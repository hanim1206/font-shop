import Link from "next/link";
import { redirect } from "next/navigation";
import { LICENSE_TYPES, LICENSES, publicCatalog } from "@/lib/catalog";
import { currentUser } from "@/lib/supabase/server";
import CheckoutForm from "./CheckoutForm";

// 결제 페이지. 로그인한 사람만 (다운로드 링크를 가입 이메일로 보내기 때문). 장바구니 전체를 한 주문으로 결제한다.
export default async function CheckoutPage() {
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent("/checkout")}`);

  return (
    <div className="narrow">
      <p className="muted"><Link href="/cart">← 장바구니</Link></p>
      <h1>결제</h1>
      <CheckoutForm
        catalog={publicCatalog()}
        licenseLabels={Object.fromEntries(LICENSE_TYPES.map((t) => [t, LICENSES[t].label]))}
        email={user.email ?? ""}
        clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""}
        customerKey={user.id}
      />
    </div>
  );
}
