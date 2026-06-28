# SpikeFit Tests

Two-layer test suite. Neither layer requires Node.js or npm.

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

## Layer 2: E2E Tests (Playwright Python)

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

### How tests seed state

Tests use Playwright's `page.add_init_script()` to inject localStorage values before any app JavaScript runs. This lets tests start from a known state without clicking through the UI to create it. The `conftest.py` fixtures handle this — see `seeded_page` for a parameterized version.

### Auth tests

Auth tests mock the `/auth/send` and `/auth/verify` network calls using `page.route()`. The Cloudflare Worker does not need to be deployed to run them.

### No build step

Tests run against the HTML files directly from disk using `file://` paths. The Playwright config sets this up automatically — no local server required.
