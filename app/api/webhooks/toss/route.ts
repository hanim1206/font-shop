// 개발자센터 > 웹훅 에 이 주소를 PAYMENT_STATUS_CHANGED 로 등록한다.
// 결제 상태 웹훅에는 서명이 없으므로 본문을 믿지 않고 paymentKey 로 재조회한 결과만 반영한다.
import { NextResponse } from "next/server";
import { fulfillOrder } from "@/lib/fulfill";
import { getOrder, transition } from "@/lib/orders";
import { getPayment } from "@/lib/toss";

export const maxDuration = 300;

export async function POST(req: Request) {
  const body = await req.json().catch(() => null);
  if (body?.eventType !== "PAYMENT_STATUS_CHANGED" || !body?.data?.paymentKey) {
    return NextResponse.json({ ignored: true });
  }
  const fetched = await getPayment(String(body.data.paymentKey));
  if (!fetched.ok) {
    // 404(없는 결제)는 위조로 보고 200 으로 끝낸다. 그 외 실패는 500 → 토스가 재전송
    return NextResponse.json({ error: fetched.error.code }, { status: fetched.status === 404 ? 200 : 500 });
  }
  const p = fetched.payment;
  const order = await getOrder(p.orderId);
  if (!order) return NextResponse.json({ ignored: "unknown order" });
  if (p.totalAmount !== order.amount) {
    await transition(order.order_id, null, {
      status: "FAILED",
      failure: { code: "WEBHOOK_AMOUNT_MISMATCH", message: String(p.totalAmount) },
    }, "webhook_amount_mismatch");
    return NextResponse.json({ ok: true });
  }

  switch (p.status) {
    case "DONE": {
      // 승인 응답을 못 받은 경우(CONFIRMING 에 멈춤)를 여기서 마무리
      const paid = await transition(order.order_id, ["READY", "CONFIRMING"], {
        status: "PAID",
        payment_key: p.paymentKey,
        method: p.method ?? null,
        approved_at: p.approvedAt ?? null,
        receipt_url: p.receipt?.url ?? null,
      }, "webhook_paid");
      const cur = paid ?? (await getOrder(order.order_id))!;
      if (cur.status === "PAID" && !cur.fulfilled_at) await fulfillOrder(cur);
      break;
    }
    case "CANCELED":
    case "PARTIAL_CANCELED":
      // 취소되면 다운로드가 막힌다 (다운로드는 status = PAID 일 때만)
      await transition(order.order_id, null, { status: "CANCELED" }, "webhook_canceled", p.status);
      break;
    case "ABORTED":
    case "EXPIRED":
      await transition(order.order_id, ["READY", "CONFIRMING"], {
        status: "FAILED",
        failure: { code: p.status, message: "payment aborted or expired" },
      }, "webhook_failed", p.status);
      break;
  }
  return NextResponse.json({ ok: true });
}
