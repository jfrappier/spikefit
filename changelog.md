# SpikeFit Changelog

## v0.0.715 — Persistent Reshare Button for Completed Workouts

The share flow no longer depends on catching the one-time badge popup right after finishing a workout — a "Share Today's Workout" button now stays available on the daily screen for as long as today's workout is marked complete, so a failed or skipped share can be retried anytime.

---

## ✨ Features

### Add persistent reshare button (BUG-5)

- New `#btn-share-today` button renders below "Reset Today's Progress" whenever `completedDates` has an entry for today's date; hidden otherwise. Visibility is recalculated on every `renderDaily()`, so it persists across reloads, not just right after completion.
- Styled to match the app's primary accent buttons (`.btn-start` / `.btn-complete`) so it stands out next to the disabled "Mark Workout Complete" button and the muted "Reset Today's Progress" button.
- Clicking it calls the new `shareTodaysBadge()`, which regenerates the badge image fresh via `generateShareImage()` and reopens the existing badge modal via `openBadgeModal()` — a clean retry path instead of relying solely on the modal shown once immediately after `markWorkoutComplete()`.

## ⚙️ Code Quality / Architecture

### Add cache-busting to JS/CSS assets

The app is mobile-first with no reliable "hard refresh" path, so a stale JS/CSS file served from a phone's cache or the CDN could persist indefinitely after a deploy with no way for the user to force a fresh fetch.

- Every `<script src="js/...">` and `<link rel="stylesheet" href="css/...">` tag in `app.html`, `auth.html`, and `index.html` now carries a `?v=0.0.715` query string.
- `cloudflare/worker.js` sets `Cache-Control: public, max-age=31536000, immutable` on `.js`/`.css` responses served from `STATIC_FILES`, so the CDN and mobile browsers cache aggressively — the version bump is what forces a fresh fetch on release, not the cache policy.
- Documented as a Hard Constraint in `CLAUDE.md`: bump the `?v=` on every referencing tag whenever a JS/CSS file changes. The Constraint Enforcer audit now checks for this.

## Files Changed

- `app.html`
- `auth.html`
- `index.html`
- `css/components/buttons.css`
- `cloudflare/worker.js`
- `js/app.js`
- `CLAUDE.md`
- `docs/architecture.md`

---

## v0.0.707 — Team Theming via Subdomains and Seed Links

Coaches and teams can now give SpikeFit their own color scheme — accessible via a team subdomain (`tigers.spikefit.app`), a shareable seed link (`spikefit.app/?team=tigers`), or automatically on return visits via stored team identity.

---

## ✨ Features

### Add team resolver and custom theming (FR-14)

A new `js/team.js` early loader resolves which team (if any) is active and injects the team's CSS theme before first paint — no flash of un-themed content. Resolution priority: hostname subdomain → `?team=` seed link → stored `spikefit_team` in localStorage.

- **Subdomain routing:** `tigers.spikefit.app` automatically applies the Tigers color scheme on any page.
- **Seed links:** Coaches share `spikefit.app/?team=tigers`; the `?team=` param is validated, persisted to `spikefit_team` in localStorage, then stripped from the URL via `history.replaceState`.
- **Persistent preference:** Stored `spikefit_team` applies the theme on all subsequent visits, even after navigating to the apex domain.
- **BYOS export / import:** `spikefit_team` is included in the backup bundle so team identity follows the athlete to a new device.
- **First example team:** Tigers (`css/themes/tigers.css`) ships with the feature.

### Add Tigers team theme

`css/themes/tigers.css` re-declares the relevant `:root` color tokens from `css/base.css` in orange/gold. It serves as the reference template for future team theme PRs; all authoring instructions are in the file comments.

## ⚙️ Code Quality / Architecture

### Add QUnit tests for resolveTeam

`tests/unit/team.test.js` covers hostname resolution, `?team=` param, localStorage fallback, priority order, edge cases (apex domain, `www`, suffix-attack hostname, `file://` empty hostname, invalid values).

### Add Playwright E2E tests for theming

`tests/e2e/test_team.py` asserts theme `<link>` injection, `--accent` computed value, param stripping, localStorage persistence, and no-team default.

## Files Changed

- `js/team.js` *(new)*
- `css/themes/tigers.css` *(new)*
- `tests/unit/team.test.js` *(new)*
- `tests/e2e/test_team.py` *(new)*
- `app.html`
- `index.html`
- `auth.html`
- `js/storage.js`
- `cloudflare/worker.js`
- `tests/unit/run.html`
- `docs/architecture.md`
- `docs/decisions.md`
- `CLAUDE.md`

---

## v0.0.706 — Cross-Device Backup / Restore (BYOS)

This release adds a first-class manual backup and restore feature so users can keep their workout history across devices and recover from a browser storage wipe — without any server, OAuth, or Google account integration.

---

## 💾 Data / Backup

### Add BYOS export / import via OS share sheet

New **Storage & Backup** feature (gear icon in the header) lets users:

- **Back Up Now** — bundles all workout data, F.R.E.S.H. logs, Combine results, level, and settings into a versioned JSON file (`spikefit-backup-YYYY-MM-DD.json`) and offers it via the OS share sheet on mobile (tap Google Drive / Save to Files) or a download on desktop.
- **Restore from a File** — picks a backup file, validates it, shows a replace-all confirmation, writes every key back to localStorage, and reloads.

SpikeFit never connects to Google or any storage service — the OS and the user's own apps do the file movement.

### Add first-run storage-choice wizard step

New users see a "Where should your progress live?" modal after accepting the disclaimer and before the Combine onboarding. They can choose **Local only** or **Google Drive backup**. The Drive branch also surfaces an **"Already have a backup? Restore it now"** link for new-device recovery at first launch.

### Add post-workout backup nudge

Users who chose the Drive preference see a lightweight "Back Up Your Progress?" prompt after completing a workout (~once per day, dismissible). Dismissing or backing up proceeds to the normal badge/share flow.

## Files Changed

- `app.html`
- `js/storage.js` *(new)*
- `js/app.js`
- `css/components/storage.css` *(new)*
- `cloudflare/worker.js`
- `docs/architecture.md`
- `docs/decisions.md`
- `CLAUDE.md`

---

## v0.0.705

This release adds the Combine baseline testing feature, a new permanent tab that prompts new users to measure seven volleyball-relevant metrics before they start training, then tracks progress across retests every four weeks.

---

## 🏐 Features

### Add Combine baseline testing tab

New **Combine** tab in the main nav lets users self-administer a battery of seven volleyball-relevant athletic tests and track their progress over time:

- **Standing Reach** — measured in inches against a wall
- **Vertical Jump** — standing reach + jump-touch entry; app computes the difference automatically and shows a live preview as you type
- **Plank Hold** — count-up timer (Start → Stop writes the duration)
- **Wall Sit** — count-up timer (same pattern as plank)
- **Toe Taps (30s)** — built-in 30-second countdown timer followed by a rep entry prompt
- **Jumping Jacks to Fatigue** — manual rep count entry
- **Lateral Shuttle** — manual stopwatch + time entry (seconds)

The summary card shows current vs. baseline (first attempt) vs. personal best for each metric, with ▲/▼ deltas after the first retest.

A **"Set Your Baseline"** modal appears once per browser session for users with no prior Combine data (after the disclaimer is accepted), prompting them to take the tests before starting their first workout. The modal suppresses itself once any result is saved. Returning users with data older than 28 days see a retest toast reminder instead.

All Combine data is stored exclusively in `combineResults` in browser localStorage — it never leaves the device.

## Files Changed

- `app.html`
- `js/combine.js` *(new)*
- `css/components/combine.css` *(new)*
- `css/components/nav.css`
- `js/app.js`
- `tests/e2e/test_combine.py` *(new)*
- `tests/unit/combine.test.js` *(new)*
- `tests/unit/run.html`
- `docs/architecture.md`
- `docs/decisions.md`
- `CLAUDE.md`

---

## v0.0.703

This release fixes three bugs introduced or exposed during the inline-style extraction and CSS refactor: a missing layout rule on the landing hero preview, broken avatar image paths in the landing stylesheet, and a timing-dependent auth step initialization.

---
## 🔒 Security

### Refactor unsafe-inline

Remove dependencies requiring unsafe-inline in CSP.

## 🐞 Bug Fixes

### Restore `.hero-preview` width and max-width in `cards.css`

`width: 100%; max-width: 900px` were accidentally dropped from the `.hero-preview` rule in `css/components/cards.css` when inline styles were extracted to the stylesheet. The hero preview section rendered without a constrained width. The properties are restored.

### Fix avatar background-image paths in `landing.css`

Avatar rules in `css/landing.css` referenced `url('img/1.jpg')` etc. CSS resolves relative URLs relative to the stylesheet's own location — `css/landing.css` — so the paths resolved to `css/img/` (404). Corrected to `url('../img/1.jpg')` to resolve to the top-level `img/` directory.

### Initialize auth step via JS at module level in `auth.js`

The initial auth step was previously shown by relying on CSS or inline-style visibility. Under the Cloudflare Worker's strict CSP, this could leave the wrong step visible during deployment transitions. `showStep('step-email')` is now called at module level so the correct step is always set via CSSOM as soon as the script runs.

## Files Changed

- `css/components/cards.css`
- `css/landing.css`
- `js/auth.js`

---

## v0.0.701

This release updates workout flow, adds warmups, separates workout list from `app.js`, and adds security documentation.

---

## 🏐 Workouts

### Add warm-up blocks to all 12 workouts *(#30)*

Every workout (Beginner, Intermediate, and Advanced tiers for A/B/C/D) now begins with a structured warm-up block that renders like any other exercise block and counts toward completion. Warm-ups are tailored to the movement demands of each session:

- **Workout A (Vertical Power):** Hip/ankle mobility series — Leg Swings, Hip Circles, Squat to Stand, Glute Bridge, Ankle Bounces. Intermediate adds Single-Leg Glute Bridge and Lateral Leg Swings.
- **Workout B (Upper Body Armor):** Shoulder prep series — Arm Circles, Shoulder Pendulum, Cat-Cow, Wall Slides. Intermediate adds Thoracic Rotation.
- **Workout C (Lateral Agility):** 3-round sport-specific activation — Lateral Shuffles, W-Drill, Fast-Feet Taps.
- **Workout D (Spike Mechanics):** Hip and rotation prep — Cat-Cow, Kneeling Hip Flexor Stretch, Hip Circles, Cross-Body Arm Swings, Seated Torso Rotation. Intermediate adds Thoracic Rotation.

Additional exercises were added to two workouts in the same pass:

- **Workout A Superset 2:** Added Goblet Squat (10 reps) and Glute Bridge (15 reps) across all tiers.
- **Workout B:** Added a dedicated "Shoulder Health" finisher block with Band Pull-Aparts; Intermediate also includes Side-Lying DB External Rotation.

---

## 🔒 Security

### Add security vulnerability reporting policy *(#31, #33)*

Added a `SECURITY.md` file and a `/.well-known/security.txt` endpoint documenting how to responsibly report vulnerabilities. The Cloudflare Worker was updated to serve `/.well-known/security.txt` without requiring authentication. `_config.yml` was added to configure Jekyll to publish the `.well-known/` directory — Jekyll silently ignores dotfile directories by default, and without this file the `security.txt` would never reach GitHub Pages.

---

## ⚙️ Code Quality

### Extract workout database to `js/workouts.js` *(#26)*

The `workouts` object (12 workout definitions across Beginner/Intermediate/Advanced) and the `schedule` array were extracted from `js/app.js` into a new `js/workouts.js` file. `app.html` now loads `workouts.js` before `app.js` via `<script defer>`. Both files use global scope — no `import`/`export`. The `workouts.js` file is added to `STATIC_FILES` in the Cloudflare Worker. This separation makes the workout data independently editable and lays the groundwork for serving coach-specific workout sets via the Worker.

### Refactor `app.js` for readability and SonarQube compliance *(#27)*

A large refactor pass on `app.js` extracted several inline blocks into named functions, reducing cognitive complexity scores and making the file easier to navigate:

- `formatDateStr(date)` — date-to-string formatting pulled out of inline expressions
- `setStartedState(startBtn, completeBtn)` / `setIdleState(startBtn, completeBtn)` — button-state logic extracted from `updateWorkoutStatus()`
- `drawBadgeBackground(ctx, canvas)` / `drawBadgeCharacter(ctx, canvas, img)` / `drawBadgeText(ctx, canvas, workoutName, dateStr, durationMins)` — badge canvas drawing split into three focused functions
- `createRegulationBanner()` / `createExerciseCard(ex, regulate, isStarted)` — exercise-rendering DOM helpers extracted from `renderDaily()`
- `calculateStreak(dates)` — pure streak calculation extracted from the side-effectful `checkStreak()`

Also fixed a bug where rest days were not correctly identified, and cleaned up several findings flagged by SonarQube.

## Files Changed

- `js/workouts.js`
- `js/app.js`
- `cloudflare/worker.js`
- `.well-known/security.txt`
- `SECURITY.md`
- `_config.yml`

---

## v0.0.625

This release closes out a full review pass of `app.js` and `app.html`, covering bug fixes, security hardening, and one behavior change to auto-leveling. Items are grouped by category; original review item numbers are noted for traceability.

---

## 🔴 Critical Fixes

### Duplicate `Image` declaration (app.js)

A leftover duplicate `const img = new Image();` block existed in `generateShareImage()` from an earlier edit that added the timeout-race fix without removing the block it replaced. Two `const` declarations of the same name in one scope is a JavaScript `SyntaxError` — this would have silently broken the **entire script**, not just badge generation, leaving the app stuck on the splash screen with no visible error. Removed the duplicate; only the timeout-race version remains.

### Unguarded `JSON.parse` calls *(#3)*

`completedExercises`, `completedDates`, and the F.R.E.S.H. workout-load log were all read from `localStorage` via bare `JSON.parse(...)`. A single corrupted value (partial write, manual edit) would throw synchronously and halt the whole script on load. Added a `safeParseJSON(key, fallback)` helper that wraps every parse in try/catch and falls back to a safe default, logging the corruption to the console instead of crashing.

---

## 🐞 Bug Fixes

### Hardcoded year in the history calendar *(#1)*

The "Next month" button and month-navigation guard were hardcoded to stop at December 2026 (`year >= 2026`). Replaced with a live comparison against the actual current date, so the calendar correctly caps navigation at "this month" indefinitely — no future re-edit required.

### Mid-workout day switching corrupts state *(#2)*

Switching days via the Schedule tab while a workout was in progress left `activeWorkoutStart` pointing at the old day's start time while rendering the new day's exercises as "started." Completing that workout would log it under the wrong day with a corrupted duration. `setWorkoutDay()` now confirms with the user before switching if a workout is active, and clears the stale state if they proceed.

### Checkbox state collided across repeated workouts *(follow-up to #2)*

`completedExercises` was keyed only by exercise ID. Since the same workout (e.g. "A") appears on multiple days (Monday *and* Saturday) and recurs weekly, checking off Monday's "A" also marked Saturday's "A" as complete — and the same collision happened week-over-week on the same weekday. Added `getExerciseKey()`, which scopes every checkbox key to today's actual calendar date (`YYYY-MM-DD_exerciseId`), fixing both collisions at once.

> **Note:** This changes the storage key format. Anyone with boxes checked on the day this update ships will see them un-check once, since old raw-ID keys won't match the new date-scoped lookup. One-time only; no ongoing impact.

### F.R.E.S.H. log grew unbounded *(#11)*

The workout-load log used by the ACWR calculation only ever grew — every `calculateACWR()` call re-parsed and iterated the entire lifetime history, even though only the trailing 28 days are ever used. `saveLog()` now prunes entries older than 28 days before writing back to storage.

### Badge image load could hang indefinitely *(#6)*

The character-art image load for the share badge had no timeout. A stalled connection (or a failing fallback URL) could leave badge generation hanging forever. Wrapped the load in `Promise.race` against a 5-second timeout — on timeout, `img.complete` stays false and the badge generates with text/gradient only, skipping the character art gracefully.

### Webfont not guaranteed loaded before canvas text draw *(#12)*

Canvas text rendering doesn't wait for webfonts. If "Source Sans 3" hadn't finished loading when the badge was generated (plausible right after the splash screen), it silently fell back to Arial. Added a `document.fonts.load()` check raced against a 2-second timeout before any canvas text is drawn.

---

## 🔒 Security

### Missing `rel="noopener noreferrer"` on external links *(#8, #4)*

- All "Watch" video links (`target="_blank"`) in `renderDaily()` now include `rel="noopener noreferrer"`, closing a reverse-tabnabbing gap where the opened tab retained a `window.opener` reference back to the app.
- The GitHub/Cloudflare privacy policy links in the Privacy modal were previously raw markdown syntax (`[text](url)`) that rendered as literal text in HTML. Converted to real `<a>` tags with the same `rel` protection.

### Inline event handlers removed *(#9)*

Three remaining inline handlers (`onerror=` on both logo `<img>` tags, `onclick=` on the readiness-modal Cancel button) were moved to `addEventListener` calls in `app.js`, matching the pattern already used everywhere else in the file. This also clears the last blocker to adopting a strict `script-src 'self'` Content Security Policy in the future, since no inline JS remains in `app.html`.

### Unhandled `localStorage` write failures *(#10)*

`saveState()` and `FRESH_SYSTEM.saveLog()` now wrap their `localStorage.setItem` calls in try/catch. On failure (storage full, private-browsing restrictions), the error is logged to the console and the user sees a toast explaining the save didn't go through, instead of an uncaught exception silently breaking the in-progress action.

---

## ⚙️ Behavior Change: Auto-Leveling Logic *(#7)*

Auto-promotion from Beginner → Intermediate → Advanced previously triggered off **lifetime total workouts** (8 / 16), regardless of pace, and could be permanently disabled the first time a user manually picked a level.

New behavior:

- Promotion now requires **16 workouts logged at the current level**, completed within a **35-day rolling window** (≈3.2 workouts/week) — informed by ACSM training-frequency guidance for novice vs. intermediate trainees, not a specific researched threshold for this exact day count.
- Auto-leveling **always fires** once the bar is met — the `manualLevelOverride` flag that previously disabled it permanently after any manual level change has been removed entirely.
- Advanced is the top tier and is never checked for further promotion.
- Each completed workout now records the level it was done at (`completedDates[date].level`), which the new pace check relies on.

**Known limitation:** Workouts logged before this update don't have a `level` field, so they won't count toward the new pace-based promotion. Everyone's 16-workout count effectively starts fresh from their next logged workout after this update ships.

---

## 📝 Content / Copy Fixes

### Privacy modal accuracy *(#5)*

The Privacy modal claimed the app "operates entirely within your browser" with no network activity — but the logo and badge artwork both have a GitHub-hosted fallback if the local asset fails to load. Softened the claim and added a sentence disclosing the asset-delivery fallback, framed accurately as not involving any user data transmission.

---

## Files Changed

- `app.js`
- `app.html`

## Not Yet Addressed

- Badge text on intermediate and advanced badges does not wrap
