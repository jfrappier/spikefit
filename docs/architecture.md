# SpikeFit Architecture

## System Overview

```
Browser (user device)
  ├── index.html          Landing page — pure HTML/CSS, no JavaScript
  ├── auth.html           OTP login flow — js/auth.js
  └── app.html            Main application — js/app.js
        │
        │  All user data stays here (localStorage).
        │  Nothing workout-related ever leaves the device.
        │
        ↕  (optional — only if the Cloudflare Worker is deployed)
  Cloudflare Worker        ← auth gate; deployed at spikefit.app
        │
        │  fetches static files from ORIGIN = https://spikefit.app
        ↓
  GitHub Pages             ← actual static file host (CNAME → spikefit.app)
    ├── Routes: GET /  /app.html  /auth.html  /auth/send  /auth/verify  /auth/logout  /consent/accept  /consent/send  /consent/confirm
    ├── KV: SESSIONS · OTPS · RATELIMIT · ALLOWLIST · CONSENTS
    └── Secret: RESEND_API_KEY → Resend API → user's email
```

The Worker is a hosting-only access gate. It controls who can reach the hosted instance at spikefit.app. It never touches user workout data. Forks running locally have no need for it.

**Static file hosting:** The repo is deployed via GitHub Pages. `CNAME` maps `spikefit.app` to the Pages deployment. GitHub Pages runs Jekyll by default; files and directories whose names start with `.` are ignored unless explicitly listed in `_config.yml`'s `include` array.

---

## Page Responsibilities

| File | JavaScript | Purpose |
|---|---|---|
| `index.html` | `js/team.js` (non-deferred early loader) | Marketing landing page. `team.js` inserts the team theme `<link>` before first paint if a team is resolved. |
| `app.html` | `js/team.js` (non-deferred) + `js/workouts.js`, `js/app.js`, `js/combine.js`, `js/storage.js` (all defer) | Main application shell. `workouts.js` defines the workout database; `js/app.js` handles all logic, rendering, and state; `js/combine.js` handles the Combine baseline testing feature; `js/storage.js` handles BYOS export/import and storage preference. |
| `auth.html` | `js/team.js` (non-deferred early loader) + `js/auth.js` (defer) | Two-step OTP flow. Only needed when the Worker is deployed. |
| `tos.html` | none | Terms of service. Static HTML. |

---

## JavaScript Architecture

### Why global scope instead of ES modules

ES module `import`/`export` does not work when an HTML file is opened directly from disk via `file://` protocol — the browser refuses cross-origin module loads. SpikeFit must work as a plain file-open, so all JS uses global scope and is loaded via `<script defer>`.

The app is being split into multiple files by responsibility. Each file declares its contents in global scope with no `import` or `export`. Load order (script tag order in the HTML) is the dependency graph.

Current file breakdown:

- `js/team.js` — team resolver, TEAMS registry, and early theme loader; non-deferred, runs before first paint
- `js/workouts.js` — the workout database (`workouts` object, `schedule` array); loaded first (deferred)
- `js/app.js` — all remaining app logic, event handling, rendering, state management
- `js/combine.js` — Combine baseline testing feature; loaded after `js/app.js`, relies on its globals
- `js/storage.js` — BYOS export/import, storage preference, and backup nudge; loaded after `js/combine.js`

### Contents of `js/workouts.js`

- `workouts` object — 12 workout definitions (A/B/C/D × Beginner/Intermediate/Advanced)
- `schedule` array — 7-day rotating weekly schedule: A, D, B, D, C, A, Rest

Custom workout sets for coaches/teams follow the same shape and variable names. The Cloudflare Worker can serve a different `workouts-*.js` file at the `/js/workouts.js` URL based on the user's email mapping in the ALLOWLIST KV.

### Logical sections of `js/app.js` (in source order)

1. `safeParseJSON(key, fallback)` — safe localStorage read helper
2. `FRESH_SYSTEM` object — F.R.E.S.H. auto-regulator engine (ACWR)
3. Module-level state variables — `completedExercises`, `completedDates`, `workoutLevel`, `activeWorkoutStart`, `historyCalDate`, `currentDayIndex`
4. Core helpers — `getWorkoutKey()`, `getTodayDateStr()`, `getExerciseKey()`, `saveState()`
5. Auto-leveling — `metConsistentPace()`, `checkAndAutoLevel()`
6. Workout lifecycle — `startWorkout()`, `toggleExercise()`, `markWorkoutComplete()`, `resetDay()`
7. Tab navigation — `showTab()`
8. Schedule management — `setWorkoutDay()`, `renderSchedule()`
9. History calendar — `renderHistoryCalendar()`, `changeMonth()`, `checkStreak()`
10. Badge generation — `generateShareImage()`, `shareBadge()`, `shareTodaysBadge()` (Canvas API)
11. Render functions — `renderDaily()` (rebuilds full workout HTML from state on every change)
12. Modal helpers — disclaimer, privacy, readiness check-in, RPE survey, FRESH dashboard
13. Event listeners — all delegation-based, set up at page load
14. Init sequence + splash screen

---

## Team Resolver and Theming

### Overview

`js/team.js` resolves which team (if any) is active for the current page load and injects the team's CSS theme before first paint. It is a non-deferred synchronous `<script>` placed immediately after `<link rel="stylesheet" href="css/base.css">` in every HTML page.

### Resolution priority (first match wins)

1. **Hostname** — left-most subdomain label if hostname ends with `.spikefit.app`. E.g. `tigers.spikefit.app` → `tigers`. Suffix check prevents `tigers.spikefit.app.evil.com` from matching. Unknown labels (e.g. `www`) or the apex domain (`spikefit.app`) produce no match.
2. **`?team=` seed link** — coach-shared URL like `spikefit.app/?team=tigers`. Loader validates against `TEAMS`, persists to `spikefit_team` in localStorage (try/catch, console-only on failure — `showToast` is not available this early), then strips the param via `history.replaceState`.
3. **`localStorage['spikefit_team']`** — persisted from a previous seed link or a future settings picker.
4. **Default** — no match, standard SpikeFit colors. `file://` forks always land here.

Every candidate is validated against the `TEAMS` registry — no arbitrary path construction from user-controlled input.

### Theme file contract

- Theme files live in `css/themes/<slug>.css`.
- A theme file may only re-declare existing `:root` tokens from `css/base.css`. It must never introduce new custom properties.
- `css/base.css` remains the sole owner of the canonical token list.
- Loaded after `base.css` via a dynamically appended `<link>` — cascade wins. No inline styles; compatible with the `unsafe-inline` cleanup path.

### Adding a team

One PR: `css/themes/<slug>.css` + one `TEAMS` entry in `js/team.js` + one `STATIC_FILES` entry in `cloudflare/worker.js`. DNS is already wildcarded (`*.spikefit.app`). No per-team Worker logic required.

### Hosting / DNS wiring (one-time setup)

- **DNS:** one wildcard record `*.spikefit.app` (proxied via Cloudflare) — not one record per team.
- **Worker route:** add wildcard route `*.spikefit.app/*` in `wrangler.toml`.
- **Worker code:** no logic change. Redirects already use `url.origin`, which preserves the subdomain, so OTP auth flows correctly on each subdomain with host-only cookies.
- **Session cookies remain host-only** — `Domain=.spikefit.app` is deliberately NOT set (see ADR-007).

---

## CSS Architecture

`css/base.css` is the sole owner of all design tokens (CSS custom properties on `:root`). Every other CSS file reads variables from there and declares none of its own.

**Custom properties defined in `base.css`:**

```
--bg-body       --bg-panel      --text-main     --text-muted
--accent        --accent-hover  --accent-light  --border
--radius-sm     --radius-md     --radius-lg
--shadow-sm     --shadow-md     --shadow-hover  --shadow-lg
```

Component files in `css/components/` are scoped to one UI concern each: `buttons.css`, `calendar.css`, `cards.css`, `forms.css`, `modals.css`, `nav.css`, `splash.css`. Adding a new component means adding a new file and linking it with `<link>` in every HTML page that uses it.

---

## State Management

State exists in three layers:

| Layer | What it holds | Written by | Read by |
|---|---|---|---|
| Module-level JS variables | In-memory working copy | State mutations throughout app.js | All render functions |
| localStorage | Persistent workout data | `saveState()`, `FRESH_SYSTEM.saveLog()`, `saveCombineResult()` | `safeParseJSON()` on page load |
| sessionStorage | Per-session flags | `checkStreak()`, `checkCombineBaseline()` | `checkStreak()`, `checkCombineBaseline()` |

The rendering model: there is no incremental diffing. Every state change rebuilds the affected UI from scratch via `renderDaily()`, `renderSchedule()`, or `renderHistoryCalendar()`. This is fast because the card counts are small.

### localStorage Key Registry

| Key | Type | Default | Description |
|---|---|---|---|
| `completedExercises` | `{ [YYYY-MM-DD_exerciseId]: boolean }` | `{}` | Per-day exercise completion. Key is date-scoped via `getExerciseKey()`. |
| `completedDates` | `{ [YYYY-MM-DD]: { completed, startTime, endTime, level } }` | `{}` | One entry per completed workout day. `level` field added in v0.0.625. |
| `workoutLevel` | `'beginner' \| 'intermediate' \| 'advanced'` | `'beginner'` | Current tier. Read directly, not via `safeParseJSON`. |
| `activeWorkoutStart` | ISO timestamp string | `null` | Set when workout starts; cleared on complete or reset. |
| `spikefit_fresh_logs` | `Array<{ timestamp, session: { load, rpe, duration, readinessModifier } }>` | `[]` | ACWR training load log. Pruned to 28 days on every write. |
| `disclaimerAgreed` | version string (e.g. `'0.0.723'`) | absent | Set to `DISCLAIMER_VERSION` when the user accepts the disclaimer. Compared against the current `DISCLAIMER_VERSION` on load — a mismatch (including the old pre-versioning value `'true'`) re-shows the modal. |
| `guardianConsentEmail` | email string | absent | Set when a self-declared minor submits a parent/guardian email in the disclaimer modal. Local record only; the authoritative, verified record (once the guardian confirms) lives server-side in the hosted instance's `ALLOWLIST` KV — see Cloudflare Worker Architecture. |
| `combineResults` | `Array<{ date, timestamp, metrics: { standingReach, jumpTouch, vertical, plankSec, wallSitSec, toeTaps, jumpingJacks, agilitySec } }>` | `[]` | All Combine attempt records. Not pruned — growth history is the point. Any metric may be absent. |
| `combineSkipped` | `'true'` | absent | Set when user clicks "Don't ask again" on the Combine onboarding modal. Permanently suppresses the prompt. |
| `storagePreference` | `'local' \| 'drive'` | `'local'` | Where the user chose to keep data. Set in the first-run wizard. Drives backup nudges and Settings copy. |
| `lastBackupAt` | ISO timestamp string | absent | Set on each successful export. Powers "Last backed up …" in the Storage Settings modal and throttles the post-workout backup nudge (~once per 20 hours). |
| `spikefit_team` | team slug string | absent | Team identity for theming (later: workout packs). Set by a `?team=` seed link or future settings picker. Hostname resolver takes priority when present. Never transmitted to any server; included in BYOS export. |

sessionStorage:

| Key | Type | Description |
|---|---|---|
| `welcomeToastShown` | `'true'` | Gate to show the streak toast once per browser session. |
| `combinePromptShown` | `'true'` | Gate to show the Combine baseline onboarding modal once per browser session (until an attempt is logged). |

`saveState()` and `safeParseJSON()` are the intended abstraction boundary for swapping the storage backend.

---

## BYOS — Bring-Your-Own-Storage (Manual Export / Import)

SpikeFit ships a first-class backup/restore feature that lets users keep their data across devices without breaking the privacy model. The design: SpikeFit builds a JSON file in memory and hands it to the OS share sheet; the user's own installed app (e.g. Google Drive) does the cross-device movement. SpikeFit never makes a network call to any storage provider.

### Export data format

```json
{
  "app": "SpikeFit",
  "schemaVersion": 1,
  "exportedAt": "2026-07-05T12:00:00.000Z",
  "data": {
    "completedExercises": {},
    "completedDates": {},
    "spikefit_fresh_logs": [],
    "workoutLevel": "beginner",
    "activeWorkoutStart": null,
    "disclaimerAgreed": "0.0.723",
    "guardianConsentEmail": null,
    "combineResults": [],
    "combineSkipped": null,
    "storagePreference": "drive",
    "spikefit_team": "tigers"
  }
}
```

Filename: `spikefit-backup-YYYY-MM-DD.json`. On import, `activeWorkoutStart` is always cleared (a restored device must never think a stale workout is mid-progress). Import is replace-all, not a merge.

### Platform behaviour

| Environment | Backup | Restore |
|---|---|---|
| iOS / Android (browser) | Share sheet → tap Google Drive / Save to Files | File picker → open from Google Drive / Files |
| Desktop (Chrome/Edge/FF/Safari) | Download to disk (into Drive-for-desktop folder if present) | File picker → choose file |
| Raw `file://` fork | Download to disk | File picker → choose file |

SpikeFit makes no network requests; the OS and the user's apps do all cross-device movement.

---

## Event Handling Pattern

The app uses event delegation almost exclusively. Rather than attaching a listener to each exercise card, a single listener on `#workout-content` uses `e.target.closest('.exercise-card')`. Same for schedule day clicks on `#schedule-content`. Exercise cards carry `data-id`; schedule days carry `data-index`.

Direct `getElementById` listeners are used only for controls that are unique and always present (tab buttons, modal close buttons, level toggle).

---

## Workout Database Structure

Workouts are defined in the `workouts` object. The naming convention:

| Suffix | Level |
|---|---|
| bare letter (`'A'`) | Beginner |
| letter + `'2'` (`'A2'`) | Intermediate |
| letter + `'3'` (`'A3'`) | Advanced |

`getWorkoutKey(baseKey)` converts the day's base letter (`'A'`, `'B'`, `'C'`, `'D'`) to the level-appropriate key using `workoutLevel`. Never hardcode level-suffixed keys directly.

The weekly schedule (the `schedule` array): **A, D, B, D, C, A, Rest** (Monday through Sunday).

Exercises marked with `impact: 'high'` carry an `alt` object. When `FRESH_SYSTEM.needsRegulation()` returns true, `renderDaily()` swaps the high-impact exercise for its `alt` automatically.

---

## F.R.E.S.H. System Data Flow

1. User taps **Start Workout** → readiness check-in modal opens
2. User rates joint freshness (1–10) → stored in `FRESH_SYSTEM.sessionState.jointFreshness`
3. User completes all exercises → RPE modal opens
4. User submits RPE (1–10) → session load computed:
   - `readinessModifier = 1 + (5 - jointFreshness) / 20`
   - `sessionLoad = RPE × durationMinutes × readinessModifier`
5. `FRESH_SYSTEM.saveLog(entry)` appends to `spikefit_fresh_logs`, prunes entries older than 28 days, writes back to localStorage
6. On F.R.E.S.H. dashboard open: `calculateACWR()` is called, computing acute load (last 7 days) vs chronic load (28-day weekly average)
7. `needsRegulation()` is called on every `renderDaily()` — if status is `danger` or joint freshness < 5, high-impact exercises are swapped for their `alt`

**ACWR status thresholds:**

| ACWR | Status | Notes |
|---|---|---|
| < 14 distinct logged workout days | `baseline` | Ratio suppressed regardless of elapsed calendar time; sparse data isn't a meaningful signal even if the oldest log is weeks old |
| < 1.3 | `optimal` | Normal training range |
| 1.3–1.5 | `caution` | Elevated load, monitor |
| ≥ 1.5 | `danger` | High-impact exercises regulated |

There is no separate low-session-count guardrail on the `danger` threshold — the baseline gate above already guarantees at least 14 logged sessions by the time this branch can run.

---

## Auto-Leveling Rules

Promotion from Beginner → Intermediate or Intermediate → Advanced requires:

- **16 workouts** logged at the current level
- The oldest of those 16 falls within a **35-day rolling window** (≈3.2 workouts/week)

Advanced is the ceiling. Auto-leveling always fires when conditions are met — there is no opt-out flag.

Pre-v0.0.625 `completedDates` entries lack a `level` field and do not count toward the 16-workout pace requirement.

---

## Cloudflare Worker Architecture

**Purpose:** Hosting-only access gate. Limits who can access the spikefit.app hosted instance. Not a security requirement — it performs no app logic and never handles user workout data.

**Routing logic:**

1. `/auth/send`, `/auth/verify`, `/auth/logout` — always pass through (no session check)
2. `/consent/accept`, `/consent/send`, `/consent/confirm` — always pass through (no session check on `/consent/confirm`, since the guardian clicking the emailed link has no SpikeFit session of their own)
3. Assets in `STATIC_FILES` set — pass through with security headers
4. `/`, `/index.html`, `/auth.html` — serve the page, but redirect authenticated users to `/app.html`
5. Everything else — requires a valid `sf_session` cookie; redirects to `/auth.html?redirect=<path>` if absent

**KV namespaces:**

| Namespace | Contents | TTL |
|---|---|---|
| `SESSIONS` | `token → email` | 30 days |
| `OTPS` | `email → { code, email }` | 10 minutes |
| `RATELIMIT` | `send:<ip>` and `verify:<ip>:<email>` counters | 10 minutes |
| `ALLOWLIST` | `email → { allowed, tosAcceptedAt?, tosVersion?, guardianEmail?, guardianAcceptedAt?, minor? }` (legacy admin-set entries may still be a bare non-JSON-object string like `'true'` or `'1'` — `readAllowlistRecord()` treats anything that doesn't parse to an object as `{ allowed: true }`) | permanent |
| `CONSENTS` | `token → { email, guardianEmail, tosVersion, requestedAt }` | 7 days |

**ToS/consent tracking (`cloudflare/worker.js`, "ToS/consent tracking" section):** `ALLOWLIST` already gates hosted access by email, so its value was extended from a bare `'true'` to a JSON record to keep a durable, server-side log of ToS acceptance — separate from the client-side `disclaimerAgreed` localStorage flag, which a user can clear at will.

- `POST /consent/accept` — called by `js/app.js`'s `acceptDisclaimer()` for adult (non-minor) acceptances. Requires an existing session; records `{ tosAcceptedAt, tosVersion }` into the caller's `ALLOWLIST` entry.
- `POST /consent/send` — called by `js/app.js`'s `sendGuardianConsent()` when a self-declared minor submits a guardian email. Requires an existing session; stores a random token in `CONSENTS` and emails the guardian a confirmation link via Resend (see `sendConsentEmail()`).
- `GET /consent/confirm?token=...` — the link the guardian clicks. No session required (the guardian isn't logged into SpikeFit). Looks up the token in `CONSENTS`, and on success records `{ guardianEmail, tosVersion, guardianAcceptedAt, minor: true }` into the athlete's `ALLOWLIST` entry, then deletes the token. Returns a small self-contained HTML confirmation page.

This mechanism only exists for the hosted instance. A locally-run fork has no server to email a guardian through, so `sendGuardianConsent()` falls back to a client-side-only attestation (the fetch fails, is caught, and the UI tells the user to review the terms with their guardian directly) — there is no verification in that path, same as the disclaimer modal itself.

**Rate limits:** 3 OTP sends per IP per 10 min (`send:<ip>`); 5 OTP verify attempts per IP+email per 10 min (`verify:<ip>:<email>`).

**Why `timingSafeEqual()`:** Standard `===` string comparison exits at the first mismatched character. Measuring response time reveals how many leading characters matched — a timing side-channel that leaks information about the correct OTP. Constant-time comparison eliminates this signal.

**Cookie:** `sf_session` — HttpOnly, Secure, SameSite=Strict, 30-day expiry.

**Security headers applied to all responses:**
```
Content-Security-Policy: default-src 'self'; script-src 'self' 'unsafe-inline';
                         style-src 'self' 'unsafe-inline';
                         img-src 'self' data: raw.githubusercontent.com
X-Content-Type-Options: nosniff
X-Frame-Options: DENY
Referrer-Policy: strict-origin-when-cross-origin
```

`'unsafe-inline'` is present because some styles are applied inline in components. Removing it requires an audit of all inline style usage.

**Origin:** `ORIGIN = 'https://spikefit.app'` in `worker.js` points to GitHub Pages. When the Worker serves a `STATIC_FILES` path, it fetches the file from GitHub Pages and passes it through. Adding a new public static file requires adding its path to `STATIC_FILES`; if the file is in a dotfile directory, also add that directory to `_config.yml`'s `include` list.

**Gap: wrangler.toml is not in the repo.** Anyone deploying the Worker must create `cloudflare/wrangler.toml` manually. Required bindings:

- KV namespace bindings for `SESSIONS`, `OTPS`, `RATELIMIT`, `ALLOWLIST`, `CONSENTS`
- Secret binding for `RESEND_API_KEY`
- `main = "worker.js"`, `compatibility_date`, and `name` fields

---

## Bring-Your-Own-Storage (BYOS) — Planned Feature

Goal: allow cross-device sync without the app ever controlling the storage backend.

The user provides their own storage (a self-hosted endpoint, Dropbox, Google Drive, etc.). The app never routes user workout data through any app-controlled server.

The `saveState()` and `safeParseJSON()` functions in `app.js`, and `FRESH_SYSTEM.saveLog()` / `FRESH_SYSTEM.getLogs()`, are the intended abstraction boundary. The interface a BYOS backend will need to support:

- `read(key)` → value string or null
- `write(key, value)` → void
- `listKeys(prefix)` → string[] (needed for bulk export/import)

Design is TBD. All existing behavior must continue to work with localStorage as the default when no BYOS backend is configured.

---

## Known Quirks

**Canvas taint over `file://`:** When the app runs from a local file, loading `badge_char.png` as a cross-origin image taints the canvas, blocking `toDataURL()`. The fix: `img.crossOrigin = 'anonymous'` is set before the `src` is assigned. Do not remove this line — it is not dead code when the app runs over HTTP.

**GitHub raw fallback for badge art:** `badge_char.png` has a fallback URL pointing to `raw.githubusercontent.com`. This is intentional for `file://` scenarios and is disclosed in the Privacy modal. The fallback carries no user data.

**Font race on badge generation:** `document.fonts.load()` is raced against a 2-second timeout before canvas text is drawn. If the font loses the race, the badge falls back to the system font silently. This is expected behavior, not a bug.
