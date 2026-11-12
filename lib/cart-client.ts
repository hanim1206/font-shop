"use client";
// 장바구니는 브라우저 localStorage 에만 둔다 (유빈 사이트의 typiEung-cart 와 같은 방식).
// 가격은 저장하지 않는다. 화면은 서버가 준 카탈로그로, 결제 금액은 서버가 다시 계산한다.
import { useEffect, useState } from "react";
import type { CartItem, LicenseType } from "./catalog";

const KEY = "fontshop-cart";
const EVENT = "fontshop-cart-change";

export function readCart(): CartItem[] {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? "[]");
    return Array.isArray(v) ? v.filter((i) => i && typeof i.slug === "string" && (i.license === "desktop" || i.license === "web")) : [];
  } catch {
    return [];
  }
}

function write(items: CartItem[]) {
  localStorage.setItem(KEY, JSON.stringify(items));
  window.dispatchEvent(new Event(EVENT));
}

export function addToCart(slug: string, license: LicenseType): boolean {
  const cart = readCart();
  if (cart.some((i) => i.slug === slug && i.license === license)) return false;
  write([...cart, { slug, license }]);
  return true;
}

export function removeFromCart(slug: string, license: LicenseType) {
  write(readCart().filter((i) => !(i.slug === slug && i.license === license)));
}

export function clearCart() {
  write([]);
}

/** 다른 탭·컴포넌트에서 바뀌어도 따라가는 장바구니 상태. 첫 렌더(서버)에서는 null. */
export function useCart(): CartItem[] | null {
  const [items, setItems] = useState<CartItem[] | null>(null);
  useEffect(() => {
    const sync = () => setItems(readCart());
    sync();
    window.addEventListener(EVENT, sync);
    window.addEventListener("storage", sync);
    return () => {
      window.removeEventListener(EVENT, sync);
      window.removeEventListener("storage", sync);
    };
  }, []);
  return items;
}
