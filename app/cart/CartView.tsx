"use client";

import Link from "next/link";
import { removeFromCart, useCart } from "@/lib/cart-client";
import type { PublicProduct } from "@/lib/catalog";

const won = (n: number) => `${n.toLocaleString("ko-KR")}원`;

export function useCartLines(catalog: PublicProduct[]) {
  const items = useCart();
  const lines = (items ?? []).flatMap((i) => {
    const p = catalog.find((c) => c.slug === i.slug);
    return p ? [{ ...i, product: p, price: p.prices[i.license] }] : []; // 판매가 끝난 상품은 빼고 보여 준다
  });
  return { loaded: items !== null, lines, total: lines.reduce((s, l) => s + l.price, 0) };
}

export function CartLines({ catalog, licenseLabels, removable }: { catalog: PublicProduct[]; licenseLabels: Record<string, string>; removable: boolean }) {
  const { lines, total } = useCartLines(catalog);
  return (
    <div className="card">
      <ul className="cart-lines">
        {lines.map((l) => (
          <li key={`${l.slug}:${l.license}`} className="row">
            <span>
              <Link href={`/fonts/${l.slug}`}>{l.product.family} {l.product.style}</Link>
              <span className="muted"> · {licenseLabels[l.license]}</span>
            </span>
            <span className="row" style={{ gap: 8 }}>
              {won(l.price)}
              {removable && (
                <button className="ghost" type="button" aria-label={`${l.product.family} ${l.product.style} ${licenseLabels[l.license]} 빼기`} onClick={() => removeFromCart(l.slug, l.license)}>
                  빼기
                </button>
              )}
            </span>
          </li>
        ))}
      </ul>
      <div className="row cart-total"><strong>합계</strong><strong>{won(total)}</strong></div>
    </div>
  );
}

export default function CartView({ catalog, licenseLabels, maxItems }: { catalog: PublicProduct[]; licenseLabels: Record<string, string>; maxItems: number }) {
  const { loaded, lines } = useCartLines(catalog);
  if (!loaded) return null;
  if (!lines.length) return <p>장바구니가 비어 있습니다. <Link href="/">폰트 보러 가기</Link></p>;
  return (
    <>
      <CartLines catalog={catalog} licenseLabels={licenseLabels} removable />
      {lines.length > maxItems ? (
        <p className="error">한 번에 {maxItems}개까지 결제할 수 있습니다. 몇 개를 빼 주세요.</p>
      ) : (
        <p><Link className="btn block" href="/checkout">결제하기</Link></p>
      )}
      <p className="muted">Desktop은 PC에 설치하는 폰트 파일, Web은 웹사이트용 웹폰트 파일입니다. 같은 웨이트를 둘 다 쓰려면 둘 다 담아 주세요.</p>
    </>
  );
}
