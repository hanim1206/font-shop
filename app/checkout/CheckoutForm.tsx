"use client";

import Link from "next/link";
import { useEffect, useRef, useState } from "react";
import { loadTossPayments, type TossPaymentsPayment } from "@tosspayments/tosspayments-sdk";
import type { PublicProduct } from "@/lib/catalog";
import { CartLines, useCartLines } from "../cart/CartView";

type Props = { catalog: PublicProduct[]; licenseLabels: Record<string, string>; email: string; clientKey: string; customerKey: string };

const ERRORS: Record<string, string> = {
  EMPTY_CART: "장바구니가 비어 있습니다.",
  TOO_MANY_ITEMS: "한 번에 결제할 수 있는 개수를 넘었습니다.",
  INVALID_ITEM: "판매하지 않는 상품이 담겨 있습니다. 장바구니를 확인해 주세요.",
  DUPLICATE_ITEM: "같은 상품이 두 번 담겨 있습니다.",
  INVALID_LICENSEE: "라이선스 사용자 이름을 확인해 주세요.",
  INVALID_BIZ_NO: "사업자등록번호는 숫자 10자리입니다.",
  INVALID_DOMAIN: "Web 라이선스를 쓸 도메인을 example.com 형태로 적어 주세요.",
  CONSENT_REQUIRED: "필수 동의 항목을 확인해 주세요.",
};

export default function CheckoutForm({ catalog, licenseLabels, email, clientKey, customerKey }: Props) {
  const { loaded, lines, total } = useCartLines(catalog);
  const hasWeb = lines.some((l) => l.license === "web");
  const [licensee, setLicensee] = useState("");
  const [licenseeType, setLicenseeType] = useState<"personal" | "company">("personal");
  const [bizNo, setBizNo] = useState("");
  const [domain, setDomain] = useState("");
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

  if (!loaded) return null;
  if (!lines.length) return <p>장바구니가 비어 있습니다. <Link href="/">폰트 보러 가기</Link></p>;

  const canPay = ready && !busy && agreedWaiver && agreedEula && licensee.trim() && (!hasWeb || domain.trim());

  async function pay() {
    if (!paymentRef.current) return;
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/orders", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          items: lines.map((l) => ({ slug: l.slug, license: l.license })),
          licenseeName: licensee,
          licenseeType,
          bizNo: licenseeType === "company" ? bizNo : "",
          webDomain: hasWeb ? domain : "",
          agreedWithdrawalWaiver: agreedWaiver,
          agreedEula,
        }),
      });
      const order = await res.json();
      if (!res.ok) throw new Error(ERRORS[order.error] ?? order.error ?? "주문 생성 실패");
      if (order.amount !== total) throw new Error("가격이 바뀌었습니다. 새로고침 후 다시 시도해 주세요.");
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
      <CartLines catalog={catalog} licenseLabels={licenseLabels} removable={false} />

      <h2>라이선스 사용자</h2>
      <div className="seg" role="radiogroup" aria-label="라이선스 사용자 구분">
        <label className="check"><input type="radio" name="holder" checked={licenseeType === "personal"} onChange={() => setLicenseeType("personal")} /><span>개인</span></label>
        <label className="check"><input type="radio" name="holder" checked={licenseeType === "company"} onChange={() => setLicenseeType("company")} /><span>회사·단체</span></label>
      </div>
      <label htmlFor="licensee">{licenseeType === "company" ? "회사·단체명" : "이름"} (폰트 파일과 라이선스 증서에 기록됩니다)</label>
      <input id="licensee" type="text" maxLength={60} value={licensee} onChange={(e) => setLicensee(e.target.value)} />
      {licenseeType === "company" && (
        <>
          <label htmlFor="bizNo">사업자등록번호 <span className="muted">(선택, 세금계산서가 필요한 경우)</span></label>
          <input id="bizNo" type="text" inputMode="numeric" placeholder="000-00-00000" value={bizNo} onChange={(e) => setBizNo(e.target.value)} />
        </>
      )}
      {hasWeb && (
        <>
          <label htmlFor="domain">Web 라이선스를 쓸 도메인 1개</label>
          <input id="domain" type="text" placeholder="example.com" value={domain} onChange={(e) => setDomain(e.target.value)} />
        </>
      )}
      <p className="muted">다운로드 링크는 가입한 이메일 <strong>{email}</strong> 로 보냅니다.</p>

      <p>결제수단: 토스페이 (테스트)</p>

      <div className="card">
        <label className="check">
          <input type="checkbox" checked={agreedEula} onChange={(e) => setAgreedEula(e.target.checked)} />
          <span>(필수) 폰트 사용권 계약(EULA)에 동의합니다. 구매한 파일에는 라이선스 사용자와 주문번호가 기록되며, 파일을 다른 사람에게 넘길 수 없습니다.</span>
        </label>
        <label className="check">
          <input type="checkbox" checked={agreedWaiver} onChange={(e) => setAgreedWaiver(e.target.checked)} />
          <span>(필수) 폰트 파일은 디지털콘텐츠로, 다운로드 링크가 발급되면 전자상거래법 제17조 제2항 제5호에 따라 청약철회가 제한됨을 확인하고 동의합니다.</span>
        </label>
      </div>

      {error && <p className="error">{error}</p>}
      <button className="block" disabled={!canPay} onClick={pay}>토스페이로 {total.toLocaleString("ko-KR")}원 결제하기</button>
      <p className="muted">테스트 결제입니다. 실제 돈은 나가지 않습니다.</p>
    </>
  );
}
