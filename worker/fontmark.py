#!/usr/bin/env python3
"""
fontmark.py — 폰트 판매 사이트용 주문별 지문(fingerprint) 삽입/추출 PoC

두 겹으로 주문 정보를 심는다.
  1) 보이는 층 (name 테이블): 라이선스 ID / 주문번호 / 검증 URL. 쉽게 지워지지만
     "모르고 공유"하는 대부분의 케이스를 잡고, 구매자도 "내 라이선스"임을 확인할 수 있다.
  2) 안 보이는 층 (글리프 외곽선): 주문 ID(32bit) + CRC-16 = 48bit 를 글리프 좌표의 홀짝(parity)에
     1 unit 단위로 심는다. 어떤 글리프의 어떤 점인지는 secret 키로 정해지므로 secret 없이는 못 찾고,
     name 테이블 삭제·서브셋·WOFF2 변환을 거쳐도 살아남는다. 두 방식으로 중복 삽입:
       - 분산(distributed): 글리프 하나당 점 1개, 144개 글리프에 3벌 → 다수결
       - 집중(carrier): 점이 48개 이상인 글리프 여러 개에 48bit 전부 → 글리프 한 개만 남아도 복원

사용 예
  embed   : python fontmark.py embed --master Font.ttf --out Font-ORD10231.ttf \
              --font-id "MyFont-1.000" --order-id 10231 --license-id LIC-7Q2K-91AB \
              --licensee "홍길동" --site https://shop.example --secret $FONTMARK_SECRET
  extract : python fontmark.py extract --master Font.ttf --suspect leaked.woff2 \
              --font-id "MyFont-1.000" --secret $FONTMARK_SECRET [--orders orders.json]
  demo    : python fontmark.py demo --master Font.ttf     # 삽입→공격(메타 삭제/서브셋/WOFF2)→추출 시연

의존성: pip install fonttools brotli   (OTS 정제: pip install opentype-sanitizer 하면 자동 사용)
"""
from __future__ import annotations

import argparse
import hashlib
import hmac
import json
import os
import random
import struct
import sys
import time
from dataclasses import asdict, dataclass, field
from typing import Dict, List, Optional, Tuple

from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import RecordingPen

PAYLOAD_BITS = 48          # 32bit order id + 16bit CRC
REPEATS = 3                # 분산 삽입 반복 횟수
# 집중 삽입 글리프 수 상한 (후보의 20% 까지). 한글 폰트는 짧은 문장만 서브셋해도 캐리어가 남도록
# 자주 쓰는 한글 2,350자(KS X 1001)를 먼저 캐리어로 쓴다. 이 값을 바꾸면 계획이 바뀌어 이전에 발급한
# 파일을 못 읽으므로, 판매를 시작한 뒤에는 바꾸지 않는다 (PLAN_VERSION 이 캐시 키에 들어간다).
MAX_CARRIERS = int(os.environ.get("FONTMARK_MAX_CARRIERS", "2600"))
PARTIAL_BITS = 46          # 부분 캐리어 글리프 하나에 넣는 최대 비트 수 (48bit 중 연속 구간, 점이 모자라면 그만큼만)
PARTIAL_MIN_POINTS = 12
MAX_GUESS_BITS = 5         # 표가 하나도 없는 비트가 이 개수 이하면 모든 조합을 CRC 로 시험한다
PLAN_VERSION = f"v5-c{MAX_CARRIERS}-p{PARTIAL_BITS}"
MIN_POINTS = 6             # 이 미만의 점을 가진 글리프는 후보에서 제외
MARK_TAG = "FMK1"          # name 테이블에 심는 기계판독용 레코드 접두어
MAC, WIN = (1, 0, 0), (3, 1, 0x409)
CACHE_DIR = os.environ.get("FONTMARK_CACHE", os.path.join(os.path.dirname(os.path.abspath(__file__)), ".fontmark-cache"))


# ---------- 작은 유틸 ----------
def crc16(data: bytes) -> int:
    """CRC-16/CCITT-FALSE"""
    crc = 0xFFFF
    for b in data:
        crc ^= b << 8
        for _ in range(8):
            crc = ((crc << 1) ^ 0x1021) & 0xFFFF if crc & 0x8000 else (crc << 1) & 0xFFFF
    return crc


def payload_bits(order_id: int) -> List[int]:
    body = struct.pack(">I", order_id & 0xFFFFFFFF)
    raw = body + struct.pack(">H", crc16(body))
    return [(byte >> (7 - i)) & 1 for byte in raw for i in range(8)]


def bits_to_order(bits: List[int]) -> Optional[int]:
    raw = bytes(sum(bits[i + j] << (7 - j) for j in range(8)) for i in range(0, PAYLOAD_BITS, 8))
    return struct.unpack(">I", raw[:4])[0] if crc16(raw[:4]) == struct.unpack(">H", raw[4:])[0] else None


def is_cff(font: TTFont) -> bool:
    return "CFF " in font


def reverse_cmap(font: TTFont) -> Dict[str, int]:
    best: Dict[str, int] = {}
    for cp, name in font.getBestCmap().items():
        if name not in best or cp < best[name]:
            best[name] = cp
    return best


def _is_common_hangul(cp: int) -> bool:
    """KS X 1001 완성형 2,350자 (EUC-KR 로 인코딩되는 한글 음절) — 실제 문장에 거의 다 이 안에서 나온다."""
    if not 0xAC00 <= cp <= 0xD7A3:
        return False
    try:
        # 파이썬 euc-kr 코덱은 나머지 음절도 8바이트 조합형으로 인코딩하므로 2바이트인 것만 완성형
        return len(chr(cp).encode("euc-kr")) == 2
    except UnicodeEncodeError:
        return False


def priority(cp: Optional[int]) -> int:
    """서브셋 후에도 살아남을 확률이 높은 글리프를 우선 사용한다.
    0: ASCII, 1: 자주 쓰는 한글 2,350자, 2: 나머지 한글·자모, 3: 기타 유니코드, 4: 매핑 없음"""
    if cp is None:
        return 4
    if 0x21 <= cp <= 0x7E:
        return 0
    if _is_common_hangul(cp):
        return 1
    if 0xAC00 <= cp <= 0xD7A3 or 0x3131 <= cp <= 0x318E:
        return 2
    return 3


# ---------- 점(point) 접근: glyf 와 CFF 를 같은 인터페이스로 ----------
def get_points(font: TTFont, name: str) -> Optional[Tuple[List[Tuple[int, int]], List[bool]]]:
    """(points, is_offcurve). 컴포지트/빈 글리프는 None. CFF 는 펜으로 그려서 점 순서를 얻는다."""
    if is_cff(font):
        gs = font.getGlyphSet()
        if name not in gs:
            return None
        pen = RecordingPen()
        gs[name].draw(pen)
        pts, off = [], []
        for op, args in pen.value:
            if op in ("moveTo", "lineTo"):
                pts.append((int(round(args[0][0])), int(round(args[0][1])))); off.append(False)
            elif op in ("curveTo", "qCurveTo"):
                for i, p in enumerate(args):
                    if p is None:
                        continue
                    pts.append((int(round(p[0])), int(round(p[1])))); off.append(i < len(args) - 1)
        return (pts, off) if pts else None
    glyf = font["glyf"]
    if name not in glyf:
        return None
    g = glyf[name]
    if g.isComposite() or g.numberOfContours <= 0:
        return None
    return [tuple(p) for p in g.coordinates], [not (f & 1) for f in g.flags]


def _flex_to_curves(op: str, a: List) -> List[Tuple[str, List]]:
    """flex 계열 연산자를 rrcurveto 두 개로 풀어쓴다 (좌표 동일, flex 힌트만 사라짐)."""
    if op == "flex":
        return [("rrcurveto", list(a[0:6])), ("rrcurveto", list(a[6:12]))]
    if op == "hflex":
        dx1, dx2, dy2, dx3, dx4, dx5, dx6 = a
        return [("rrcurveto", [dx1, 0, dx2, dy2, dx3, 0]), ("rrcurveto", [dx4, 0, dx5, -dy2, dx6, 0])]
    if op == "hflex1":
        dx1, dy1, dx2, dy2, dx3, dx4, dx5, dy5, dx6 = a
        return [("rrcurveto", [dx1, dy1, dx2, dy2, dx3, 0]), ("rrcurveto", [dx4, 0, dx5, dy5, dx6, -(dy1 + dy2 + dy5)])]
    if op == "flex1":
        dx1, dy1, dx2, dy2, dx3, dy3, dx4, dy4, dx5, dy5, d6 = a
        sx, sy = dx1 + dx2 + dx3 + dx4 + dx5, dy1 + dy2 + dy3 + dy4 + dy5
        last = [d6, -sy] if abs(sx + d6) > abs(sy) else [-sx, d6]
        return [("rrcurveto", [dx1, dy1, dx2, dy2, dx3, dy3]), ("rrcurveto", [dx4, dy4, dx5, dy5, *last])]
    raise ValueError(op)


def _cff_commands(charstring) -> List[Tuple[str, List]]:
    """힌트 연산자는 그대로 두고, 그리기 연산자만 rmoveto/rlineto/rrcurveto 로 일반화한다."""
    from fontTools.cffLib import specializer as sp
    charstring.decompile()
    out: List[Tuple[str, List]] = []
    for op, args in sp.generalizeCommands(sp.programToCommands(charstring.program)):
        out += _flex_to_curves(op, args) if op in ("flex", "hflex", "hflex1", "flex1") else [(op, list(args))]
    return out


def set_points(font: TTFont, name: str, changes: Dict[int, Tuple[int, int]]) -> None:
    if not changes:
        return
    if is_cff(font):
        # CFF 좌표는 전부 상대값 → 점 k 를 d 만큼 옮기면 다음 점의 상대값을 -d 해서 나머지를 고정한다.
        # 힌트(hstem/vstem/hintmask)는 손대지 않으므로 작은 크기 렌더링이 원본과 같다.
        from fontTools.cffLib import specializer as sp
        cs = font["CFF "].cff.topDictIndex[0].CharStrings[name]
        cmds = _cff_commands(cs)
        refs: List[Tuple[int, int]] = []          # 점 순서 → (command index, dx 인덱스)
        for ci, (op, args) in enumerate(cmds):
            if op in ("rmoveto", "rlineto", "rrcurveto"):
                refs += [(ci, i) for i in range(0, len(args), 2)]
        cur = get_points(font, name)[0]
        for k, (nx, ny) in sorted(changes.items()):
            dx, dy = nx - cur[k][0], ny - cur[k][1]
            ci, ai = refs[k]
            cmds[ci][1][ai] += dx; cmds[ci][1][ai + 1] += dy
            if k + 1 < len(refs):
                cj, aj = refs[k + 1]
                cmds[cj][1][aj] -= dx; cmds[cj][1][aj + 1] -= dy
        cs.program = sp.commandsToProgram(sp.specializeCommands(cmds))
        cs.bytecode = None
        return
    g = font["glyf"][name]
    for i, (x, y) in changes.items():
        g.coordinates[i] = (x, y)


def prepare(font: TTFont) -> None:
    """내용을 바꾸므로 기존 디지털 서명(DSIG)은 무효 → 제거. CFF 는 서브루틴을 풀어 글리프별 독립 charstring 으로."""
    if "DSIG" in font:
        del font["DSIG"]
    if is_cff(font):
        font["CFF "].cff.desubroutinize()


# ---------- 어디에 심을지: secret + font_id 로 정해지는 계획(Plan) ----------
@dataclass
class Slot:                 # 분산 삽입: 글리프 한 개의 점 한 개에 비트 하나
    glyph: str
    unicode: Optional[int]
    point: int
    npoints: int
    direction: int          # 패리티를 바꿔야 할 때 +1 / -1 중 어느 쪽으로 밀지


@dataclass
class Carrier:              # 집중 삽입: 글리프 한 개에 48bit 전부
    glyph: str
    unicode: Optional[int]
    npoints: int
    points: List[int]
    directions: List[int]


@dataclass
class Partial:              # 부분 캐리어: 점이 적은 자주 쓰는 글자에 48bit 중 일부(offset 부터 연속)를 넣는다.
    glyph: str              # 글자 몇 개만 남아도 각자 다른 구간을 갖고 있어서 합치면 48bit 가 채워진다.
    unicode: Optional[int]
    npoints: int
    points: List[int]
    directions: List[int]
    offset: int


@dataclass
class Plan:
    font_id: str
    slots: List[Slot] = field(default_factory=list)
    carriers: List[Carrier] = field(default_factory=list)
    partials: List[Partial] = field(default_factory=list)


def _plan_cache_key(master: TTFont, secret: str, font_id: str) -> str:
    h = hashlib.sha256()
    h.update(hmac.new(secret.encode(), font_id.encode(), hashlib.sha256).digest())
    h.update(PLAN_VERSION.encode())
    h.update(",".join(master.getGlyphOrder()).encode())
    return h.hexdigest()[:24]


def plan(master: TTFont, secret: str, font_id: str, use_cache: bool = True) -> Plan:
    """같은 master+secret+font_id 면 항상 같은 계획. 큰 폰트는 글리프를 다 읽어야 해서 캐시한다."""
    key = _plan_cache_key(master, secret, font_id)
    cache_path = os.path.join(CACHE_DIR, key + ".json")
    if use_cache and os.path.exists(cache_path):
        with open(cache_path, encoding="utf-8") as fh:
            d = json.load(fh)
        return Plan(d["font_id"], [Slot(**s) for s in d["slots"]], [Carrier(**c) for c in d["carriers"]],
                    [Partial(**x) for x in d.get("partials", [])])

    seed = int.from_bytes(hmac.new(secret.encode(), font_id.encode(), hashlib.sha256).digest()[:8], "big")
    rng = random.Random(seed)
    rc = reverse_cmap(master)
    buckets: Dict[int, List[str]] = {0: [], 1: [], 2: [], 3: [], 4: []}
    info: Dict[str, Tuple[int, List[bool]]] = {}
    for name in master.getGlyphOrder():
        got = get_points(master, name)
        if not got or len(got[0]) < MIN_POINTS:
            continue
        info[name] = (len(got[0]), got[1])
        buckets[priority(rc.get(name))].append(name)
    candidates: List[str] = []
    for k in (0, 1, 2, 3, 4):
        rng.shuffle(buckets[k]); candidates += buckets[k]
    if not candidates:
        raise SystemExit("심을 만한 글리프가 없습니다.")

    p = Plan(font_id)
    used: Dict[str, set] = {}
    for k in range(PAYLOAD_BITS * REPEATS):
        name = candidates[k % len(candidates)]
        n, off = info[name]
        taken = used.setdefault(name, set())
        pool = [i for i in range(n) if i not in taken and off[i]] or [i for i in range(n) if i not in taken] or list(range(n))
        i = rng.choice(pool); taken.add(i)
        p.slots.append(Slot(name, rc.get(name), i, n, rng.choice((1, -1))))

    # 분산 슬롯이 쓴 글리프도 캐리어가 될 수 있다 (그 점만 피함). 안 그러면 ASCII 가 전부 슬롯에 쓰여서
    # 캐리어가 비ASCII 글리프에만 들어가고, 정작 Latin 서브셋에서는 캐리어가 하나도 안 남는다.
    eligible = [n for n in candidates if info[n][0] - len(used.get(n, ())) >= PAYLOAD_BITS + 4]
    n_carriers = min(MAX_CARRIERS, max(1, len(eligible) // 5)) if eligible else 0
    for name in eligible[:n_carriers]:
        n, off = info[name]
        free = [i for i in range(n) if i not in used.get(name, ())]
        pts = sorted(rng.sample(free, PAYLOAD_BITS))
        p.carriers.append(Carrier(name, rc.get(name), n, pts, [rng.choice((1, -1)) for _ in pts]))
        used.setdefault(name, set()).update(pts)

    # 부분 캐리어: 캐리어가 못 된 ASCII·자주 쓰는 한글(점이 적은 '가', '고' 같은 글자)에 비트 일부를 넣는다
    carrier_names = {c.glyph for c in p.carriers}
    for name in candidates:
        if name in carrier_names or priority(rc.get(name)) > 1:
            continue
        n, _ = info[name]
        free = [i for i in range(n) if i not in used.get(name, ())]
        if len(free) < PARTIAL_MIN_POINTS:
            continue
        m = min(PARTIAL_BITS, len(free) - 2)
        pts = sorted(rng.sample(free, m))
        p.partials.append(Partial(name, rc.get(name), n, pts, [rng.choice((1, -1)) for _ in pts], rng.randrange(PAYLOAD_BITS)))
        used.setdefault(name, set()).update(pts)

    if use_cache:
        os.makedirs(CACHE_DIR, exist_ok=True)
        with open(cache_path, "w", encoding="utf-8") as fh:
            json.dump(asdict(p), fh)
    return p


# ---------- 보이는 층: name 테이블 ----------
def write_name_layer(font: TTFont, *, order_id: int, license_id: str, licensee: str, site: str, font_id: str,
                     license_no: Optional[int] = None, license_type: str = "", domain: str = "", seats: int = 0,
                     gen: int = 1) -> None:
    """보이는 층. license_type 이 있으면 라이선스 유형·도메인을 문구와 기계판독 레코드에 넣는다."""
    name = font["name"]
    original_copyright = name.getDebugName(0) or ""
    used_ids = {r.nameID for r in name.names}
    custom_id = next(i for i in range(256, 32767) if i not in used_ids)
    ts = time.strftime("%Y-%m-%d", time.gmtime())
    if license_type == "web":
        scope = f" for {domain} · Web"
    elif license_type == "desktop":
        scope = f" · Desktop {seats}인" if seats else " · Desktop"
    else:
        scope = ""
    who = f"Licensed to {licensee}{scope} · {license_id} · order #{order_id}"
    rec = f"{MARK_TAG};font={font_id};order={order_id};lic={license_no if license_no is not None else license_id};code={license_id}"
    if license_type:
        rec += f";type={license_type}"
    if domain:
        rec += f";domain={domain}"
    if license_type == "desktop" and seats:
        rec += f";seats={seats}"
    if license_type:
        rec += f";gen={gen}"
    rec += f";issued={ts}"
    records = {
        0: f"{original_copyright} | {who}".strip(" |"),
        13: f"{who}. Redistribution is prohibited. Verify at {site}/verify/{license_id}",
        14: f"{site}/verify/{license_id}",
        custom_id: rec,
    }
    for nid, text in records.items():
        name.setName(text, nid, *WIN)           # 유니코드 레코드: 모든 OS 가 읽음
        try:
            text.encode("mac_roman")             # Mac Roman 으로 못 쓰는 글자(한글 등)면 Mac 레코드는 생략
            name.setName(text, nid, *MAC)
        except UnicodeEncodeError:
            name.removeNames(nameID=nid, platformID=1)


def read_name_layer(font: TTFont) -> Dict[str, str]:
    out: Dict[str, str] = {}
    for rec in font["name"].names:
        try:
            s = rec.toUnicode()
        except Exception:
            continue
        if s.startswith(MARK_TAG + ";"):
            out["machine_record"] = s
            for kv in s.split(";")[1:]:
                k, _, v = kv.partition("=")
                out[k] = v
        elif rec.nameID in (0, 13, 14) and ("Licensed to" in s or "/license/" in s or "/verify/" in s):
            out.setdefault(f"nameID_{rec.nameID}", s)
    return out


# ---------- 안 보이는 층: 외곽선 패리티 ----------
def embed_outline_layer(font: TTFont, p: Plan, order_id: int) -> Dict[str, int]:
    bits = payload_bits(order_id)
    changes: Dict[str, Dict[int, Tuple[int, int]]] = {}
    cache: Dict[str, List[Tuple[int, int]]] = {}

    def put(glyph: str, idx: int, bit: int, direction: int) -> None:
        if glyph not in cache:
            cache[glyph] = get_points(font, glyph)[0]
        pts = cache[glyph]
        x, y = pts[idx]
        if (x & 1) != bit:
            pts[idx] = (x + direction, y)
            changes.setdefault(glyph, {})[idx] = (x + direction, y)

    for k, s in enumerate(p.slots):
        put(s.glyph, s.point, bits[k % PAYLOAD_BITS], s.direction)
    for c in p.carriers:
        for b, (idx, d) in enumerate(zip(c.points, c.directions)):
            put(c.glyph, idx, bits[b], d)
    for q in p.partials:
        for j, (idx, d) in enumerate(zip(q.points, q.directions)):
            put(q.glyph, idx, bits[(q.offset + j) % PAYLOAD_BITS], d)
    for name, ch in changes.items():
        set_points(font, name, ch)
    moved = sum(len(ch) for ch in changes.values())
    return {"slots": len(p.slots), "carriers": len(p.carriers), "partials": len(p.partials), "points_moved": moved, "glyphs_touched": len(changes), "max_delta_units": 1}


def _find_glyph(suspect: TTFont, scmap: Dict[int, str], sorder: set, name: str, unicode: Optional[int]) -> Optional[str]:
    """이름이 바뀌었을 수 있으니 유니코드로 먼저 찾고, 없으면 이름으로."""
    if unicode is not None and unicode in scmap:
        return scmap[unicode]
    return name if name in sorder else None


def extract_outline_layer(suspect: TTFont, p: Plan) -> Dict:
    scmap = suspect.getBestCmap()
    sorder = set(suspect.getGlyphOrder())
    cache: Dict[str, Optional[Tuple[List[Tuple[int, int]], List[bool]]]] = {}

    def points_of(name: Optional[str], npoints: int) -> Optional[List[Tuple[int, int]]]:
        if not name:
            return None
        if name not in cache:
            cache[name] = get_points(suspect, name)
        got = cache[name]
        return got[0] if got and len(got[0]) == npoints else None

    # 1) 집중 삽입: 글리프 하나만 온전해도 복원
    carrier_hits: Dict[int, int] = {}
    carriers_present = 0
    for c in p.carriers:
        pts = points_of(_find_glyph(suspect, scmap, sorder, c.glyph, c.unicode), c.npoints)
        if pts is None:
            continue
        carriers_present += 1
        oid = bits_to_order([pts[i][0] & 1 for i in c.points])
        if oid is not None:
            carrier_hits[oid] = carrier_hits.get(oid, 0) + 1
    # 2) 분산 삽입: 비트별 다수결
    votes: List[List[int]] = [[] for _ in range(PAYLOAD_BITS)]
    slots_missing = 0
    for k, s in enumerate(p.slots):
        pts = points_of(_find_glyph(suspect, scmap, sorder, s.glyph, s.unicode), s.npoints)
        if pts is None:
            slots_missing += 1
            continue
        votes[k % PAYLOAD_BITS].append(pts[s.point][0] & 1)
    partials_present = 0
    for q in p.partials:
        pts = points_of(_find_glyph(suspect, scmap, sorder, q.glyph, q.unicode), q.npoints)
        if pts is None:
            continue
        partials_present += 1
        for j, idx in enumerate(q.points):
            votes[(q.offset + j) % PAYLOAD_BITS].append(pts[idx][0] & 1)
    distributed: Optional[int] = None
    agreement = None
    guessed: List[int] = []
    missing = [i for i, v in enumerate(votes) if not v]
    if missing and len(missing) <= MAX_GUESS_BITS and sum(len(v) for v in votes) >= PAYLOAD_BITS:
        # 글자가 아주 적게 남아 몇 비트가 빈 경우: 빈 비트의 모든 조합을 CRC 로 시험한다.
        # 우연히 통과할 확률이 2^k/65536 이라 결과는 'low' 로만 표시하고 주문 DB 와 대조해야 한다.
        known = [1 if sum(v) * 2 > len(v) else 0 for v in votes]
        for combo in range(1 << len(missing)):
            trial = known[:]
            for j, bi in enumerate(missing):
                trial[bi] = (combo >> j) & 1
            oid = bits_to_order(trial)
            if oid is not None:
                guessed.append(oid)
    if all(votes):
        bits = [1 if sum(v) * 2 > len(v) else 0 for v in votes]
        agreement = round(sum(v.count(b) for v, b in zip(votes, bits)) / sum(len(v) for v in votes), 3)
        distributed = bits_to_order(bits)

    result = {"found": False, "order_id": None, "method": None, "confidence": None,
              "carriers_total": len(p.carriers), "carriers_present": carriers_present, "carrier_hits": carrier_hits,
              "slots_total": len(p.slots), "slots_missing": slots_missing,
              "partials_total": len(p.partials), "partials_present": partials_present,
              "bits_missing": len(missing), "bit_agreement": agreement, "reason": None}
    if carrier_hits:
        best = max(carrier_hits, key=carrier_hits.get)
        # CRC-16 이라 글리프 하나가 우연히 통과할 확률이 1/65536 → 캐리어 2개 이상이 같은 값이거나
        # 분산 층과 일치할 때만 'high'. 단독 캐리어 1개는 'low' 로 표시해 관리자가 주문 DB와 대조하게 한다.
        strong = carrier_hits[best] >= 2 or distributed == best
        result.update(found=True, order_id=best, method="carrier", confidence="high" if strong else "low")
        if distributed is not None and distributed != best:
            result["reason"] = f"분산 층은 다른 값({distributed}) — 파일이 섞였거나 손상됐을 수 있음"
    elif distributed is not None:
        # 비트마다 표가 2개 이상이고 90% 이상 일치해야 high. 표가 1개뿐인 비트가 있으면 CRC 만 믿는 셈이라 low
        min_votes = min(len(v) for v in votes)
        result.update(found=True, order_id=distributed, method="distributed",
                      confidence="high" if (agreement or 0) >= 0.9 and min_votes >= 2 else "low")
    elif len(guessed) == 1:
        result.update(found=True, order_id=guessed[0], method="partial-guess", confidence="low",
                      reason=f"{len(missing)}비트를 추정해서 찾음. 주문 DB 에 있는 번호인지 확인할 것")
    elif guessed:
        result.update(reason=f"후보가 여러 개({guessed[:8]}) — 남은 글자가 너무 적음", candidates=guessed[:32])
    else:
        result["reason"] = "워터마크 없음, 또는 외곽선이 재생성(포맷 변환·재export·좌표 반올림)되어 손상됨"
    return result


# ---------- 정제(sanitize) ----------
def sanitize(src: str, dst: str) -> str:
    """OTS 가 있으면 OTS 로, 없으면 fontTools 재직렬화 + DSIG 제거."""
    try:
        import ots  # type: ignore
        r = ots.sanitize(src, dst, capture_output=True)
        if r.returncode == 0:
            return "ots"
    except Exception:
        pass
    f = TTFont(src)
    if "DSIG" in f:
        del f["DSIG"]
    f.save(dst)
    return "fonttools-reserialize"


# ---------- 명령 ----------
def cmd_embed(a) -> None:
    """--out 하나 또는 --out-dir + --basename + --formats otf,woff,woff2 (한 번 심고 여러 포맷으로 저장)."""
    t = time.time()
    font = TTFont(a.master)
    prepare(font)
    p = plan(font, a.secret, a.font_id)
    # 안 보이는 층에는 license_no(있으면)를, 없으면 주문번호를 넣는다
    mark_id = a.license_no if a.license_no is not None else a.order_id
    stats = embed_outline_layer(font, p, mark_id)
    write_name_layer(font, order_id=a.order_id, license_id=a.license_id, licensee=a.licensee, site=a.site,
                     font_id=a.font_id, license_no=a.license_no, license_type=a.license_type, domain=a.domain,
                     seats=a.seats, gen=a.gen)
    outs = []
    if a.out:
        targets = [a.out]
    else:
        if not (a.out_dir and a.basename):
            raise SystemExit("--out 또는 --out-dir/--basename 이 필요합니다")
        os.makedirs(a.out_dir, exist_ok=True)
        base_ext = "otf" if is_cff(font) else "ttf"
        targets = [os.path.join(a.out_dir, f"{a.basename}.{base_ext if f in ('otf', 'ttf') else f}") for f in a.formats.split(",")]
    for out in targets:
        low = out.lower()
        font.flavor = "woff2" if low.endswith(".woff2") else "woff" if low.endswith(".woff") else None
        font.save(out)
        with open(out, "rb") as fh:
            digest = hashlib.sha256(fh.read()).hexdigest()
        outs.append({"path": out, "format": low.rsplit(".", 1)[-1], "sha256": digest, "bytes": os.path.getsize(out)})
        # save 가 내부 상태를 바꾸므로 다음 포맷을 위해 다시 읽지 않아도 되도록 flavor 만 바꿔 반복 저장한다
    print(json.dumps({"files": outs, "order_id": a.order_id, "license_no": a.license_no, "mark_id": mark_id,
                      "license_id": a.license_id, **stats, "seconds": round(time.time() - t, 1)}, ensure_ascii=False))


def cmd_extract(a) -> None:
    master = TTFont(a.master)
    try:
        suspect = TTFont(a.suspect)
    except Exception as e:  # 폰트가 아니거나 깨진 파일
        print(json.dumps({"suspect": a.suspect, "error": f"폰트로 읽을 수 없음: {e}"}, ensure_ascii=False))
        return
    p = plan(master, a.secret, a.font_id)
    report = {"suspect": a.suspect, "name_layer": read_name_layer(suspect), "outline_layer": extract_outline_layer(suspect, p)}
    oid = report["outline_layer"].get("order_id")
    if a.orders and oid is not None:
        with open(a.orders, encoding="utf-8") as fh:
            db = json.load(fh)
        report["matched_order"] = db.get(str(oid), "주문 DB에 없음")
    print(json.dumps(report, ensure_ascii=False))


def cmd_demo(a) -> None:
    from fontTools import subset
    out = a.workdir
    os.makedirs(out, exist_ok=True)
    secret, font_id, order_id = "demo-secret-change-me", "DemoFont-1.000", 10231
    ext = ".otf" if is_cff(TTFont(a.master)) else ".ttf"
    marked = os.path.join(out, f"marked-{order_id}{ext}")
    j = lambda d: json.dumps(d, ensure_ascii=False)

    print("\n[1] 삽입"); t = time.time()
    font = TTFont(a.master); prepare(font)
    p = plan(font, secret, font_id, use_cache=False)
    print("   ", j(embed_outline_layer(font, p, order_id)), f"({time.time()-t:.1f}s)")
    write_name_layer(font, order_id=order_id, license_id="LIC-7Q2K-91AB", licensee="홍길동", site="https://shop.example", font_id=font_id)
    font.save(marked)

    print("[2] 그대로 추출 →", j(extract_outline_layer(TTFont(marked), p)))
    print("    name 레코드 →", read_name_layer(TTFont(marked)).get("machine_record"))

    print("[3] 공격: name 테이블 라이선스 삭제 + Basic Latin 서브셋 + WOFF2 변환")
    att = TTFont(marked)
    opts = subset.Options(); opts.name_IDs = [1, 2, 3, 4, 5, 6]; opts.flavor = "woff2"
    s = subset.Subsetter(opts); s.populate(unicodes=range(0x20, 0x7F)); s.subset(att)
    att.flavor = "woff2"; attacked = os.path.join(out, "attacked-subset.woff2"); att.save(attacked)
    att2 = TTFont(attacked)
    print("    name 레코드 →", read_name_layer(att2) or "(삭제됨)")
    print("    외곽선 층 →", j(extract_outline_layer(att2, p)))

    print("[4] 공격: 글리프 12개만 남긴 극단적 서브셋")
    att = TTFont(marked); opts = subset.Options(); opts.name_IDs = [1, 2, 3, 4, 5, 6]
    s = subset.Subsetter(opts); s.populate(text="Hamburgefont"); s.subset(att)
    tiny = os.path.join(out, "attacked-12glyphs" + ext); att.save(tiny)
    print("    외곽선 층 →", j(extract_outline_layer(TTFont(tiny), p)))

    print("[5] 원본(워터마크 없음)에서 추출 → 오탐 없어야 함")
    print("   ", j(extract_outline_layer(TTFont(a.master), p)))

    print("[6] 다른 주문(99001)으로 삽입 후 추출 → 다른 번호가 나와야 함")
    f2 = TTFont(a.master); prepare(f2)
    embed_outline_layer(f2, p, 99001); other = os.path.join(out, f"marked-99001{ext}"); f2.save(other)
    print("   ", j(extract_outline_layer(TTFont(other), p)))

    print("[7] 잘못된 secret 으로 추출 → 못 찾아야 함")
    print("   ", j(extract_outline_layer(TTFont(marked), plan(TTFont(a.master), "wrong-secret", font_id, use_cache=False))))

    try:
        print("[8] OTS 정제:", sanitize(marked, os.path.join(out, "sanitized" + ext)))
    except Exception as e:
        print("[8] OTS 정제 실패:", e)
    print("\n결과 파일:", out)


def main(argv=None) -> None:
    ap = argparse.ArgumentParser(description=__doc__, formatter_class=argparse.RawDescriptionHelpFormatter)
    sub = ap.add_subparsers(dest="cmd", required=True)
    e = sub.add_parser("embed", help="주문별 지문을 심은 폰트 생성")
    e.add_argument("--master", required=True); e.add_argument("--out")
    e.add_argument("--out-dir"); e.add_argument("--basename"); e.add_argument("--formats", default="otf")
    e.add_argument("--license-no", type=int, help="안 보이는 층에 넣을 32bit 라이선스 번호 (없으면 --order-id)")
    e.add_argument("--license-type", default="", choices=["", "desktop", "web"])
    e.add_argument("--domain", default=""); e.add_argument("--seats", type=int, default=0); e.add_argument("--gen", type=int, default=1)
    e.add_argument("--font-id", required=True, help="마스터 버전 식별자 (예: MyFont-1.000). 주문 DB에 같이 저장")
    e.add_argument("--order-id", type=int, required=True); e.add_argument("--license-id", required=True)
    e.add_argument("--licensee", required=True); e.add_argument("--site", default="https://example.com")
    e.add_argument("--secret", default=os.environ.get("FONTMARK_SECRET", ""))
    e.set_defaults(fn=cmd_embed)
    x = sub.add_parser("extract", help="유출 의심 파일에서 주문 역추적")
    x.add_argument("--master", required=True); x.add_argument("--suspect", required=True)
    x.add_argument("--font-id", required=True); x.add_argument("--secret", default=os.environ.get("FONTMARK_SECRET", ""))
    x.add_argument("--orders", help="주문 DB(JSON) — order_id → 구매자 정보")
    x.set_defaults(fn=cmd_extract)
    d = sub.add_parser("demo", help="삽입→공격→추출 시연")
    d.add_argument("--master", required=True); d.add_argument("--workdir", default="demo-out")
    d.set_defaults(fn=cmd_demo)
    a = ap.parse_args(argv)
    if a.cmd in ("embed", "extract") and not a.secret:
        ap.error("--secret 또는 FONTMARK_SECRET 환경변수가 필요합니다")
    a.fn(a)


if __name__ == "__main__":
    main()
