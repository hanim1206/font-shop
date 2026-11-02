import { notFound } from "next/navigation";
import { isAdminEmail } from "@/lib/env";
import { listAllOrders } from "@/lib/orders";
import { currentUser } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 관리자 주문 조회. ADMIN_EMAILS 에 있는 계정으로 로그인해야 보인다.
export default async function AdminOrders() {
  const user = await currentUser();
  if (!isAdminEmail(user?.email)) notFound();
  const orders = await listAllOrders();
  const kst = (s: string | null) => (s ? new Date(s).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" }) : "-");
  return (
    <>
      <h1>주문 {orders.length}건</h1>
      <div className="table-wrap">
        <table className="admin">
          <thead>
            <tr><th>주문</th><th>구매자</th><th>상품 · 금액</th><th>상태</th><th>파일 (워터마크)</th><th>메일 · 다운로드</th><th>이력</th></tr>
          </thead>
          <tbody>
            {orders.map((o) => (
              <tr key={o.order_no}>
                <td>#{o.order_no}<br /><span className="muted">{kst(o.created_at)}</span></td>
                <td>{o.licensee_name}<br /><span className="muted">{o.customer_email}</span></td>
                <td>{o.order_name}<br />{o.amount.toLocaleString("ko-KR")}원 {o.method && <span className="muted">· {o.method}</span>}</td>
                <td><span className={`badge ${o.status}`}>{o.status}</span>{o.failure && <><br /><span className="error">{o.failure.code}</span></>}</td>
                <td>{o.order_files.map((f) => <div key={f.id}>{f.filename}<br /><span className="muted">sha256 {f.sha256.slice(0, 12)}…</span></div>)}</td>
                <td className="muted">
                  {o.emails.map((e, i) => <div key={i}>메일 {e.status} → {e.to_email}</div>)}
                  {o.downloads.length > 0 && <div>다운로드 {o.downloads.length}회 (최근 {kst(o.downloads.map((d) => d.at).sort().at(-1)!)})</div>}
                </td>
                <td className="muted">{[...o.order_events].sort((a, b) => a.at.localeCompare(b.at)).map((h, i) => <div key={i}>{h.event}{h.detail && h.event !== "paid" ? ` · ${h.detail}` : ""}</div>)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <p className="muted">청약철회 배제 동의 시각은 DB orders.withdrawal_waiver_agreed_at 에 저장됩니다.</p>
    </>
  );
}
