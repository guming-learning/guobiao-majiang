# -*- coding: utf-8 -*-
# Slice the HD Illustrator/PDF mahjong sprite (aaa.ai) into 42 transparent glyph PNGs.
# Renders the vector at high DPI, detects the irregular grid, removes each tile's outer
# border outline (connected-components touching the cell edge) and keeps the interior glyph
# on a transparent background, preserving anti-aliasing. Run: python tools/slice_tiles_ai.py [src]
import sys, os
import numpy as np
from PIL import Image
from scipy import ndimage
import fitz  # PyMuPDF

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    r"~/Downloads/ebXx5vDdWx/aaa.ai")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "tiles")
os.makedirs(OUT, exist_ok=True)
OUT_W = 256  # output width in px (height follows tile aspect)

# tile id encoding: 1-9 wan, 10-18 tiao, 19-27 bing(dots), 28-31 ESWN, 32-34 zhong/fa/bai, 35-42 flowers
MAP = {}
for c, tid in zip(range(5), [19, 20, 21, 22, 23]): MAP[(0, c)] = tid           # dots 1-5
for c, tid in zip(range(4), [24, 25, 26, 27]): MAP[(1, c)] = tid               # dots 6-9
for c, tid in zip(range(5), [18, 17, 11, 13, 12]): MAP[(2, c)] = tid           # bamboo 9,8,2,4,3
for c, tid in zip(range(4), [14, 15, 16, 10]): MAP[(3, c)] = tid               # bamboo 5,6,7,1(bird)
for c, tid in zip(range(7), [32, 33, 28, 29, 30, 31, 34]): MAP[(4, c)] = tid   # zhong fa E S W N blank
for c, tid in zip(range(5), [1, 2, 3, 4, 5]): MAP[(5, c)] = tid                # wan 1-5
for c, tid in zip(range(4), [6, 7, 8, 9]): MAP[(6, c)] = tid                   # wan 6-9
for c, tid in zip(range(4), [35, 36, 37, 38]): MAP[(7, c)] = tid               # flowers (arbitrary)
for c, tid in zip(range(4), [39, 40, 41, 42]): MAP[(8, c)] = tid               # flowers (arbitrary)

doc = fitz.open(SRC)
page = doc[0]
pix = page.get_pixmap(matrix=fitz.Matrix(4.0, 4.0), alpha=True)
img = Image.frombytes("RGBA", (pix.width, pix.height), pix.samples)
a = np.asarray(img)
alpha = a[:, :, 3]
ink = alpha > 30


def bands(arr, m):
    res, s = [], None
    for i, v in enumerate(arr):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= m: res.append((s, i - 1))
            s = None
    if s is not None and len(arr) - s >= m: res.append((s, len(arr) - 1))
    return res


rb = bands(ink.any(axis=1), 60)
cells = {}
for ri, (y0, y1) in enumerate(rb):
    cb = bands(ink[y0:y1 + 1].any(axis=0), 40)
    for ci, (x0, x1) in enumerate(cb):
        cells[(ri, ci)] = (x0, y0, x1, y1)


def extract(box):
    x0, y0, x1, y1 = box
    cell = a[y0:y1 + 1, x0:x1 + 1]
    h, w = cell.shape[:2]
    cink = cell[:, :, 3] > 40
    lbl, n = ndimage.label(cink)
    # labels appearing in the 3px border ring belong to the tile's outer outline
    ring = np.zeros((h, w), bool)
    ring[:3, :] = ring[-3:, :] = ring[:, :3] = ring[:, -3:] = True
    border_labels = set(np.unique(lbl[ring & cink]))
    border_labels.discard(0)
    glyph = cink & ~np.isin(lbl, list(border_labels))
    keep = ndimage.binary_dilation(glyph, iterations=2)
    out = cell.copy()
    out[:, :, 3] = np.where(keep, cell[:, :, 3], 0)
    return Image.fromarray(out, "RGBA")


count = 0
for key, tid in MAP.items():
    if key not in cells:
        print("MISSING", key); continue
    g = extract(cells[key])
    oh = round(OUT_W * g.height / g.width)
    g = g.resize((OUT_W, oh), Image.LANCZOS)
    g.save(os.path.join(OUT, f"{tid}.png"))
    count += 1
print(f"wrote {count} HD tiles to {OUT} (width {OUT_W}px)")
