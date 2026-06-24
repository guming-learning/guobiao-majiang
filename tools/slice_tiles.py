# -*- coding: utf-8 -*-
# Slice majiang.png sprite sheet into 42 transparent glyph PNGs (public/tiles/<id>.png).
# Each glyph is extracted onto a transparent canvas the size of its source cell so that
# proportions stay natural; the tile border/background is removed via edge flood-fill so
# even large glyphs (e.g. 1-dot) are preserved. Run: python tools/slice_tiles.py <src>
import sys, os
from collections import deque
import numpy as np
from PIL import Image

SRC = sys.argv[1] if len(sys.argv) > 1 else os.path.expanduser(
    r"~/OneDrive - Microsoft/Desktop/majiang.png")
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "tiles")
os.makedirs(OUT, exist_ok=True)

# tile id encoding: 1-9 wan, 10-18 tiao, 19-27 bing(dots), 28-31 ESWN, 32-34 zhong/fa/bai, 35-42 flowers
MAP = {}
# row0: dots 1-9 -> 19..27
for c in range(9): MAP[(0, c)] = 19 + c
# row1: bamboo, source order 9 8 2 4 3 5 6 7 1 -> tiao ids (10=1 tiao .. 18=9 tiao)
for c, rank in enumerate([9, 8, 2, 4, 3, 5, 6, 7, 1]): MAP[(1, c)] = 9 + rank
# row2: characters 1-9 -> 1..9
for c in range(9): MAP[(2, c)] = 1 + c
# row3: flowers (arbitrary) -> 35..42
for c in range(8): MAP[(3, c)] = 35 + c
# row4: honors 中 發 東 南 西 北 blank -> zhong,fa,E,S,W,N,bai
for c, tid in enumerate([32, 33, 28, 29, 30, 31, 34]): MAP[(4, c)] = tid

im = Image.open(SRC).convert("RGB")
a = np.asarray(im).astype(int)
H, W, _ = a.shape
bg = a[2, 2]
dist_bg = np.abs(a - bg).sum(axis=2)
mask = dist_bg > 40


def bands(arr, minlen):
    res, s = [], None
    for i, v in enumerate(arr):
        if v and s is None:
            s = i
        elif not v and s is not None:
            if i - s >= minlen: res.append((s, i - 1))
            s = None
    if s is not None and len(arr) - s >= minlen: res.append((s, len(arr) - 1))
    return res


rb = bands(mask.any(axis=1), 40)
cells = {}
for ri, (y0, y1) in enumerate(rb):
    cb = bands(mask[y0:y1 + 1].any(axis=0), 20)
    med = sorted([x1 - x0 + 1 for x0, x1 in cb])[len(cb) // 2]
    expanded = []
    for (x0, x1) in cb:
        n = round((x1 - x0 + 1) / med)
        if n <= 1:
            expanded.append((x0, x1))
        else:
            step = (x1 - x0 + 1) / n
            for k in range(n):
                expanded.append((int(x0 + k * step), int(x0 + (k + 1) * step) - 1))
    for ci, (x0, x1) in enumerate(expanded):
        cells[(ri, ci)] = (x0, y0, x1, y1)


def dilate(m, it=2):
    out = m.copy()
    for _ in range(it):
        d = out.copy()
        d[1:, :] |= out[:-1, :]
        d[:-1, :] |= out[1:, :]
        d[:, 1:] |= out[:, :-1]
        d[:, :-1] |= out[:, 1:]
        out = d
    return out


def extract(box):
    x0, y0, x1, y1 = box
    cell = a[y0:y1 + 1, x0:x1 + 1]
    h, w, _ = cell.shape
    mn = cell.min(axis=2)
    dist_white = 255 - mn  # 0 for white, large for ink
    alpha_raw = np.clip((dist_white - 14) * 2.0, 0, 255)
    solid = dist_white > 60
    # flood from the border ring over connected solid pixels -> tile outline
    visited = np.zeros((h, w), bool)
    dq = deque()
    for x in range(w):
        for yy in (0, h - 1):
            if solid[yy, x] and not visited[yy, x]:
                visited[yy, x] = True; dq.append((yy, x))
    for y in range(h):
        for xx in (0, w - 1):
            if solid[y, xx] and not visited[y, xx]:
                visited[y, xx] = True; dq.append((y, xx))
    while dq:
        cy, cx = dq.popleft()
        for dy in (-1, 0, 1):
            for dx in (-1, 0, 1):
                ny, nx = cy + dy, cx + dx
                if 0 <= ny < h and 0 <= nx < w and solid[ny, nx] and not visited[ny, nx]:
                    visited[ny, nx] = True; dq.append((ny, nx))
    glyph_core = solid & ~visited
    keep = dilate(glyph_core, 2)
    alpha = np.where(keep, alpha_raw, 0).astype(np.uint8)
    rgb = cell.astype(np.uint8)
    # keep the full source cell framing so each glyph's designed size/position is preserved
    return np.dstack([rgb, alpha])


count = 0
for key, tid in MAP.items():
    if key not in cells:
        print("MISSING cell", key)
        continue
    rgba = extract(cells[key])
    Image.fromarray(rgba, "RGBA").save(os.path.join(OUT, f"{tid}.png"))
    count += 1
print(f"wrote {count} tiles to {OUT}")
