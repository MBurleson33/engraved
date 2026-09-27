#!/usr/bin/env python3
"""
Build script for the wallpaper site.

1. Drop new wallpapers into  originals/  named like:
       psalm-27-1--woodcut.png
       2-corinthians-5-7--noir.png
       john-3-16-17--stained-glass.jpg     (verse range -> John 3:16-17)
       psalm-23-1--woodcut--2.png           (optional trailing number for variants)
   Everything before "--" is the reference, the part after it is the style.

2. Run:   python3 build.py        (add --rebuild to redo every image)
   (first time only:  pip3 install Pillow)

It creates:
   full/<id>.jpg      1320x2868 download file (iPhone Pro Max size)
   thumbs/<id>.webp   small grid image
   wallpapers.json    the list the site reads

Anything you type into wallpapers.json by hand (verse text, a nicer title,
"featured": true) is kept on the next run. Only new files get new entries.
"""
import json, re, sys
from datetime import date
from pathlib import Path

try:
    from PIL import Image, ImageOps
except ImportError:
    sys.exit("Pillow is missing. Run:  pip3 install Pillow")

ROOT = Path(__file__).parent
SRC = ROOT / "originals"
FULL = ROOT / "full"
THUMBS = ROOT / "thumbs"
DATA = ROOT / "wallpapers.json"

FULL_SIZE = (1320, 2868)   # iPhone 16/17 Pro Max; downscales cleanly on every other iPhone
THUMB_W = 420
MARK_W = 210          # width of the "Engraved" signature on downloads (px)
MARK_BOTTOM = 118     # distance from bottom edge; sits just above the iPhone home bar
EXTS = {".png", ".jpg", ".jpeg", ".webp", ".heic"}

SMALL_WORDS = {"of", "the", "and"}


def pretty_ref(slug: str) -> str:
    parts = slug.split("-")
    nums = []
    while parts and parts[-1].isdigit() and len(nums) < 3:
        nums.insert(0, parts.pop())
    book = " ".join(p if p.isdigit() else (p if p in SMALL_WORDS else p.capitalize()) for p in parts)
    if len(nums) == 3:
        return f"{book} {nums[0]}:{nums[1]}-{nums[2]}"
    if len(nums) == 2:
        return f"{book} {nums[0]}:{nums[1]}"
    if len(nums) == 1:
        return f"{book} {nums[0]}"
    return book


def pretty_style(slug: str) -> str:
    special = {"ukiyo-e": "Ukiyo-e", "mid-century": "Mid-Century"}
    if slug in special:
        return special[slug]
    return " ".join(w.capitalize() for w in slug.split("-"))


def parse_name(stem: str):
    stem = stem.lower().strip().replace(" ", "-").replace("_", "-")
    bits = [b for b in stem.split("--") if b]
    ref_slug = bits[0]
    style_slug = bits[1] if len(bits) > 1 and not bits[1].isdigit() else ""
    return re.sub(r"[^a-z0-9-]", "", stem), pretty_ref(ref_slug), pretty_style(style_slug) if style_slug else ""


_marks = {}
def add_mark(img):
    """Stamp a small Engraved signature, bottom center. Picks the light or dark
    logo depending on how bright the image is behind it."""
    if not _marks:
        for k in ("engraved-logo", "engraved-logo-dark"):
            m = Image.open(ROOT / "brand" / f"{k}.png").convert("RGBA")
            m = m.resize((MARK_W, round(MARK_W * m.height / m.width)), Image.LANCZOS)
            _marks[k] = m
    W, H = img.size
    m = _marks["engraved-logo"]
    x, y = (W - m.width) // 2, H - MARK_BOTTOM - m.height
    region = img.crop((x - 20, y - 12, x + m.width + 20, y + m.height + 12)).convert("L")
    from PIL import ImageStat
    bright = ImageStat.Stat(region).mean[0]
    m = _marks["engraved-logo-dark" if bright > 150 else "engraved-logo"]
    alpha = m.getchannel("A").point(lambda a: int(a * 0.62))
    m = m.copy(); m.putalpha(alpha)
    out = img.convert("RGBA"); out.alpha_composite(m, (x, y))
    return out.convert("RGB")


def fit_cover(img, size):
    return ImageOps.fit(img, size, Image.LANCZOS, centering=(0.5, 0.5))


def main():
    SRC.mkdir(exist_ok=True)
    FULL.mkdir(exist_ok=True)
    THUMBS.mkdir(exist_ok=True)

    existing = {}
    if DATA.exists():
        for item in json.loads(DATA.read_text()):
            existing[item["id"]] = item

    files = sorted(p for p in SRC.iterdir() if p.suffix.lower() in EXTS)
    if not files and not existing:
        print("No images in originals/ yet.")

    rebuild = "--rebuild" in sys.argv
    made = 0
    for src in files:
        wid, ref, style = parse_name(src.stem)
        full_out = FULL / f"{wid}.jpg"
        thumb_out = THUMBS / f"{wid}.webp"

        stale = [p for p in (full_out, thumb_out)
                 if not p.exists() or src.stat().st_mtime > p.stat().st_mtime]
        if stale or rebuild:
            img = ImageOps.exif_transpose(Image.open(src)).convert("RGB")
            w, h = img.size
            if w < FULL_SIZE[0] * 0.95:
                print(f"  note: {src.name} is {w}x{h}; it will be upscaled and may look soft. "
                      f"Export at {FULL_SIZE[0]}x{FULL_SIZE[1]} if you can.")
            add_mark(fit_cover(img, FULL_SIZE)).save(full_out, "JPEG", quality=90, optimize=True, progressive=True)
            th = img.resize((THUMB_W, round(THUMB_W * FULL_SIZE[1] / FULL_SIZE[0])), Image.LANCZOS)
            th.save(thumb_out, "WEBP", quality=72, method=6)
            made += 1
            print(f"  built {wid}")

        entry = existing.get(wid, {})
        existing[wid] = {
            "id": wid,
            "ref": entry.get("ref") or ref,
            "style": entry.get("style") or style,
            "text": entry.get("text", ""),
            "added": entry.get("added") or date.today().isoformat(),
            "featured": entry.get("featured", False),
            "themes": entry.get("themes", []),
            "full": f"full/{wid}.jpg",
            "thumb": f"thumbs/{wid}.webp",
        }

    # drop entries whose image no longer exists
    items = [i for i in existing.values() if (ROOT / i["full"]).exists()]
    items.sort(key=lambda i: i["id"])
    items.sort(key=lambda i: i["added"], reverse=True)   # newest first
    items.sort(key=lambda i: not i["featured"])
    DATA.write_text(json.dumps(items, indent=2, ensure_ascii=False) + "\n")

    blank = [i["id"] for i in items if not i["text"]]
    print(f"\nDone. {made} image(s) built, {len(items)} total in wallpapers.json.")
    if blank:
        print(f"{len(blank)} without verse text (optional, helps search + accessibility):")
        for b in blank[:10]:
            print("   -", b)


if __name__ == "__main__":
    main()
