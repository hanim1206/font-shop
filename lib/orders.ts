// 주문 저장소 (Supabase Postgres, service role). 상태 전이는 전부 "조건부 UPDATE" 로 해서
// 승인 응답과 웹훅이 동시에 와도 한 번만 반영된다.
import "server-only";
import { randomBytes } from "node:crypto";
import { supabaseAdmin } from "./supabase/admin";

export type OrderStatus = "READY" | "CONFIRMING" | "PAID" | "FAILED" | "CANCELED";

export type Order = {
  order_no: number;
  order_id: string;
  user_id: string;
  product_slug: string;
  font_id: string;
  order_name: string;
  amount: number;
  customer_email: string;
  licensee_name: string;
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

export async function insertOrder(row: Omit<Order, "order_no" | "status" | "payment_key" | "method" | "approved_at" | "receipt_url" | "failure" | "fulfill_started_at" | "fulfilled_at" | "created_at" | "updated_at">): Promise<Order> {
  const { data, error } = await db().from("orders").insert(row).select().single();
  if (error) throw new Error(`insertOrder: ${error.message}`);
  await logEvent(data.order_no, "created");
  return data as Order;
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
    .select("*, order_events(event, detail, at), order_files(id, filename, sha256), downloads(via, ip, at), emails(status, to_email, created_at)")
    .order("created_at", { ascending: false })
    .limit(limit);
  if (error) throw new Error(error.message);
  return data as (Order & {
    order_events: { event: string; detail: string | null; at: string }[];
    order_files: { id: string; filename: string; sha256: string }[];
    downloads: { via: string; ip: string | null; at: string }[];
    emails: { status: string; to_email: string; created_at: string }[];
  })[];
}
