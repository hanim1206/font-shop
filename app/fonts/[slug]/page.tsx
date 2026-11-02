import Link from "next/link";
import { notFound } from "next/navigation";
import { findProduct, LICENSE_LABEL, PRODUCTS, won } from "@/lib/catalog";
import { MAX_CHARS_PER_REQUEST } from "@/lib/preview";
import Preview from "./Preview";

export function generateStaticParams() {
  return PRODUCTS.map((p) => ({ slug: p.slug }));
}

// 상세 페이지. 입력한 글자만 서버에서 잘라 받는 미리보기(동적 서브셋)
export default async function FontPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = findProduct(slug);
  if (!p) notFound();
  return (
    <>
      <p className="muted"><Link href="/">폰트</Link> / {p.family}</p>
      <div className="row">
        <h1>{p.family} {p.style}</h1>
      </div>
      <p className="muted">{p.description}</p>

      <Preview slug={p.slug} initial={p.sample} maxChars={MAX_CHARS_PER_REQUEST} />

      <div className="card">
        <div className="row">
          <div>
            <strong>{LICENSE_LABEL}</strong>
            <p className="muted" style={{ margin: "4px 0 0" }}>인쇄·출판, 영상, 웹 이미지, 굿즈 등 콘텐츠 제작 · {p.downloadName.split(".").pop()?.toUpperCase()} 파일</p>
          </div>
          <strong>{won(p.price)}</strong>
        </div>
        <p style={{ marginBottom: 0 }}><Link className="btn block" href={`/checkout/${p.slug}`}>구매하기</Link></p>
      </div>
      <p className="muted">구매한 파일에는 구매자 이름과 주문번호가 기록됩니다.</p>
    </>
  );
}
