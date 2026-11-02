// 토스 API 를 흉내 내는 로컬 목 서버. 실서버에 닿을 수 없는 환경에서 서버 흐름만 검증할 때 쓴다.
//   node scripts/mock-toss.mjs            (기본 포트 4010)
//   TOSS_API_BASE=http://localhost:4010 npm run dev
import http from "node:http";

const payments = new Map();
const port = Number(process.env.MOCK_PORT || 4010);

function send(res, status, body) {
  res.writeHead(status, { "Content-Type": "application/json" });
  res.end(JSON.stringify(body));
}

http
  .createServer(async (req, res) => {
    let raw = "";
    for await (const chunk of req) raw += chunk;
    const url = new URL(req.url, "http://x");

    // 테스트 전용: 상점관리자에서 취소한 것처럼 상태를 바꾼다
    const c = url.pathname.match(/^\/__mock\/cancel\/([^/]+)$/);
    if (req.method === "POST" && c) {
      const p = payments.get(decodeURIComponent(c[1]));
      if (!p) return send(res, 404, {});
      p.payment = { ...p.payment, status: "CANCELED", balanceAmount: 0 };
      return send(res, 200, p.payment);
    }
    const auth = Buffer.from((req.headers.authorization || "").replace(/^Basic /, ""), "base64").toString();
    if (!auth.startsWith("test_gsk_") || !auth.endsWith(":")) {
      return send(res, 401, { code: "UNAUTHORIZED_KEY", message: "인증되지 않은 시크릿 키 혹은 시큐리티 키 입니다." });
    }

    if (req.method === "POST" && url.pathname === "/v1/payments/confirm") {
      const { paymentKey, orderId, amount } = JSON.parse(raw || "{}");
      const prev = payments.get(paymentKey);
      if (prev) {
        // 같은 Idempotency-Key 면 같은 응답, 아니면 이미 처리된 결제
        if (req.headers["idempotency-key"] === prev.idem) return send(res, 200, prev.payment);
        return send(res, 400, { code: "ALREADY_PROCESSED_PAYMENT", message: "이미 처리된 결제 입니다." });
      }
      if (!paymentKey?.startsWith("tgen_")) return send(res, 404, { code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보 입니다." });
      const payment = {
        paymentKey, orderId, orderName: "mock", status: "DONE", method: "카드",
        totalAmount: amount, balanceAmount: amount, approvedAt: new Date().toISOString(),
        receipt: { url: `http://localhost:${port}/receipt/${paymentKey}` },
      };
      payments.set(paymentKey, { payment, idem: req.headers["idempotency-key"] });
      return send(res, 200, payment);
    }

    const m = url.pathname.match(/^\/v1\/payments\/([^/]+)$/);
    if (req.method === "GET" && m) {
      const p = payments.get(decodeURIComponent(m[1]));
      return p ? send(res, 200, p.payment) : send(res, 404, { code: "NOT_FOUND_PAYMENT", message: "존재하지 않는 결제 정보 입니다." });
    }

    send(res, 404, { code: "NOT_FOUND" });
  })
  .listen(port, () => console.log(`mock toss api on http://localhost:${port}`));
