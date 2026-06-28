# SpikeFit Coding Rules

Short, declarative rules organized by risk category. When a rule conflicts with convenience, the rule wins.

---

## Production: Zero Runtime Dependencies

No npm packages in any file that ships to users. No CDN `<script src>` imports in HTML. If a utility is needed (date formatting, debounce), write it as a plain function in the relevant `.js` file. Dev tooling — Playwright Python, vendored QUnit — is always exempt.

## JS Files: Global Scope, No ES Modules

Never use `import` or `export` in any JS file that ships to the browser. ES modules fail over `file://` protocol. Each JS file declares its functions and objects in global scope and is loaded via `<script defer>` in the HTML. Load order of script tags is the dependency graph — a function must be defined before it is called.

When adding a new JS file: add `<script defer src="js/yourfile.js">` to every HTML page that needs it, in the correct order relative to its dependents.

## localStorage: Always Safe-Parse and Safe-Write

Every `localStorage.getItem` call must go through `safeParseJSON(key, fallback)`. Never call `JSON.parse(localStorage.getItem(key))` directly — a single corrupted value throws synchronously and halts the whole script.

Every `localStorage.setItem` call must be wrapped in try/catch. On catch: log to console with a descriptive message, call `showToast()` to inform the user. `saveState()` and `FRESH_SYSTEM.saveLog()` are the canonical patterns — copy them.

## Storage Key Naming

New localStorage keys use the `spikefit_` prefix (e.g., `spikefit_fresh_logs`) for new systems, or match the existing short-name convention (`completedDates`, `workoutLevel`) for core workout state. Every new key must be added to the localStorage key registry in `CLAUDE.md` and `docs/architecture.md`.

## Privacy Absolute

User workout data (`completedDates`, `completedExercises`, `spikefit_fresh_logs`, `workoutLevel`) must never be transmitted to any server the app controls. No fetch or XHR call may include this data. The Cloudflare Worker must never receive or store workout data — it handles auth tokens only. Any future BYOS feature is user-configured; the app never provides or controls the backend. Any new network call (even an asset CDN fallback) must be disclosed in the Privacy modal.

## XSS: No User Data in innerHTML

The app uses `innerHTML` extensively for rendering workout content. Workout data in the `workouts` object is static and hardcoded — it is safe to interpolate. User-controlled data (anything read from localStorage or user input) must never be interpolated into `innerHTML` strings. Use `textContent` or `createElement` / `setAttribute` instead.

## External Links

All `<a target="_blank">` links must include `rel="noopener noreferrer"`. No exceptions. This applies to video links rendered in `renderDaily()`, links in modals, and all HTML files.

## Event Handling

No inline event handlers in HTML (`onclick=`, `onchange=`, `onerror=`, etc.). Use `addEventListener` in JS. Prefer event delegation — attach a single listener to a parent container and use `e.target.closest(selector)` — over individual per-item listeners. Exercise cards use `data-id`; schedule days use `data-index`.

## Security-Sensitive Worker Code

- OTP comparison must use `timingSafeEqual()`, never `===` or `==` — timing attacks on string comparison leak how many characters matched.
- Rate limit keys for verify attempts must include both IP and email: `verify:${ip}:${email}`.
- Session cookie attributes must remain: HttpOnly, Secure, SameSite=Strict.
- The ALLOWLIST gate must remain — the Worker must never send an OTP to an address not on the allowlist.
- If OTP TTL (`OTP_TTL`) or session TTL (`SESSION_TTL`) constants change, update the changelog.

## ACWR / F.R.E.S.H. Data Integrity

- Session load must cap `durationMinutes` at 180 before multiplying.
- The 28-day log prune must run on every write (inside `saveLog()`), not on read.
- The 14-day baseline gate is intentional — do not remove it to show a ratio sooner.
- The readiness modifier formula is `1 + (5 - jointFreshness) / 20`. Any change requires updating `docs/decisions.md` ADR-004.
- `needsRegulation()` returns true for ACWR status `'danger'` OR joint freshness < 5. Both conditions must be preserved.

## CSS

Use CSS custom properties from `base.css` for all colors, shadows, and border-radii — never hardcode hex values or pixel values that duplicate a variable. No new `:root` variable definitions outside of `base.css`. New component styles belong in a new `css/components/filename.css` file, linked in the relevant HTML pages.

## Auto-Leveling Constants

`CONSISTENCY_WINDOW_DAYS = 35` and the `requiredCount = 16` argument to `metConsistentPace()` reflect ACSM training-frequency guidance. Changing either value requires updating `docs/decisions.md` ADR-006 and the README science section.
