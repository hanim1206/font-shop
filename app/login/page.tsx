import Link from "next/link";
import AuthForm from "../AuthForm";
import { signIn } from "../auth-actions";

export default async function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next = "/", error } = await searchParams;
  return (
    <div className="narrow">
      <h1>로그인</h1>
      {error && <p className="error">인증 링크가 만료됐거나 잘못됐습니다. 다시 로그인해 주세요.</p>}
      <AuthForm action={signIn} mode="login" next={next} />
      <p className="muted"><Link href="/forgot-password">비밀번호를 잊으셨나요?</Link></p>
      <p className="muted">처음이신가요? <Link href={`/signup?next=${encodeURIComponent(next)}`}>회원가입</Link></p>
    </div>
  );
}
