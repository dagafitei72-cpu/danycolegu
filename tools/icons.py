# Generează toate iconițele din logo-ul DanyColegu (tools/src/logo-original.webp).
# Rulare: python tools/icons.py
from PIL import Image, ImageDraw
import os

HERE = os.path.dirname(os.path.abspath(__file__))
OUT = os.path.join(HERE, '..', 'icons')
NAVY = (9, 16, 40, 255)

src = Image.open(os.path.join(HERE, 'src', 'logo-original.webp')).convert('RGBA')
# pătratul rotunjit din imagine (fără marginea neagră estompată din jur)
sq = src.crop((72, 72, 1184, 1184))
flat = Image.new('RGBA', sq.size, NAVY)
flat.alpha_composite(sq)


def resized(size):
    return flat.resize((size, size), Image.LANCZOS)


def rounded(size, radius=0.19):
    im = resized(size)
    mask = Image.new('L', (size * 4, size * 4), 0)
    ImageDraw.Draw(mask).rounded_rectangle([0, 0, size * 4 - 1, size * 4 - 1], radius=int(size * 4 * radius), fill=255)
    im.putalpha(mask.resize((size, size), Image.LANCZOS))
    return im


def padded(size, scale):
    im = Image.new('RGBA', (size, size), NAVY)
    inner = int(size * scale)
    im.alpha_composite(rounded(inner, 0.14), ((size - inner) // 2, (size - inner) // 2))
    return im


# iPhone (iOS rotunjește singur colțurile → pătrat plin)
resized(180).convert('RGB').save(os.path.join(OUT, 'apple-touch-icon.png'), optimize=True)
# Android / manifest
rounded(192).save(os.path.join(OUT, 'icon-192.png'), optimize=True)
rounded(512).save(os.path.join(OUT, 'icon-512.png'), optimize=True)
padded(512, 0.80).convert('RGB').save(os.path.join(OUT, 'icon-512-maskable.png'), optimize=True)
# favicon + logo din antet
rounded(64).save(os.path.join(OUT, 'favicon-64.png'), optimize=True)
rounded(160).save(os.path.join(OUT, 'logo-160.png'), optimize=True)
# previzualizare la linkuri (WhatsApp, Messenger etc.)
og = Image.new('RGBA', (1200, 630), NAVY)
glow = Image.new('RGBA', (1200, 630), (0, 0, 0, 0))
d = ImageDraw.Draw(glow)
for i in range(60, 0, -1):
    a = int(12 * (60 - i) / 60)
    d.ellipse([600 - i * 9, 315 - i * 5, 600 + i * 9, 315 + i * 5], fill=(40, 70, 160, a))
og.alpha_composite(glow)
og.alpha_composite(rounded(560, 0.16), ((1200 - 560) // 2, 35))
og.convert('RGB').save(os.path.join(OUT, 'og.jpg'), quality=86, optimize=True)
print('ok')
