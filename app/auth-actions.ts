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
