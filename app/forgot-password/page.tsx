import Link from "next/link";
import { ResetRequestForm } from "../PasswordForms";

export default function ForgotPasswordPage() {
  return (
    <div className="narrow">
      <h1>비밀번호 찾기</h1>
      <p className="muted">가입한 이메일로 비밀번호 재설정 링크를 보내드립니다.</p>
      <ResetRequestForm />
      <p className="muted"><Link href="/login">로그인으로 돌아가기</Link></p>
    </div>
  );
}
