import Link from "next/link";

// {failUrl}?code=&message=&orderId= 로 돌아온다. 결제창을 닫으면 PAY_PROCESS_CANCELED.
export default async function FailPage({ searchParams }: { searchParams: Promise<Record<string, string | undefined>> }) {
  const sp = await searchParams;
  return (
    <div className="narrow">
      <h1>결제가 완료되지 않았습니다</h1>
      <div className="card">
        <p>{sp.message ?? "알 수 없는 오류"}</p>
        <p className="muted">코드 {sp.code} · 주문 {sp.orderId}</p>
      </div>
      <Link href="/">처음으로</Link>
    </div>
  );
}
