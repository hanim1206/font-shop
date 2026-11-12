import { redirect } from "next/navigation";
import { supabaseServer } from "@/lib/supabase/server";
import { NewPasswordForm } from "../../PasswordForms";

export const dynamic = "force-dynamic";

// 재설정 메일 링크(/auth/callback?next=/account/password)로 들어오거나, 로그인한 상태에서 비밀번호를 바꾼다.
export default async function PasswordPage() {
  const sb = await supabaseServer();
  const { data: auth } = await sb.auth.getUser();
  if (!auth.user) redirect("/login?next=/account/password");
  return (
    <div className="narrow">
      <h1>비밀번호 변경</h1>
      <p className="muted">{auth.user.email}</p>
      <NewPasswordForm />
    </div>
  );
}
