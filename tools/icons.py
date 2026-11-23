# Generează iconițele PNG (python tools/icons.py). Desen original: punct + două unde.
from PIL import Image, ImageDraw
import os
OUT = os.path.join(os.path.dirname(__file__), '..', 'icons')
BG, AC = (20, 24, 33), (255, 181, 71)
def make(size, pad=0.0, rounded=True):
    S = size * 4
    im = Image.new('RGBA', (S, S), (0, 0, 0, 0))
    d = ImageDraw.Draw(im)
    if rounded: d.rounded_rectangle([0, 0, S - 1, S - 1], radius=int(S * 0.22), fill=BG)
    else: d.rectangle([0, 0, S, S], fill=BG)
    k = S * (1 - 2 * pad) / 32.0
    ox = oy = S * pad + k * 0.5
    def P(x, y): return (ox + x * k, oy + y * k)
    cx, cy = P(9, 23.5)
    r = 3.4 * k
    d.ellipse([cx - r, cy - r, cx + r, cy + r], fill=AC)
    w = int(3.2 * k)
    dim = tuple(int(a * 0.6 + b * 0.4) for a, b in zip(AC, BG))
    for R, col in ((10, AC), (18, dim)):
        Rk = R * k + w / 2
        d.arc([cx - Rk, cy - Rk, cx + Rk, cy + Rk], 270, 360, fill=col, width=w)
        rc = Rk - w / 2
        for (x, y) in ((cx, cy - rc), (cx + rc, cy)):
            d.ellipse([x - w / 2, y - w / 2, x + w / 2, y + w / 2], fill=col)
    return im.resize((size, size), Image.LANCZOS)
make(180, 0.12, False).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'))
make(192, 0.10).save(os.path.join(OUT, 'icon-192.png'))
make(512, 0.10).save(os.path.join(OUT, 'icon-512.png'))
make(512, 0.20, False).convert('RGB').save(os.path.join(OUT, 'icon-512-maskable.png'))
print('ok')
