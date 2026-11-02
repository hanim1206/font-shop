#!/usr/bin/env python3
"""테스트용 더미 폰트 마스터를 만든다 (실제 판매 폰트가 오기 전 자리 채우기).

Noto Sans KR(SIL OFL 1.1) 가변 폰트를 받아 Regular(400)·Bold(700) 정적 TTF로 자르고
이름을 'Hanim Dummy Gothic' 으로 바꿔 fonts/masters/ 에 둔다. 마스터는 레포에 올리지 않는다(.gitignore).

  pip install -r worker/requirements.txt
  python3 worker/make_dummy_fonts.py

실제 폰트로 바꿀 때: fonts/masters/ 에 파일을 넣고 lib/catalog.ts 의 fontId·masterFile 만 고친다.
fontId 를 바꾸면 워터마크 위치가 바뀌므로, 한 번 판매를 시작한 마스터의 fontId 는 그대로 둔다.
"""
import os
import sys
import urllib.request

from fontTools.ttLib import TTFont
from fontTools.varLib import instancer

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
MASTERS = os.path.join(ROOT, "fonts", "masters")
CACHE = os.path.join(ROOT, "fonts", ".src")
SRC_URL = "https://raw.githubusercontent.com/google/fonts/main/ofl/notosanskr/NotoSansKR%5Bwght%5D.ttf"
SRC = os.path.join(CACHE, "NotoSansKR-VF.ttf")

FAMILY = "Hanim Dummy Gothic"
# (스타일, wght, font_id) — font_id 는 lib/catalog.ts 와 같아야 한다
STYLES = [
    ("Regular", 400, "HanimDummyGothic-Regular-1.000"),
    ("Bold", 700, "HanimDummyGothic-Bold-1.000"),
]


def rename(font: TTFont, family: str, style: str) -> None:
    name = font["name"]
    ps = f"{family.replace(' ', '')}-{style}"
    for nid in (1, 2, 3, 4, 6, 16, 17, 21, 22, 25):
        name.removeNames(nameID=nid)
    for nid, text in {1: family, 2: style, 3: f"{ps};1.000;DUMMY", 4: f"{family} {style}", 6: ps}.items():
        name.setName(text, nid, 3, 1, 0x409)
        name.setName(text, nid, 1, 0, 0)
    name.setName("TEST DUMMY. Renamed from Noto Sans KR (SIL Open Font License 1.1). Not for sale.", 0, 3, 1, 0x409)
    name.setName("TEST DUMMY. Renamed from Noto Sans KR (SIL Open Font License 1.1). Not for sale.", 0, 1, 0, 0)
    for rec in list(name.names):  # 원본 이름이 남은 다국어 레코드 정리
        if rec.nameID in (1, 4, 6, 16, 17) and rec.langID not in (0x409, 0):
            name.removeNames(nameID=rec.nameID, langID=rec.langID)


def main() -> None:
    os.makedirs(MASTERS, exist_ok=True)
    os.makedirs(CACHE, exist_ok=True)
    if not os.path.exists(SRC):
        print("download", SRC_URL)
        urllib.request.urlretrieve(SRC_URL, SRC)
    for style, wght, font_id in STYLES:
        out = os.path.join(MASTERS, f"{font_id}.ttf")
        if os.path.exists(out):
            print("exists ", out)
            continue
        vf = TTFont(SRC)
        static = instancer.instantiateVariableFont(vf, {"wght": wght}, updateFontNames=False)
        for tag in ("STAT", "MVAR", "HVAR", "avar", "fvar", "gvar"):
            if tag in static:
                del static[tag]
        rename(static, FAMILY, style)
        static["OS/2"].usWeightClass = wght
        static.save(out)
        print("master ", out, os.path.getsize(out), "bytes")


if __name__ == "__main__":
    sys.exit(main())
