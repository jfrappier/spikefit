# SpikeFit — Claude Context

SpikeFit is a mobile-responsive volleyball training app. It has zero runtime dependencies — everything ships as plain HTML, CSS, and JavaScript that opens directly in a browser. Privacy is non-negotiable: user workout data is always in the user's control and must never be transmitted to any server the app controls. The optional Cloudflare Worker in `cloudflare/` is a hosting-only access gate; forks running locally need none of it.

---

## Hard Constraints — Read Before Touching Code

- **No npm packages or CDN imports in production paths.** Dev tooling (Playwright, QUnit as a vendored file) is exempt.
- **No ES module syntax (`import`/`export`) in any browser-shipped JS file.** ES modules fail over `file://` protocol. JS files use global scope and are loaded via `<script defer>` in the HTML. Load order is the dependency graph.
- **localStorage reads must use `safeParseJSON(key, fallback)`.** Never call `JSON.parse(localStorage.getItem(key))` directly — a corrupted value crashes the whole script on load.
- **localStorage writes must be wrapped in try/catch.** On failure, log to console and call `showToast()` to inform the user. See `saveState()` for the canonical pattern.
- **No `target="_blank"` without `rel="noopener noreferrer"`.** No exceptions.
- **No inline event handlers in HTML** (`onclick=`, `onerror=`, etc.). Use `addEventListener` in JS.
- **Workout key always derived via `getWorkoutKey(baseKey)`.** Never hardcode level-suffixed keys like `'A2'` or `'A3'` directly.
- **User workout data must never leave the device.** No fetch/XHR that transmits `completedDates`, `spikefit_fresh_logs`, `workoutLevel`, or any other user-generated data to any server. The Cloudflare Worker must never handle workout data. Any future BYOS (bring-your-own-storage) feature is user-configured — the app never provides or controls the storage backend.

---

## JS File Conventions

JS is being split into multiple files by responsibility. Each file uses global scope — no `import`, no `export`. Load order (script tag order in HTML) replaces the module system.

Current split:

- `js/team.js` — team resolver, TEAMS registry, and early theme loader (non-deferred; runs before first paint in all HTML pages)
- `js/workouts.js` — the `workouts` object and `schedule` array (static workout data)
- `js/app.js` — all remaining logic
- `js/combine.js` — Combine baseline testing feature (loaded after `js/app.js`; uses its globals)

When adding a new JS file: add it as `<script defer src="js/yourfile.js">` in the relevant HTML files, before any file that depends on its globals. Exception: early loaders that must run before first paint use `<script src="...">` (no defer) placed immediately after `<link rel="stylesheet" href="css/base.css">`.

When a function in one JS file is called from another (a cross-file global), add its name to the `appGlobals` object in **both** `eslint.config.mjs` (root) and `.codacy/tools-configs/eslint.config.mjs`. Omitting it causes `no-undef` errors in the consuming file when running `codacy-cli analyze --tool eslint`.

---

## File Map

| File | Purpose |
|---|---|
| `index.html` + `js/team.js` | Marketing landing page. `team.js` is an early non-deferred loader that applies the team theme before first paint. (Zero-JS constraint deliberately relaxed per ADR-011.) |
| `app.html` + `js/team.js` + `js/workouts.js` + `js/app.js` + `js/combine.js` + `js/storage.js` | Main app shell. `team.js` is the early theme loader; `workouts.js` defines the workout database; `app.js` handles all logic, rendering, and state; `combine.js` handles the Combine baseline testing feature; `storage.js` handles BYOS export/import and storage preference. |
| `auth.html` + `js/team.js` + `js/auth.js` | OTP auth flow. `team.js` is the early theme loader; `auth.js` handles the OTP flow. Only used when the Worker is deployed. |
| `js/team.js` | Team resolver, TEAMS registry, and early theme loader. Non-deferred; runs before first paint. |
| `css/themes/tigers.css` | Tigers team color override. Re-declares `:root` tokens from `base.css` only. |
| `css/components/combine.css` | Combine-specific styles (summary card, test cards, timers, delta coloring). |
| `css/components/storage.css` | Storage & Backup UI styles (gear icon, storage-choice wizard, settings modal, backup nudge, restore confirm). |
| `cloudflare/worker.js` | Optional hosting gate — routing, OTP, sessions. Never touches workout data. |
| `_config.yml` | Jekyll config. Only purpose: `include` list for dotfile directories that Jekyll would otherwise ignore (e.g. `.well-known/`). |
| `css/base.css` | All CSS custom properties (design tokens). The only file that defines `:root` variables. |
| `css/layout.css` | Page structure and grid layouts. |
| `css/components/*.css` | One file per UI component. |
| `tests/unit/run.html` | QUnit unit tests — open in browser, no install. |
| `tests/e2e/` | Playwright Python E2E tests. |
| `docs/architecture.md` | Full architecture reference including localStorage key registry. |
| `docs/decisions.md` | Architectural decision records (ADRs). |
| `guardrails/coding-rules.md` | Coding standards. |
| `guardrails/review-checklist.md` | PR review checklist. |

---

## localStorage Key Registry

| Key | Type | Default | Description |
|---|---|---|---|
| `completedExercises` | `{ [YYYY-MM-DD_exerciseId]: boolean }` | `{}` | Per-day exercise completion. Key is date-scoped via `getExerciseKey()`. |
| `completedDates` | `{ [YYYY-MM-DD]: { completed, startTime, endTime, level } }` | `{}` | One entry per completed workout day. `level` was added in v0.0.625. |
| `workoutLevel` | `'beginner' \| 'intermediate' \| 'advanced'` | `'beginner'` | Current tier. |
| `activeWorkoutStart` | ISO timestamp string | `null` | Set when workout starts; cleared on complete or reset. |
| `spikefit_fresh_logs` | `Array<{ timestamp, session: { load, rpe, duration, readinessModifier } }>` | `[]` | ACWR training load log. Pruned to 28 days on every write. |
| `disclaimerAgreed` | `'true'` | absent | Set once when user accepts the disclaimer modal. |
| `combineResults` | `Array<{ date, timestamp, metrics: { standingReach, jumpTouch, vertical, plankSec, wallSitSec, toeTaps, jumpingJacks, agilitySec } }>` | `[]` | All Combine attempt records (never pruned). Any metric may be absent. |
| `combineSkipped` | `'true'` | absent | Set when user clicks "Don't ask again" on the Combine onboarding modal. Permanently suppresses the modal. |
| `storagePreference` | `'local' \| 'drive'` | `'local'` | Where the user chose to keep data. Set in the first-run wizard. Drives backup nudges and Settings copy. |
| `lastBackupAt` | ISO timestamp string | absent | Set on each successful export. Powers "Last backed up …" in Settings and throttles the post-workout nudge (~once per 20 hours). |
| `spikefit_team` | team slug string | absent | Team identity for theming (later: workout packs). Set by `?team=` seed link or future settings picker. Hostname resolver takes priority. Never transmitted; included in BYOS export. |

sessionStorage:

| Key | Type | Description |
|---|---|---|
| `welcomeToastShown` | `'true'` | Shows the streak toast once per browser session. |
| `combinePromptShown` | `'true'` | Shows the Combine onboarding modal once per browser session (until first attempt is logged). |

Every new localStorage key must be added to this table and to the canonical registry in `docs/architecture.md`.

---

## Workout Database Structure

The `workouts` object has 12 entries. Naming convention:

| Key suffix | Level |
|---|---|
| bare letter: `'A'`, `'B'`, `'C'`, `'D'` | Beginner |
| letter + `'2'`: `'A2'`, `'B2'`, `'C2'`, `'D2'` | Intermediate |
| letter + `'3'`: `'A3'`, `'B3'`, `'C3'`, `'D3'` | Advanced |

`getWorkoutKey(baseKey)` converts the base letter to the level-appropriate key. Use it; never hardcode the suffix.

Weekly schedule (the `schedule` array, Monday → Sunday): **A · D · B · D · C · A · Rest**

Exercises with `impact: 'high'` carry an `alt` object. When `FRESH_SYSTEM.needsRegulation()` is true, `renderDaily()` swaps these automatically.

---

## F.R.E.S.H. System

`FRESH_SYSTEM` is a module-level object in `app.js` implementing the Acute:Chronic Workload Ratio.

- **Session load** = `RPE × durationMinutes × readinessModifier`
- **Readiness modifier** = `1 + (5 - jointFreshness) / 20` (higher fatigue = more costly workout)
- **Acute load** = sum of session loads in the last 7 days
- **Chronic load** = weekly average over the active data window (1–4 weeks, proportional)
- **14-day baseline gate**: ratio is suppressed until 14 days of data exist — before that, the acute and chronic windows substantially overlap and the ratio is not meaningful
- **28-day prune**: old log entries are pruned on every write, not on read
- **Regulation**: `needsRegulation()` returns true when ACWR status is `'danger'` OR joint freshness < 5. High-impact exercises are swapped for their `alt` in `renderDaily()`.

---

## Auto-Leveling Rules

Promotion requires **16 workouts logged at the current level** where the oldest of those 16 falls within the last **35 days** (≈3.2 workouts/week minimum pace). Advanced is the ceiling. The 35-day window (`CONSISTENCY_WINDOW_DAYS`) and the count (16) are constants in `app.js` — any change requires updating `docs/decisions.md` ADR-006 and the README science section.

Pre-v0.0.625 `completedDates` entries lack a `level` field and do not count.

---

## Known Quirks

- **Canvas + `file://` protocol**: `img.crossOrigin = 'anonymous'` is set before `img.src` is assigned in `generateShareImage()`. This is required for `toDataURL()` to work when loading assets over HTTP. Do not remove it.
- **GitHub raw fallback for badge art**: Intentional for `file://` scenarios. Disclosed in the Privacy modal. Do not remove the fallback URL.
- **`'unsafe-inline'` in CSP**: A known gap in the Worker's Content-Security-Policy. Removing it requires auditing all inline styles in the component files first.
- **Badge text wrapping**: Long workout names (intermediate/advanced) can overflow the badge canvas. Acknowledged in changelog; not yet fixed.

---

## Code Quality Tools

**Codacy** and **SonarCloud** run automatically on every GitHub push and PR. Config files: `.codacy.yml` and `sonar-project.properties`.

**Codacy CLI** is installed locally and should be run before reporting any task complete. Run it and flag findings in the chat session so any issues can be reviewed and fixed before pushing:
```bash
codacy-cli analyze --tool eslint
```

To fetch what Codacy flagged post-push via the API:
```bash
source ~/.zshrc
FILE_ID=$(curl -s -H "api-token: $CODACY_API_TOKEN" \
  "https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files?limit=100" \
  | python3 -c "import sys,json; files=json.load(sys.stdin)['data']; print(next(f['fileId'] for f in files if f['path']=='js/app.js'))")
curl -s -H "api-token: $CODACY_API_TOKEN" \
  "https://app.codacy.com/api/v3/organizations/gh/jfrappier/repositories/spikefit/files/$FILE_ID/issues" \
  | python3 -m json.tool
```

**SonarCloud** uses Automatic Analysis (GitHub-triggered only — CLI scanner does not work alongside it). To fetch what it flagged, query the API with `$SONAR_TOKEN`:
```bash
# All open issues
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=jfrappier_volleyfit&statuses=OPEN" \
  | python3 -m json.tool

# Issues on a specific PR (replace 42 with PR number)
curl -s -u "$SONAR_TOKEN:" \
  "https://sonarcloud.io/api/issues/search?projectKeys=jfrappier_volleyfit&pullRequest=42&statuses=OPEN" \
  | python3 -m json.tool
```

See `docs/quality.md` for full details including known false positives.

---

## Hosting Architecture

**Static files → GitHub Pages.** The `CNAME` file maps `spikefit.app` to this repo's GitHub Pages deployment. All HTML, CSS, JS, images, and fonts are served from there.

**Auth gate → Cloudflare Worker.** `cloudflare/worker.js` is deployed as a Cloudflare Worker in front of GitHub Pages. `ORIGIN = 'https://spikefit.app'` in the Worker points back to GitHub Pages. The Worker fetches static files from GitHub Pages and passes them through with security headers; everything else is auth-gated.

**Jekyll is active.** GitHub Pages uses Jekyll by default (no `.nojekyll` file in this repo). Jekyll silently ignores any file or directory whose name starts with `.`. Use `_config.yml` to opt directories in:

```yaml
include:
  - .well-known
```

**Adding a new static file:**

1. Add its path to `STATIC_FILES` in `cloudflare/worker.js` so the Worker serves it without an auth check. 

1. If the file lives in a dotfile directory, add that directory to `_config.yml`'s `include` list so Jekyll publishes it.

---

## How to Run

Open `index.html` in any modern browser. No server, no build step, no installation required.

Auth (if deploying with the Cloudflare Worker): requires a Cloudflare account, `wrangler.toml` with KV bindings for `SESSIONS`/`OTPS`/`RATELIMIT`/`ALLOWLIST`, and a `RESEND_API_KEY` secret. See `docs/architecture.md` for binding details.

Tests: see `tests/README.md`.

---

## Testing Protocol

After any code change, run the E2E suite and confirm it passes before reporting the task done:

```bash
pytest tests/e2e/
```

For changes to pure logic functions in `app.js` (ACWR, workout keys, localStorage helpers), also open `tests/unit/run.html` in a browser and confirm all QUnit tests pass.

**Exception:** Changes that are purely static data (e.g. adding exercises to `workouts.js` with no logic change) do not require a test run, but a quick visual check of `app.html` in a browser is expected before reporting done.

---

## Automated Audit Agents

These agents run automatically — do not wait to be asked. Each has a defined trigger; if the trigger condition is met, spawn the agent before reporting the task done.

### QA Agent

**Trigger:** Any change to JS or HTML logic before reporting a task complete (same exceptions as Testing Protocol above).

**What it does:** Runs `pytest tests/e2e/` and reports pass/fail with any failure output. For logic changes to `app.js`, also runs the QUnit suite via `tests/unit/run.html` and confirms all tests pass. Does not fix failures — reports them so the main task can address them.

### Constraint Enforcer

**Trigger:** Any PR that adds or modifies JS or HTML files.

**What it does:** Audits all browser-shipped JS and HTML against the Hard Constraints listed above. Checks for: ES module syntax, bare `JSON.parse(localStorage.getItem())` calls, localStorage writes without try/catch, `target="_blank"` without `rel="noopener noreferrer"`, inline event handlers, hardcoded workout level suffixes, and CDN/npm imports. Reports PASS or VIOLATION with file:line for each constraint.

Also checks: every `<script src="...">` and `<link rel="stylesheet" href="...">` in `app.html` and `auth.html` has a matching entry in `STATIC_FILES` in `cloudflare/worker.js`. A file referenced in HTML but absent from `STATIC_FILES` will be auth-gated by the Worker and break the hosted instance.

### Privacy Boundary Auditor

**Trigger:** Any change to a `fetch()` call, `navigator.*` usage, URL construction, or anything in `cloudflare/worker.js`.

**What it does:** Finds every network transmission in `js/app.js`, `js/auth.js`, `js/combine.js`, `js/storage.js`, and `cloudflare/worker.js`. For each, confirms none of the protected keys (`completedDates`, `spikefit_fresh_logs`, `workoutLevel`, `activeWorkoutStart`, `completedExercises`, `combineResults`, `storagePreference`, `lastBackupAt`) or their values are transmitted. Reports PASS or VIOLATION per call site.

### Test Gap Analyst

**Trigger:** After adding a new named function or feature branch to `app.js`.

**What it does:** Maps the new code against existing QUnit and Playwright coverage. Identifies untested functions or branches introduced by the change and ranks them by risk. Does not write tests — produces a prioritized gap report so tests can be added in a follow-up.

### Documentation Agent

**Trigger:** Before reporting any task complete that changes behavior, adds a feature, fixes a bug, or modifies any file referenced in `docs/`.

**What it does:** Two checks:

1. **Docs currency** — reviews `docs/architecture.md`, `docs/decisions.md`, and `docs/quality.md` against the change. Flags any section that is now stale or missing coverage (e.g. a new localStorage key not added to the key registry, a new ADR-worthy decision not recorded, a new JS file not reflected in the file map).

2. **Changelog entry** — verifies a changelog entry exists in `changelog.md` for this change, or drafts one if missing. Entries must follow the established pattern:
   - Version heading: `## v0.0.MMDD` where MMDD is today's date (e.g. `## v0.0.702` for July 2nd)
   - One-sentence summary paragraph immediately after the heading
   - `---` separator
   - Category subheadings with emoji (e.g. `## 🔒 Security`, `## ⚙️ Code Quality`) matching the nature of the change
   - Named `###` entries per logical change with PR reference if applicable
   - `## Files Changed` list at the end

Reports what needs updating and drafts any missing content — does not silently skip stale docs.
