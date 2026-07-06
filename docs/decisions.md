# Architectural Decision Records

Lightweight ADR format: **Status → Context → Decision → Consequences**

---

## ADR-001: Zero Runtime Dependencies

**Status:** Accepted

**Context:** Common web frameworks (React, Vue, Svelte) require a build step, package.json, and ongoing upgrade maintenance. The app needed to be shareable as a file you can just open.

**Decision:** No npm packages, no CDN `<script src>` imports, no build tools in any file that ships to users. CSS is handwritten. JS is vanilla ES6+. Dev tooling (Playwright, vendored QUnit) is exempt from this rule.

**Consequences:** No tree-shaking, no TypeScript, no hot reload. No one accidentally breaks the app by running `npm update`. The entire app loads from a file open or a GitHub Pages URL with zero network round-trips for dependencies.

---

## ADR-002: Privacy-First Storage — User Data Never Leaves the Device

**Status:** Accepted

**Context:** A backend database would require account creation, privacy policy obligations under GDPR/CCPA, and server infrastructure to maintain. The target users are individual volleyball players, likely on mobile. The core principle: user data is always in the user's control.

**Decision:** All workout data (`completedDates`, `completedExercises`, `spikefit_fresh_logs`, `workoutLevel`) lives exclusively in browser localStorage on the user's device. No fetch or XHR call may transmit this data to any server the app controls. The planned BYOS (bring-your-own-storage) feature extends this principle — the user provides and controls the storage backend; the app never does.

**Consequences:** Data is not backed up and does not sync across devices by default. Clearing site data wipes history. Users in strict private-browsing modes see a toast warning on write failure. No GDPR data subject requests to handle because no data leaves the device.

---

## ADR-003: Multi-File Global-Scope JavaScript

**Status:** Accepted

**Context:** ES module `import`/`export` syntax does not work when loading HTML via the `file://` protocol without a local server — the browser blocks cross-origin module loads. The app must work when opened directly from disk. At the same time, `app.js` had grown to ~1,300 lines and needed to be split for maintainability.

**Decision:** All browser-shipped JS files use global scope — no `import`, no `export`. Files are split by responsibility and loaded in order via `<script defer>` in the HTML. Load order is the dependency graph. The workout database has been extracted into `js/workouts.js` (loaded before `js/app.js`) to separate static data from application logic.

**Consequences:** No tree-shaking, no circular dependency detection, no dead code elimination by tooling. Load order bugs (calling a function before its file loads) are possible. This tradeoff is acceptable for the current scale. If a local server ever becomes a requirement, migrating to ES modules is straightforward.

---

## ADR-004: ACWR Calculation Formula and Guardrails

**Status:** Accepted

**Context:** Tim Gabbett's ACWR model divides acute load (7-day) by chronic load (28-day average). Several implementation choices were required for the model to be accurate and not mislead users.

**Decision:**

(a) **Chronic load as a proportional weekly average.** `Math.ceil(daysActive / 7)` would round 8 days up to 2 full weeks, halving the chronic average and doubling the ratio. Instead: `weeksActive = max(1, min(4, daysActive / 7))` — proportional division within a 1–4 week range.

(b) **14-day baseline gate.** Before 14 days of data, the acute (7-day) and chronic (28-day) windows substantially overlap. The ratio is mathematically near-locked to ~1.0 regardless of actual training variation. Showing it would look precise but carry no signal. The app shows "Building Baseline" instead.

(c) **Session load formula:** `RPE × durationMinutes × readinessModifier` where `readinessModifier = 1 + (5 - jointFreshness) / 20`. A fatigued athlete's workout costs more load than the same session done fresh. Duration is capped at 180 minutes before multiplication.

(d) **Cold-start danger guardrail.** ACWR ≥ 1.5 with fewer than 3 sessions logged becomes `'caution'`, not `'danger'`. Too few sessions means the ratio can spike without reflecting a genuine overload pattern.

**Consequences:** Users with fewer than 14 days of data see a baseline indicator rather than a near-1.0 ratio that would look meaningful but isn't. Any change to the formula, thresholds, or guardrails must update this ADR.

---

## ADR-005: Exercise Key Scoped to Calendar Date

**Status:** Accepted (replaces original design)

**Context:** `completedExercises` was originally keyed only by exercise ID (e.g., `'a1'`). Workout A appears on both Monday and Saturday in the weekly schedule. Checking off Monday's A also marked Saturday's A complete. The same collision happened week-over-week on the same weekday.

**Decision:** Keys are scoped to the actual calendar date: `YYYY-MM-DD_exerciseId`. `getExerciseKey(id)` enforces this format. This eliminates both the same-week cross-day collision and the week-over-week collision at once.

**Consequences:** Users who had exercises checked on the day v0.0.625 shipped saw them un-check once — old raw-ID keys don't match the new date-scoped format. One-time impact only; orphaned old keys remain in localStorage but have no effect.

---

## ADR-006: Pace-Based Auto-Leveling

**Status:** Accepted (replaces lifetime-count design)

**Context:** The original design promoted from Beginner after 8 total lifetime workouts and Intermediate after 16, regardless of pace. One workout per week for 16 weeks is a different fitness trajectory than 4 workouts per week for 4 weeks.

**Decision:** Promotion requires **16 workouts at the current level** where the oldest of those 16 falls within the last **35 days** (≈3.2 workouts/week minimum pace). The 35-day threshold is informed by ACSM training-frequency guidance for novice vs. intermediate trainees — it is not a research-validated threshold for this exact number. Auto-leveling always fires when conditions are met; the `manualLevelOverride` flag that could permanently disable it has been removed.

**Consequences:** Pre-v0.0.625 `completedDates` entries lack a `level` field and will not count toward the new pace requirement. Everyone's 16-workout count effectively starts fresh from their next logged workout after the update. Any change to the 35-day window (`CONSISTENCY_WINDOW_DAYS`) or the 16-count must update this ADR and the README science section.

---

## ADR-007: Cloudflare Worker as an Optional Hosting-Only Gate

**Status:** Accepted

**Context:** The app works completely without any backend. However, the hosted instance at spikefit.app should not be open to the general public.

**Decision:** Authentication via Cloudflare Workers is optional and serves only as an access gate for the hosted instance. The app behaves identically without it. The Worker acts as a reverse proxy — unauthenticated requests to protected routes redirect to `/auth.html`. Access is allowlist-based; there is no self-registration. The Worker never handles or stores user workout data.

**Consequences:** Users must be manually added to the ALLOWLIST KV. The Worker requires a Cloudflare account, a `RESEND_API_KEY` secret (Resend API for email), and a `wrangler.toml` file with the four KV namespace bindings. Anyone forking the repo to run locally needs none of this.

---

## ADR-008: Canvas API for Badge Generation

**Status:** Accepted

**Context:** Shareable completion badges motivate continued training. Badges need to be image files that can be shared natively on mobile.

**Decision:** Badges are rendered to an off-screen `<canvas>` element, exported as JPEG blobs, and shared via the Web Share API (files). Clipboard copy and link-based download are fallbacks. The `badge_char.png` character art has a `raw.githubusercontent.com` fallback URL for `file://` scenarios (where local file loads are cross-origin for canvas). `img.crossOrigin = 'anonymous'` is set to prevent canvas tainting over HTTP. Font loading is raced against a 2-second timeout to prevent the badge from hanging if the webfont hasn't loaded.

**Consequences:** Badge generation is timing-dependent — the character art load and font load both race against timeouts. If either loses, the badge generates gracefully without them. Badge text does not wrap for long workout names (intermediate/advanced); acknowledged but not yet fixed.

---

## ADR-009: Combine Baseline Testing — Manual Measurement Over Sensor-Based

**Status:** Accepted

**Context:** SpikeFit had no way to establish a starting point for users or track raw athletic growth. A Combine — a short battery of self-administered tests — was needed to anchor the training program with measurable baselines. The most meaningful volleyball metric is vertical jump height, but measuring it automatically (accelerometer hang-time, camera-based analysis) requires HTTPS sensor permissions, video processing dependencies, or platform-specific APIs. These conflict with the app's core constraints: zero runtime dependencies, works over `file://` protocol, no external APIs, privacy-first.

**Decision:** The Combine uses manual wall/reach entry for vertical jump: the user enters their standing reach height (arm fully extended) and their jump-touch height; the app computes `vertical = jumpTouch − standingReach`. All seven metrics in the v1 battery are self-measured and manually entered:

- Standing reach (in)
- Jump touch (in) → vertical computed automatically
- Plank hold (seconds) — count-up timer in the UI
- Wall sit (seconds) — count-up timer in the UI
- Toe taps in 30 seconds (reps) — countdown timer, then rep entry
- Jumping jacks to fatigue (reps) — manual count entry
- Lateral shuttle time (seconds) — manual stopwatch + entry

Units are **inches** in v1. A cm toggle is deferred.

**Consequences:** Measurement accuracy depends on the user following instructions correctly. The wall/reach method is the same technique used by volleyball scouting programs (SportsRecruits, NCAA programs). No hardware, no permissions, works identically over `file://` and HTTPS. Sensor-based measurement (accelerometer hang-time, `MyJump`-style video frame analysis) is documented as a future option in `docs/decisions.md` once the file://+dependency constraints are revisited.

---

## ADR-010: BYOS via Manual OS-Mediated Export/Import; Google Drive OAuth Auto-Sync Deferred

**Status:** Accepted

**Context:** Users who clear browser storage or switch devices permanently lose all workout history. SpikeFit needed a cross-device data continuity story that does not break the privacy model (data never touches a server SpikeFit controls), does not require new runtime dependencies, and does not require OAuth app registration or Google's verification/review process.

The full Google Drive OAuth path was evaluated. It requires: a `client_secret` stored somewhere (Worker KV or environment), a token-exchange endpoint in the Worker, Google's OAuth consent-screen review process (which blocks new apps pending manual Google approval), and ongoing token refresh. This is disproportionate to the problem and conflicts with the project's zero-dependency, zero-server-data principles.

**Decision:** Ship a first-class **manual export / import** feature. SpikeFit builds a versioned JSON bundle of all user data in memory and offers it via the OS Web Share API (mobile share sheet → user picks Google Drive / Files) or a synthetic download link (desktop / `file://`). The user's own installed Google Drive app, iCloud Drive, or file manager performs the actual cross-device transfer. SpikeFit makes zero network requests in this flow.

- Export reads all localStorage keys into a `{ app, schemaVersion, exportedAt, data }` envelope and hands the resulting file to the OS.
- Import triggers a file picker, parses and validates the envelope (`app === 'SpikeFit'`, `schemaVersion === 1`), shows a replace-all confirmation, then writes each key back in `try/catch` and reloads.
- `activeWorkoutStart` is always cleared on import — a restored device must never resume a stale in-flight workout.
- A first-run wizard (inserted between disclaimer acceptance and the Combine onboarding step) asks users to choose "local only" or "Google Drive backup," sets `storagePreference` in localStorage, and offers an immediate "Restore from backup" path for new-device recovery.
- A gear icon in the app header opens a Storage & Backup settings modal for existing users.
- A post-workout backup nudge appears ~once per day for users who chose the Drive preference.

**Consequences:** Backup and restore are user-initiated, not silent/automatic. A user must remember to back up before switching devices or clearing storage. The `storagePreference` key drives nudge frequency and settings copy but does not change how data is actually stored (still localStorage). Google Drive OAuth auto-sync remains a documented future enhancement once the verification-wall constraint is revisited.
