#!/usr/bin/env python3
"""Crop per-item images from public/miaoi/menu-board.jpg into public/miaoi/items/."""
from PIL import Image
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "public" / "miaoi" / "menu-board.jpg"
OUT = ROOT / "public" / "miaoi" / "items"

def save(im: Image.Image, id_: str, box, size=560):
    W, H = im.size
    x0, y0, x1, y1 = [int(v) for v in box]
    x0, y0 = max(0, x0), max(0, y0)
    x1, y1 = min(W, x1), min(H, y1)
    crop = im.crop((x0, y0, x1, y1))
    px = crop.getpixel((min(5, crop.width - 1), min(5, crop.height - 1)))
    canvas = Image.new("RGB", (size, size), px)
    crop.thumbnail((size, size), Image.Resampling.LANCZOS)
    canvas.paste(crop, ((size - crop.width) // 2, (size - crop.height) // 2))
    canvas.save(OUT / f"{id_}.jpg", quality=93)

def main():
    OUT.mkdir(parents=True, exist_ok=True)
    im = Image.open(SRC)
    cols = [95, 300, 520, 745]
    for i, id_ in enumerate(["mia-la-dua", "mia-thom", "mia-dau", "mia-quyt"]):
        save(im, id_, (cols[i], 375, cols[i] + 210, 590))
    for i, id_ in enumerate(["mia-xi-muoi", "mia-olong", "mia-chanh-day", "mia-che"]):
        save(im, id_, (cols[i], 595, cols[i] + 210, 810))
    cols_cf = [70, 295, 520, 745]
    for i, id_ in enumerate(["cf-den", "cf-sua", "cf-americano", "cf-la-dua"]):
        save(im, id_, (cols_cf[i], 1125, cols_cf[i] + 220, 1335))
    for i, id_ in enumerate(["cf-bac-xiu", "cf-cacao", "cf-hanh-nhan", "cf-capu"]):
        save(im, id_, (cols_cf[i], 1310, cols_cf[i] + 220, 1490))
    for id_, x, y in [
        ("tra-dao", 1010, 275), ("tra-oi", 1235, 275),
        ("tra-vai", 1010, 455), ("tra-dau", 1235, 455),
        ("tra-sen", 1010, 635), ("tra-thom", 1235, 635),
        ("tra-lai-nho", 1010, 815),
    ]:
        save(im, id_, (x, y, x + 195, y + 170))
    for i, id_ in enumerate(["ts-sen", "ts-olong", "ts-hanh-nhan", "ts-oreo", "ts-mo"]):
        y = 255 + i * 148
        save(im, id_, (1460, y, 1785, y + 145))
    for i, id_ in enumerate(["st-mia-oi", "st-bo", "st-colada", "st-dau", "st-mojito"]):
        y = 245 + i * 150
        save(im, id_, (2180, y, 2500, y + 145))
    save(im, "matcha-sua", (1020, 1010, 1560, 1455))
    save(im, "topping", (1620, 1005, 2060, 1460))
    save(im, "khac", (2060, 1005, 2545, 1460))
    for tid in ["tp-nha-dam", "tp-suong-sao", "tp-tran-chau", "tp-kem-muoi", "tp-pho-mai"]:
        save(im, tid, (1620, 1005, 2060, 1460))
    for kid in ["khac-sting", "khac-coca", "khac-7up", "khac-revive", "khac-suoi"]:
        save(im, kid, (2060, 1005, 2545, 1460))
    print(f"Wrote {len(list(OUT.glob('*.jpg')))} images -> {OUT}")

if __name__ == "__main__":
    main()
