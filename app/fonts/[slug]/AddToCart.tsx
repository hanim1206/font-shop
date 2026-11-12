"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { addToCart, useCart } from "@/lib/cart-client";
import type { LicenseType } from "@/lib/catalog";

type Option = { type: LicenseType; label: string; desc: string; formats: string; price: string };

// 라이선스 고르기 → 장바구니 담기 / 바로 구매
export default function AddToCart({ slug, options }: { slug: string; options: Option[] }) {
  const [license, setLicense] = useState<LicenseType>(options[0].type);
  const [added, setAdded] = useState(false);
  const cart = useCart();
  const router = useRouter();
  const inCart = cart?.some((i) => i.slug === slug && i.license === license);

  return (
    <div className="card">
      <fieldset className="licenses">
        <legend>라이선스</legend>
        {options.map((o) => (
          <label key={o.type} className={`license-option${license === o.type ? " on" : ""}`}>
            <input type="radio" name="license" value={o.type} checked={license === o.type} onChange={() => { setLicense(o.type); setAdded(false); }} />
            <span className="row" style={{ flex: 1 }}>
              <span>
                <strong>{o.label}</strong>
                <span className="muted" style={{ display: "block" }}>{o.desc} · {o.formats}</span>
              </span>
              <strong>{o.price}</strong>
            </span>
          </label>
        ))}
      </fieldset>
      <div className="actions">
        <button
          className="ghost"
          type="button"
          disabled={cart === null || inCart}
          onClick={() => setAdded(addToCart(slug, license))}
        >
          {inCart ? "장바구니에 있음" : "장바구니 담기"}
        </button>
        <button
          type="button"
          disabled={cart === null}
          onClick={() => { addToCart(slug, license); router.push("/checkout"); }}
        >
          바로 구매
        </button>
      </div>
      {(added || inCart) && <p className="muted" style={{ marginBottom: 0 }}><Link href="/cart">장바구니 보기 →</Link></p>}
    </div>
  );
}
