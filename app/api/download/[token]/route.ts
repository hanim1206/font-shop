// 메일 링크로 받기. GET 은 페이지(/download/[token])가 담당하고, 실제 다운로드는 POST 로만 한다.
// 메일 보안 스캐너가 링크를 미리 열어 보는 것만으로 횟수가 줄지 않게 하기 위해서다.
import { NextResponse } from "next/server";
import { hashToken } from "@/lib/fulfill";
import { streamOrderFile } from "@/lib/deliver";
import { supabaseAdmin } from "@/lib/supabase/admin";

export async function POST(req: Request, { params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  // 만료·횟수·주문 상태(PAID)를 DB 함수 하나에서 원자적으로 확인하고 횟수를 올린다
  const { data, error } = await supabaseAdmin().rpc("use_download_link", { p_token_hash: hashToken(token) });
  if (error) return new NextResponse("error", { status: 500 });
  const link = data?.[0];
  if (!link) return NextResponse.redirect(new URL(`/download/${token}?expired=1`, req.url), 303);
  return streamOrderFile({ orderNo: link.order_no, linkId: link.link_id, via: "email_link", req });
}
