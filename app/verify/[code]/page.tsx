import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 폰트 파일 name 테이블에 적힌 검증 주소. 라이선스가 진짜인지 누구나 확인할 수 있다 (개인정보는 가림).
const mask = (s: string) => (s.length <= 1 ? "*" : s[0] + "*".repeat(Math.min(s.length - 1, 6)));

export default async function VerifyPage({ params }: { params: Promise<{ code: string }> }) {
  const { code } = await params;
  const { data: o } = await supabaseAdmin()
    .from("orders")
    .select("order_no, order_name, status, licensee_name, web_domain, approved_at, order_items(item_name)")
    .eq("order_id", code)
    .maybeSingle();
  return (
    <div className="narrow">
      <h1>라이선스 확인</h1>
      {!o || o.status === "READY" || o.status === "FAILED" || o.status === "CONFIRMING" ? (
        <p className="error">확인되지 않는 라이선스입니다.</p>
      ) : (
        <div className="card">
          <p className={o.status === "PAID" ? "ok" : "error"}><strong>{o.status === "PAID" ? "유효한 라이선스" : "해지된 라이선스"}</strong></p>
          <dl className="kv">
            <dt>상품</dt><dd>{o.order_items.length ? o.order_items.map((i) => <div key={i.item_name}>{i.item_name}</div>) : o.order_name}</dd>
            {o.web_domain && <><dt>Web 도메인</dt><dd>{o.web_domain}</dd></>}
            <dt>라이선스 대상</dt><dd>{mask(o.licensee_name)}</dd>
            <dt>주문</dt><dd>#{o.order_no}</dd>
            <dt>발급일</dt><dd>{o.approved_at ? new Date(o.approved_at).toLocaleDateString("ko-KR") : "-"}</dd>
          </dl>
        </div>
      )}
    </div>
  );
}
