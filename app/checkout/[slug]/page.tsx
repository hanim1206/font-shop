import Link from "next/link";
import { notFound, redirect } from "next/navigation";
import { findProduct, LICENSE_LABEL, won } from "@/lib/catalog";
import { currentUser } from "@/lib/supabase/server";
import CheckoutForm from "./CheckoutForm";

// 결제 페이지. 로그인한 사람만 (다운로드 링크를 가입 이메일로 보내기 때문)
export default async function CheckoutPage({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const p = findProduct(slug);
  if (!p) notFound();
  const user = await currentUser();
  if (!user) redirect(`/login?next=${encodeURIComponent(`/checkout/${slug}`)}`);

  return (
    <div className="narrow">
      <p className="muted"><Link href={`/fonts/${p.slug}`}>← {p.family} {p.style}</Link></p>
      <h1>결제</h1>
      <div className="card">
        <div className="row"><strong>{p.family} {p.style}</strong><strong>{won(p.price)}</strong></div>
        <p className="muted" style={{ margin: "4px 0 0" }}>{LICENSE_LABEL}</p>
      </div>
      <CheckoutForm productSlug={p.slug} amount={p.price} email={user.email ?? ""} clientKey={process.env.NEXT_PUBLIC_TOSS_CLIENT_KEY ?? ""} customerKey={user.id} />
    </div>
  );
}
