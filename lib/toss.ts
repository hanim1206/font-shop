// 토스페이먼츠 코어 API. 시크릿 키는 이 파일(서버)에서만 읽는다.
import "server-only";

const API_BASE = process.env.TOSS_API_BASE || "https://api.tosspayments.com";

function authHeader(): string {
  const secret = process.env.TOSS_SECRET_KEY;
  if (!secret) throw new Error("TOSS_SECRET_KEY is not set");
  // 시크릿 키 뒤에 ':' 를 붙여 base64 인코딩 (비밀번호 없는 Basic 인증)
  return "Basic " + Buffer.from(`${secret}:`).toString("base64");
}

// 응답 중 이 예제가 쓰는 필드만
export type TossPayment = {
  paymentKey: string;
  orderId: string;
  orderName: string;
  status:
    | "READY"
    | "IN_PROGRESS"
    | "WAITING_FOR_DEPOSIT"
    | "DONE"
    | "CANCELED"
    | "PARTIAL_CANCELED"
    | "ABORTED"
    | "EXPIRED";
  totalAmount: number;
  balanceAmount: number;
  method?: string;
  approvedAt?: string;
  receipt?: { url: string } | null;
};

export type TossError = { code: string; message: string };

export type TossResult =
  | { ok: true; payment: TossPayment }
  | { ok: false; status: number; error: TossError };

async function call(path: string, init: RequestInit & { idempotencyKey?: string }): Promise<TossResult> {
  const headers: Record<string, string> = {
    Authorization: authHeader(),
    "Content-Type": "application/json",
  };
  // 같은 키로 재시도하면 토스가 같은 결과를 돌려준다 (네트워크 타임아웃 뒤 재시도 대비)
  if (init.idempotencyKey) headers["Idempotency-Key"] = init.idempotencyKey;

  let res: Response;
  try {
    res = await fetch(`${API_BASE}${path}`, { ...init, headers, cache: "no-store" });
  } catch (e) {
    return { ok: false, status: 0, error: { code: "NETWORK_ERROR", message: String(e) } };
  }
  const body = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: res.status,
      error: { code: body.code ?? "UNKNOWN", message: body.message ?? res.statusText },
    };
  }
  return { ok: true, payment: body as TossPayment };
}

export function confirmPayment(input: { paymentKey: string; orderId: string; amount: number }) {
  return call("/v1/payments/confirm", {
    method: "POST",
    body: JSON.stringify(input),
    idempotencyKey: `confirm-${input.orderId}`,
  });
}

export function getPayment(paymentKey: string) {
  return call(`/v1/payments/${encodeURIComponent(paymentKey)}`, { method: "GET" });
}
