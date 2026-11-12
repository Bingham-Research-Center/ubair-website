#!/usr/bin/env python3
"""Draw the site favicon and write every file a browser asks for.

    scripts/make_favicon.py --design ridge --theme slate-copper
    scripts/make_favicon.py --design basin --bg '#10283f' --accent '#8fbf96'
    scripts/make_favicon.py --sheet /tmp/favicons.png        # all designs x all themes, to look at

Writes into public/images/favicons/ (or --out DIR):

    favicon.svg            modern browsers; sharp at any size
    favicon.ico            16, 32 and 48 px; served at /favicon.ico
    apple-touch-icon.png   180 px, square and opaque (iOS rounds the corners itself)

Python 3 standard library only, so it runs on either box. The icon is described once, as a
few shapes on a 64 x 64 grid, and both the SVG and the PNGs are produced from that description,
so they cannot drift apart. Steps for changing the icon: docs/FAVICON-INSTALL-STEPS.md.
"""

import argparse
import math
import re
import struct
import zlib
from pathlib import Path

GRID = 64
CORNER = 12          # tab icon corner radius on the 64 grid
WHITE = '#ffffff'

# Background and accent per theme. The accent is a lighter tint of the theme's accent colour:
# the theme's own accent is tuned for text on white and is too dark to read on the anchor.
THEMES = {
    'current':      {'bg': '#00263a', 'accent': '#ef4a5f'},
    'slate-copper': {'bg': '#2a323c', 'accent': '#e0813f'},
    'ink-teal':     {'bg': '#15181c', 'accent': '#2bb5a6'},
    'navy-sage':    {'bg': '#10283f', 'accent': '#8fbf96'},
}


# --- shapes: each knows how to test a point and how to write itself as SVG -------------------

class Rect:
    def __init__(self, x, y, w, h, r=0):
        self.x, self.y, self.w, self.h, self.r = x, y, w, h, r

    def contains(self, px, py):
        dx = max(self.x + self.r - px, 0, px - (self.x + self.w - self.r))
        dy = max(self.y + self.r - py, 0, py - (self.y + self.h - self.r))
        if self.r == 0:
            return self.x <= px <= self.x + self.w and self.y <= py <= self.y + self.h
        return dx * dx + dy * dy <= self.r * self.r

    def svg(self, fill):
        r = f' rx="{self.r}"' if self.r else ''
        return f'<rect x="{self.x}" y="{self.y}" width="{self.w}" height="{self.h}"{r} fill="{fill}"/>'


class Circle:
    def __init__(self, cx, cy, r):
        self.cx, self.cy, self.r = cx, cy, r

    def contains(self, px, py):
        return (px - self.cx) ** 2 + (py - self.cy) ** 2 <= self.r * self.r

    def svg(self, fill):
        return f'<circle cx="{self.cx}" cy="{self.cy}" r="{self.r}" fill="{fill}"/>'


class Polygon:
    def __init__(self, points):
        self.points = points

    def contains(self, px, py):
        inside = False
        j = len(self.points) - 1
        for i, (xi, yi) in enumerate(self.points):
            xj, yj = self.points[j]
            if (yi > py) != (yj > py) and px < (xj - xi) * (py - yi) / (yj - yi) + xi:
                inside = not inside
            j = i
        return inside

    def svg(self, fill):
        pts = ' '.join(f'{x},{y}' for x, y in self.points)
        return f'<polygon points="{pts}" fill="{fill}"/>'


class Stroke:
    """A line of the given width with round ends and joins. `path` mixes ('M'|'L', x, y) with
    ('R', x, y): a half circle bulging right from the current point down to (x, y)."""

    def __init__(self, path, width):
        self.path, self.half = path, width / 2
        self.segments = []
        cx = cy = 0
        for kind, x, y in path:
            if kind == 'L':
                self.segments.append((cx, cy, x, y))
            elif kind == 'R':
                radius, mid = (y - cy) / 2, (y + cy) / 2
                previous = (cx, cy)
                for step in range(1, 25):
                    angle = -math.pi / 2 + math.pi * step / 24
                    point = (cx + radius * math.cos(angle), mid + radius * math.sin(angle))
                    self.segments.append((*previous, *point))
                    previous = point
            cx, cy = x, y

    def contains(self, px, py):
        for x1, y1, x2, y2 in self.segments:
            dx, dy = x2 - x1, y2 - y1
            length = dx * dx + dy * dy
            t = 0 if length == 0 else max(0, min(1, ((px - x1) * dx + (py - y1) * dy) / length))
            if (px - x1 - t * dx) ** 2 + (py - y1 - t * dy) ** 2 <= self.half * self.half:
                return True
        return False

    def svg(self, fill):
        parts, cy = [], 0
        for kind, x, y in self.path:
            if kind == 'R':
                radius = (y - cy) / 2
                parts.append(f'A{radius} {radius} 0 0 1 {x} {y}')
            else:
                parts.append(f'{kind}{x} {y}')
            cy = y
        return (f'<path d="{" ".join(parts)}" fill="none" stroke="{fill}" '
                f'stroke-width="{self.half * 2}" stroke-linecap="round" stroke-linejoin="round"/>')


# --- the three designs: layers painted in order, each (shape, colour role) -------------------

def design_ridge():
    """Two peaks standing out of a layer of haze: the mountains that ring the Basin, and the
    air that pools below them."""
    return [
        (Polygon([(-2, 66), (-2, 47), (21, 17), (32, 31), (42, 20), (66, 51), (66, 66)]), 'fg'),
        (Rect(-2, 45, 68, 21), 'accent'),
    ]


def design_basin():
    """The Basin in cross-section: a bowl with a lid over it, which is how a winter inversion
    traps air (and ozone) on the valley floor."""
    return [
        (Circle(32, 27, 21), 'fg'),
        (Rect(-2, -2, 68, 29), 'bg'),
        (Rect(9, 14, 46, 7, 3.5), 'accent'),
    ]


def design_letter():
    """A plain B for Basin, with a degree ring."""
    return [
        (Stroke([('M', 19, 14), ('L', 19, 50)], 8), 'fg'),
        (Stroke([('M', 19, 14), ('L', 30, 14), ('R', 30, 31), ('L', 19, 31)], 8), 'fg'),
        (Stroke([('M', 19, 31), ('L', 32, 31), ('R', 32, 50), ('L', 19, 50)], 8), 'fg'),
        (Circle(51, 15, 6.5), 'accent'),
        (Circle(51, 15, 2.6), 'bg'),
    ]


DESIGNS = {'ridge': design_ridge, 'basin': design_basin, 'letter': design_letter}


# --- output -----------------------------------------------------------------------------

def rgb(colour):
    colour = colour.lstrip('#')
    return tuple(int(colour[i:i + 2], 16) for i in (0, 2, 4))


def to_svg(layers, colours, corner=CORNER):
    body = '\n    '.join(shape.svg(colours[role]) for shape, role in layers)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {GRID} {GRID}">\n'
            f'  <clipPath id="tile"><rect width="{GRID}" height="{GRID}" rx="{corner}"/></clipPath>\n'
            f'  <g clip-path="url(#tile)">\n'
            f'    <rect width="{GRID}" height="{GRID}" fill="{colours["bg"]}"/>\n'
            f'    {body}\n'
            f'  </g>\n</svg>\n')


def rasterise(layers, colours, size, corner=CORNER, samples=4):
    """RGBA rows for a size x size image, averaging samples x samples points per pixel."""
    tile = Rect(0, 0, GRID, GRID, corner)
    paints = [(shape, rgb(colours[role])) for shape, role in layers]
    background = rgb(colours['bg'])
    scale = GRID / size
    rows = []
    for py in range(size):
        row = bytearray()
        for px in range(size):
            red = green = blue = covered = 0
            for sy in range(samples):
                for sx in range(samples):
                    x = (px + (sx + 0.5) / samples) * scale
                    y = (py + (sy + 0.5) / samples) * scale
                    if not tile.contains(x, y):
                        continue
                    colour = background
                    for shape, paint in paints:
                        if shape.contains(x, y):
                            colour = paint
                    red, green, blue = red + colour[0], green + colour[1], blue + colour[2]
                    covered += 1
            if covered:
                row += bytes((round(red / covered), round(green / covered), round(blue / covered),
                              round(255 * covered / (samples * samples))))
            else:
                row += b'\0\0\0\0'
        rows.append(bytes(row))
    return rows


def png_bytes(rows):
    width, height = len(rows[0]) // 4, len(rows)

    def chunk(kind, data):
        return (struct.pack('>I', len(data)) + kind + data
                + struct.pack('>I', zlib.crc32(kind + data) & 0xffffffff))

    raw = b''.join(b'\0' + row for row in rows)
    return (b'\x89PNG\r\n\x1a\n'
            + chunk(b'IHDR', struct.pack('>IIBBBBB', width, height, 8, 6, 0, 0, 0))
            + chunk(b'IDAT', zlib.compress(raw, 9)) + chunk(b'IEND', b''))


def ico_bytes(pngs):
    """An .ico holding PNG images (every browser since IE 11 reads these)."""
    header = struct.pack('<HHH', 0, 1, len(pngs))
    offset = 6 + 16 * len(pngs)
    entries, blobs = b'', b''
    for size, data in pngs:
        entries += struct.pack('<BBBBHHII', size % 256, size % 256, 0, 0, 1, 32, len(data), offset)
        offset += len(data)
        blobs += data
    return header + entries + blobs


def write_set(design, colours, out):
    layers = DESIGNS[design]()
    out.mkdir(parents=True, exist_ok=True)
    (out / 'favicon.svg').write_text(to_svg(layers, colours))
    pngs = [(size, png_bytes(rasterise(layers, colours, size))) for size in (16, 32, 48)]
    (out / 'favicon.ico').write_bytes(ico_bytes(pngs))
    (out / 'apple-touch-icon.png').write_bytes(png_bytes(rasterise(layers, colours, 180, corner=0)))
    for name in ('favicon.svg', 'favicon.ico', 'apple-touch-icon.png'):
        print(f'{out / name}  {(out / name).stat().st_size} bytes')


def write_sheet(path):
    """Every design in every theme at 64 px, with the 16 px tab size beside it."""
    cell, pad = 64, 12
    names, themes = list(DESIGNS), list(THEMES)
    width = pad + len(names) * (cell + 16 + 2 * pad)
    height = pad + len(themes) * (cell + pad)
    canvas = [bytearray(b'\xee\xee\xee\xff' * width) for _ in range(height)]

    def paste(rows, left, top):
        for dy, row in enumerate(rows):
            for dx in range(len(row) // 4):
                r, g, b, a = row[dx * 4:dx * 4 + 4]
                at = (left + dx) * 4
                old = canvas[top + dy][at:at + 3]
                canvas[top + dy][at:at + 3] = bytes(
                    round((new * a + was * (255 - a)) / 255) for new, was in zip((r, g, b), old))

    for row, theme in enumerate(themes):
        colours = {'fg': WHITE, **THEMES[theme]}
        for column, name in enumerate(names):
            left = pad + column * (cell + 16 + 2 * pad)
            top = pad + row * (cell + pad)
            layers = DESIGNS[name]()
            paste(rasterise(layers, colours, cell), left, top)
            paste(rasterise(layers, colours, 16), left + cell + pad, top + cell - 16)
    Path(path).write_bytes(png_bytes([bytes(row) for row in canvas]))
    print(f'{path}: columns {", ".join(names)}; rows {", ".join(themes)}')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--design', choices=sorted(DESIGNS))
    parser.add_argument('--theme', choices=sorted(THEMES), default='current')
    parser.add_argument('--bg', help='background colour, overrides the theme')
    parser.add_argument('--accent', help='accent colour, overrides the theme')
    parser.add_argument('--fg', default=WHITE, help='main mark colour (default white)')
    parser.add_argument('--out', default=str(Path(__file__).resolve().parent.parent
                                             / 'public/images/favicons'))
    parser.add_argument('--sheet', metavar='PNG', help='write a comparison sheet and stop')
    args = parser.parse_args()
    if args.sheet:
        write_sheet(args.sheet)
        return
    if not args.design:
        parser.error('--design is required (or use --sheet)')
    colours = {'fg': args.fg, **THEMES[args.theme]}
    if args.bg:
        colours['bg'] = args.bg
    if args.accent:
        colours['accent'] = args.accent
    # Check every colour before writing anything: a bad one must not leave a new SVG beside
    # an old .ico.
    for role, colour in colours.items():
        if not re.fullmatch(r'#[0-9a-fA-F]{6}', colour):
            parser.error(f'{role} colour {colour!r} must be six hex digits, like #10283f')
    write_set(args.design, colours, Path(args.out))


if __name__ == '__main__':
    main()
