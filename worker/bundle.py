"""주문 파일 묶음 zip 만들기. lib/fontmark.ts makeZip 이 부른다.

python bundle.py OUT.zip '{"files": [["/tmp/a.ttf", "Font.ttf"]], "extra": {"LICENSE.txt": "..."}}'
"""
import json
import sys
import zipfile


def main() -> None:
    out, spec = sys.argv[1], json.loads(sys.argv[2])
    with zipfile.ZipFile(out, "w", compression=zipfile.ZIP_DEFLATED) as z:
        for src, arcname in spec["files"]:
            z.write(src, arcname)
        for arcname, text in spec.get("extra", {}).items():
            z.writestr(arcname, text)


if __name__ == "__main__":
    main()
