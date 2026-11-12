// 메일 발송. 파일은 첨부하지 않고 다운로드 링크만 보낸다.
//   MAIL_PROVIDER=resend  : Resend API (RESEND_API_KEY). 테스트 모드(onboarding@resend.dev)는 가입한 본인 메일로만 보낼 수 있다
//   MAIL_PROVIDER=mailpit : 로컬 Supabase 에 딸린 Mailpit(http://127.0.0.1:54324) 으로 보내서 브라우저로 확인
//   없음                  : 보내지 않고 기록만 (서버 로그에 링크 출력)
// MAIL_TO_OVERRIDE 를 넣으면 수신자를 그 주소로 바꾼다 (테스트 기간엔 내 메일로만).
import "server-only";
import { supabaseAdmin } from "./supabase/admin";

type Mail = { to: string; subject: string; html: string; text: string; orderNo?: number };

export async function sendMail(m: Mail): Promise<{ status: "sent" | "failed" | "skipped"; error?: string }> {
  const provider = process.env.MAIL_PROVIDER || "";
  const from = process.env.MAIL_FROM || "Font Shop <onboarding@resend.dev>";
  const to = process.env.MAIL_TO_OVERRIDE || m.to;
  let status: "sent" | "failed" | "skipped" = "skipped";
  let providerId: string | null = null;
  let error: string | undefined;

  try {
    if (provider === "resend") {
      const r = await fetch("https://api.resend.com/emails", {
        method: "POST",
        headers: { Authorization: `Bearer ${process.env.RESEND_API_KEY}`, "Content-Type": "application/json" },
        body: JSON.stringify({ from, to: [to], subject: m.subject, html: m.html, text: m.text }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status} ${body.message ?? body.name ?? ""}`);
      status = "sent";
      providerId = body.id ?? null;
    } else if (provider === "mailpit") {
      const base = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
      const r = await fetch(`${base}/api/v1/send`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          From: { Email: from.match(/<(.+)>/)?.[1] ?? from, Name: "Font Shop" },
          To: [{ Email: to }],
          Subject: m.subject,
          HTML: m.html,
          Text: m.text,
        }),
      });
      const body = await r.json().catch(() => ({}));
      if (!r.ok) throw new Error(`${r.status} ${JSON.stringify(body)}`);
      status = "sent";
      providerId = body.ID ?? null;
    } else {
      console.log(`[mail skipped] to=${to} subject=${m.subject}\n${m.text}`);
    }
  } catch (e) {
    status = "failed";
    error = (e as Error).message;
    console.error("[mail failed]", error);
  }

  await supabaseAdmin()
    .from("emails")
    .insert({ order_no: m.orderNo ?? null, to_email: to, subject: m.subject, status, provider_id: providerId, error: error ?? null });
  return { status, error };
}

const esc = (s: string) => s.replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);

export function deliveryMail(p: { orderNo: number; orderName: string; amount: number; licensee: string; link: string; expiresAt: string; maxUses: number; accountUrl: string }) {
  const exp = new Date(p.expiresAt).toLocaleString("ko-KR", { timeZone: "Asia/Seoul" });
  const text = [
    `${p.licensee} 님, 구매해 주셔서 감사합니다.`,
    ``,
    `주문 #${p.orderNo} · ${p.orderName} · ${p.amount.toLocaleString("ko-KR")}원`,
    ``,
    `다운로드: ${p.link}`,
    `(${exp}까지, ${p.maxUses}회. 이후에는 내 구매내역에서 다시 받을 수 있습니다: ${p.accountUrl})`,
    ``,
    `폰트 파일에는 구매자 이름과 주문번호가 기록되어 있습니다. 다른 사람에게 파일을 넘기지 말아 주세요.`,
  ].join("\n");
  const html = `<div style="font-family:system-ui,sans-serif;line-height:1.6;color:#191f28">
<p>${esc(p.licensee)} 님, 구매해 주셔서 감사합니다.</p>
<p><strong>주문 #${p.orderNo}</strong><br>${esc(p.orderName)} · ${p.amount.toLocaleString("ko-KR")}원</p>
<p><a href="${esc(p.link)}" style="display:inline-block;padding:12px 20px;background:#191f28;color:#fff;border-radius:8px;text-decoration:none">폰트 다운로드</a></p>
<p style="color:#6b7684;font-size:13px">${esc(exp)}까지 ${p.maxUses}회 받을 수 있습니다. 이후에는 <a href="${esc(p.accountUrl)}">내 구매내역</a>에서 다시 받으세요.<br>
폰트 파일에는 구매자 이름과 주문번호가 기록되어 있습니다. 다른 사람에게 파일을 넘기지 말아 주세요.</p></div>`;
  return { subject: `[Font Shop] 주문 #${p.orderNo} 폰트 다운로드 안내`, text, html };
}
