// service role 클라이언트. RLS 를 우회하므로 서버 코드에서만, 사용자 입력을 검증한 뒤에만 쓴다.
import "server-only";
import { createClient } from "@supabase/supabase-js";
import { required } from "../env";
import type { Database } from "./database.types";

let client: ReturnType<typeof createClient<Database>> | null = null;

export function supabaseAdmin() {
  client ??= createClient<Database>(required("NEXT_PUBLIC_SUPABASE_URL"), required("SUPABASE_SECRET_KEY"), {
    auth: { persistSession: false, autoRefreshToken: false },
  });
  return client;
}
