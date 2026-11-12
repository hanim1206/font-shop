"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, updatePassword, type AuthState } from "./auth-actions";

export function ResetRequestForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(requestPasswordReset, {});
  return (
    <form action={formAction}>
      <label htmlFor="email">가입한 이메일</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      {state.error && <p className="error">{state.error}</p>}
      {state.info && <p className="ok">{state.info}</p>}
      <p><button className="block" disabled={pending}>재설정 메일 받기</button></p>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, formAction, pending] = useActionState<AuthState, FormData>(updatePassword, {});
  return (
    <form action={formAction}>
      <label htmlFor="password">새 비밀번호 (8자 이상)</label>
      <input id="password" name="password" type="password" autoComplete="new-password" minLength={8} required />
      <label htmlFor="confirm">새 비밀번호 확인</label>
      <input id="confirm" name="confirm" type="password" autoComplete="new-password" minLength={8} required />
      {state.error && <p className="error">{state.error}</p>}
      {state.info && <p className="ok">{state.info} <Link href="/account">내 구매내역으로</Link></p>}
      <p><button className="block" disabled={pending}>비밀번호 바꾸기</button></p>
    </form>
  );
}
