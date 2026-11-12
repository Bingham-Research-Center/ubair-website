# To address before DOGM 12pm

Written 12 Nov 2026. What is left of the visual overhaul for the 15 Nov relaunch (release #315
is due 13 Nov). Tick things off here; delete the file when the list is empty or the remainder
has moved to issues.

**Where things stand:** six pieces of work are ready and merge with each other in any order
(all six together on `dev`: 402 tests pass). Nothing is merged. Nobody has yet looked at the
new look in a browser.

## 1. John only

- [ ] **Make the preview reachable.** As root on the dev box, certificate first (nginx will not
      start without it):
      ```bash
      certbot certonly --nginx -d theme.basinwx.dev
      cp /srv/ubair-website-preview-theme/theme.basinwx.dev.nginx /etc/nginx/sites-available/theme.basinwx.dev
      ln -s /etc/nginx/sites-available/theme.basinwx.dev /etc/nginx/sites-enabled/
      nginx -t && systemctl reload nginx
      ```
      The app is already running on port 3003 (`basinwx-preview-theme`). It is not in the pm2
      reboot list, so it will not come back by itself after a reboot.
- [ ] **Pick a theme variant** on `https://theme.basinwx.dev`: Slate + Copper (Inter),
      Ink + Teal (IBM Plex Sans) or Navy + Sage (Source Sans 3). The panel at the bottom right
      switches variant, light/dark, basemap and tab icon. Choices are per tab, so two tabs can
      sit side by side. **If there is no pick by midday 12 Nov, 1.6.0 ships without the new look
      and it lands as 1.6.1.**
- [ ] **Pick a favicon design:** `ridge`, `basin` or `letter` (the "Tab icon" choice in the same
      panel, or the sheet from `scripts/make_favicon.py --sheet /tmp/favicons.png` on #348).
      `ridge` in the current navy and red is installed as a placeholder.
- [ ] **Decide how Quinten's repaired #322 lands:** `rebased/quinten-changes` is his ten commits
      on current `dev` plus five small fixes. Either he resets `quinten-changes` to it, or it
      gets a PR of its own. He has not been told yet.
- [ ] **Merge, one at a time** (`gh pr merge <N> --admin`). Any order works.

      | PR | What | Tests |
      |---|---|---|
      | #344 | remove easter eggs, 90s mode, Welsh flag strip | 322 |
      | #345 | remove kiosk pages; old URLs redirect | 326 |
      | #346 | one vendored Font Awesome; blank icons replaced | 352 |
      | #347 | token foundation, style ratchet, README theme section | 347 |
      | #348 | one constant favicon, generator, install steps | 343 |
      | `rebased/quinten-changes` | #322 repaired (no PR yet) | 322 |

- [ ] **Tell Michael and Quinten** once the variant is picked. Draft notes are mine to write;
      they should credit Michael's flat roads direction and ring marker, and Quinten's sports
      accents.

## 2. Mine, once the choices above are made

- [ ] Bake the chosen variant into `public/css/theme/tokens.css` and vendor its typeface under
      `/vendor/fonts` (needs #347 merged).
- [ ] Open the **apply** PR (page palettes, font, flat background, accents read the tokens) and
      the **flatten** PR (radii, shadows, gradients, hover lift). Both exist only on the local
      `preview/theme` branch today, as commits `44ef436` and `dfbe9dd`.
- [ ] Lower the ratchet ceilings afterwards: `node scripts/style-scan.mjs --tighten`. Leave
      `roads.css` and `live_aq.css` until the roads stack and #322 are in.
- [ ] Recolour the favicon to the chosen variant and design: one command,
      `docs/FAVICON-INSTALL-STEPS.md` (needs #348 merged).
- [ ] Delete the old Gemini icon files in `public/images/favicons/` (needs #344 and #345 merged;
      90s mode and the kiosk pages point at them until then). Closes the favicon half of #309.
- [ ] **Coming-soon removal** PR (needs #322 merged): agriculture, aviation and water pages; the
      two glassed Clyfar sections; the sidebar "Coming Soon" dropdown; "Our Website Team"
      becomes the #284 link; copyright credits BRC (#290). Then drop those pages from
      `PENDING_REMOVAL` in `iconNames.test.js`.
- [ ] Name the chosen variant in README's "Look and feel" section.
- [ ] Release train for 1.6.0 (#315): strip `-dev`, promote `dev` to `ops`, tag, GitHub Release.

## 3. Look at these on the preview before choosing

- [ ] **The flattening pass has not been checked by eye.** It was mechanical. Look at home,
      `/live_aq` with a popup open, `/roads`, Clyfar, sports, fire, and the sidebar at phone width.
- [ ] **Dark mode is a draft** and does not ship on 15 Nov. Only tokenised surfaces follow it;
      expect white panels.
- [ ] **Agriculture, aviation and water are still present and unflattened** there. They go in
      the coming-soon removal.
- [ ] **Tab icon:** judge it in Chrome, Edge or Firefox. Safari ignores SVG favicons, so on the
      preview it keeps showing the placeholder.
- [ ] Two tests fail on `preview/theme` only, by design: the guard that keeps the switcher off
      `dev`.

## 4. Known and handled, for the record

- **#344 and `rebased/quinten-changes`** no longer collide. The legend script tag moved two
  lines up on Quinten's branch (`55c938f`).
- **#345 and the roads stack (#336 to #339)** still conflict on `views/kiosk.html`, and that
  cannot be removed from #345's side. The fix when the stack is un-parked is to keep the
  deletion (`git rm views/kiosk.html`). Rehearsed: 445 tests pass. The only thing dropped is
  the one-line feed notice Michael added to the kiosk's roads slide.
- **Copilot's two comments on #347** were both right and are fixed (`310ce3b`, `c54332b`). The
  first also hid a small colour change on untyped sports cards.

## 5. After the relaunch, not before DOGM

- Display mode (`?display=1`) on home, live map and roads, replacing the kiosk pages.
- Michael's ring marker as the shared map marker, with EPA bands (#194, #122), with Quinten.
- Hoist the copy-pasted card and section rules into `theme/components.css`.
- Plotly and inline styles written from JavaScript; the dark-mode toggle.
- Re-point `roads.css` at the tokens once #339 is in; rename the `--usu-*` shim.
- Check CARTO's tile terms before using their basemap outside the preview.
- `preview-apps.json` is stale: its one entry gives port 3002 to the old sports preview, and
  the roads preview runs there now.
