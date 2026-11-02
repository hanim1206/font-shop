"use client";

import { useActionState } from "react";
import type { AuthState } from "./auth-actions";

export default function AuthForm({
  action,
  mode,
  next,
}: {
  action: (s: AuthState, f: FormData) => Promise<AuthState>;
  mode: "signup" | "login";
  next: string;
}) {
  const [state, formAction, pending] = useActionState(action, {});
  return (
    <form action={formAction}>
      <input type="hidden" name="next" value={next} />
      <label htmlFor="email">이메일 (필수)</label>
      <input id="email" name="email" type="email" autoComplete="email" required />
      <label htmlFor="password">비밀번호{mode === "signup" && " (8자 이상)"}</label>
      <input id="password" name="password" type="password" autoComplete={mode === "signup" ? "new-password" : "current-password"} minLength={mode === "signup" ? 8 : undefined} required />
      {mode === "signup" && (
        <label className="check">
          <input type="checkbox" name="agree" required />
          <span>(필수) 이용약관에 동의하고, 주문·다운로드 안내를 위해 이메일을 수집하는 데 동의합니다.</span>
        </label>
      )}
      {state.error && <p className="error">{state.error}</p>}
      {state.info && <p className="ok">{state.info}</p>}
      <p><button className="block" disabled={pending}>{mode === "signup" ? "가입하기" : "로그인"}</button></p>
    </form>
  );
}
