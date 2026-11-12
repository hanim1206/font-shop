// 결제 완료(PAID) → 워터마크 파일 생성 → 비공개 버킷 저장 → 다운로드 링크 → 메일.
// 승인 응답과 웹훅 둘 다 이걸 부를 수 있으니 fulfill_started_at 으로 한 번만 돌게 잠근다.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findProduct, LICENSES } from "./catalog";
import { siteUrl } from "./env";
import { embedWatermark, makeZip } from "./fontmark";
import { deliveryMail, sendMail } from "./mail";
import { getOrderItems, logEvent, type Order, type OrderItem } from "./orders";
import { supabaseAdmin } from "./supabase/admin";

export const LINK_DAYS = 7;
export const LINK_MAX_USES = 5;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");
const sha256 = (b: Buffer) => createHash("sha256").update(b).digest("hex");

const CONTENT_TYPES: Record<string, string> = {
  otf: "font/otf", ttf: "font/ttf", woff: "font/woff", woff2: "font/woff2", zip: "application/zip",
};

// 저장 경로는 추측 불가능한 랜덤. 파일명에 개인정보를 넣지 않는다.
async function storeFile(orderNo: number, itemId: string | null, src: string, filename: string, format: string, hash: string, bytes: number) {
  const db = supabaseAdmin();
  const storagePath = `${orderNo}/${randomBytes(12).toString("hex")}.${format}`;
  const up = await db.storage.from("deliveries").upload(storagePath, await readFile(src), {
    contentType: CONTENT_TYPES[format] ?? "application/octet-stream",
    upsert: false,
  });
  if (up.error) throw new Error(`storage upload: ${up.error.message}`);
  const { error } = await db.from("order_files").insert({
    order_no: orderNo, item_id: itemId, storage_path: storagePath, filename, format, sha256: hash, bytes,
  });
  if (error) throw new Error(`order_files: ${error.message}`);
}

async function clearOrderFiles(orderNo: number) {
  const db = supabaseAdmin();
  const { data } = await db.from("order_files").select("id, storage_path").eq("order_no", orderNo);
  if (!data?.length) return;
  await db.storage.from("deliveries").remove(data.map((f) => f.storage_path));
  await db.from("order_files").delete().eq("order_no", orderNo);
}

function licenseText(order: Order, items: OrderItem[]): string {
  const holder = order.licensee_type === "company" ? `${order.licensee_name} (회사·단체${order.biz_no ? `, 사업자등록번호 ${order.biz_no}` : ""})` : order.licensee_name;
  return [
    "폰트 라이선스 증서",
    "",
    `라이선스 사용자: ${holder}`,
    `주문: #${order.order_no} (${order.order_id})`,
    `발급일: ${new Date(order.approved_at ?? Date.now()).toLocaleDateString("ko-KR", { timeZone: "Asia/Seoul" })}`,
    "",
    "항목",
    ...items.map((i) => `- ${i.item_name}: ${LICENSES[i.license_type].desc}${i.license_type === "web" ? ` (도메인: ${order.web_domain})` : ""}`),
    "",
    "폰트 파일에는 라이선스 사용자와 주문번호가 기록되어 있습니다. 파일을 다른 사람에게 넘기거나 공개된 곳에 올릴 수 없습니다.",
    `라이선스 확인: ${siteUrl()}/verify/${order.order_id}`,
    "",
  ].join("\n");
}

export async function fulfillOrder(order: Order): Promise<"done" | "already" | "failed"> {
  const db = supabaseAdmin();
  const { data: locked } = await db
    .from("orders")
    .update({ fulfill_started_at: new Date().toISOString() })
    .eq("order_no", order.order_no)
    .eq("status", "PAID")
    .is("fulfill_started_at", null)
    .select()
    .maybeSingle();
  if (!locked) return "already";

  const tmp = await mkdtemp(path.join(os.tmpdir(), "fontshop-"));
  try {
    const items = await getOrderItems(order.order_no);
    if (!items.length) throw new Error("order has no items");
    // 이미 일부 만들어 둔 파일이 있으면(지난 시도가 중간에 실패) 지우고 처음부터 다시 만든다
    await clearOrderFiles(order.order_no);

    const bundle: [string, string][] = [];
    for (const item of items) {
      const product = findProduct(item.product_slug);
      if (!product) throw new Error(`unknown product ${item.product_slug}`);
      const base = product.downloadName.replace(/\.[^.]+$/, "");
      const isWeb = item.license_type === "web";
      const dir = path.join(tmp, item.id);
      const result = await embedWatermark({
        masterFile: product.masterFile,
        fontId: item.font_id,
        orderNo: order.order_no, // 안 보이는 층에는 주문번호 하나를 모든 파일에 넣는다
        orderId: order.order_id,
        licensee: order.licensee_name,
        site: siteUrl(),
        outDir: dir,
        basename: isWeb ? `${base}-Web` : base,
        formats: isWeb ? ["woff", "woff2"] : ["otf"], // otf 는 "마스터와 같은 형식(otf/ttf)" 이라는 뜻
        licenseType: item.license_type,
        domain: isWeb ? order.web_domain : null,
      });
      for (const f of result.files) {
        const filename = path.basename(f.path);
        await storeFile(order.order_no, item.id, f.path, filename, f.format, f.sha256, f.bytes);
        bundle.push([f.path, `${LICENSES[item.license_type].label}/${filename}`]);
      }
      await logEvent(order.order_no, "watermarked", `${item.item_name} · order #${order.order_no} · ${result.points_moved} points · ${result.seconds}s`);
    }

    // 메일 링크로 한 번에 받는 묶음 (라이선스 증서 포함)
    const zipPath = path.join(tmp, "bundle.zip");
    await makeZip(zipPath, bundle, { "LICENSE.txt": licenseText(order, items) });
    const zipBytes = await readFile(zipPath);
    await storeFile(order.order_no, null, zipPath, `FontShop-order-${order.order_no}.zip`, "zip", sha256(zipBytes), zipBytes.length);

    const { token, expiresAt } = await createDownloadLink(order.order_no);
    await db.from("orders").update({ fulfilled_at: new Date().toISOString() }).eq("order_no", order.order_no);

    const mail = deliveryMail({
      orderNo: order.order_no,
      orderName: order.order_name,
      amount: order.amount,
      licensee: order.licensee_name,
      link: `${siteUrl()}/download/${token}`,
      expiresAt,
      maxUses: LINK_MAX_USES,
      accountUrl: `${siteUrl()}/account`,
    });
    const sent = await sendMail({ to: order.customer_email, orderNo: order.order_no, ...mail });
    await logEvent(order.order_no, `mail_${sent.status}`, sent.error);
    return "done";
  } catch (e) {
    // 다시 시도할 수 있게 잠금을 푼다 (관리자 화면의 "다시 발급" 또는 웹훅 재수신)
    await db.from("orders").update({ fulfill_started_at: null }).eq("order_no", order.order_no);
    await logEvent(order.order_no, "fulfill_failed", (e as Error).message.slice(0, 500));
    console.error("fulfill failed", e);
    return "failed";
  } finally {
    await rm(tmp, { recursive: true, force: true });
  }
}

export async function createDownloadLink(orderNo: number) {
  const token = randomBytes(24).toString("base64url");
  const expiresAt = new Date(Date.now() + LINK_DAYS * 86400_000).toISOString();
  const { error } = await supabaseAdmin()
    .from("download_links")
    .insert({ order_no: orderNo, token_hash: hashToken(token), expires_at: expiresAt, max_uses: LINK_MAX_USES });
  if (error) throw new Error(`download_links: ${error.message}`);
  return { token, expiresAt };
}
