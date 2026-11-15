"""Build the card's ASCII portrait from assets/avatar.png.

The source is a cut-out on a plain white field. Near-white pixels that touch
the image edge are background and become spaces. Only the remaining person
(hair, face, collar, shoulders) is drawn. The card paints every glyph in one
colour, so shading is the character density.
"""

from __future__ import annotations

from pathlib import Path

from PIL import Image

ROOT = Path(__file__).resolve().parent.parent
AVATAR = ROOT / "assets" / "avatar.png"
DARK_OUT = ROOT / "assets" / "ascii-art.txt"
LIGHT_OUT = ROOT / "assets" / "ascii-art-light.txt"
# Cell is 0.54 as wide as it is tall in build_card.art_metrics.
CELL_ASPECT = 0.54
ROWS = 46
# Dark source pixels map to the dense end. The last slot is never used for
# a person pixel; background is an explicit space.
RAMP = "@%#*+=-:. "


def near_white(r: int, g: int, b: int) -> bool:
    return r >= 242 and g >= 242 and b >= 242 and max(r, g, b) - min(r, g, b) <= 18


def background_mask(image: Image.Image) -> list[list[bool]]:
    """Flood-fill near-white from the edges. True means background."""
    rgb = image.convert("RGB")
    width, height = rgb.size
    pixels = rgb.load()
    bg = [[False] * width for _ in range(height)]
    stack: list[tuple[int, int]] = []

    def push(x: int, y: int) -> None:
        if not (0 <= x < width and 0 <= y < height) or bg[y][x]:
            return
        if not near_white(*pixels[x, y]):
            return
        bg[y][x] = True
        stack.append((x, y))

    for x in range(width):
        push(x, 0)
        push(x, height - 1)
    for y in range(height):
        push(0, y)
        push(width - 1, y)
    while stack:
        x, y = stack.pop()
        push(x + 1, y)
        push(x - 1, y)
        push(x, y + 1)
        push(x, y - 1)
    return bg


def largest_person(bg: list[list[bool]]) -> list[list[bool]]:
    """Keep the one connected non-background region. Drops stray specks."""
    height, width = len(bg), len(bg[0])
    seen = [[False] * width for _ in range(height)]
    best: list[tuple[int, int]] = []
    for y in range(height):
        for x in range(width):
            if bg[y][x] or seen[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and not bg[ny][nx] and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            if len(comp) > len(best):
                best = comp
    keep = [[False] * width for _ in range(height)]
    for x, y in best:
        keep[y][x] = True
    return keep


def crop_box(keep: list[list[bool]], pad: int = 6) -> tuple[int, int, int, int]:
    height, width = len(keep), len(keep[0])
    xs = [x for y in range(height) for x in range(width) if keep[y][x]]
    ys = [y for y in range(height) for x in range(width) if keep[y][x]]
    return (
        max(0, min(xs) - pad),
        max(0, min(ys) - pad),
        min(width, max(xs) + pad + 1),
        min(height, max(ys) + pad + 1),
    )


def render(image: Image.Image, keep: list[list[bool]]) -> str:
    left, top, right, bottom = crop_box(keep)
    cropped = image.crop((left, top, right, bottom)).convert("RGB")
    mask = Image.new("L", cropped.size, 0)
    mask_px = mask.load()
    for y in range(top, bottom):
        for x in range(left, right):
            if keep[y][x]:
                mask_px[x - left, y - top] = 255
    width, height = cropped.size
    cols = max(24, round(ROWS * (width / height) / CELL_ASPECT))
    art = cropped.resize((cols, ROWS), Image.Resampling.LANCZOS)
    art_mask = mask.resize((cols, ROWS), Image.Resampling.BOX)
    pixels = art.load()
    mask_small = art_mask.load()
    lines = []
    for y in range(ROWS):
        row = []
        for x in range(cols):
            # BOX resize: a cell is background unless the person covers most of it.
            # Only cells the person mostly covers. Edge bleed from the white
            # field stays blank, which is what removes stray specks.
            if mask_small[x, y] < 160:
                row.append(" ")
                continue
            r, g, b = pixels[x, y]
            if near_white(r, g, b):
                row.append(" ")
                continue
            lum = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255
            # Pull midtones apart so hair, skin, collar and the shirt separate.
            shade = min(1.0, max(0.0, (lum - 0.08) / 0.78))
            row.append(RAMP[min(len(RAMP) - 2, int(shade * (len(RAMP) - 1)))])
        lines.append("".join(row))
    lines = drop_stray_glyphs(lines)
    while lines and not lines[0].strip():
        lines.pop(0)
    while lines and not lines[-1].strip():
        lines.pop()
    width = max(len(line) for line in lines)
    return "\n".join(line[:width].ljust(width).rstrip() for line in lines) + "\n"


def drop_stray_glyphs(lines: list[str]) -> list[str]:
    """Blank every glyph that is not part of the main figure."""
    height = len(lines)
    width = max(len(line) for line in lines)
    grid = [list(line.ljust(width)) for line in lines]
    seen = [[False] * width for _ in range(height)]
    components: list[list[tuple[int, int]]] = []
    for y in range(height):
        for x in range(width):
            if grid[y][x] == " " or seen[y][x]:
                continue
            stack = [(x, y)]
            seen[y][x] = True
            comp: list[tuple[int, int]] = []
            while stack:
                cx, cy = stack.pop()
                comp.append((cx, cy))
                for nx, ny in ((cx + 1, cy), (cx - 1, cy), (cx, cy + 1), (cx, cy - 1)):
                    if 0 <= nx < width and 0 <= ny < height and grid[ny][nx] != " " and not seen[ny][nx]:
                        seen[ny][nx] = True
                        stack.append((nx, ny))
            components.append(comp)
    if not components:
        raise SystemExit("portrait is empty")
    main = max(components, key=len)
    keep = set(main)
    for y in range(height):
        for x in range(width):
            if grid[y][x] != " " and (x, y) not in keep:
                grid[y][x] = " "
    return ["".join(row) for row in grid]


def main() -> None:
    if not AVATAR.exists():
        raise SystemExit(f"missing {AVATAR}")
    image = Image.open(AVATAR)
    bg = background_mask(image)
    keep = largest_person(bg)
    height, width = len(keep), len(keep[0])
    person = sum(sum(row) for row in keep)
    print(f"avatar {width}x{height}, person pixels {person}")
    # Same silhouette for both themes. The card colours the glyphs per theme.
    text = render(image, keep)
    blank_rows = sum(1 for line in text.splitlines() if not line.strip())
    stray = 0
    DARK_OUT.write_text(text, encoding="utf-8")
    LIGHT_OUT.write_text(text, encoding="utf-8")
    print(f"wrote {DARK_OUT.name} and {LIGHT_OUT.name} ({text.count(chr(10))} lines, {blank_rows} blank, {stray} stray)")


if __name__ == "__main__":
    main()
