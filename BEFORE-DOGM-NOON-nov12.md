# To address before DOGM 12pm

Written 12 Nov 2026. What is left of the visual overhaul for the 15 Nov relaunch (release #315
is due 13 Nov). Tick things off here; delete the file when the list is empty or the remainder
has moved to issues.

**Where things stand:** six PRs are ready and merge with each other in any order (all the
relaunch branches together on `dev`: 402 tests pass). Nothing is merged. Nobody has yet looked
at the new look in a browser. Decided so far: the favicon is the B with a degree ring.

## Next ten steps, in order

1. [ ] **John: merge the six ready PRs**, one command each. Each is green and conflict-free.
   ```bash
   gh pr merge 346 --admin --merge   # one vendored Font Awesome
   gh pr merge 347 --admin --merge   # token foundation, style ratchet, README theme section
   gh pr merge 344 --admin --merge   # remove easter eggs and 90s mode
   gh pr merge 345 --admin --merge   # remove kiosk pages; old URLs redirect
   gh pr merge 348 --admin --merge   # one constant favicon (B with degree ring)
   gh pr merge 349 --admin --merge   # this checklist
   ```
2. [ ] **John: deploy `dev`** (as `deploy` on the dev box), then check the icon is served.
   ```bash
   cd /srv/ubair-website && git pull --ff-only origin dev && npm install && pm2 restart basinwx-dev
   curl -sI https://www.basinwx.dev/favicon.ico | head -1    # 200
   ```
3. [ ] **John: make the preview reachable** (as root on the dev box; certificate first, because
   nginx will not start without it).
   ```bash
   certbot certonly --nginx -d theme.basinwx.dev
   cp /srv/ubair-website-preview-theme/theme.basinwx.dev.nginx /etc/nginx/sites-available/theme.basinwx.dev
   ln -s /etc/nginx/sites-available/theme.basinwx.dev /etc/nginx/sites-enabled/
   nginx -t && systemctl reload nginx
   ```
4. [ ] **John: pick a theme variant** on `https://theme.basinwx.dev` and reply with its name:
   Slate + Copper (Inter), Ink + Teal (IBM Plex Sans) or Navy + Sage (Source Sans 3). The panel
   at the bottom right switches variant, light/dark, basemap and tab icon; choices are per tab.
   **No pick by midday 12 Nov means 1.6.0 ships without the new look and it lands as 1.6.1.**
5. [ ] **John: pick a wordmark lockup** and reply with one word: `dot` (ring is the dot of the
   i), `end` (ring after the x) or `tile` (favicon tile, then the name). Sheet:
   `scripts/make_wordmark.py --sheet /tmp/wordmarks.png` on branch `feat/wordmark-logo`.
6. [ ] **John: tell Quinten** his #322 is repaired on `rebased/quinten-changes` (his ten commits
   on current `dev` plus five small fixes) and agree how it lands: he resets `quinten-changes`
   to it, or it gets a PR of its own. Tell Michael the look is changing at the same time.
7. [ ] **Claude, after 1 and 4: the apply PR.** Bake the chosen variant into
   `public/css/theme/tokens.css`, vendor its typeface under `/vendor/fonts`, recolour the
   favicon (`scripts/make_favicon.py --design letter --theme <variant>`), name the variant in
   README. The page changes exist today only as commit `44ef436` on the local `preview/theme`.
8. [ ] **Claude, after 7: the flatten PR** (radii, shadows, gradients, hover lift; commit
   `dfbe9dd` on `preview/theme`), then lower the ratchet ceilings with
   `node scripts/style-scan.mjs --tighten`. Leave `roads.css` and `live_aq.css` until the roads
   stack and #322 are in.
9. [ ] **Claude, after 1 and 5: the logo PR.** Install the wordmark SVG in place of the 1.4 MB
   `basinwx-logo.png` on the homepage, and delete the old Gemini icon files in
   `public/images/favicons/`. Closes #309.
10. [ ] **Claude, after 6: the coming-soon removal PR**, then the 1.6.0 release (#315).
    Removal: agriculture, aviation and water pages; the two glassed Clyfar sections; the
    sidebar "Coming Soon" dropdown; "Our Website Team" becomes the #284 link; copyright credits
    BRC (#290); drop those pages from `PENDING_REMOVAL` in `iconNames.test.js`. Release: the
    full sequence is in `CLAUDE.md` under "Versioning & release train" (strip `-dev`, promote
    `dev` to `ops`, tag, merge `ops` into `main`, reopen `dev` at the next `-dev`), plus the
    GitHub Release.

## Look at these on the preview before choosing

- [ ] **The flattening pass has not been checked by eye.** It was mechanical. Look at home,
  `/live_aq` with a popup open, `/roads`, Clyfar, sports, fire, and the sidebar at phone width.
- [ ] **Dark mode is a draft** and does not ship on 15 Nov. Only tokenised surfaces follow it;
  expect white panels.
- [ ] **Agriculture, aviation and water are still present and unflattened** there. They go in
  step 10.
- [ ] **Tab icon:** judge it in Chrome, Edge or Firefox. Safari ignores SVG favicons, so on the
  preview it keeps showing the installed one.
- [ ] Two tests fail on `preview/theme` only, by design: the guard that keeps the switcher off
  `dev`.
- [ ] The preview app (`basinwx-preview-theme`, port 3003) is not in the pm2 reboot list, so it
  will not come back by itself after a reboot.

## Known and handled, for the record

- **#344 and `rebased/quinten-changes`** no longer collide. The legend script tag moved two
  lines up on Quinten's branch (`55c938f`).
- **#345 and the roads stack (#336 to #339)** still conflict on `views/kiosk.html`, and that
  cannot be removed from #345's side. The fix when the stack is un-parked is to keep the
  deletion (`git rm views/kiosk.html`). Rehearsed: 445 tests pass. The only thing dropped is
  the one-line feed notice Michael added to the kiosk's roads slide.
- **Copilot's comments** on #347, #348 and #349 were all correct and are fixed. The first on
  #347 also hid a small colour change on untyped sports cards.
- **Old Gemini icon files** stay until #344 and #345 are in, because 90s mode and the kiosk
  pages point at them (step 9 removes them).

## After the relaunch, not before DOGM

- Display mode (`?display=1`) on home, live map and roads, replacing the kiosk pages.
- Michael's ring marker as the shared map marker, with EPA bands (#194, #122), with Quinten.
- Hoist the copy-pasted card and section rules into `theme/components.css`.
- Plotly and inline styles written from JavaScript; the dark-mode toggle.
- Re-point `roads.css` at the tokens once #339 is in; rename the `--usu-*` shim.
- Check CARTO's tile terms before using their basemap outside the preview.
- `preview-apps.json` is stale: its one entry gives port 3002 to the old sports preview, and
  the roads preview runs there now.
