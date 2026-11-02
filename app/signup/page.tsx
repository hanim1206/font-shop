import Link from "next/link";
import AuthForm from "../AuthForm";
import { signUp } from "../auth-actions";

export default async function SignupPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next = "/" } = await searchParams;
  return (
    <div className="narrow">
      <h1>회원가입</h1>
      <p className="muted">구매한 폰트의 다운로드 링크를 가입한 이메일로 보내드립니다.</p>
      <AuthForm action={signUp} mode="signup" next={next} />
      <p className="muted">이미 계정이 있나요? <Link href={`/login?next=${encodeURIComponent(next)}`}>로그인</Link></p>
    </div>
  );
}
