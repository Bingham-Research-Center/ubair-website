Closes #

One concern per PR. Base branch is `dev` — never `ops` or `main`.

## Preview URL

`https://<name>.basinwx.dev` (see `docs/howto/preview-a-branch.md`), or "nothing visible".

## Screenshots

| 375 px | desktop |
|---|---|
|  |  |

## Definition of done

- [ ] Branch from `origin/dev`, one concern, PR into `dev` with `Closes #N`; acceptance criteria named in the PR.
- [ ] `npm test` green locally and in CI; new behaviour has a test where testable (`server/`, pure `public/js` functions).
- [ ] Checked at 375 px and desktop; screenshots in the PR for anything visual.
- [ ] Observations stay raw SI; conversion only at the display layer, reading `_units`.
- [ ] Preview URL in the PR if visible (`scripts/manage-previews.sh` → `<name>.basinwx.dev`).
- [ ] Copilot review threads resolved; no new console errors.
- [ ] Nothing "coming soon" reaches `ops` without the dev-only gate.
- [ ] Closing comment on the issue: what changed, what is left, anything surprising.

Tick if you want Derek's by-eye review:
- [ ] add the label `needs-ux-review` (the `ux-review` workflow then requests @dmeanea123)
