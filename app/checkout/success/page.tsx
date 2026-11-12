import ConfirmPayment from "./ConfirmPayment";

// 토스가 {successUrl}?paymentType=&orderId=&paymentKey=&amount= 로 돌려보낸다.
// 아직 결제가 끝난 게 아니다. 서버가 승인 API 를 불러야 완료된다.
export default async function SuccessPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="narrow">
      <ConfirmPayment paymentKey={sp.paymentKey ?? ""} orderId={sp.orderId ?? ""} amount={sp.amount ?? ""} />
    </div>
  );
}
