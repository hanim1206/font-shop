"use client";

import { useEffect, useRef, useState } from "react";
import { loadTossPayments, type TossPaymentsPayment } from "@tosspayments/tosspayments-sdk";

type Props = { productSlug: string; amount: number; email: string; clientKey: string; customerKey: string };

export default function CheckoutForm({ productSlug, amount, email, clientKey, customerKey }: Props) {
  const [licensee, setLicensee] = useState("");
  const [agreedWaiver, setAgreedWaiver] = useState(false);
  const [agreedEula, setAgreedEula] = useState(false);
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const paymentRef = useRef<TossPaymentsPayment | null>(null);

  // 토스페이 결제창만 연다 (개발 모드 effect 두 번 실행 대비)
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const toss = await loadTossPayments(clientKey);
        if (cancelled) return;
        // customerKey 는 추측하기 어려운 값이어야 한다 → Supabase user id(UUID)
        paymentRef.current = toss.payment({ customerKey });
        setReady(true);
      } catch (e) {
        if (!cancelled) setError(`결제 모듈을 불러오지 못했습니다: ${(e as Error).message}`);
      }
    })();
    return () => { cancelled = true; };
  }, [clientKey, customerKey]);

  const canPay = ready && !busy && agreedWaiver && agreedEula && licensee.trim();

  async function pay() {
    if (!paymentRef.current) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ productSlug, licenseeName: licensee, agreedWithdrawalWaiver: agreedWaiver, agreedEula }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(order.error ?? "주문 생성 실패");
      if (order.amount !== amount) throw new Error("가격이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.");
      await paymentRef.current.requestPayment({
        method: "CARD",
        amount: { currency: "KRW", value: order.amount },
        card: { flowMode: "DIRECT", easyPay: "TOSSPAY" },
        orderId: order.orderId,
        orderName: order.orderName,
        customerEmail: order.customerEmail,
        customerName: licensee,
        successUrl: `${window.location.origin}/checkout/success`,
        failUrl: `${window.location.origin}/checkout/fail`,
      });
    } catch (e) {
      // 결제창을 닫으면 여기로 온다. 주문은 READY 로 남는다.
      setError((e as Error).message);
      setBusy(false);
    }
  }

  return (
    <>
      <label htmlFor="licensee">라이선스 받는 분 (개인 이름 또는 회사명, 폰트 파일에 기록됩니다)</label>
      <input id="licensee" type="text" maxLength={60} value={licensee} onChange={(e) => setLicensee(e.target.value)} />
      <p className="muted">다운로드 링크는 가입한 이메일 <strong>{email}</strong> 로 보냅니다.</p>

      <p>결제수단: 토스페이 (테스트)</p>

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={agreedEula} onChange={(e) => setAgreedEula(e.target.checked)} />
          <span>(필수) 폰트 사용권 계약(EULA)에 동의합니다. 구매한 파일에는 구매자 이름과 주문번호가 기록되며, 파일을 다른 사람에게 넘길 수 없습니다.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agreedWaiver} onChange={(e) => setAgreedWaiver(e.target.checked)} />
          <span>(필수) 폰트 파일은 디지털콘텐츠로, 다운로드 링크가 발급되면 전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됨을 확인하고 동의합니다.</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="block" disabled={!canPay} onClick={pay}>토스페이로 {amount.toLocaleString("ko-KR")}원 결제하기</button>
      <p className="muted">테스트 결제입니다. 실제 돈은 나가지 않습니다.</p>
    </>
  );
}
