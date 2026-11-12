// 주문 저장소 (Supabase Postgres, service role). 상태 전이는 전부 "조건부 UPDATE" 로 해서
// 승인 응답과 웹훅이 동시에 와도 한 번만 반영된다.
import "server-only";
import { randomBytes } from "node:crypto";
import type { LicenseType, PricedItem } from "./catalog";
import { supabaseAdmin } from "./supabase/admin";

export type OrderStatus = "READY" | "CONFIRMING" | "PAID" | "FAILED" | "CANCELED";

export type Order = {
  order_no: number;
  order_id: string;
  user_id: string;
  product_slug: string | null; // 예전 단건 주문 기록용. 상품은 order_items 에 있다
  font_id: string | null;
  order_name: string;
  amount: number;
  customer_email: string;
  licensee_name: string;
  licensee_type: "personal" | "company";
  biz_no: string | null;
  web_domain: string | null;
  status: OrderStatus;
  withdrawal_waiver_agreed_at: string;
  eula_agreed_at: string;
  payment_key: string | null;
  method: string | null;
  approved_at: string | null;
  receipt_url: string | null;
  failure: { code: string; message: string } | null;
  fulfill_started_at: string | null;
  fulfilled_at: string | null;
  created_at: string;
  updated_at: string;
};

const db = () => supabaseAdmin();

export function newOrderId(): string {
  // 토스 orderId 규칙: 6~64자, 영문·숫자·-·_. 추측하기 어렵게 랜덤.
  const d = new Date().toISOString().slice(0, 10).replaceAll("-", "");
  return `ORD-${d}-${randomBytes(8).toString("hex")}`;
}

export type OrderItem = {
  id: string;
  order_no: number;
  product_slug: string;
  font_id: string;
  license_type: LicenseType;
  item_name: string;
  unit_price: number;
};

type NewOrder = Omit<Order, "order_no" | "product_slug" | "font_id" | "status" | "payment_key" | "method" | "approved_at" | "receipt_url" | "failure" | "fulfill_started_at" | "fulfilled_at" | "created_at" | "updated_at">;

export async function insertOrder(row: NewOrder, items: PricedItem[]): Promise<Order> {
  const { data, error } = await db().from("orders").insert(row).select().single();
  if (error) throw new Error(`insertOrder: ${error.message}`);
  const { error: ie } = await db().from("order_items").insert(
    items.map((i) => ({
      order_no: data.order_no,
      product_slug: i.product.slug,
      font_id: i.product.fontId,
      license_type: i.license,
      item_name: i.name,
      unit_price: i.price,
    })),
  );
  if (ie) {
    // 항목 없는 주문이 남지 않게 지운다 (아직 결제 전이라 안전)
    await db().from("orders").delete().eq("order_no", data.order_no);
    throw new Error(`insertOrder items: ${ie.message}`);
  }
  await logEvent(data.order_no, "created", `${items.length} items`);
  return data as Order;
}

export async function getOrderItems(orderNo: number): Promise<OrderItem[]> {
  const { data, error } = await db().from("order_items").select().eq("order_no", orderNo).order("created_at").order("id");
  if (error) throw new Error(`getOrderItems: ${error.message}`);
  return data as OrderItem[];
}

export async function getOrder(orderId: string): Promise<Order | null> {
  const { data, error } = await db().from("orders").select().eq("order_id", orderId).maybeSingle();
  if (error) throw new Error(`getOrder: ${error.message}`);
  return data as Order | null;
}

export async function getOrderByNo(orderNo: number): Promise<Order | null> {
  const { data } = await db().from("orders").select().eq("order_no", orderNo).maybeSingle();
  return data as Order | null;
}

/** expect 상태일 때만 patch 를 적용한다. 바뀌었으면 새 행, 아니면 null. */
export async function transition(
  orderId: string,
  expect: OrderStatus[] | null,
  patch: Partial<Omit<Order, "order_no" | "order_id" | "user_id">>,
  event: string,
  detail?: string,
): Promise<Order | null> {
  let q = db().from("orders").update({ ...patch, updated_at: new Date().toISOString() }).eq("order_id", orderId);
  if (expect) q = q.in("status", expect);
  const { data, error } = await q.select().maybeSingle();
  if (error) throw new Error(`transition: ${error.message}`);
  if (data) await logEvent(data.order_no, event, detail);
  return data as Order | null;
}

export async function logEvent(orderNo: number, event: string, detail?: string) {
  await db().from("order_events").insert({ order_no: orderNo, event, detail: detail ?? null });
}

export async function listAllOrders(limit = 200) {
  const { data, error } = await db()
    .from("orders")
    .select("*, order_items(item_name, license_type, unit_price), order_events(event, detail, at), order_files(id, filename, sha256), downloads(via, ip, at), emails(status, to_email, created_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as (Order & {
    order_items: { item_name: string; license_type: LicenseType; unit_price: number }[];
    order_events: { event: string; detail: string | null; at: string }[];
    order_files: { id: string; filename: string; sha256: string }[];
    downloads: { via: string; ip: string | null; at: string }[];
    emails: { status: string; to_email: string; created_at: string }[];
  })[];
}
