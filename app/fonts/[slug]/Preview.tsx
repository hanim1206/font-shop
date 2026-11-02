"use client";

import { useEffect, useRef, useState } from "react";

// 입력할 때마다(250ms 디바운스) 그 글자만 담긴 woff2 를 받아 FontFace 로 적용한다.
export default function Preview({ slug, initial, maxChars }: { slug: string; initial: string; maxChars: number }) {
  const [text, setText] = useState(initial);
  const [size, setSize] = useState(56);
  const [family, setFamily] = useState<string | null>(null);
  const [status, setStatus] = useState<"" | "loading" | "error">("loading");
  const [message, setMessage] = useState("");
  const seq = useRef(0);

  const unique = [...new Set([...text.normalize("NFC")].filter((c) => c.trim() !== ""))];
  const tooMany = unique.length > maxChars;

  useEffect(() => {
    if (!unique.length || tooMany) return;
    const my = ++seq.current;
    const t = setTimeout(async () => {
      setStatus("loading");
      const qs = new URLSearchParams({ font: slug, text: unique.sort().join("") });
      try {
        const res = await fetch(`/api/preview?${qs}`);
        if (!res.ok) throw new Error(res.status === 429 ? "미리보기 한도를 넘었습니다. 잠시 후 다시 시도해 주세요." : `미리보기 실패 (${res.status})`);
        const buf = await res.arrayBuffer();
        const name = `pv-${slug}-${my}`;
        const face = new FontFace(name, buf);
        await face.load();
        if (my !== seq.current) return; // 더 최근 요청이 있으면 버린다
        document.fonts.add(face);
        setFamily(name);
        setStatus("");
        setMessage(`${unique.length}글자 · ${(buf.byteLength / 1024).toFixed(1)}KB 받음`);
      } catch (e) {
        if (my === seq.current) {
          setStatus("error");
          setMessage((e as Error).message);
        }
      }
    }, 250);
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [text, slug]);

  return (
    <section>
      <div className="toolbar">
        <input type="text" value={text} onChange={(e) => setText(e.target.value)} placeholder="미리 볼 문장을 입력하세요" aria-label="미리보기 문장" />
        <input type="range" min={16} max={120} value={size} onChange={(e) => setSize(Number(e.target.value))} aria-label="글자 크기" />
        <span className="muted">{size}px</span>
      </div>
      <div className="preview-box">
        <p className="specimen" style={{ fontFamily: family ? `"${family}", sans-serif` : "sans-serif", fontSize: size, opacity: status === "loading" && !family ? 0.2 : 1 }}>
          {text || " "}
        </p>
      </div>
      <p className={tooMany || status === "error" ? "error" : "muted"}>
        {tooMany ? `한 번에 서로 다른 글자 ${maxChars}자까지 미리 볼 수 있습니다.` : message}
        {!tooMany && status !== "error" && " · 입력한 글자만 서버에서 잘라 받아요 (전체 폰트 파일은 내려오지 않음)"}
      </p>
    </section>
  );
}
