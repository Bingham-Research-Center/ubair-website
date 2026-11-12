# Favicon and wordmark: what is installed and how to change it

The site has **one** icon, the same on every page. (Until #309 each page linked a different
Gemini-made `.ico`, so the tab icon changed as a reader moved around, and `/favicon.ico` 404ed.)

## What is installed

| File (in `public/images/favicons/`) | Used for | Reached at |
|---|---|---|
| `favicon.svg` | tabs in current browsers; sharp at any size | the `<link>` in each page |
| `favicon.ico` (16, 32, 48 px) | older browsers, bookmarks, anything that asks for it unprompted | `/favicon.ico` |
| `apple-touch-icon.png` (180 px, square, opaque) | iOS and Android "Add to Home Screen" | `/apple-touch-icon.png` |

Every page in `views/` carries the same three lines, and `server/server.js` serves the two
root URLs. `server/__tests__/faviconLinks.test.js` fails if a page is missing them, links some
other icon, or a file has the wrong size.

```html
<link rel="icon" href="/favicon.ico" sizes="32x32">
<link rel="icon" href="/public/images/favicons/favicon.svg" type="image/svg+xml">
<link rel="apple-touch-icon" href="/apple-touch-icon.png">
```

## Choosing a design and colours

All three files are drawn by `scripts/make_favicon.py` (Python 3, nothing to install). It holds
three designs and one colour pair per theme:

| `--design` | What it shows |
|---|---|
| `ridge` | two white peaks above a band of the accent colour: the mountains round the Basin and the air that pools below them |
| `basin` | a white bowl with an accent-coloured lid: the Basin in cross-section under a winter inversion |
| `letter` | a white **B** with an accent-coloured degree ring (**installed**, chosen 12 Nov 2026: the most distinctive of the three, and the basis for the wordmark) |

| `--theme` | Background | Accent |
|---|---|---|
| `current` | navy `#00263a` | red `#ef4a5f` |
| `slate-copper` | slate `#2a323c` | copper `#e0813f` |
| `ink-teal` (**installed**) | ink `#15181c` | teal `#2bb5a6` |
| `navy-sage` | navy `#10283f` | sage `#8fbf96` |

The accent is a lighter tint of each theme's accent: the theme's own is tuned for text on white
and is too dark to read on the background at 16 px. `--bg` and `--accent` override either colour.

To look at all twelve combinations first (64 px with the real 16 px tab size beside each):

```bash
scripts/make_favicon.py --sheet /tmp/favicons.png
```

## Installing a choice

1. From a branch off `dev`:
   ```bash
   scripts/make_favicon.py --design letter --theme slate-copper
   ```
   It overwrites the three files above. No page or server change is needed.
2. `npm test`, commit the three files, open a PR into `dev`.
3. After the deploy, check from outside:
   ```bash
   curl -sI https://www.basinwx.dev/favicon.ico | head -1            # 200
   curl -sI https://www.basinwx.dev/apple-touch-icon.png | head -1   # 200
   ```
4. Browsers hold on to favicons longer than anything else. If a tab still shows the old one,
   open `https://www.basinwx.dev/favicon.ico` directly and reload that; a private window shows
   what a new visitor gets.

To install artwork made elsewhere instead, replace the same three files, keeping their names
and sizes (the `.ico` must hold 16, 32 and 48 px; the touch icon must be 180 px, square, with
no transparency). Edit the SVG test in `faviconLinks.test.js` if its `viewBox` differs.

## Adding a design or a theme

Designs are short lists of shapes on a 64 × 64 grid in `make_favicon.py` (`design_ridge` and
its neighbours); themes are the `THEMES` table at the top. The SVG and the PNGs are both made
from that one description, so they cannot drift apart. Keep a design to two or three shapes:
at 16 px, anything finer than about 6 grid units disappears.

## The wordmark

`public/images/brand/basinwx-wordmark.svg` is the name "BasinWx" drawn in the same strokes as
the favicon's B, with the degree ring as the dot of the i. It is the homepage logo
(`views/index.html`, class `site-wordmark`) and replaced a 1.4 MB PNG (#309).

`scripts/make_wordmark.py` draws it:

```bash
scripts/make_wordmark.py --lockup dot --scheme light --theme ink-teal --out public/images/brand/basinwx-wordmark.svg
scripts/make_wordmark.py --sheet /tmp/wordmarks.png     # every lockup, on dark and on white
```

| Option | Choices |
|---|---|
| `--lockup` | `dot` (installed: ring is the dot of the i), `end` (ring after the x), `tile` (favicon tile, then the name) |
| `--scheme` | `light` (dark letters, for a white page; installed) or `dark` (white letters, for a dark surface such as the sidebar) |
| `--theme` | as for the favicon |

The SVG has no background and no text: the letters are paths, so it looks the same whether or
not the site typeface has loaded. If dark mode is ever switched on, the homepage needs the
`dark` scheme file as well.
