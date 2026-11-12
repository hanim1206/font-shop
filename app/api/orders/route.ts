// 결제창을 띄우기 직전에 주문을 만든다. 로그인 필수. 금액은 서버 카탈로그로 계산하고 동의 시각을 저장한다.
// body: { items: [{ slug, license: "desktop" | "web" }], licenseeName, licenseeType, bizNo?, webDomain?, agreed… }
import { NextResponse } from "next/server";
import { normalizeDomain, orderNameOf, priceCart } from "@/lib/catalog";
import { insertOrder, newOrderId } from "@/lib/orders";
import { currentUser } from "@/lib/supabase/server";

export async function POST(req: Request) {
  const user = await currentUser();
  if (!user?.email) return NextResponse.json({ error: "LOGIN_REQUIRED" }, { status: 401 });

  const body = await req.json().catch(() => null);
  if (!body) return NextResponse.json({ error: "INVALID_JSON" }, { status: 400 });

  const cart = priceCart(body.items);
  if ("error" in cart) return NextResponse.json({ error: cart.error }, { status: 400 });

  const licensee = String(body.licenseeName ?? "").trim();
  if (!licensee || licensee.length > 60) return NextResponse.json({ error: "INVALID_LICENSEE" }, { status: 400 });
  const licenseeType = body.licenseeType === "company" ? "company" : "personal";
  const bizNo = licenseeType === "company" ? String(body.bizNo ?? "").replace(/\D/g, "") : "";
  if (bizNo && bizNo.length !== 10) return NextResponse.json({ error: "INVALID_BIZ_NO" }, { status: 400 });

  // Web 라이선스가 있으면 쓸 도메인 1개가 필요하다 (라이선스 증서와 폰트 파일에 기록)
  const hasWeb = cart.items.some((i) => i.license === "web");
  const webDomain = hasWeb ? normalizeDomain(body.webDomain) : null;
  if (hasWeb && !webDomain) return NextResponse.json({ error: "INVALID_DOMAIN" }, { status: 400 });

  // 체크박스를 서버에서도 확인한다. 동의 없이는 주문을 만들지 않는다.
  if (body.agreedWithdrawalWaiver !== true || body.agreedEula !== true) {
    return NextResponse.json({ error: "CONSENT_REQUIRED" }, { status: 400 });
  }

  const now = new Date().toISOString();
  const order = await insertOrder(
    {
      order_id: newOrderId(),
      user_id: user.id,
      order_name: orderNameOf(cart.items),
      amount: cart.total, // 클라이언트가 보낸 금액은 쓰지 않는다
      customer_email: user.email, // 메일은 가입한 이메일로
      licensee_name: licensee,
      licensee_type: licenseeType,
      biz_no: bizNo ? `${bizNo.slice(0, 3)}-${bizNo.slice(3, 5)}-${bizNo.slice(5)}` : null,
      web_domain: webDomain,
      withdrawal_waiver_agreed_at: now,
      eula_agreed_at: now,
    },
    cart.items,
  );
  return NextResponse.json({
    orderId: order.order_id,
    orderName: order.order_name,
    amount: order.amount,
    customerEmail: order.customer_email,
  });
}
