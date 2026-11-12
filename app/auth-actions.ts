"use server";

import { redirect } from "next/navigation";
import { siteUrl } from "@/lib/env";
import { supabaseServer } from "@/lib/supabase/server";

export type AuthState = { error?: string; info?: string };

const safeNext = (v: FormDataEntryValue | null) => {
  const s = String(v ?? "");
  return s.startsWith("/") && !s.startsWith("//") ? s : "/";
};

export async function signUp(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const next = safeNext(form.get("next"));
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 주소를 확인해 주세요." };
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (form.get("agree") !== "on") return { error: "이용약관과 개인정보 수집에 동의해 주세요." };

  const sb = await supabaseServer();
  const { data, error } = await sb.auth.signUp({
    email,
    password,
    options: { emailRedirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent(next)}` },
  });
  if (error) return { error: error.code === "user_already_exists" ? "이미 가입된 이메일입니다." : error.message };
  // 이메일 인증을 켠 프로젝트면 세션이 없다 → 메일 확인 안내
  if (!data.session) return { info: `${email} 로 인증 메일을 보냈습니다. 메일의 링크를 누르면 가입이 끝납니다.` };
  redirect(next);
}

export async function signIn(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  const password = String(form.get("password") ?? "");
  const sb = await supabaseServer();
  const { error } = await sb.auth.signInWithPassword({ email, password });
  if (error) {
    if (error.code === "email_not_confirmed") return { error: "이메일 인증이 아직 안 됐습니다. 받은 메일의 링크를 눌러 주세요." };
    return { error: "이메일 또는 비밀번호가 맞지 않습니다." };
  }
  redirect(safeNext(form.get("next")));
}

export async function signOut() {
  const sb = await supabaseServer();
  await sb.auth.signOut();
  redirect("/");
}

// 비밀번호 재설정 메일. 가입 여부를 알려주지 않도록 결과와 상관없이 같은 안내를 보여준다.
export async function requestPasswordReset(_: AuthState, form: FormData): Promise<AuthState> {
  const email = String(form.get("email") ?? "").trim().toLowerCase();
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 주소를 확인해 주세요." };
  const sb = await supabaseServer();
  const { error } = await sb.auth.resetPasswordForEmail(email, {
    redirectTo: `${siteUrl()}/auth/callback?next=${encodeURIComponent("/account/password")}`,
  });
  if (error?.code === "over_email_send_rate_limit") return { error: "메일 요청이 너무 많습니다. 잠시 후 다시 시도해 주세요." };
  return { info: `${email} 로 가입된 계정이 있으면 비밀번호 재설정 메일을 보냈습니다. 메일의 링크는 이 브라우저에서 열어 주세요.` };
}

// 새 비밀번호 저장. 재설정 메일 링크로 들어왔거나 로그인한 상태여야 한다.
export async function updatePassword(_: AuthState, form: FormData): Promise<AuthState> {
  const password = String(form.get("password") ?? "");
  const confirm = String(form.get("confirm") ?? "");
  if (password.length < 8) return { error: "비밀번호는 8자 이상이어야 합니다." };
  if (password !== confirm) return { error: "두 비밀번호가 다릅니다." };
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) return { error: "로그인이 풀렸습니다. 재설정 메일을 다시 받아 주세요." };
  const { error } = await sb.auth.updateUser({ password });
  if (error) {
    if (error.code === "same_password") return { error: "지금 쓰는 비밀번호와 다른 비밀번호를 입력해 주세요." };
    if (error.code === "weak_password") return { error: "비밀번호가 너무 약합니다. 더 길게 만들어 주세요." };
    return { error: "비밀번호를 바꾸지 못했습니다. 잠시 후 다시 시도해 주세요." };
  }
  return { info: "비밀번호를 바꿨습니다." };
}
