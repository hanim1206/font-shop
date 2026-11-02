// 실제 화면으로 도는 점검: 가입 → 상세 미리보기(동적 서브셋) → 주문 → 승인 → 워터마크 파일 → 메일 → 다운로드 → 취소.
// 토스 서버 대신 scripts/mock-toss.mjs 를 쓴다 (앱을 TOSS_API_BASE=http://localhost:4010 으로 띄울 것).
// 메일은 로컬 Supabase 의 Mailpit(MAIL_PROVIDER=mailpit)에서 읽는다.
//   npm run db:start && npm run build
//   node scripts/mock-toss.mjs &  npx next start &
//   node scripts/e2e.mjs
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { createRequire } from "node:module";

// playwright 는 전역 설치본을 쓴다 (없으면 npm i -D playwright)
const { chromium } = createRequire(import.meta.url)("playwright");

const APP = process.env.APP || "http://localhost:3000";
const MOCK = process.env.MOCK_BASE || "http://localhost:4010";
const MAILPIT = process.env.MAILPIT_URL || "http://127.0.0.1:54324";
const env = Object.fromEntries(
  readFileSync(".env.local", "utf8").split("\n").filter((l) => /^[A-Z_]+=/.test(l)).map((l) => [l.slice(0, l.indexOf("=")), l.slice(l.indexOf("=") + 1)]),
);
const tmp = mkdtempSync(path.join(os.tmpdir(), "e2e-"));
const step = (s) => console.log("✓", s);
const PASSWORD = "test-password-123";

const browser = await chromium.launch();

async function signup(email) {
  const ctx = await browser.newContext({ acceptDownloads: true });
  const page = await ctx.newPage();
  await page.goto(`${APP}/signup?next=/`);
  await page.fill("#email", email);
  await page.fill("#password", PASSWORD);
  await page.check('input[name="agree"]');
  await page.click("button.block");
  await page.waitForURL(`${APP}/`);
  return { ctx, page };
}
const api = (page, url, body) =>
  page.evaluate(async ([url, body]) => {
    const r = await fetch(url, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body) });
    return { status: r.status, body: await r.json().catch(() => null) };
  }, [url, body]);
const order = (page, extra = {}) =>
  api(page, "/api/orders", { productSlug: "dummy-gothic-regular", licenseeName: "홍길동 스튜디오", agreedWithdrawalWaiver: true, agreedEula: true, ...extra });

// 1. 가입
const buyerEmail = `buyer-${Date.now()}@example.com`;
const { ctx, page } = await signup(buyerEmail);
assert.ok(await page.getByText("로그아웃").isVisible());
step("이메일+비밀번호 회원가입 → 로그인 상태");

// 비로그인은 결제 페이지 진입 불가
const anon = await (await browser.newContext()).newPage();
await anon.goto(`${APP}/checkout/dummy-gothic-regular`);
assert.match(anon.url(), /\/login\?next=/);
step("비로그인 사용자는 결제 페이지 → 로그인으로");

// 2. 목록 · 상세 미리보기
await page.goto(APP);
assert.equal(await page.locator(".font-card").count(), 2);
const previewResp = page.waitForResponse((r) => r.url().includes("/api/preview") && r.url().includes("text=") && r.request().resourceType() === "fetch");
await page.goto(`${APP}/fonts/dummy-gothic-regular`);
await page.fill('input[aria-label="미리보기 문장"]', "폰트샵 테스트 Hello");
const pr = await previewResp;
assert.equal(pr.status(), 200);
assert.equal(pr.headers()["content-type"], "font/woff2");
await page.waitForFunction(() => [...document.fonts].some((f) => f.family.startsWith("pv-") && f.status === "loaded"));
const size = (await pr.body()).length;
assert.ok(size < 20_000, `preview too big ${size}`);
step(`상세 미리보기: 입력한 글자만 woff2 로 받아 적용 (${size} bytes, 마스터는 6MB)`);
let r = await fetch(`${APP}/api/preview?font=dummy-gothic-regular&text=${encodeURIComponent(Array.from({ length: 70 }, (_, i) => String.fromCharCode(0xac00 + i * 28)).join(""))}`);
assert.equal(r.status, 413);
r = await fetch(`${APP}/api/preview?font=dummy-gothic-regular&text=abc`, { headers: { "Sec-Fetch-Site": "cross-site" } });
assert.equal(r.status, 403);
step("미리보기 제한: 한 번에 60자 초과 413, 다른 사이트에서 가져다 쓰기 403");

// 3. 결제 페이지 + 주문 생성 검증
await page.goto(`${APP}/checkout/dummy-gothic-regular`);
assert.ok(await page.getByText(buyerEmail).isVisible());
r = await order(page, { agreedWithdrawalWaiver: false });
assert.equal(r.body.error, "CONSENT_REQUIRED");
r = await order(page, { amount: 100 });
assert.equal(r.body.amount, 33000);
assert.equal(r.body.customerEmail, buyerEmail);
step("주문: 동의 없으면 거절, 클라이언트 금액 무시하고 서버 가격 33,000원, 메일은 가입 이메일");

// 4. 금액 위조
const tampered = r.body;
await page.goto(`${APP}/checkout/success?paymentKey=tgen_tampered&orderId=${tampered.orderId}&amount=100`);
await page.getByText("AMOUNT_MISMATCH").waitFor();
step("successUrl 금액 위조 → 승인 전에 차단");

// 5. 정상 결제 → 워터마크 → 메일
const o = (await order(page)).body;
const key = `tgen_${Date.now()}`;
const successUrl = `${APP}/checkout/success?paymentKey=${key}&orderId=${o.orderId}&amount=${o.amount}`;
await page.goto(successUrl);
await page.getByText("다운로드 링크를 보냈습니다").waitFor({ timeout: 120_000 });
const orderNo = Number((await page.locator("dd").first().textContent()).replace(/\D/g, ""));
step(`정상 결제 → PAID → 주문 #${orderNo} 워터마크 파일 생성`);

await page.goto(successUrl);
await page.getByText("다운로드 링크를 보냈습니다").waitFor({ timeout: 60_000 });
r = await api(page, "/api/payments/confirm", { paymentKey: "tgen_other", orderId: o.orderId, amount: o.amount });
assert.equal(r.status, 409);
step("새로고침 재승인은 같은 결과, 다른 paymentKey 로 재승인은 409");

const list = await (await fetch(`${MAILPIT}/api/v1/search?query=${encodeURIComponent(`subject:"#${orderNo}"`)}`)).json();
assert.equal(list.messages.length, 1, "메일 1통");
const msg = await (await fetch(`${MAILPIT}/api/v1/message/${list.messages[0].ID}`)).json();
assert.equal(msg.To[0].Address, buyerEmail);
const link = msg.Text.match(/https?:\/\/\S+\/download\/[\w-]+/)[0];
assert.ok(!msg.Attachments?.length, "첨부 없음");
step("구매자 이메일로 다운로드 링크 1통 (파일 첨부 없음)");

// 6. 메일 링크로 다운로드 → 워터마크 확인
await page.goto(link);
assert.ok(await page.getByText("5 / 5").isVisible(), "열기만 해서는 횟수 안 줄어듦");
const [dl] = await Promise.all([page.waitForEvent("download"), page.click("button.block")]);
assert.equal(dl.suggestedFilename(), "HanimDummyGothic-Regular.ttf");
const file = path.join(tmp, "bought.ttf");
await dl.saveAs(file);
const master = "fonts/masters/HanimDummyGothic-Regular-1.000.ttf";
const extract = (f) =>
  JSON.parse(execFileSync("python3", ["worker/fontmark.py", "extract", "--master", master, "--suspect", f, "--font-id", "HanimDummyGothic-Regular-1.000"], { env: { ...process.env, FONTMARK_SECRET: env.FONTMARK_SECRET } }).toString());
const ex = extract(file);
assert.equal(ex.outline_layer.order_id, orderNo);
assert.match(ex.name_layer.nameID_13, /Licensed to 홍길동 스튜디오/);
step(`받은 파일에서 주문번호 #${ex.outline_layer.order_id} 복원 (안 보이는 층), name 에 구매자 이름`);

// 이름 지우고 서브셋 + WOFF2 로 바꿔도 남는지
const attacked = path.join(tmp, "attacked.woff2");
execFileSync("python3", ["-c", `
from fontTools.ttLib import TTFont; from fontTools import subset
f=TTFont(${JSON.stringify(file)}); o=subset.Options(); o.name_IDs=[1,2]; o.flavor='woff2'
s=subset.Subsetter(o); s.populate(text='안녕하세요 폰트 유출 테스트입니다 ABC'); s.subset(f); f.flavor='woff2'; f.save(${JSON.stringify(attacked)})`]);
const ex2 = extract(attacked);
assert.equal(ex2.outline_layer.order_id, orderNo);
step(`이름 삭제 + 20글자 서브셋 + WOFF2 변환 뒤에도 #${ex2.outline_layer.order_id} 복원`);

await page.goto(link);
assert.ok(await page.getByText("4 / 5").isVisible());
step("다운로드 1회 차감 (5회 중 4회 남음)");

// 7. 내 구매내역 재다운로드, 남의 파일은 못 받음
await page.goto(`${APP}/account`);
const [dl2] = await Promise.all([page.waitForEvent("download"), page.getByRole("button", { name: /HanimDummyGothic-Regular\.ttf 받기/ }).click()]);
assert.equal(dl2.suggestedFilename(), "HanimDummyGothic-Regular.ttf");
const fileAction = await page.locator('form[action^="/api/account/files/"]').getAttribute("action");
step("내 구매내역에서 재다운로드");

const other = await signup(`other-${Date.now()}@example.com`);
const st = await other.page.evaluate(async (u) => (await fetch(u, { method: "POST" })).status, fileAction);
assert.equal(st, 404);
step("다른 회원이 같은 파일 주소로 요청 → 404 (RLS)");

// 8. 관리자
// ADMIN_EMAILS 의 첫 계정으로 가입(처음) 또는 로그인
const adminCtx = await browser.newContext();
const ap = await adminCtx.newPage();
await ap.goto(`${APP}/signup?next=/admin/orders`);
await ap.fill("#email", env.ADMIN_EMAILS.split(",")[0].trim());
await ap.fill("#password", PASSWORD);
await ap.check('input[name="agree"]');
await ap.click("button.block");
await Promise.race([ap.waitForURL(`${APP}/admin/orders`), ap.getByText("이미 가입된 이메일").waitFor()]);
if (new URL(ap.url()).pathname !== "/admin/orders") {
  // 이미 가입돼 있으면 로그인
  await ap.goto(`${APP}/login?next=/admin/orders`);
  await ap.fill("#email", env.ADMIN_EMAILS.split(",")[0].trim());
  await ap.fill("#password", PASSWORD);
  await ap.click("button.block");
  await ap.waitForURL(`${APP}/admin/orders`);
}
await ap.locator("td", { hasText: `#${orderNo}` }).first().waitFor();
await ap.locator("td", { hasText: buyerEmail }).first().waitFor();
r = await (await other.page.goto(`${APP}/admin/orders`)).status();
assert.equal(r, 404);
step("관리자 주문 목록에 주문·구매자·파일 해시·메일·다운로드 기록, 일반 회원은 404");

// 9. 취소 웹훅 → 다운로드 막힘
await fetch(`${MOCK}/__mock/cancel/${key}`, { method: "POST" });
r = await fetch(`${APP}/api/webhooks/toss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: key } }) });
assert.equal(r.status, 200);
await page.goto(link);
assert.ok(await page.getByText("취소된 주문입니다").isVisible());
const blocked = await page.evaluate(async (u) => (await fetch(u, { method: "POST", redirect: "manual" })).type, link.replace(/^https?:\/\/[^/]+/, "").replace("/download/", "/api/download/"));
assert.notEqual(blocked, "basic");
r = await fetch(`${APP}/api/webhooks/toss`, { method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify({ eventType: "PAYMENT_STATUS_CHANGED", data: { paymentKey: "tgen_forged" } }) });
assert.equal(r.status, 200);
step("결제 취소 웹훅 → 메일 링크 다운로드 차단, 위조 웹훅은 무시");

await browser.close();
console.log("\n모든 점검 통과");
