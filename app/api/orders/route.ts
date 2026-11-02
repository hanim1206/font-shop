// 결제창을 띄우기 직전에 주문을 만든다. 로그인 필수. 금액은 서버 카탈로그로 계산하고 동의 시각을 저장한다.
import { NextResponse } from "next/server";
import { findProduct, orderNameOf } from "@/lib/catalog";
import { insertOrder, newOrderId } from "@/lib/orders";
import { currentUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.email) return NextResponse.json({ error: "LOGIN_REQUIRED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });
  const product = findProduct(String(body.productSlug));
  if (!product) return NextResponse.json({ error: "INVALID_PRODUCT" }, { status: 400 });

  const licensee = String(body.licenseeName ?? "").trim();
  if (!licensee || licensee.length > 60) return NextResponse.json({ error: "INVALID_LICENSEE" }, { status: 400 });
  // 체크박스를 서버에서도 확인한다. 동의 없이는 주문을 만들지 않는다.
  if (body.agreedWithdrawalWaiver !== true || body.agreedEula !== true) {
    return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const order = await insertOrder({
    order_id: newOrderId(),
    user_id: user.id,
    product_slug: product.slug,
    font_id: product.fontId,
    order_name: orderNameOf(product),
    amount: product.price, // 클라이언트가 보낸 금액은 쓰지 않는다
    customer_email: user.email, // 메일은 가입한 이메일로
    licensee_name: licensee,
    withdrawal_waiver_agreed_at: now,
    eula_agreed_at: now,
  });
  return NextResponse.json({
    orderId: order.order_id,
    orderName: order.order_name,
    amount: order.amount,
    customerEmail: order.customer_email,
  });
}
