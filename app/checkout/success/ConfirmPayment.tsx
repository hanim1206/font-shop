"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";

type Confirmed = { orderNo: number; orderName: string; amount: number; method?: string; receiptUrl?: string; customerEmail: string; fulfilled: boolean };

export default function ConfirmPayment(props: { paymentKey: string; orderId: string; amount: string }) {
  const [state, setState] = useState<{ done?: Confirmed; error?: string }>({});
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // 개발 모드에서 effect 가 두 번 돌아도 승인은 한 번
    started.current = true;
    fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(props) })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message ?? body.error);
        setState({ done: body.order });
      })
      .catch((e) => setState({ error: (e as Error).message }));
  }, [props]);

  if (state.error) return <p className="error">결제를 완료하지 못했습니다: {state.error}</p>;
  if (!state.done) return <p className="muted">결제를 승인하고 구매자 전용 폰트 파일을 만드는 중입니다… (10초 정도)</p>;
  const o = state.done;
  return (
    <div className="card">
      <dl className="kv">
        <dt>주문번호</dt><dd>#{o.orderNo}</dd>
        <dt>상품</dt><dd>{o.orderName}</dd>
        <dt>결제</dt><dd>{o.amount.toLocaleString("ko-KR")}원 · {o.method}</dd>
      </dl>
      {o.fulfilled ? (
        <p><strong>{o.customerEmail}</strong> 로 다운로드 링크를 보냈습니다. 파일에는 주문번호 #{o.orderNo} 가 기록되어 있습니다.</p>
      ) : (
        <p className="error">파일 생성이 늦어지고 있습니다. 준비되면 메일로 보내드리고, 내 구매내역에도 표시됩니다.</p>
      )}
      <p><Link className="btn" href="/account">내 구매내역에서 바로 받기</Link></p>
      {o.receiptUrl && <p className="muted"><a href={o.receiptUrl} target="_blank" rel="noreferrer">카드 영수증 보기</a></p>}
    </div>
  );
}
