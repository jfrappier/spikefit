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
  Cloudflare Worker
    ├── Routes: GET /  /app.html  /auth.html  /auth/send  /auth/verify  /auth/logout
    ├── KV: SESSIONS · OTPS · RATELIMIT · ALLOWLIST
    └── Secret: RESEND_API_KEY → Resend API → user's email
```

The Worker is a hosting-only access gate. It controls who can reach the hosted instance at spikefit.app. It never touches user workout data. Forks running locally have no need for it.

---

## Page Responsibilities

| File | JavaScript | Purpose |
|---|---|---|
| `index.html` | none | Marketing landing page. Pure HTML/CSS — no JS at all. |
| `app.html` | `js/app.js` (defer) | Main application shell. All workout, schedule, history, and F.R.E.S.H. UI. |
| `auth.html` | `js/auth.js` (defer) | Two-step OTP flow. Only needed when the Worker is deployed. |
| `tos.html` | none | Terms of service. Static HTML. |

---

## JavaScript Architecture

### Why global scope instead of ES modules

ES module `import`/`export` does not work when an HTML file is opened directly from disk via `file://` protocol — the browser refuses cross-origin module loads. SpikeFit must work as a plain file-open, so all JS uses global scope and is loaded via `<script defer>`.

The app is being split into multiple files by responsibility. Each file declares its contents in global scope with no `import` or `export`. Load order (script tag order in the HTML) is the dependency graph.

Planned file breakdown:
- `js/workouts.js` — the workout database (`workouts` object, `schedule` array) — first planned extraction
- `js/app.js` — all remaining app logic, event handling, rendering, state management

### Logical sections of `js/app.js` (in source order)

1. `safeParseJSON(key, fallback)` — safe localStorage read helper
2. `FRESH_SYSTEM` object — F.R.E.S.H. auto-regulator engine (ACWR)
3. `workouts` object — 12 workout definitions (A/B/C/D × Beginner/Intermediate/Advanced)
4. `schedule` array — 7-day rotating weekly schedule: A, D, B, D, C, A, Rest
5. Module-level state variables — `completedExercises`, `completedDates`, `workoutLevel`, `activeWorkoutStart`, `historyCalDate`, `currentDayIndex`
6. Core helpers — `getWorkoutKey()`, `getTodayDateStr()`, `getExerciseKey()`, `saveState()`
7. Auto-leveling — `metConsistentPace()`, `checkAndAutoLevel()`
8. Workout lifecycle — `startWorkout()`, `toggleExercise()`, `markWorkoutComplete()`, `resetDay()`
9. Tab navigation — `showTab()`
10. Schedule management — `setWorkoutDay()`, `renderSchedule()`
11. History calendar — `renderHistoryCalendar()`, `changeMonth()`, `checkStreak()`
12. Badge generation — `generateShareImage()`, `shareBadge()` (Canvas API)
13. Render functions — `renderDaily()` (rebuilds full workout HTML from state on every change)
14. Modal helpers — disclaimer, privacy, readiness check-in, RPE survey, FRESH dashboard
15. Event listeners — all delegation-based, set up at page load
16. Init sequence + splash screen

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
| localStorage | Persistent workout data | `saveState()`, `FRESH_SYSTEM.saveLog()` | `safeParseJSON()` on page load |
| sessionStorage | `welcomeToastShown` only | `checkStreak()` | `checkStreak()` |

The rendering model: there is no incremental diffing. Every state change rebuilds the affected UI from scratch via `renderDaily()`, `renderSchedule()`, or `renderHistoryCalendar()`. This is fast because the card counts are small.

### localStorage Key Registry

| Key | Type | Default | Description |
|---|---|---|---|
| `completedExercises` | `{ [YYYY-MM-DD_exerciseId]: boolean }` | `{}` | Per-day exercise completion. Key is date-scoped via `getExerciseKey()`. |
| `completedDates` | `{ [YYYY-MM-DD]: { completed, startTime, endTime, level } }` | `{}` | One entry per completed workout day. `level` field added in v0.0.625. |
| `workoutLevel` | `'beginner' \| 'intermediate' \| 'advanced'` | `'beginner'` | Current tier. Read directly, not via `safeParseJSON`. |
| `activeWorkoutStart` | ISO timestamp string | `null` | Set when workout starts; cleared on complete or reset. |
| `spikefit_fresh_logs` | `Array<{ timestamp, session: { load, rpe, duration, readinessModifier } }>` | `[]` | ACWR training load log. Pruned to 28 days on every write. |
| `disclaimerAgreed` | `'true'` | absent | Set once when user accepts the disclaimer. |

sessionStorage:

| Key | Type | Description |
|---|---|---|
| `welcomeToastShown` | `'true'` | Gate to show the streak toast once per browser session. |

`saveState()` and `safeParseJSON()` are the intended abstraction boundary for swapping the storage backend. When BYOS (bring-your-own-storage) is built, these are the two functions to make pluggable.

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
| < 14 days of data | `baseline` | Ratio suppressed; acute and chronic windows overlap too much |
| < 1.3 | `optimal` | Normal training range |
| 1.3–1.5 | `caution` | Elevated load, monitor |
| ≥ 1.5, < 3 sessions logged | `caution` | Cold-start guardrail — not enough history to call danger |
| ≥ 1.5, ≥ 3 sessions | `danger` | High-impact exercises regulated |

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
2. Assets in `STATIC_FILES` set — pass through with security headers
3. `/`, `/index.html`, `/auth.html` — serve the page, but redirect authenticated users to `/app.html`
4. Everything else — requires a valid `sf_session` cookie; redirects to `/auth.html?redirect=<path>` if absent

**KV namespaces:**

| Namespace | Contents | TTL |
|---|---|---|
| `SESSIONS` | `token → email` | 30 days |
| `OTPS` | `email → { code, email }` | 10 minutes |
| `RATELIMIT` | `send:<ip>` and `verify:<ip>:<email>` counters | 10 minutes |
| `ALLOWLIST` | `email → 'true'` | permanent |

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

**Gap: wrangler.toml is not in the repo.** Anyone deploying the Worker must create `cloudflare/wrangler.toml` manually. Required bindings:
- KV namespace bindings for `SESSIONS`, `OTPS`, `RATELIMIT`, `ALLOWLIST`
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
