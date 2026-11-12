import { LICENSE_TYPES, LICENSES, MAX_CART_ITEMS, publicCatalog } from "@/lib/catalog";
import CartView from "./CartView";

// 장바구니. 담은 목록은 브라우저에 있고, 이름·가격은 서버 카탈로그로 그린다.
export default function CartPage() {
  return (
    <div className="narrow">
      <h1>장바구니</h1>
      <CartView
        catalog={publicCatalog()}
        licenseLabels={Object.fromEntries(LICENSE_TYPES.map((t) => [t, LICENSES[t].label]))}
        maxItems={MAX_CART_ITEMS}
      />
    </div>
  );
}
