# Style Token Guide

How the site's look is organised, so that a theme change is made in one place.

## The rule

**Raw values live in `public/css/theme/tokens.css` and nowhere else.** A raw value is a
colour (`#1e3a8a`, `rgba(…)`), a `border-radius` length, a `box-shadow`, a gradient or a
`font-family`. Every other stylesheet, and any style written from JavaScript, refers to a
token with `var(--…)`.

If you know Python, the tokens file is the base class: page stylesheets inherit from it and
override only what is genuinely different about that page.

## Tiers

`tokens.css` is ordered top to bottom, and each tier refers only to the one above it.

| Tier | Example | Who uses it |
|---|---|---|
| 1. Primitives | `--grey-600: #626872`, `--anchor-900: #00263a` | only `tokens.css` itself |
| 2. Semantic | `--color-text-muted: var(--grey-600)`, `--radius-md`, `--shadow-card`, `--font-sans`, `--status-danger`, `--aqi-moderate` | every page and component stylesheet |
| 3. Component knobs | `--page-accent`, `--card-accent`, `--card-text`, `--marker-status-color` | a page *sets* them; shared components *read* them |
| 4. Dark mode | `html[data-mode="dark"] { --color-bg: … }` | re-points tier 2 only |

Use tier 2 names in page CSS. Do not reach for a primitive: `color: var(--grey-600)` ties the
page to one palette, `color: var(--color-text-muted)` follows whatever the theme says.

To give one page or one card its own accent, set a knob rather than writing new rules:

```css
body[data-page-type="fire"] { --page-accent: var(--status-danger); }
.condition-card[data-card-type="wind"] { --card-accent: var(--status-info); }
```

`--card-accent` / `--card-text` began on the sports page (Quinten's per-card colours) and are
now the shared way to do this.

## Changing the theme

Edit values in `tokens.css`. Changing `--anchor-900` moves the sidebar, headings and every
`--usu-blue` reference at once; changing `--radius-lg` moves every card that uses it. Run
`npm test`: `themeContrast.test.js` checks that text tokens still meet WCAG AA (4.5:1) on the
surfaces they sit on, in light and dark.

Two groups are deliberately not themeable:

- `--confidence-*` are fixed by `docs/CONFIDENCE_TAXONOMY.md`.
- `--epa-*` are the EPA AQI category colours (#194).

## Legacy names

`public/css/variables.css` maps the old `--usu-*` names onto tokens so existing CSS keeps
working. Do not use `--usu-*` in new code. Page palettes such as `--roads-primary` or
`--fire-primary` are the same kind of legacy: they should point at tokens, not hold values.

## Enforcement

`server/__tests__/styleRatchet.test.js` runs in `npm test` and in CI. Most of the site
predates the rule, so it is a ratchet, not a ban:

- `server/__tests__/styleRatchet.baseline.json` records a ceiling per file for each metric
  (`color`, `radius`, `shadow`, `gradient`, `important`, `hoverMotion`, `fontFamily`,
  `rootBlock`, `legacyVar`; for JavaScript `color` and `inlineStyle`).
- A count may fall but not rise. A file with no entry has a ceiling of zero, so a new
  stylesheet has to be clean from the start.
- If the test fails, a change added a raw value: use a token, adding one to `tokens.css` if
  none fits.
- After removing raw values, run `node scripts/style-scan.mjs --tighten` to lower the
  ceilings. It never raises one. Raising a ceiling means editing the JSON by hand, so a
  reviewer sees it.
- The baseline carries headroom for branches that were open when it was written (the roads
  stack #336–#339 and #322). `--tighten` removes headroom for files that already exist, so
  wait until those have merged before tightening `roads.css` or `live_aq.css`.

`iconNames.test.js` does the same job for icons: one Font Awesome, served from
`/vendor/fontawesome`, and every `fa-*` name must exist in it.

## Hover and motion

Hovering changes colour or border only. No lift, no scale. Keyboard focus shows the same
state as hover.
