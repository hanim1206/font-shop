import Link from "next/link";
import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

// 내 구매내역. RLS 로 본인 주문만 조회된다.
export default async function AccountPage() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/account");
  const { data: orders } = await sb
    .from("orders")
    .select("order_no, order_name, amount, status, approved_at, created_at, licensee_name, fulfilled_at, order_files(id, filename, bytes)")
    .in("status", ["PAID", "CANCELED"])
    .order("created_at", { ascending: false });

  return (
    <>
      <h1>내 구매내역</h1>
      <p className="muted">{auth.user.email} · <Link href="/account/password">비밀번호 변경</Link></p>
      {!orders?.length && <p>아직 구매한 폰트가 없습니다.</p>}
      {orders?.map((o) => (
        <div className="card" key={o.order_no} style={{ marginBottom: 12 }}>
          <div className="row">
            <strong>{o.order_name}</strong>
            <span className={`badge ${o.status}`}>{o.status === "PAID" ? "결제 완료" : "취소됨"}</span>
          </div>
          <p className="muted">주문 #{o.order_no} · {o.amount.toLocaleString("ko-KR")}원 · {new Date(o.approved_at ?? o.created_at).toLocaleDateString("ko-KR")} · 라이선스: {o.licensee_name}</p>
          {o.status === "PAID" && (o.order_files.length ? (
            o.order_files.map((f) => (
              <form key={f.id} method="post" action={`/api/account/files/${f.id}`}>
                <button className="ghost" type="submit">{f.filename} 받기 ({(f.bytes / 1024 / 1024).toFixed(1)}MB)</button>
              </form>
            ))
          ) : (
            <p className="muted">파일을 준비하고 있습니다.</p>
          ))}
        </div>
      ))}
    </>
  );
}
