import { redirect } from "next/navigation";

// 예전 단건 결제 주소. 이제는 상세 페이지에서 라이선스를 골라 장바구니로 결제한다.
export default async function OldCheckout({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  redirect(`/fonts/${encodeURIComponent(slug)}`);
}
