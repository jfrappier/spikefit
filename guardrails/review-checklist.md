# SpikeFit PR Review Checklist

Open this file during review. Check every applicable box before approving.

---

## General

- [ ] No new npm packages in any browser-shipped file
- [ ] No new CDN `<script src>` or `<link>` imports in HTML
- [ ] No `import` or `export` statements in any browser-shipped JS file
- [ ] Changelog updated if user-facing behavior changed

## Privacy

- [ ] No new fetch/XHR call transmits user workout data (`completedDates`, `completedExercises`, `spikefit_fresh_logs`, `workoutLevel`, or any other user-generated data)
- [ ] Any new external network call (asset CDN fallback, etc.) is disclosed in the Privacy modal
- [ ] If a BYOS storage call is added: it only fires when the user has explicitly configured a storage backend

## JavaScript File Conventions

- [ ] New JS files use global scope — no `import`/`export`
- [ ] New JS files are loaded via `<script defer>` in the correct order in all relevant HTML files
- [ ] Any new global function or variable name does not collide with existing globals

## localStorage

- [ ] Every new `localStorage.getItem` call goes through `safeParseJSON(key, fallback)`
- [ ] Every new `localStorage.setItem` call is wrapped in try/catch with a `showToast` on failure
- [ ] Any new localStorage key is added to the registry in `CLAUDE.md` and `docs/architecture.md`
- [ ] If an existing key's format or value shape changed: migration impact is documented and backward-compatibility behavior is defined

## Security

- [ ] No new inline event handlers in HTML (`onclick=`, `onerror=`, `onchange=`, etc.)
- [ ] All new `target="_blank"` links include `rel="noopener noreferrer"`
- [ ] No user-controlled data interpolated into `innerHTML`
- [ ] Any change to OTP comparison still uses `timingSafeEqual()`
- [ ] Session cookie attributes (HttpOnly, Secure, SameSite=Strict) not loosened
- [ ] Rate limit key for verify still scopes to `verify:${ip}:${email}`
- [ ] ALLOWLIST check is not bypassed in the OTP send handler

## F.R.E.S.H. / ACWR

- [ ] Session load still caps `durationMinutes` at 180 before multiplying
- [ ] 28-day prune still runs inside `saveLog()` (on write, not on read)
- [ ] 14-day baseline gate not removed
- [ ] `needsRegulation()` still checks both ACWR `'danger'` status AND joint freshness < 5
- [ ] If the ACWR formula or thresholds changed: `docs/decisions.md` ADR-004 is updated

## Auto-Leveling

- [ ] `CONSISTENCY_WINDOW_DAYS` (35) and the 16-workout count not changed without updating ADR-006 and the README science section
- [ ] If `completedDates` entry shape changed: new fields documented in the localStorage key registry

## Workout Database

- [ ] Any new exercises with `impact: 'high'` include an `alt` object
- [ ] New workout keys follow the naming convention: bare letter = Beginner, `+2` = Intermediate, `+3` = Advanced
- [ ] `getWorkoutKey()` is used to derive level-aware keys — no hardcoded suffixes

## Rendering / UI

- [ ] New exercise cards use `data-id` attribute and the existing `#workout-content` delegation handler
- [ ] New schedule days use `data-index` attribute and the existing `#schedule-content` delegation handler
- [ ] New modals have a close button wired with `addEventListener` in JS, not an inline `onclick`
- [ ] Tested in a mobile viewport (375px width) — SpikeFit is mobile-first

## CSS

- [ ] Colors, shadows, and border-radii use CSS variables from `base.css` — no hardcoded hex or duplicate pixel values
- [ ] No new `:root` variable definitions outside of `base.css`
- [ ] New component styles are in a new `css/components/filename.css` file, linked in the relevant HTML pages

## Cloudflare Worker

- [ ] `STATIC_FILES` set updated if new files need to be served through the Worker
- [ ] New routes have explicit auth handling (session check or documented public exemption)
- [ ] ALLOWLIST gate not bypassed in the OTP send handler
- [ ] KV namespace names (`SESSIONS`, `OTPS`, `RATELIMIT`, `ALLOWLIST`) not renamed without updating `wrangler.toml` and architecture docs

---

**When in doubt:** If the change touches `calculateACWR`, `metConsistentPace`, `timingSafeEqual`, `saveState`, `FRESH_SYSTEM`, or the `workouts` database — read the relevant ADR in `docs/decisions.md` before and after making the change.
