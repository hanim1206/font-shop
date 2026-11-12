// 산돌 상세페이지식 동적 서브셋: 미리보기에 입력한 글자만 잘라 작은 woff2 로 내려준다.
// 브라우저에는 전체 폰트가 가지 않는다. 대신 글자를 계속 바꿔 넣으면 조금씩 모을 수는 있으므로
// IP 별로 한 시간에 받을 수 있는 서로 다른 글자 수를 제한한다.
import "server-only";
import { readFile } from "node:fs/promises";
import subsetFont from "subset-font";
import type { Product } from "./catalog";
import { ensureMaster } from "./masters";

export const MAX_CHARS_PER_REQUEST = 60; // 서로 다른 글자 기준
export const MAX_GLYPHS_PER_HOUR = Number(process.env.PREVIEW_GLYPHS_PER_HOUR || 1500);

const masters = new Map<string, Promise<Buffer>>();
const cache = new Map<string, Buffer>(); // 같은 글자 조합은 다시 자르지 않는다 (작은 LRU)
const seen = new Map<string, { since: number; glyphs: Set<string> }>();

export function uniqueChars(text: string): string[] {
  return [...new Set([...text.normalize("NFC")].filter((c) => c.trim() !== "" || c === " "))].sort();
}

export function allowGlyphs(ip: string, chars: string[]): boolean {
  const now = Date.now();
  let s = seen.get(ip);
  if (!s || now - s.since > 3600_000) {
    s = { since: now, glyphs: new Set() };
    seen.set(ip, s);
  }
  const fresh = chars.filter((c) => !s.glyphs.has(c));
  if (s.glyphs.size + fresh.length > MAX_GLYPHS_PER_HOUR) return false;
  fresh.forEach((c) => s.glyphs.add(c));
  if (seen.size > 10_000) seen.clear();
  return true;
}

export async function previewWoff2(product: Product, chars: string[]): Promise<Buffer> {
  const key = `${product.fontId}:${chars.join("")}`;
  const hit = cache.get(key);
  if (hit) return hit;
  let m = masters.get(product.masterFile);
  if (!m) {
    m = ensureMaster(product.masterFile).then((file) => readFile(file));
    masters.set(product.masterFile, m);
  }
  const out = await subsetFont(await m, chars.join(""), {
    targetFormat: "woff2",
    preserveNameIds: [1, 2], // 패밀리·스타일 이름만 남긴다
  });
  if (cache.size > 500) cache.delete(cache.keys().next().value!);
  cache.set(key, out);
  return out;
}

export function previewUrl(slug: string, text: string) {
  return `/api/preview?font=${encodeURIComponent(slug)}&text=${encodeURIComponent(uniqueChars(text).join(""))}`;
}
