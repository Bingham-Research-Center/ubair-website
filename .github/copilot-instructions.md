# Copilot coding agent — house rules

- Read `CLAUDE.md` first; it is the authoritative context for this repo (topology, data pipeline, branch rules).
- Only pick up issues labelled `copilot-ok`. Anything else is not yours.
- Branch from `origin/dev`. Open PRs as **drafts** against `dev` only. Never push to `dev`, `ops` or `main`.
- One concern per PR; fill in the PR template, including `Closes #N`.
- `npm test` must stay green, and new behaviour needs a test (`server/`, pure `public/js` functions).
- Observations are raw SI — Celsius, m/s, Pa. Convert only at the display layer, reading `observations._units`.
- Never edit `server/routes/dataUpload.js`, `DATA_MANIFEST.json`, `.env*`, or anything under `scripts/manage-previews.sh`.
- Never read, log or commit secrets; the app loads them from a gitignored `.env`.
- Put file:line evidence in the PR description for every claim about existing behaviour.
- If the issue turns out to need a decision or a second concern, stop and comment on the issue instead of guessing.
