"""E2E tests for the OTP authentication UI flow.

Auth tests mock /auth/send and /auth/verify — the Cloudflare Worker
does not need to be deployed. Tests run against auth.html directly.
"""
import json
from pathlib import Path
from playwright.sync_api import Page, expect

REPO_ROOT = Path(__file__).parent.parent.parent
AUTH_URL = f"file://{REPO_ROOT / 'auth.html'}"


def test_email_step_is_shown_on_load(auth_page):
    """The email input step is visible when auth.html loads."""
    expect(auth_page.locator("#step-email")).to_be_visible()
    expect(auth_page.locator("#step-otp")).to_be_hidden()


def test_invalid_email_shows_error_without_network_call(page: Page):
    """An invalid email format shows an inline error and makes no network request."""
    requests_made = []
    page.on("request", lambda req: requests_made.append(req.url))
    page.goto(AUTH_URL)

    page.locator("#email").fill("not-an-email")
    page.locator("button[type=submit], button:has-text('Send Code')").click()

    error = page.locator(".error, [id*='error'], [class*='error']")
    expect(error.first).to_be_visible(timeout=2000)
    assert not any("/auth/send" in url for url in requests_made), (
        "No network request should be made for an invalid email"
    )


def test_valid_email_transitions_to_otp_step(auth_page):
    """A valid email submission shows the OTP entry step."""
    auth_page.locator("#email").fill("test@example.com")
    auth_page.locator("button[type=submit], button:has-text('Send Code')").click()
    expect(auth_page.locator("#step-otp")).to_be_visible(timeout=3000)


def test_go_back_returns_to_email_step(auth_page):
    """Clicking back from the OTP step returns to the email step."""
    auth_page.locator("#email").fill("test@example.com")
    auth_page.locator("button[type=submit], button:has-text('Send Code')").click()
    expect(auth_page.locator("#step-otp")).to_be_visible(timeout=3000)

    auth_page.locator("button:has-text('Back'), [onclick*='goBack']").click()
    expect(auth_page.locator("#step-email")).to_be_visible(timeout=2000)


def test_five_failed_otp_attempts_shows_lockout(page: Page):
    """After 5 failed OTP verify attempts, a lockout message appears."""
    attempt_count = {"n": 0}

    def handle_verify(route):
        attempt_count["n"] += 1
        route.fulfill(status=401, content_type="application/json", body=json.dumps({"ok": False, "error": "Invalid code"}))

    page.route("**/auth/send", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps({"ok": True})))
    page.route("**/auth/verify", handle_verify)
    page.goto(AUTH_URL)

    page.locator("#email").fill("test@example.com")
    page.locator("button[type=submit], button:has-text('Send Code')").click()
    expect(page.locator("#step-otp")).to_be_visible(timeout=3000)

    for _ in range(5):
        page.locator("#otp, input[name='otp'], input[type='text']").first.fill("000000")
        page.locator("button[type=submit]:visible, button:has-text('Verify'):visible").click()

    lockout = page.locator("text=/too many|locked|limit/i")
    expect(lockout.first).to_be_visible(timeout=3000)
