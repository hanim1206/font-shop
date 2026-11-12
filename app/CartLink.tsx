"use client";

import Link from "next/link";
import { useCart } from "@/lib/cart-client";

// 상단 메뉴의 장바구니 (담은 개수)
export default function CartLink() {
  const items = useCart();
  return <Link href="/cart">장바구니{items?.length ? ` (${items.length})` : ""}</Link>;
}
