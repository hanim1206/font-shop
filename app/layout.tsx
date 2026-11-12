import type { ReactNode } from "react";
import Link from "next/link";
import { currentUser } from "@/lib/supabase/server";
import { isAdminEmail } from "@/lib/env";
import { signOut } from "./auth-actions";
import { SELLER } from "@/lib/catalog";
import CartLink from "./CartLink";
import "./globals.css";

export const metadata = { title: "Font Shop (테스트)", description: "개인 폰트 판매 테스트 사이트" };

export default async function RootLayout({ children }: { children: ReactNode }) {
  const user = await currentUser();
  return (
    <html lang="ko">
      <body>
        <header className="site">
          <div className="wrap">
            <Link href="/" className="logo">Font Shop</Link>
            <nav>
              <Link href="/">폰트</Link>
              <CartLink />
              {user ? (
                <>
                  <Link href="/account">내 구매내역</Link>
                  {isAdminEmail(user.email) && <Link href="/admin/orders">관리자</Link>}
                  <form action={signOut}><button className="ghost" type="submit">로그아웃</button></form>
                </>
              ) : (
                <>
                  <Link href="/login">로그인</Link>
                  <Link href="/signup">회원가입</Link>
                </>
              )}
            </nav>
          </div>
        </header>
        <main><div className="wrap">{children}</div></main>
        <footer className="site">
          <div className="wrap">
            테스트 사이트입니다. 결제는 토스페이먼츠 테스트 키로 동작하며 실제로 청구되지 않습니다.<br />
            판매자 {SELLER.name} · 사업자등록번호 {SELLER.bizNo} · 통신판매업 신고 {SELLER.mailOrderNo} · {SELLER.email}
          </div>
        </footer>
      </body>
    </html>
  );
}
