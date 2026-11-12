"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { clearCart } from "@/lib/cart-client";

// 서버는 confirm 한 번으로 끝나 진행률을 주지 않는다. 실측(약 17초)에 맞춘 경과 시간 기반 표시다.
const STAGES = [
  { until: 3, label: "결제 승인 중" },
  { until: 14, label: "주문번호 워터마크 넣는 중" },
  { until: Infinity, label: "다운로드 링크 만드는 중" },
];

function ConfirmProgress({ finished, stopped }: { finished: boolean; stopped: boolean }) {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (finished || stopped) return;
    const start = Date.now();
    const timer = setInterval(() => setElapsed((Date.now() - start) / 1000), 200);
    return () => clearInterval(timer);
  }, [finished, stopped]);

  // 응답이 오기 전까지는 90%에 다가가기만 한다
  const value = finished ? 100 : Math.round(90 * (1 - Math.exp(-elapsed / 7)));
  const label = STAGES.find((s) => elapsed < s.until)!.label;
  return (
    <>
      <div className="progress" role="progressbar" aria-label="결제 처리 진행률" aria-valuemin={0} aria-valuemax={100} aria-valuenow={value} aria-valuetext={label}>
        <span style={{ width: `${value}%` }} />
      </div>
      <p className="muted">{label}… (담은 개수에 따라 20초~1분)</p>
    </>
  );
}

type Confirmed = { orderNo: number; orderName: string; amount: number; method?: string; receiptUrl?: string; customerEmail: string; fulfilled: boolean };

export default function ConfirmPayment(props: { paymentKey: string; orderId: string; amount: string }) {
  const [state, setState] = useState<{ done?: Confirmed; error?: string }>({});
  const [showResult, setShowResult] = useState(false);
  const started = useRef(false);

  useEffect(() => {
    if (started.current) return; // 개발 모드에서 effect 가 두 번 돌아도 승인은 한 번
    started.current = true;
    fetch("/api/payments/confirm", { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(props) })
      .then(async (r) => {
        const body = await r.json();
        if (!r.ok) throw new Error(body.message ?? body.error);
        clearCart(); // 결제가 끝났으니 장바구니를 비운다
        setState({ done: body.order });
        setTimeout(() => setShowResult(true), 400); // 100% 를 잠깐 보여 준다
      })
      .catch((e) => setState({ error: (e as Error).message }));
  }, [props]);

  if (state.error) {
    return (
      <>
        <h1>결제를 완료하지 못했어요</h1>
        <ConfirmProgress finished={false} stopped />
        <p className="error">결제를 완료하지 못했습니다: {state.error}</p>
      </>
    );
  }
  if (!state.done || !showResult) {
    return (
      <>
        <h1>결제 처리 중</h1>
        <ConfirmProgress finished={Boolean(state.done)} stopped={false} />
      </>
    );
  }
  const o = state.done;
  return (
    <>
      <h1>결제 완료</h1>
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
    </>
  );
}
