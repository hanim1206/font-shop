// 비공개 버킷에서 파일을 꺼내 attachment 로 내려준다. 내려줄 때마다 downloads 에 기록.
import "server-only";
import { NextResponse } from "next/server";
import { supabaseAdmin } from "./supabase/admin";

export async function streamOrderFile(opts: {
  orderNo: number;
  fileId?: string;
  linkId?: string;
  via: "email_link" | "account";
  req: Request;
}) {
  const db = supabaseAdmin();
  const pick = (format?: string) => {
    let q = db.from("order_files").select().eq("order_no", opts.orderNo);
    if (opts.fileId) q = q.eq("id", opts.fileId);
    if (format) q = q.eq("format", format);
    return q.order("created_at", { ascending: false }).limit(1).maybeSingle();
  };
  // 파일을 지정하지 않으면(메일 링크) 전체 묶음 zip, 묶음이 없는 예전 주문은 마지막 파일
  let { data: file } = await pick(opts.fileId ? undefined : "zip");
  if (!file && !opts.fileId) ({ data: file } = await pick());
  if (!file) return new NextResponse("file not found", { status: 404 });

  const { data: blob, error } = await db.storage.from("deliveries").download(file.storage_path);
  if (error || !blob) return new NextResponse("storage error", { status: 500 });

  await db.from("downloads").insert({
    order_no: opts.orderNo,
    file_id: file.id,
    link_id: opts.linkId ?? null,
    via: opts.via,
    ip: (opts.req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || null,
    ua: opts.req.headers.get("user-agent"),
  });

  return new NextResponse(blob.stream(), {
    headers: {
      "Content-Type": file.format === "zip" ? "application/zip" : "application/octet-stream",
      "Content-Disposition": `attachment; filename="${file.filename}"`,
      "Content-Length": String(file.bytes),
      "Cache-Control": "no-store",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
