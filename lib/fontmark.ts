// worker/fontmark.py 호출. 결제 완료 후 주문번호 워터마크를 넣은 구매자 전용 파일을 만든다.
// 지금은 웹 서버에서 바로 python 을 실행한다 (테스트용). 배포할 때는 별도 워커로 분리 (README 참고).
import "server-only";
import { execFile } from "node:child_process";
import path from "node:path";
import { promisify } from "node:util";
import { required } from "./env";
import { ensureMaster } from "./masters";

const run = promisify(execFile);
const ROOT = process.cwd();

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
  site: string;
  /** 한 번 심고 여러 포맷으로 저장: outDir/basename.{otf|ttf|woff|woff2} */
  outDir: string;
  basename: string;
  formats: ("otf" | "woff" | "woff2")[];
  licenseType?: "desktop" | "web";
  domain?: string | null;
}): Promise<EmbedResult> {
  const master = await ensureMaster(input.masterFile);
  const { stdout } = await run(
    process.env.PYTHON || "python3",
    [
      path.join(ROOT, "worker", "fontmark.py"),
      "embed",
      "--master", master,
      "--out-dir", input.outDir,
      "--basename", input.basename,
      "--formats", input.formats.join(","),
      "--font-id", input.fontId,
      "--order-id", String(input.orderNo),
      "--license-id", input.orderId,
      "--licensee", input.licensee,
      "--site", input.site,
      ...(input.licenseType ? ["--license-type", input.licenseType] : []),
      ...(input.domain ? ["--domain", input.domain] : []),
    ],
    { env: { ...process.env, FONTMARK_SECRET: required("FONTMARK_SECRET") }, timeout: 180_000, maxBuffer: 4 << 20 },
  );
  return JSON.parse(stdout) as EmbedResult;
}

/** 여러 파일을 zip 하나로 묶는다 (메일 링크 한 번에 전부 받기). files: [디스크 경로, zip 안 이름] */
export async function makeZip(outPath: string, files: [string, string][], extra: Record<string, string>) {
  await run(
    process.env.PYTHON || "python3",
    [path.join(ROOT, "worker", "bundle.py"), outPath, JSON.stringify({ files, extra })],
    { timeout: 60_000 },
  );
}

export async function extractWatermark(masterFile: string, fontId: string, suspectPath: string) {
  const master = await ensureMaster(masterFile);
  const { stdout } = await run(
    process.env.PYTHON || "python3",
    [path.join(ROOT, "worker", "fontmark.py"), "extract", "--master", master, "--suspect", suspectPath, "--font-id", fontId],
    { env: { ...process.env, FONTMARK_SECRET: required("FONTMARK_SECRET") }, timeout: 180_000, maxBuffer: 4 << 20 },
  );
  return JSON.parse(stdout);
}
