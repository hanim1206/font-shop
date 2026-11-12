import Link from "next/link";
import { notFound } from "next/navigation";
import { findProduct, LICENSE_TYPES, LICENSES, PRODUCTS, won } from "@/lib/catalog";
import { MAX_CHARS_PER_REQUEST } from "@/lib/preview";
import AddToCart from "./AddToCart";
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

      <AddToCart
        slug={p.slug}
        options={LICENSE_TYPES.map((t) => ({
          type: t,
          label: LICENSES[t].label,
          desc: LICENSES[t].desc,
          formats: (t === "desktop" ? [p.downloadName.split(".").pop()!] : LICENSES[t].formats).map((f) => f.toUpperCase()).join(" · "),
          price: won(p.prices[t]),
        }))}
      />
      <p className="muted">구매한 파일에는 구매자 이름과 주문번호가 기록됩니다.</p>
    </>
  );
}
