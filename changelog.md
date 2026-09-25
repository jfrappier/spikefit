# SpikeFit Changelog

## v0.0.927 — Coach Module: Detect an Unconfigured Team's Sheet

A missing or wrong `sheetId` in a team's `TEAMS` config used to look exactly like a connectivity problem — the coach would see scans sit "queued, unverified" forever, retried every 30s, never succeeding, with no signal that the real problem is server-side setup, not their signal. The Worker now tells these apart and the coach UI responds accordingly.

---

## ✨ Features

### `team_not_configured` — a distinct, non-retryable error (`cloudflare/worker.js`)

- New `isSheetConfigured(teamConfig)` (presence-only — never validates or reveals the ID) short-circuits `requireCoachApi()` before any Sheets call when `sheetId` is blank.
- `fetchRosterFromSheets()` now distinguishes a permanent setup problem (Google returns `400`/`403`/`404` — wrong ID, deleted sheet, or never shared with the service account) from an ordinary transient Sheets failure, throwing a `TeamNotConfiguredError` for the former.
- All three pickup endpoints (`/scan`, `/confirm`, `/sync`) return `409 {error:'team_not_configured'}` for this case instead of `503`, specifically so the client never queues it offline — retrying can't fix a broken Sheet ID.
- `/coach/api/config` now includes a presence-only `configured` boolean per team (still never the `sheetId` itself), so the hub can flag this before a coach ever attempts a scan.

### Coach UI (`js/coach.js`, `css/components/coach.css`)

- A team with `pickup` on but `configured: false` still gets a hub tile, styled as "Pickup — Setup Needed" — clicking it shows a toast pointing at the admin instead of opening the camera.
- A `409 team_not_configured` from `/scan` or `/confirm` renders a persistent card ("Contact your SpikeFit admin — `<team>` needs its roster sheet finished…") instead of silently queuing the scan.

## 🧪 Tests

- `tests/worker/coach-auth.test.js` — `isSheetConfigured()` coverage (non-empty string, blank, missing, wrong type).
- `tests/e2e/test_coach.py` — hub "Setup Needed" tile (never opens the scanner), and a `409 team_not_configured` scan showing the admin-contact message with an empty offline queue afterward.

## 📚 Documentation

- `docs/architecture.md` Coach Module section: the `409`/`503` distinction, and `configured` added to the `/coach/api/config` response shape.
- `tools/coach/README.md`: what a coach sees if `sheetId` is left blank or wrong, plus a note that every KV write in this doc can be done from the Cloudflare dashboard — no `wrangler` CLI required.

## Files Changed

- `cloudflare/worker.js`
- `js/coach.js`, `css/components/coach.css`, `coach.html` (cache-bust bump)
- `tests/worker/coach-auth.test.js`
- `tests/e2e/test_coach.py`
- `docs/architecture.md`, `tools/coach/README.md`

---

## v0.0.926 — Add Millis (Mohawks) Team Theme

New team theme for Millis, following the existing team-pack pattern (ADR-011) — no Worker logic changes, just a theme file, a `TEAMS` entry, and a logo asset.

---

## ✨ Features

### Millis team theme (`css/themes/millis.css`, `img/teams/millis-logo.png`)

- Colors sampled directly from the team's Mohawks logo (`img/teams/millis-logo.png`) — a maroon `--accent: #7e161a` with a darker hover state and a pale rose `--accent-light`, matching the token set every other theme file re-declares (`--accent`, `--accent-hover`, `--accent-light`, `--shadow-hover`, `--shadow-lg`).
- Logo background was removed (soft alpha threshold against the near-white source) so it composites cleanly like `lions-logo.png`, rather than shipping with a visible white box like the source JPEG.
- New `millis` entry in the `TEAMS` registry (`js/team.js`) and matching `STATIC_FILES` entries in `cloudflare/worker.js` for the theme CSS and logo.
- Reachable at `millis.spikefit.app` or via `?team=millis` seed link, same resolution priority as every other team.

## Files Changed

- `css/themes/millis.css`
- `img/teams/millis-logo.png`
- `js/team.js`
- `cloudflare/worker.js`
- `app.html`, `auth.html`, `index.html`, `coach.html` (cache-bust bump for `js/team.js`)

---

## v0.0.925 — Coach Module v1: Pickup Sign-Out (FR-18)

A new, opt-in coach-only area at `/coach` for practice pickup: a coach scans an adult's QR card, then each kid's card, and gets an immediate green/yellow/red read on whether that adult is authorized to take that kid — no paper roster. This is a genuinely new class of data for SpikeFit (kid/adult names and adult emails, not athlete workout data), so it ships with its own privacy model: the team's own Google Sheet is the only durable store of that data, and nothing Cloudflare-owned may ever hold a name, email, or phone number.

---

## ✨ Features

### Pickup sign-out (`/coach`, `coach.html`, `js/coach.js`)

- **Hub** (`GET /coach/api/config`) shows one tile per feature enabled for the coach's team; a coach with several teams and not on a team subdomain sees a team picker first. Pickup is the only feature in v1.
- **Scanner:** `BarcodeDetector` when the browser supports the `qr_code` format, falling back to a vendored `jsQR` decoding canvas frames at ~10fps. A denied/unavailable camera falls back to a manual ID-entry field — same code path either way. A 5-second decode-dedupe absorbs rapid re-reads of the same physical card.
- **Pickup flow:** scan the adult, then each kid. Each kid gets its own green (authorized — logged automatically), yellow (not authorized — coach must pick a reason and can add a note before confirming, or decline), or red (unknown/inactive card, or a kid card scanned as the adult or vice versa — no override) result. A pending yellow blocks **Done** until resolved. A client-side in-memory guard blocks re-submitting an already-resolved kid within the same pickup session, separate from the 5-second decode-dedupe.
- **Offline queue:** a failed scan, timeout, or `503` queues the event (`spikefit_coach_queue`, IDs only) behind an **UNVERIFIED — check manually** banner, and retries on reconnect, on tab visibility, and every 30s. A synced offline yellow auto-releases (no confirmation is possible after the fact) and is flagged `RELEASED OFFLINE — NOT VERIFIED`, with a parent alert and an incident email to the team's admins.
- **"Already signed out today" warning:** best-effort (Workers KV is only eventually consistent across edge locations), shown as a banner, never blocks the pickup.

### Worker: coach API (`cloudflare/worker.js`)

- `GET /coach` (page, gated), `GET /coach/api/config`, `POST /coach/api/pickup/{scan,confirm,sync}` — routed above the static/catch-all gate. Every API route re-reads the coach's `ALLOWLIST.coach.teams` on each request (not just at session creation), resolves the team (hostname proposes, `coach.teams` decides — a coach on the wrong team's subdomain gets the generic "no coach tools enabled" message, not a redirect hint), checks the team's feature flag, and applies CSRF defense in depth (`Content-Type`/`Origin` checks) plus a 60 req/min rate limit.
- `decidePickup()`, `parseRoster()`, ID validation, team resolution, and the feature-flag reader are pure functions — covered by a new `node --test` layer (`tests/worker/`, zero dependencies, `"type":"module"` via a scoped `package.json`).
- Reads/writes the team's Google Sheet directly (JWT-signed service-account auth, `crypto.subtle`, RS256) — no Apps Script layer. Writes always use `valueInputOption=RAW` (never `USER_ENTERED`, which would let a name or note starting with `=`/`+`/`-`/`@` execute as a formula). The roster is cached 60s via the Workers Cache API, not KV.
- New `TEAMS` KV namespace (team config: name, timezone, Sheet ID, feature flags, override reasons, admin emails — `sheetId`/`adminEmails` never reach the browser). New short-TTL `RATELIMIT` keys: `coachapi:`, `evt:` (idempotency), `out:` (duplicate-pickup warning, IDs only), `pending:` (yellow awaiting confirm), `gtoken` (Google access token KV fallback).
- New `GOOGLE_SA_KEY` secret. `cloudflare/wrangler.example.toml` added as a checked-in template with every binding (`wrangler.toml` itself stays gitignored).

## 🔒 Security & Privacy

### No kid/adult PII in any Cloudflare-owned store

New hard rule (ADR-014): the team's Google Sheet — owned and shared by the team admin — is the only durable store of kid/adult names, emails, and phone numbers. No Worker-owned KV value may ever contain one; only IDs, with short bounded TTLs (10 min–48 h). Where a name is needed for display (the scanned adult's name, the already-out banner), it's resolved from the roster cache at response time and never persisted. This was a deliberate rejection of a simpler Cloudflare-owned-store design (D1 + CSV export) specifically because that would have made the solo maintainer the data controller for children's PII — see ADR-014's alternatives-considered section.

### Resend email refactor

Extracted the duplicated `fetch()` call in `sendEmail()`/`sendConsentEmail()` into a shared `sendResend(apiKey, to, subject, html)` helper, now reused by the coach module's parent-pickup and incident alerts too. Every parent alert goes to exactly one recipient (never several addresses in one `to`), and every interpolated value is HTML-escaped.

---

## 🧪 Tests

- `tests/worker/pickup.test.js`, `coach-auth.test.js`, `sheets.test.js` — `node --test` coverage for `decidePickup()` (every green/yellow/red case, including inactive kid/adult, a kid card scanned as the adult and the reverse, and an adult authorized for one sibling but not another), roster parsing rules, ID/UUID validation, team resolution (apex, `www`, team subdomain, a subdomain the coach isn't assigned to, a spoofed `*.spikefit.app.evil.com` suffix), the feature-flag reader, and the Sheets append request builder (rejects any `valueInputOption` other than `RAW`).
- `tests/e2e/test_coach.py` — Playwright, served over real HTTP (not `file://`, since `coach.js`'s `fetch()` calls need it) with `/coach/api/**` mocked via `page.route()`. Covers green, red, the already-out banner, yellow confirm (including the required-reason guard) and decline, the offline queue and sync (including the offline re-scan guard), and the hub hiding a team with no enabled features. Camera access is stubbed to reject immediately (matching a denied/unavailable camera) so these run through the manual-entry fallback rather than needing a fake video device.

## 📚 Documentation

- New **ADR-014** (coach module privacy model, alternatives considered, accepted limitations). Amended **ADR-001** (vendored-exception table, `js/vendor/jsQR.js`) and **ADR-007** (the Worker is no longer purely a hosting-only pass-through).
- `docs/architecture.md`: new Coach Module section, updated routing/KV tables, and a fix to stale CSP documentation (`'unsafe-inline'` was documented but not actually sent).
- `CLAUDE.md`: coach-module scoping on the workout-data hard constraint, new no-PII-in-Cloudflare-storage hard constraint, file map, localStorage registry, and Privacy Boundary Auditor additions.
- `tools/coach/README.md` + `generate-ids.py`: setup steps (service account, Sheet, `TEAMS` KV, granting a coach) and a standard-library ID generator for printing QR cards.
- Added a coach-module paragraph to the in-app Privacy modal (`app.html`) and `tos.html`.

## Files Changed

- `cloudflare/worker.js`, `cloudflare/wrangler.example.toml`, `cloudflare/package.json`
- `coach.html`, `js/coach.js`, `js/vendor/jsQR.js`, `css/components/coach.css`
- `app.html` (Privacy modal paragraph)
- `tos.html`
- `tools/coach/generate-ids.py`, `tools/coach/README.md`
- `tests/worker/pickup.test.js`, `tests/worker/coach-auth.test.js`, `tests/worker/sheets.test.js`, `tests/worker/package.json`
- `tests/e2e/test_coach.py`, `tests/e2e/conftest.py`
- `tests/README.md`
- `eslint.config.mjs`, `.codacy/tools-configs/eslint.config.mjs`
- `docs/decisions.md`, `docs/architecture.md`, `CLAUDE.md`

---

## v0.0.811 — Confirm Abnormally Long Workout Durations Before Logging (FR-17)

Workout duration is auto-detected from Start → Mark Complete and feeds directly into the F.R.E.S.H. training load (`load = rpe × durationMins × readinessModifier`). A forgotten timer therefore injects one huge phantom session that dominates the acute load and spikes the ACWR for a full 7 days. When a detected duration is abnormally long, the app now prompts the user to confirm or correct it before the session is saved.

---

## ✨ Features

### Long-workout duration confirmation prompt (FR-17)

- Added a `#long-workout-modal` shown after the RPE modal when the auto-detected duration looks abnormal. It reports the detected minutes and lets the user keep or edit the value; the corrected duration (clamped 1–180) is what gets saved to the F.R.E.S.H. log.
- Detection is a pure function, `isAbnormalDuration(minutes, priorDurations)` in `js/app.js`. A duration is flagged only when it clears **both** a static floor (`LONG_WORKOUT_FLOOR_MINS = 75`) **and** a personalized threshold (`LONG_WORKOUT_MEDIAN_MULT = 2.5` × the median of the user's prior logged durations). With fewer than `LONG_WORKOUT_MIN_HISTORY = 3` prior sessions it falls back to the floor alone. This avoids nagging short/normal sessions, brand-new users, and athletes who legitimately train long.
- The `btn-save-rpe` flow was refactored so the save/complete step lives in a shared `finalizeWorkout(rpeScore, finalDuration)` helper, called directly for normal sessions or after the modal for flagged ones.

## 🧪 Tests

- `tests/unit/long-workout.test.js` — QUnit coverage for `medianOf` and `isAbnormalDuration` (floor gating, low-history fallback, personalized threshold boundary, garbage-input filtering, and the real-world 131-min case).
- `tests/e2e/test_long_workout.py` — Playwright coverage for the prompt appearing on a long detected duration and correcting it, and for a normal session saving with no prompt.

## Files Changed

- `js/app.js`
- `app.html`
- `css/components/modals.css`
- `auth.html` (cache-bust bump)
- `index.html` (cache-bust bump)
- `tests/unit/long-workout.test.js`
- `tests/unit/run.html`
- `tests/e2e/test_long_workout.py`

---

## v0.0.7291 — Fix Large White Space Below Bottom Nav in DuckDuckGo on Android

The mobile bottom navigation showed a large empty white band below the tab buttons in DuckDuckGo's Android browser (Chrome and desktop were unaffected). DuckDuckGo reports a non-zero `env(safe-area-inset-bottom)` — roughly the height of its own bottom toolbar — even though the app never opts into edge-to-edge layout, and that value was being turned into padding below the nav.

---

## 🐛 Fixes

### Remove safe-area-inset padding from the mobile bottom nav (BUG-6)

- `css/components/nav.css` no longer references `env(safe-area-inset-bottom)` anywhere in the mobile bottom-nav block. Previously it was applied twice at once — as `padding-bottom` on the `.nav` container **and** inside each `.nav button`'s `padding` (`calc(0.6em + env(safe-area-inset-bottom))`) — and both are now gone. Button padding is symmetric (`0.6em 0.1em`) and the container reserves no extra bottom space.
- The app's viewport meta tag does not set `viewport-fit=cover`, so per spec `env(safe-area-inset-bottom)` resolves to `0` on compliant browsers (Chrome, Safari) — meaning this padding was only ever a no-op there, and the nav already sits flush above the system gesture bar. DuckDuckGo's Android browser violates that expectation and reports a non-zero inset (≈ its own bottom toolbar height), which the padding turned into the visible white band. Removing the inset makes DuckDuckGo match Chrome; it changes nothing on spec-compliant browsers.
- If the app later adopts an intentional edge-to-edge layout via `viewport-fit=cover`, safe-area handling should be re-introduced deliberately (and audited across all fixed/edge elements) rather than relying on the incidental behavior removed here.

## Files Changed

- `css/components/nav.css`
- `app.html`
- `auth.html`
- `index.html`
- `changelog.md`

---

## v0.0.724 — Fix F.R.E.S.H. Baseline Gate to Count Logged Workout Days, Not Elapsed Time

The 14-day F.R.E.S.H. baseline gate was checking calendar time since the first logged workout instead of counting actual logged workout days, so a user with only a couple of sparse sessions spread across 14+ real days could get a "computed" ACWR ratio from data that was really still too thin to mean anything.

---

## 🐛 Fixes

### Gate the ACWR baseline on distinct logged days, not elapsed calendar time (BUG-6)

- `calculateACWR()` (`js/app.js`) now tracks a `loggedDays` set of distinct calendar dates with at least one logged session (within the 28-day retention window) and requires 14 of those before computing a ratio — previously it only checked `(now - oldestLogTimestamp) / ONE_DAY >= 14`, which passed as soon as 14 calendar days had elapsed since the oldest surviving log, regardless of how many workouts were actually logged in between.
- The chronic-load averaging denominator (`weeksActive`) is unchanged — it still legitimately uses real elapsed time, since that's the actual ACWR chronic-average window, separate from the "is there enough data yet" readiness check.
- Removed the now-dead "fewer than 3 sessions → caution not danger" cold-start guardrail: once the baseline gate requires 14 distinct logged days, `logs.length >= 14` is guaranteed by the time that branch would run, so it could never trigger again.
- "Building Baseline" copy in the F.R.E.S.H. modal now reads workouts remaining instead of days remaining, to match the new gate.
- Updated `tests/unit/acwr.test.js` (the inline copy of the calculation used for pure-function testing) to match, added a regression test for the exact reported scenario (few sessions spanning 14+ calendar days should stay `baseline`), and updated `docs/decisions.md` ADR-004.

## Files Changed

- `js/app.js`
- `app.html`
- `tests/unit/acwr.test.js`
- `CLAUDE.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `changelog.md`

---

## v0.0.723 — Required Physician-Consultation Checkbox

The disclaimer modal now requires an affirmative "I have consulted with my physician or PCP" checkbox before it can be accepted, and fixes a bug where a real server error during guardian-consent requests was misreported as "not connected to a server."

---

## ⚖️ Legal

### Add required PCP-consultation checkbox (FR-16)

- New checkbox in the disclaimer modal (`app.html`): "I have consulted with my physician or primary care provider before starting this program." `#btn-accept-disclaimer` now starts `disabled` and only enables once this box is checked (and, for self-declared minors, once guardian consent has also been submitted).
- `DISCLAIMER_VERSION` bumped to `0.0.723` in `js/app.js` so existing users are re-prompted, per the versioning mechanism from `v0.0.720`.
- See `docs/decisions.md` ADR-013.

## 🐛 Fixes

### Distinguish "no server" from "server errored" in guardian-consent flow (FR-16)

- `sendGuardianConsent()` in `js/app.js` previously caught every failure — a genuine network error (no server reachable, e.g. a local/offline fork) and a real server-side error (missing `CONSENTS` KV binding, Resend failure, etc.) — into the same "isn't connected to a server" message, which was misleading on a working hosted deployment. It now distinguishes the two: a `fetch()` throw still shows the "not connected" fallback, while a non-2xx response logs the HTTP status/body to the console and shows a distinct "something went wrong, try again" message.

## Files Changed

- `app.html`
- `js/app.js`
- `CLAUDE.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `changelog.md`
- `tests/e2e/test_storage.py`
- `tests/e2e/test_combine.py`
- `tests/e2e/test_workout_flow.py`

---

## v0.0.720 — Versioned Disclaimer Acceptance and Guardian Consent Tracking

The disclaimer/ToS now carries an age-of-majority and Massachusetts governing-law clause, re-prompts existing users when the wording changes, and — on the hosted instance — records acceptance server-side and verifies parent/guardian consent by email for self-declared minors.

---

## ⚖️ Legal

### Add age-of-majority and governing-law clauses (FR-15)

- The disclaimer modal (`app.html`) and `tos.html` now state that users must be 18+ to accept on their own behalf, and that the terms are governed by the laws of the Commonwealth of Massachusetts, with exclusive jurisdiction in MA state/federal courts.
- Added a footer link to `tos.html` on the landing page (`index.html`) so the terms are visible before a user ever logs in.

### Version-gate disclaimer acceptance (FR-15)

- `disclaimerAgreed` now stores a `DISCLAIMER_VERSION` string instead of `'true'`. `checkDisclaimer()` re-shows the modal whenever the stored value doesn't match the current version — including everyone who already accepted the old, unversioned text. Bump `DISCLAIMER_VERSION` in `js/app.js` whenever the wording changes materially.

### Minor/guardian consent flow (FR-15)

- The disclaimer modal gains an "I am under 18" checkbox that reveals a parent/guardian email field. On the hosted instance, submitting it calls a new `POST /consent/send` Worker endpoint, which emails the guardian a confirmation link via Resend — consent is only recorded once the guardian clicks it (`GET /consent/confirm`), not when the athlete types an email.
- Adult (non-minor) acceptance now also calls a new `POST /consent/accept` endpoint to log `{ tosAcceptedAt, tosVersion }` server-side.
- Both endpoints extend the Worker's existing `ALLOWLIST` KV value from a bare `'true'` to a JSON record, and a new `CONSENTS` KV namespace holds pending guardian-confirmation tokens (7-day TTL). Deploying the hosted Worker now requires an additional `CONSENTS` KV namespace binding in `wrangler.toml`.
- None of this applies to locally-run forks — there's no server to email a guardian through, so that path falls back to an unverified, client-side-only attestation, same as the disclaimer always has been for local forks.
- See `docs/decisions.md` ADR-012 for the full rationale.

## Files Changed

- `app.html`
- `tos.html`
- `index.html`
- `auth.html`
- `js/app.js`
- `css/components/modals.css`
- `cloudflare/worker.js`
- `CLAUDE.md`
- `docs/architecture.md`
- `docs/decisions.md`
- `changelog.md`
- `tests/e2e/test_workout_flow.py`
- `tests/e2e/test_storage.py`
- `tests/e2e/test_combine.py`

---

## v0.0.715 — Persistent Reshare Button for Completed Workouts

The share flow no longer depends on catching the one-time badge popup right after finishing a workout — a "Share Today's Workout" button now stays available on the daily screen for as long as today's workout is marked complete, so a failed or skipped share can be retried anytime.

---

## ✨ Features

### Add persistent reshare button (BUG-5)

- New `#btn-share-today` button renders below "Reset Today's Progress" whenever `completedDates` has an entry for today's date; hidden otherwise. Visibility is recalculated on every `renderDaily()`, so it persists across reloads, not just right after completion.
- Styled to match the app's primary accent buttons (`.btn-start` / `.btn-complete`) so it stands out next to the disabled "Mark Workout Complete" button and the muted "Reset Today's Progress" button.
- Clicking it calls the new `shareTodaysBadge()`, which regenerates the badge image fresh via `generateShareImage()` and reopens the existing badge modal via `openBadgeModal()` — a clean retry path instead of relying solely on the modal shown once immediately after `markWorkoutComplete()`.

### Remove auto-opened badge modal on completion (BUG-5)

With the persistent button now covering the "how do I share" need, auto-popping the badge modal immediately after `markWorkoutComplete()` was redundant — two share affordances competing for attention at once. `markWorkoutComplete()` still pre-generates the badge in the background (via `generateShareImage()`) so it's ready the instant the user taps the button, it just no longer forces the modal open. Same for the backup-nudge flow in `js/storage.js`: dismissing the nudge or completing a backup no longer auto-opens the badge modal either — `dismissBackupNudge()` and the renamed `runBackupFromNudge()` (was `backupThenBadge()`) just close the nudge.

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
- `js/storage.js`
- `CLAUDE.md`
- `docs/architecture.md`
- `eslint.config.mjs`
- `.codacy/tools-configs/eslint.config.mjs`
- `tests/e2e/test_storage.py`

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
