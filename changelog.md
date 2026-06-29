# SpikeFit Changelog

## Unreleased

### Code Quality

#### Extract workout database to `js/workouts.js`

The `workouts` object (12 workout definitions across Beginner/Intermediate/Advanced) and the `schedule` array were extracted from `js/app.js` into a new `js/workouts.js` file. `app.html` now loads `workouts.js` before `app.js` via `<script defer>`. Both files use global scope — no `import`/`export`. The `workouts.js` file is added to `STATIC_FILES` in the Cloudflare Worker. This separation makes the workout data independently editable and lays the groundwork for serving coach-specific workout sets via the Worker.

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
