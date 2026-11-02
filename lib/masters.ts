// 폰트 원본은 이미지와 깃에 넣지 않는다. 디스크에 없으면 Supabase 비공개 버킷 masters 에서 처음 쓸 때 내려받는다.
import "server-only";
import { randomUUID } from "node:crypto";
import { access, mkdir, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { supabaseAdmin } from "./supabase/admin";

export const MASTERS_DIR = process.env.FONT_MASTERS_DIR || path.join(process.cwd(), "fonts", "masters");

const pending = new Map<string, Promise<string>>();

export function ensureMaster(masterFile: string): Promise<string> {
  let job = pending.get(masterFile);
  if (!job) {
    job = fetchIfMissing(masterFile).finally(() => pending.delete(masterFile));
    pending.set(masterFile, job);
  }
  return job;
}

async function fetchIfMissing(masterFile: string): Promise<string> {
  const target = path.join(MASTERS_DIR, masterFile);
  try {
    await access(target);
    return target;
  } catch {}

  const { data, error } = await supabaseAdmin().storage.from("masters").download(masterFile);
  if (error || !data) throw new Error(`폰트 원본을 내려받지 못했습니다 (${masterFile}): ${error?.message}`);

  // 받는 중인 파일을 다른 요청이 읽지 않도록 다 받은 뒤 이름을 바꾼다
  await mkdir(MASTERS_DIR, { recursive: true });
  const tmp = `${target}.${randomUUID()}.tmp`;
  try {
    await writeFile(tmp, Buffer.from(await data.arrayBuffer()));
    await rename(tmp, target);
  } finally {
    await rm(tmp, { force: true });
  }
  return target;
}
