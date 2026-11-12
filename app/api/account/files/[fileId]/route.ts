// 로그인한 구매자의 재다운로드. RLS 로 자기 파일만 보이므로 남의 fileId 를 넣어도 찾지 못한다.
import { NextResponse } from "next/server";
import { streamOrderFile } from "@/lib/deliver";
import { supabaseServer } from "@/lib/supabase/server";

export async function POST(req: Request, { params }: { params: Promise<{ fileId: string }> }) {
  const { fileId } = await params;
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return NextResponse.redirect(new URL("/login?next=/account", req.url), 303);
  const { data: file } = await sb.from("order_files").select("id, order_no, orders!inner(status)").eq("id", fileId).maybeSingle();
  if (!file) return new NextResponse("not found", { status: 404 });
  if ((file.orders as unknown as { status: string }).status !== "PAID") return new NextResponse("order not active", { status: 403 });
  return streamOrderFile({ orderNo: file.order_no, fileId: file.id, via: "account", req });
}
