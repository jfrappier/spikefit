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

- `js/workouts.js` — the `workouts` object and `schedule` array (static workout data)
- `js/app.js` — all remaining logic

When adding a new JS file: add it as `<script defer src="js/yourfile.js">` in the relevant HTML files, before any file that depends on its globals.

---

## File Map

| File | Purpose |
|---|---|
| `index.html` | Marketing landing page. No JavaScript. |
| `app.html` + `js/workouts.js` + `js/app.js` | Main app shell. `workouts.js` defines the workout database; `app.js` handles all logic, rendering, and state. |
| `auth.html` + `js/auth.js` | OTP auth flow. Only used when the Worker is deployed. |
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

sessionStorage:

| Key | Type | Description |
|---|---|---|
| `welcomeToastShown` | `'true'` | Shows the streak toast once per browser session. |

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

**Codacy** runs automatically on GitHub push. To fetch what it flagged for a file (Docker CLI doesn't work on macOS — use the API):
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
2. If the file lives in a dotfile directory, add that directory to `_config.yml`'s `include` list so Jekyll publishes it.

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
