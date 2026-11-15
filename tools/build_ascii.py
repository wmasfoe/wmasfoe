"""Build a person-only ASCII portrait from the GitHub avatar.

The card painter colours every glyph with one fill, so the picture is the
character grid itself. Background pixels stay spaces. Dark and light files
use the same silhouette with the ink direction matched to that theme.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
AVATAR_URL = "https://avatars.githubusercontent.com/u/61968242?v=4"
DARK_OUT = ROOT / "assets" / "ascii-art.txt"
LIGHT_OUT = ROOT / "assets" / "ascii-art-light.txt"
COLS = 72
ROWS = 39
RAMP = "@%#*+=-:. "


def is_person(r: int, g: int, b: int) -> bool:
    lum = 0.2126 * r + 0.7152 * g + 0.0722 * b
    if g > b + 55 and r > 180:
        return False
    skin = r > 145 and g > 90 and b > 70 and r > g and r - b > 28 and g - b < 55 and 105 < lum < 235
    hair = r > g + 8 and r > b + 16 and r < 160 and g < 110 and b < 85 and 16 < lum < 145
    shirt = 55 < r < 160 and g < 85 and b < 95 and r > g + 28 and r > b + 18 and 28 < lum < 130
    collar = abs(r - g) < 28 and b > r + 4 and 85 < b < 175 and 85 < lum < 175
    return skin or hair or shirt or collar


def components(mask: list[list[bool]]) -> list[dict]:
    height, width = len(mask), len(mask[0])
    seen = [[False] * width for _ in range(height)]
    found = []
    for y in range(height):
        for x in range(width):
            if not mask[y][x] or seen[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp = []
            minx = maxx = x
            miny = maxy = y
            sx = sy = 0
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                sx += cx
                sy += cy
                minx, maxx = min(minx, cx), max(maxx, cx)
                miny, maxy = min(miny, cy), max(maxy, cy)
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and mask[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > 500:
                found.append({
                    "comp": comp, "minx": minx, "maxx": maxx, "miny": miny, "maxy": maxy,
                    "cx": sx / len(comp), "cy": sy / len(comp), "n": len(comp),
                })
    found.sort(key=lambda item: item["n"], reverse=True)
    return found


def person_mask(image: Image.Image) -> Image.Image:
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    mask = [[is_person(*pixels[x, y]) for x in range(width)] for y in range(height)]
    parts = components(mask)
    keep = [[False] * width for _ in range(height)]
    if parts:
        head = parts[0]
        for x, y in head["comp"]:
            keep[y][x] = True
        for part in parts[1:]:
            overlaps = part["maxx"] > head["minx"] - 40 and part["minx"] < head["maxx"] + 20
            if overlaps and part["cy"] > head["cy"] and part["n"] > 800:
                for x, y in part["comp"]:
                    keep[y][x] = True
    grown = [row[:] for row in keep]
    for y in range(2, height - 2):
        for x in range(2, width - 2):
            if keep[y][x]:
                continue
            neighbors = sum(
                keep[y + dy][x + dx]
                for dy in range(-2, 3) for dx in range(-2, 3)
            )
            if neighbors >= 10:
                grown[y][x] = True
    outside = [[False] * width for _ in range(height)]
    stack = []

    def mark(x: int, y: int) -> None:
        if not (0 <= x < width and 0 <= y < height) or grown[y][x] or outside[y][x]:
            return
        outside[y][x] = True
        stack.append((x, y))

    for x in range(width):
        mark(x, 0)
        mark(x, height - 1)
    for y in range(height):
        mark(0, y)
        mark(width - 1, y)
    while stack:
        x, y = stack.pop()
        mark(x + 1, y)
        mark(x - 1, y)
        mark(x, y + 1)
        mark(x, y - 1)
    out = Image.new("RGBA", (width, height))
    dest = out.load()
    for y in range(height):
        for x in range(width):
            if grown[y][x] or not outside[y][x]:
                r, g, b = pixels[x, y]
                dest[x, y] = (r, g, b, 255)
            else:
                dest[x, y] = (0, 0, 0, 0)
    bbox = out.getbbox()
    if bbox:
        pad = 8
        left = max(0, bbox[0] - pad)
        top = max(0, bbox[1] - pad)
        right = min(width, bbox[2] + pad)
        bottom = min(height, bbox[3] + pad)
        out = out.crop((left, top, right, bottom))
    return out


def equalize(levels: list[float]) -> list[float]:
    if not levels:
        return []
    bins = 64
    hist = [0] * bins
    for level in levels:
        hist[min(bins - 1, int(level * bins))] += 1
    total = 0
    cdf = []
    for count in hist:
        total += count
        cdf.append(total)
    minimum = next(value for value in cdf if value)
    span = max(1, total - minimum)
    return [max(0.0, min(1.0, (cdf[min(bins - 1, int(level * bins))] - minimum) / span)) for level in levels]


def render(image: Image.Image, invert: bool) -> str:
    sample = image.resize((COLS, ROWS), Image.Resampling.LANCZOS)
    pixels = sample.load()
    lums = []
    coords = []
    for y in range(ROWS):
        for x in range(COLS):
            r, g, b, a = pixels[x, y]
            if a < 48:
                continue
            lums.append((0.2126 * r + 0.7152 * g + 0.0722 * b) / 255)
            coords.append((x, y))
    tones = {(x, y): tone for (x, y), tone in zip(coords, equalize(lums))}
    lines = []
    for y in range(ROWS):
        chars = []
        for x in range(COLS):
            tone = tones.get((x, y))
            if tone is None:
                chars.append(" ")
                continue
            shade = 1 - tone if invert else tone
            chars.append(RAMP[min(len(RAMP) - 1, int(shade * len(RAMP)))])
        lines.append("".join(chars).rstrip())
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    width = max(len(line) for line in lines)
    return "\n".join(line.ljust(width) for line in lines) + "\n"


def main() -> None:
    import urllib.request

    avatar = ROOT / "cache" / "avatar.jpg"
    avatar.parent.mkdir(exist_ok=True)
    urllib.request.urlretrieve(AVATAR_URL, avatar)
    image = person_mask(Image.open(avatar))
    # Dark card draws light ink, so the darker parts of the figure carry more glyphs.
    DARK_OUT.write_text(render(image, invert=False), encoding="utf-8")
    LIGHT_OUT.write_text(render(image, invert=True), encoding="utf-8")
    print(f"wrote {DARK_OUT.name} and {LIGHT_OUT.name}")


if __name__ == "__main__":
    main()
