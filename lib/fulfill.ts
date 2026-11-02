// 결제 완료(PAID) → 워터마크 파일 생성 → 비공개 버킷 저장 → 다운로드 링크 → 메일.
// 승인 응답과 웹훅 둘 다 이걸 부를 수 있으니 fulfill_started_at 으로 한 번만 돌게 잠근다.
import "server-only";
import { createHash, randomBytes } from "node:crypto";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { findProduct } from "./catalog";
import { siteUrl } from "./env";
import { embedWatermark } from "./fontmark";
import { deliveryMail, sendMail } from "./mail";
import { logEvent, type Order } from "./orders";
import { supabaseAdmin } from "./supabase/admin";

export const LINK_DAYS = 7;
export const LINK_MAX_USES = 5;

export const hashToken = (t: string) => createHash("sha256").update(t).digest("hex");

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

  const product = findProduct(order.product_slug);
  const tmp = await mkdtemp(path.join(os.tmpdir(), "fontshop-"));
  try {
    if (!product) throw new Error(`unknown product ${order.product_slug}`);
    const ext = path.extname(product.masterFile);
    const out = path.join(tmp, `out${ext}`);
    const result = await embedWatermark({
      masterFile: product.masterFile,
      fontId: product.fontId,
      orderNo: order.order_no,
      orderId: order.order_id,
      licensee: order.licensee_name,
      outPath: out,
      site: siteUrl(),
    });
    const file = result.files[0];
    const bytes = await readFile(out);

    // 저장 경로는 추측 불가능한 랜덤. 파일명에 개인정보를 넣지 않는다.
    const storagePath = `${order.order_no}/${randomBytes(12).toString("hex")}${ext}`;
    const up = await db.storage.from("deliveries").upload(storagePath, bytes, {
      contentType: ext === ".otf" ? "font/otf" : "font/ttf",
      upsert: false,
    });
    if (up.error) throw new Error(`storage upload: ${up.error.message}`);
    const { error: fe } = await db.from("order_files").insert({
      order_no: order.order_no,
      storage_path: storagePath,
      filename: product.downloadName,
      format: file.format,
      sha256: file.sha256,
      bytes: file.bytes,
    });
    if (fe) throw new Error(`order_files: ${fe.message}`);
    await logEvent(order.order_no, "watermarked", `order #${order.order_no} · ${result.points_moved} points · ${result.seconds}s`);

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
