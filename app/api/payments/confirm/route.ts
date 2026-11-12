// successUrl 로 돌아온 paymentKey/orderId/amount 로 결제를 승인한다.
// 1) 주인 확인  2) 저장 금액과 대조  3) READY → CONFIRMING 잠금  4) 토스 승인 API  5) PAID → 워터마크 파일·메일
import { NextResponse } from "next/server";
import { fulfillOrder } from "@/lib/fulfill";
import { getOrder, transition, type Order } from "@/lib/orders";
import { currentUser } from "@/lib/supabase/server";
import { confirmPayment } from "@/lib/toss";

export const maxDuration = 300; // 워터마크 생성까지 기다린다 (항목마다 수 초)

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user) return NextResponse.json({ error: "LOGIN_REQUIRED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  const paymentKey = String(body?.paymentKey ?? "");
  const orderId = String(body?.orderId ?? "");
  const amount = Number(body?.amount);
  if (!paymentKey || !orderId || !Number.isInteger(amount)) {
    return NextResponse.json({ error: "INVALID_PARAMS" }, { status: 400 });
  }

  const order = await getOrder(orderId);
  if (!order || order.user_id !== user.id) return NextResponse.json({ error: "ORDER_NOT_FOUND" }, { status: 404 });

  // 새로고침으로 다시 들어온 경우: 이미 승인된 같은 결제면 그대로 성공
  if (order.status === "PAID" && order.payment_key === paymentKey) {
    if (!order.fulfilled_at) await fulfillOrder(order);
    return NextResponse.json({ ok: true, order: publicView((await getOrder(orderId))!) });
  }

  // 쿼리스트링의 amount 는 구매자가 바꿀 수 있다. 저장된 금액과 다르면 승인하지 않는다.
  if (amount !== order.amount) {
    await transition(orderId, ["READY"], {
      status: "FAILED",
      failure: { code: "AMOUNT_MISMATCH", message: `expected ${order.amount}, got ${amount}` },
    }, "amount_mismatch", String(amount));
    return NextResponse.json({ error: "AMOUNT_MISMATCH" }, { status: 400 });
  }

  const locked = await transition(orderId, ["READY"], { status: "CONFIRMING", payment_key: paymentKey }, "confirm_started");
  if (!locked) return NextResponse.json({ error: "ORDER_NOT_CONFIRMABLE", status: order.status }, { status: 409 });

  const result = await confirmPayment({ paymentKey, orderId, amount: order.amount });
  if (!result.ok) {
    // 네트워크 오류면 실제로는 승인됐을 수도 있다. CONFIRMING 으로 두고 웹훅이 정리하게 한다.
    if (result.error.code === "NETWORK_ERROR") return NextResponse.json({ error: "PENDING_VERIFICATION" }, { status: 502 });
    await transition(orderId, ["CONFIRMING"], { status: "FAILED", failure: result.error }, "confirm_failed", result.error.code);
    return NextResponse.json({ error: result.error.code, message: result.error.message }, { status: 400 });
  }

  const p = result.payment;
  // 승인 응답도 한 번 더 확인 (다른 주문의 paymentKey 를 끼워 넣는 경우 대비)
  if (p.orderId !== orderId || p.totalAmount !== order.amount || p.status !== "DONE") {
    await transition(orderId, ["CONFIRMING"], {
      status: "FAILED",
      failure: { code: "CONFIRM_RESPONSE_MISMATCH", message: `${p.orderId} ${p.totalAmount} ${p.status}` },
    }, "confirm_mismatch");
    return NextResponse.json({ error: "CONFIRM_RESPONSE_MISMATCH" }, { status: 400 });
  }

  const paid = await transition(orderId, ["CONFIRMING"], {
    status: "PAID",
    method: p.method ?? null,
    approved_at: p.approvedAt ?? null,
    receipt_url: p.receipt?.url ?? null,
  }, "paid", p.method);
  const final = paid ?? (await getOrder(orderId))!; // 웹훅이 먼저 PAID 로 바꿨으면 paid 는 null
  if (final.status === "PAID") await fulfillOrder(final);

  return NextResponse.json({ ok: true, order: publicView((await getOrder(orderId))!) });
}

function publicView(o: Order) {
  return {
    orderNo: o.order_no,
    orderId: o.order_id,
    orderName: o.order_name,
    amount: o.amount,
    method: o.method,
    approvedAt: o.approved_at,
    receiptUrl: o.receipt_url,
    customerEmail: o.customer_email,
    fulfilled: Boolean(o.fulfilled_at),
  };
}
