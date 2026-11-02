// worker/fontmark.py 호출. 결제 완료 후 주문번호 워터마크를 넣은 구매자 전용 파일을 만든다.
// 지금은 웹 서버에서 바로 python 을 실행한다 (테스트용). 배포할 때는 별도 워커로 분리 (README 참고).
import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { required } from "./env";

const run = promisify(execFile);
const ROOT = process.cwd();
export const MASTERS_DIR = process.env.FONT_MASTERS_DIR || path.join(ROOT, "fonts", "masters");

export type EmbedResult = {
  files: { path: string; format: string; sha256: string; bytes: number }[];
  order_id: number;
  points_moved: number;
  seconds: number;
};

export async function embedWatermark(input: {
  masterFile: string;
  fontId: string;
  orderNo: number;
  orderId: string;
  licensee: string;
  outPath: string;
  site: string;
}): Promise<EmbedResult> {
  const { stdout } = await run(
    process.env.PYTHON || "python3",
    [
      path.join(ROOT, "worker", "fontmark.py"),
      "embed",
      "--master", path.join(MASTERS_DIR, input.masterFile),
      "--out", input.outPath,
      "--font-id", input.fontId,
      "--order-id", String(input.orderNo),
      "--license-id", input.orderId,
      "--licensee", input.licensee,
      "--site", input.site,
    ],
    { env: { ...process.env, FONTMARK_SECRET: required("FONTMARK_SECRET") }, timeout: 180_000, maxBuffer: 4 << 20 },
  );
  return JSON.parse(stdout) as EmbedResult;
}

export async function extractWatermark(masterFile: string, fontId: string, suspectPath: string) {
  const { stdout } = await run(
    process.env.PYTHON || "python3",
    [path.join(ROOT, "worker", "fontmark.py"), "extract", "--master", path.join(MASTERS_DIR, masterFile), "--suspect", suspectPath, "--font-id", fontId],
    { env: { ...process.env, FONTMARK_SECRET: required("FONTMARK_SECRET") }, timeout: 180_000, maxBuffer: 4 << 20 },
  );
  return JSON.parse(stdout);
}
