import Link from "next/link";
import { PRODUCTS, won } from "@/lib/catalog";
import { previewUrl } from "@/lib/preview";

// 목록 페이지. 견본 문장도 동적 서브셋으로 그 글자만 받아 그린다.
export default function Home() {
  const faces = PRODUCTS.map(
    (p) => `@font-face{font-family:"pv-${p.slug}";src:url("${previewUrl(p.slug, p.family + p.sample)}") format("woff2");font-display:swap}`,
  ).join("");
  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: faces }} />
      <h1>폰트</h1>
      <p className="muted">테스트용 더미 폰트입니다.</p>
      <div className="grid">
        {PRODUCTS.map((p) => (
          <Link key={p.slug} href={`/fonts/${p.slug}`} className="card font-card">
            <div className="row">
              <strong>{p.family} {p.style}</strong>
              <span className="muted">{won(p.price)}</span>
            </div>
            <p className="specimen" style={{ fontFamily: `"pv-${p.slug}", sans-serif` }}>{p.sample}</p>
          </Link>
        ))}
      </div>
    </>
  );
}
