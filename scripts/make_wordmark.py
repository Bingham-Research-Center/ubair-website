#!/usr/bin/env python3
"""Draw the BasinWx wordmark: the name set in the same strokes as the favicon's B.

    scripts/make_wordmark.py --lockup dot --scheme light --theme slate-copper --out wordmark.svg
    scripts/make_wordmark.py --sheet /tmp/wordmarks.png      # every lockup, to look at

Lockups (where the favicon's degree ring goes):

    dot    the ring is the dot of the i
    end    the ring follows the x, as in a temperature reading
    tile   the favicon tile, then the name with a plain dot

Schemes: `dark` is white letters for a dark surface (the sidebar); `light` is dark letters
for a white page. The SVG has no background of its own.

Letters are built the way the favicon's B is: straight lines and arcs of one width with round
ends, on the same grid (capitals from 14 to 50, lowercase from 26, line width 8). Shapes and
PNG writer come from make_favicon.py. Python 3 standard library only.
"""

import argparse
import math
import re
from pathlib import Path

from make_favicon import (CORNER, GRID, THEMES, WHITE, Circle, Rect, Stroke, design_letter,
                          png_bytes, rgb)

LINE = 8
HEIGHT = 64
# On a white page the ring takes the theme's own accent, which is dark enough there.
ACCENT_ON_LIGHT = {'current': '#c8102e', 'slate-copper': '#b4531a',
                   'ink-teal': '#0f766e', 'navy-sage': '#55775a'}


class Line(Stroke):
    """A Stroke that also takes ('C', cx, cy, r, start, end): an arc about (cx, cy) between
    two angles in degrees (0 = right, 90 = down). An arc starts its own piece of line."""

    def __init__(self, path, width=LINE):
        self.path, self.half, self.segments = path, width / 2, []
        cx = cy = 0
        for command in path:
            kind = command[0]
            if kind == 'C':
                _, ox, oy, radius, start, end = command
                steps = max(8, int(abs(end - start) / 6))
                points = [(ox + radius * math.cos(math.radians(start + (end - start) * i / steps)),
                           oy + radius * math.sin(math.radians(start + (end - start) * i / steps)))
                          for i in range(steps + 1)]
                self.segments += [(*a, *b) for a, b in zip(points, points[1:])]
                cx, cy = points[-1]
                continue
            _, x, y = command
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
        xs = [v for s in self.segments for v in (s[0], s[2])]
        ys = [v for s in self.segments for v in (s[1], s[3])]
        self.box = (min(xs) - self.half, min(ys) - self.half, max(xs) + self.half, max(ys) + self.half)

    def svg(self, fill):
        parts, cy = [], 0
        for command in self.path:
            kind = command[0]
            if kind == 'C':
                _, ox, oy, radius, start, end = command
                def at(angle):
                    return (round(ox + radius * math.cos(math.radians(angle)), 3),
                            round(oy + radius * math.sin(math.radians(angle)), 3))
                sweep = 1 if end > start else 0
                stops = [start, (start + end) / 2, end] if abs(end - start) >= 360 else [start, end]
                parts.append('M{} {}'.format(*at(stops[0])))
                for a, b in zip(stops, stops[1:]):
                    large = 1 if abs(b - a) > 180 else 0
                    parts.append('A{r} {r} 0 {l} {s} {x} {y}'.format(
                        r=radius, l=large, s=sweep, x=at(b)[0], y=at(b)[1]))
                cy = at(end)[1]
                continue
            _, x, y = command
            if kind == 'R':
                radius = (y - cy) / 2
                parts.append(f'A{radius} {radius} 0 0 1 {x} {y}')
            else:
                parts.append(f'{kind}{x} {y}')
            cy = y
        return (f'<path d="{" ".join(parts)}" fill="none" stroke="{fill}" '
                f'stroke-width="{self.half * 2}" stroke-linecap="round" stroke-linejoin="round"/>')


# --- letters: each returns (paths, width between the outermost centre lines) ---------------

def letter_B(x):
    return [[('M', x, 14), ('L', x, 50)],
            [('M', x, 14), ('L', x + 11, 14), ('R', x + 11, 31), ('L', x, 31)],
            [('M', x, 31), ('L', x + 13, 31), ('R', x + 13, 50), ('L', x, 50)]], 22.5


def letter_a(x):
    return [[('C', x + 12, 38, 12, 0, 360)], [('M', x + 24, 26), ('L', x + 24, 50)]], 24


def letter_s(x):
    return [[('M', x + 17, 26), ('L', x + 6, 26)], [('C', x + 6, 32, 6, 270, 90)],
            [('M', x + 6, 38), ('L', x + 12, 38)], [('C', x + 12, 44, 6, -90, 90)],
            [('M', x + 12, 50), ('L', x + 1, 50)]], 18


def letter_i(x):
    return [[('M', x, 26), ('L', x, 50)]], 0


def letter_n(x):
    return [[('M', x, 26), ('L', x, 50)], [('C', x + 8, 34, 8, 180, 360)],
            [('M', x + 16, 34), ('L', x + 16, 50)]], 16


def letter_W(x):
    return [[('M', x, 14), ('L', x + 9, 50), ('L', x + 18, 20), ('L', x + 27, 50),
             ('L', x + 36, 14)]], 36


def letter_x(x):
    return [[('M', x, 26), ('L', x + 19, 50)], [('M', x + 19, 26), ('L', x, 50)]], 19


# (letter, gap before it between outer edges)
NAME = [(letter_B, 0), (letter_a, 6), (letter_s, 6), (letter_i, 6), (letter_n, 6),
        (letter_W, 5), (letter_x, 3)]


def ring(cx, cy):
    """The favicon's degree ring, as a line so the hole is really empty."""
    return Line([('C', cx, cy, 4.55, 0, 360)], 3.9)


def wordmark(lockup):
    """(layers, width). Layers are (shape, colour role); roles are fg, accent, tile."""
    layers = []
    pen = 2
    if lockup == 'tile':
        layers.append((Rect(0, 0, GRID, GRID, CORNER), 'tile'))
        layers += [(shape, {'fg': 'tile-fg', 'bg': 'tile', 'accent': 'tile-accent'}[role])
                   for shape, role in design_letter()]
        pen = GRID + 14
    for letter, gap in NAME:
        left = pen + gap + LINE / 2
        paths, width = letter(left)
        layers += [(Line(path), 'fg') for path in paths]
        if letter is letter_i:
            layers.append((ring(left, 11.5), 'accent') if lockup == 'dot'
                          else (Circle(left, 13.5, 4.6), 'fg'))
        pen = left + width + LINE / 2
    if lockup == 'end':
        layers.append((ring(pen + 3 + 6.5, 15), 'accent'))
        pen += 3 + 13
    return layers, pen + 2


def colours_for(scheme, theme):
    tile = THEMES[theme]
    if scheme == 'dark':
        main = {'fg': WHITE, 'accent': tile['accent']}
    else:
        main = {'fg': tile['bg'], 'accent': ACCENT_ON_LIGHT[theme]}
    return {**main, 'tile': tile['bg'], 'tile-fg': WHITE, 'tile-accent': tile['accent']}


def to_svg(layers, width, colours):
    body = '\n  '.join(shape.svg(colours[role]) for shape, role in layers)
    return (f'<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 {width:g} {HEIGHT}" '
            f'role="img" aria-label="BasinWx">\n  {body}\n</svg>\n')


def box_of(shape):
    if isinstance(shape, Line):
        return shape.box
    if isinstance(shape, Stroke):
        xs = [v for s in shape.segments for v in (s[0], s[2])]
        ys = [v for s in shape.segments for v in (s[1], s[3])]
        return (min(xs) - shape.half, min(ys) - shape.half, max(xs) + shape.half, max(ys) + shape.half)
    if isinstance(shape, Circle):
        return (shape.cx - shape.r, shape.cy - shape.r, shape.cx + shape.r, shape.cy + shape.r)
    return (shape.x, shape.y, shape.x + shape.w, shape.y + shape.h)


def rasterise(layers, width, colours, backdrop, scale=2, samples=3):
    """RGBA rows, `scale` pixels to a grid unit, on an opaque backdrop colour."""
    paints = [(shape, box_of(shape), rgb(colours[role])) for shape, role in layers]
    base = rgb(backdrop)
    rows = []
    for py in range(HEIGHT * scale):
        row = bytearray()
        for px in range(int(width * scale)):
            total = [0, 0, 0]
            for sy in range(samples):
                for sx in range(samples):
                    x = (px + (sx + 0.5) / samples) / scale
                    y = (py + (sy + 0.5) / samples) / scale
                    colour = base
                    for shape, (x0, y0, x1, y1), paint in paints:
                        if x0 <= x <= x1 and y0 <= y <= y1 and shape.contains(x, y):
                            colour = paint
                    for channel in range(3):
                        total[channel] += colour[channel]
            row += bytes(round(v / (samples * samples)) for v in total) + b'\xff'
        rows.append(bytes(row))
    return rows


def write_sheet(path):
    """Each lockup on a dark and a light panel (current colours), then the `dot` lockup in
    the three candidate themes."""
    pad, scale = 20, 2
    cells = [(lockup, scheme, 'current') for lockup in ('dot', 'end', 'tile')
             for scheme in ('dark', 'light')]
    cells += [('dot', scheme, theme) for theme in ('slate-copper', 'ink-teal', 'navy-sage')
              for scheme in ('dark', 'light')]
    panel_w = max(wordmark(lockup)[1] for lockup in ('dot', 'end', 'tile')) * scale + 2 * pad
    panel_h = HEIGHT * scale + 2 * pad
    width, height = int(2 * panel_w + 3 * pad), int(len(cells) / 2 * (panel_h + pad) + pad)
    canvas = [bytearray(b'\xd8\xdb\xe0\xff' * width) for _ in range(height)]
    for index, (lockup, scheme, theme) in enumerate(cells):
        layers, mark_w = wordmark(lockup)
        colours = colours_for(scheme, theme)
        backdrop = THEMES[theme]['bg'] if scheme == 'dark' else WHITE
        if lockup == 'tile' and scheme == 'dark':
            backdrop = '#3a424d'      # a tile needs a surface that is not its own colour
        left = int(pad + (index % 2) * (panel_w + pad))
        top = int(pad + (index // 2) * (panel_h + pad))
        fill = bytes(rgb(backdrop)) + b'\xff'
        for y in range(top, top + panel_h):
            canvas[y][left * 4:(left + int(panel_w)) * 4] = fill * int(panel_w)
        for dy, row in enumerate(rasterise(layers, mark_w, colours, backdrop, scale)):
            at = (left + pad) * 4
            canvas[top + pad + dy][at:at + len(row)] = row
    Path(path).write_bytes(png_bytes([bytes(row) for row in canvas]))
    print(f'{path}: rows dot, end, tile (current colours), then dot in slate-copper, '
          f'ink-teal, navy-sage; left dark, right light')


def main():
    parser = argparse.ArgumentParser(description=__doc__.split('\n')[0])
    parser.add_argument('--lockup', choices=['dot', 'end', 'tile'], default='dot')
    parser.add_argument('--scheme', choices=['dark', 'light'], default='light')
    parser.add_argument('--theme', choices=sorted(THEMES), default='current')
    parser.add_argument('--fg', help='letter colour, overrides the scheme')
    parser.add_argument('--accent', help='ring colour, overrides the scheme')
    parser.add_argument('--out', help='SVG file to write')
    parser.add_argument('--sheet', metavar='PNG', help='write a comparison sheet and stop')
    args = parser.parse_args()
    if args.sheet:
        write_sheet(args.sheet)
        return
    if not args.out:
        parser.error('--out is required (or use --sheet)')
    colours = colours_for(args.scheme, args.theme)
    for role, value in (('fg', args.fg), ('accent', args.accent)):
        if value:
            if not re.fullmatch(r'#[0-9a-fA-F]{6}', value):
                parser.error(f'{role} colour {value!r} must be six hex digits, like #10283f')
            colours[role] = value
    layers, width = wordmark(args.lockup)
    Path(args.out).write_text(to_svg(layers, width, colours))
    print(f'{args.out}  {width:g} x {HEIGHT} units')


if __name__ == '__main__':
    main()
