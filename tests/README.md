# SpikeFit Tests

Three-layer test suite. None of the layers require npm (Layer 3 needs Node.js itself, but zero packages — see below).

---

## Layer 1: Unit Tests (QUnit, zero install)

Open `tests/unit/run.html` in any browser. Tests run immediately — no command line, no server needed.

**What's covered:** Pure functions extracted from `app.js` — ACWR calculation logic, workout key naming, exercise key date-scoping, `safeParseJSON` fallback behavior.

**To add a test:** Edit `tests/unit/acwr.test.js` or `tests/unit/workout-keys.test.js`. QUnit syntax:

```js
QUnit.test('description of what you are testing', function(assert) {
    assert.equal(actualValue, expectedValue, 'failure message');
    assert.ok(condition, 'failure message');
    assert.deepEqual(actualObject, expectedObject, 'failure message');
});
```

**QUnit files:** `tests/unit/qunit/qunit.js` and `qunit.css` are vendored copies from [qunitjs.com](https://qunitjs.com). Update them by downloading new versions from the QUnit releases page — no package manager needed.

---

## Layer 2: Worker Unit Tests (`node --test`, zero install beyond Node itself)

```bash
node --test tests/worker/
```

**What's covered:** Pure functions extracted from `cloudflare/worker.js` for the coach module (ADR-014) — `decidePickup()` (every green/yellow/red case), roster parsing rules, ID/UUID validation, team resolution, the feature-flag reader, and the Sheets append request builder (rejects any `valueInputOption` other than `RAW`). Nothing that needs live KV/Sheets/Resend — those are exercised through the Playwright coach e2e suite (mocked) and manual QA instead.

Uses only Node's built-in `node:test`/`node:assert`/`node:crypto` — no npm install. `cloudflare/package.json` and `tests/worker/package.json` each declare `"type":"module"` (nothing else) so `worker.js`'s `export`/`import` syntax resolves correctly under Node; this is scoped to those two directories and has no effect on any browser-shipped file.

**To add a test:** add a `node:test` `test()` case to one of the files in `tests/worker/`, importing the function under test from `../../cloudflare/worker.js` (only functions in that file's final `export { ... }` block are available).

---

## Layer 3: E2E Tests (Playwright Python)

### One-time install

Python is required. macOS ships with Python 3 or install via `brew install python`.

```bash
pip install pytest-playwright
playwright install chromium
```

### Running tests

From the repo root:

```bash
pytest tests/e2e/
```

Run a single file:

```bash
pytest tests/e2e/test_workout_flow.py
```

Run with visible browser (useful for debugging):

```bash
pytest tests/e2e/ --headed
```

### What's covered

| File | Scenarios |
|---|---|
| `test_workout_flow.py` | Start workout, check exercises, RPE modal, badge, reset day, mid-workout day switch |
| `test_localstorage_safety.py` | Corrupted JSON, date-scoped key isolation across two dates |
| `test_auth.py` | OTP UI steps, invalid email, attempt lockout, redirect on success |
| `test_coach.py` | Coach module (ADR-014): hub tile visibility, green/red/yellow (confirm + decline) pickup results, the already-out banner, the offline queue and sync, the offline re-scan guard |

### How tests seed state

Tests use Playwright's `page.add_init_script()` to inject localStorage values before any app JavaScript runs. This lets tests start from a known state without clicking through the UI to create it. The `conftest.py` fixtures handle this — see `seeded_page` for a parameterized version.

### Auth tests

Auth tests mock the `/auth/send` and `/auth/verify` network calls using `page.route()`. The Cloudflare Worker does not need to be deployed to run them.

### No build step

Most tests run against the HTML files directly from disk using `file://` paths — no local server required. The exception is `test_coach.py`: `coach.js` makes real `fetch()` calls to `/coach/api/*`, and those don't resolve the way `page.route()` expects them to against a `file://` origin. `conftest.py`'s `http_server_base_url` fixture spins up a plain `http.server.ThreadingHTTPServer` on an OS-assigned free port, scoped to the whole test session, serving the repo root — still no build step, just a different transport.
