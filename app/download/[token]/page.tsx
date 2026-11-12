import { hashToken } from "@/lib/fulfill";
import { supabaseAdmin } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

// 메일 링크로 들어오는 페이지. 열어 보는 것만으로는 횟수가 줄지 않고, 버튼(POST)을 눌러야 받는다.
export default async function DownloadPage({ params, searchParams }: { params: Promise<{ token: string }>; searchParams: Promise<{ expired?: string }> }) {
  const { token } = await params;
  const { expired } = await searchParams;
  const { data: link } = await supabaseAdmin()
    .from("download_links")
    .select("expires_at, uses, max_uses, orders!inner(order_no, order_name, status, order_files(filename, format, bytes))")
    .eq("token_hash", hashToken(token))
    .maybeSingle();

  const order = link?.orders as unknown as { order_no: number; order_name: string; status: string; order_files: { filename: string; format: string; bytes: number }[] } | undefined;
  const usable = link && order?.status === "PAID" && new Date(link.expires_at) > new Date() && link.uses < link.max_uses;

  return (
    <div className="narrow">
      <h1>폰트 다운로드</h1>
      {!link || !order ? (
        <p className="error">잘못된 링크입니다.</p>
      ) : (
        <div className="card">
          <dl className="kv">
            <dt>주문</dt><dd>#{order.order_no} · {order.order_name}</dd>
            <dt>파일</dt><dd>{(order.order_files.find((f) => f.format === "zip") ? order.order_files.filter((f) => f.format === "zip") : order.order_files.slice(-1)).map((f) => f.filename).join(", ")}{order.order_files.some((f) => f.format === "zip") && <span className="muted"> (폰트 파일 {order.order_files.length - 1}개 + 라이선스 증서)</span>}</dd>
            <dt>남은 횟수</dt><dd>{Math.max(0, link.max_uses - link.uses)} / {link.max_uses}</dd>
            <dt>만료</dt><dd>{new Date(link.expires_at).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" })}</dd>
          </dl>
          {usable && !expired ? (
            <form method="post" action={`/api/download/${token}`}>
              <p><button className="block" type="submit">다운로드</button></p>
            </form>
          ) : (
            <p className="error">
              {order.status !== "PAID" ? "취소된 주문입니다." : "링크가 만료됐거나 다운로드 횟수를 다 썼습니다."} 로그인 후 <a href="/account">내 구매내역</a>에서 다시 받을 수 있습니다.
            </p>
          )}
        </div>
      )}
    </div>
  );
}
