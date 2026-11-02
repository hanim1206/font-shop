// 상세페이지 미리보기용 동적 서브셋. GET /api/preview?font=<slug>&text=<글자들>
import { NextResponse } from "next/server";
import { findProduct } from "@/lib/catalog";
import { allowGlyphs, MAX_CHARS_PER_REQUEST, previewWoff2, uniqueChars } from "@/lib/preview";

export async function GET(req: Request) {
  const url = new URL(req.url);
  const product = findProduct(url.searchParams.get("font") ?? "");
  if (!product) return new NextResponse("unknown font", { status: 404 });

  // 다른 사이트에서 이 주소를 @font-face 로 끌어다 쓰지 못하게 (브라우저가 보내는 헤더 기준, 억지력)
  const site = req.headers.get("sec-fetch-site");
  if (site && site !== "same-origin") return new NextResponse("forbidden", { status: 403 });

  const chars = uniqueChars(url.searchParams.get("text") ?? "");
  if (chars.length === 0) return new NextResponse("empty", { status: 400 });
  if (chars.length > MAX_CHARS_PER_REQUEST) return new NextResponse("too many characters", { status: 413 });

  const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || "local";
  if (!allowGlyphs(ip, chars)) return new NextResponse("preview limit reached", { status: 429 });

  const woff2 = await previewWoff2(product, chars);
  return new NextResponse(new Uint8Array(woff2), {
    headers: {
      "Content-Type": "font/woff2",
      "Cache-Control": "private, max-age=3600",
      "Cross-Origin-Resource-Policy": "same-origin",
      "X-Content-Type-Options": "nosniff",
    },
  });
}
