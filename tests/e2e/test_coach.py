"""
Coach module E2E tests (ADR-014, coach-module-plan.md §10).

coach.js makes real fetch() calls to /coach/api/*, so these tests serve the
repo over real HTTP (http_server_base_url fixture) rather than file:// — a
fetch('/coach/api/config') from a file:// page resolves to a file:// URL that
page.route() does not reliably intercept the way it does over http://.

The Cloudflare Worker itself is never involved — every /coach/api/* call is
mocked with page.route(), same pattern as tests/e2e/test_auth.py mocking
/auth/send and /auth/verify. Camera scanning is exercised through the manual
entry field rather than a fake video device, per the plan's documented
alternative — it drives the exact same code path (processScannedId()) as a
real camera decode.
"""
import json

import pytest
from playwright.sync_api import Page

ONE_TEAM_PICKUP_CONFIG = {
    "teams": [{
        "slug": "tigers",
        "name": "Tigers",
        "features": {"pickup": True, "pickupOverrideAlerts": True},
        "overrideReasons": [
            "Verified by phone with an authorized parent",
            "Written or text note from an authorized parent",
            "Other (note required)"
        ]
    }]
}

NO_FEATURES_CONFIG = {
    "teams": [{"slug": "tigers", "name": "Tigers", "features": {}, "overrideReasons": []}]
}

UNCONFIGURED_TEAM_CONFIG = {
    "teams": [{
        "slug": "millis", "name": "Millis",
        "features": {"pickup": True, "pickupOverrideAlerts": True},
        "overrideReasons": ["Verified by phone with an authorized parent"],
        "configured": False
    }]
}


def _mock_config(page: Page, config: dict):
    page.route("**/coach/api/config", lambda route: route.fulfill(
        status=200, content_type="application/json", body=json.dumps(config)
    ))


def _mock_scan_once(page: Page, result: dict, status: int = 200):
    """Fulfill exactly one /coach/api/pickup/scan call with the given result."""
    state = {"called": False}

    def handler(route):
        state["called"] = True
        route.fulfill(status=status, content_type="application/json", body=json.dumps(result))

    page.route("**/coach/api/pickup/scan", handler)
    return state


@pytest.fixture
def coach_page(page: Page, http_server_base_url):
    """Returns a function that opens coach.html over HTTP with /coach/api/config mocked."""
    def _open(config=ONE_TEAM_PICKUP_CONFIG):
        # No real/fake camera device is configured for this suite, and a
        # headless sandbox never resolves a getUserMedia permission prompt
        # (it just hangs). Stub it to reject immediately, exactly like a
        # denied/unavailable camera would — startScanner() already handles
        # that by showing #camera-denied and falling back to manual entry,
        # which is the path these tests exercise (per the plan's documented
        # camera-testing alternative).
        page.add_init_script("""
            navigator.mediaDevices.getUserMedia = () =>
                Promise.reject(new DOMException('Denied for testing', 'NotAllowedError'));
        """)
        _mock_config(page, config)
        page.goto(f"{http_server_base_url}/coach.html")
        page.wait_for_selector("#view-hub:not(.u-hidden)")
        return page
    return _open


def _open_pickup(page: Page):
    page.locator(".coach-tile").click()
    page.wait_for_selector("#view-pickup:not(.u-hidden)")
    page.wait_for_selector("#camera-denied:not(.u-hidden)")
    # Manual entry lives inside a collapsed <details> (a secondary fallback
    # to the camera in real usage) — expand it before interacting with it.
    page.locator(".coach-manual-entry summary").click()


def _manual_scan(page: Page, card_id: str):
    page.locator("#manual-id-input").fill(card_id)
    page.locator("#manual-submit-btn").click()


# ─── Hub ──────────────────────────────────────────────────────────────────────

def test_hub_shows_pickup_tile_when_enabled(coach_page):
    page = coach_page(ONE_TEAM_PICKUP_CONFIG)
    assert page.locator(".coach-tile", has_text="Pickup").is_visible()
    assert page.locator("#hub-no-features").is_hidden()


def test_hub_hides_disabled_features(coach_page):
    page = coach_page(NO_FEATURES_CONFIG)
    assert page.locator("#hub-no-features").is_visible()
    assert page.locator(".coach-tile").count() == 0


def test_hub_shows_setup_needed_for_an_unconfigured_team_without_opening_scanner(coach_page):
    page = coach_page(UNCONFIGURED_TEAM_CONFIG)
    tile = page.locator(".coach-tile", has_text="Setup Needed")
    assert tile.is_visible()

    tile.click()
    page.wait_for_selector("#coach-toast.show")
    assert "setup needed" in page.locator("#coach-toast-title").inner_text().lower()
    # Clicking an unconfigured tile must never open the camera/scanner view.
    assert page.locator("#view-pickup").is_hidden()


# ─── Pickup: green / red ────────────────────────────────────────────────────

def test_green_scan_shows_success_card(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {
        "status": "green",
        "kid": {"kidId": "K-7F3QX9", "name": "Emma Lee"},
        "adult": {"parentId": "P-2M8KD4", "name": "Sarah Lee"},
        "loggedAt": "2026-09-25T15:00:00.000Z",
        "alreadyOut": None
    })

    _manual_scan(page, "P-2M8KD4")
    _manual_scan(page, "K-7F3QX9")

    card = page.locator(".coach-result-card").first
    page.wait_for_selector(".coach-result-card.status-green")
    assert "Emma Lee" in card.inner_text()
    assert "Sarah Lee" in card.inner_text()
    # Done is never blocked by a green result.
    assert page.locator("#btn-done").is_enabled()


def test_red_scan_shows_rejection_with_no_action_button(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {"status": "red", "reason": "Inactive card"})

    _manual_scan(page, "P-2M8KD4")
    _manual_scan(page, "K-7F3QX9")

    page.wait_for_selector(".coach-result-card.status-red")
    card = page.locator(".coach-result-card").first
    assert "Inactive card" in card.inner_text()
    assert card.locator("button").count() == 0


def test_team_not_configured_scan_shows_admin_contact_message_and_never_queues(coach_page):
    """A 409 team_not_configured is a permanent setup problem, not a
    connectivity blip — it must show a clear message immediately and must
    NOT be queued offline (retrying forever can't fix a missing Sheet ID)."""
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {"error": "team_not_configured"}, status=409)

    _manual_scan(page, "P-2M8KD4")
    _manual_scan(page, "K-7F3QX9")

    page.wait_for_selector(".coach-result-card.status-red")
    card = page.locator(".coach-result-card").first
    card_text = card.inner_text().lower()
    assert "set up" in card_text
    assert "tigers" in card_text  # names the team (helpful for the coach), never a sheetId

    page.wait_for_selector("#coach-toast.show")
    assert "setup needed" in page.locator("#coach-toast-title").inner_text().lower()

    queue = page.evaluate("JSON.parse(localStorage.getItem('spikefit_coach_queue') || '[]')")
    assert queue == []


def test_already_out_warning_banner(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {
        "status": "green",
        "kid": {"kidId": "K-7F3QX9", "name": "Emma Lee"},
        "adult": {"parentId": "P-9TQW1R", "name": "Mike Lee"},
        "loggedAt": "2026-09-25T16:00:00.000Z",
        "alreadyOut": {"at": "2026-09-25T15:00:00.000Z", "adult": "Sarah Lee", "coach": "coach@example.com"}
    })

    _manual_scan(page, "P-9TQW1R")
    _manual_scan(page, "K-7F3QX9")

    page.wait_for_selector(".coach-already-out")
    assert "Sarah Lee" in page.locator(".coach-already-out").inner_text()


# ─── Pickup: yellow confirm / decline ───────────────────────────────────────

def test_yellow_confirm_flow(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {
        "status": "yellow",
        "kid": {"kidId": "K-3H9VBN", "name": "Owen Lee"},
        "adult": {"parentId": "P-9TQW1R", "name": "Mike Lee"},
        "authorizedAdults": ["Sarah Lee"],
        "alreadyOut": None
    })

    _manual_scan(page, "P-9TQW1R")
    _manual_scan(page, "K-3H9VBN")

    page.wait_for_selector(".coach-result-card.status-yellow")
    # A pending yellow blocks Done.
    assert page.locator("#btn-done").is_disabled()

    def handle_confirm(route):
        posted = json.loads(route.request.post_data)
        assert posted["reason"] == "Verified by phone with an authorized parent"
        route.fulfill(status=200, content_type="application/json", body=json.dumps({
            "status": "yellow-override",
            "kid": {"kidId": "K-3H9VBN", "name": "Owen Lee"},
            "adult": {"parentId": "P-9TQW1R", "name": "Mike Lee"},
            "alertSent": True
        }))

    page.route("**/coach/api/pickup/confirm", handle_confirm)

    page.locator(".radio-row", has_text="Verified by phone with an authorized parent").locator("input").check()
    page.locator("button", has_text="Confirm Pickup").click()

    page.locator(".coach-result-card", has_text="override").wait_for()
    assert page.locator("#btn-done").is_enabled()


def test_yellow_confirm_requires_a_reason(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {
        "status": "yellow",
        "kid": {"kidId": "K-3H9VBN", "name": "Owen Lee"},
        "adult": {"parentId": "P-9TQW1R", "name": "Mike Lee"},
        "authorizedAdults": ["Sarah Lee"],
        "alreadyOut": None
    })

    _manual_scan(page, "P-9TQW1R")
    _manual_scan(page, "K-3H9VBN")
    page.wait_for_selector(".coach-result-card.status-yellow")

    confirmed = {"called": False}
    page.route("**/coach/api/pickup/confirm", lambda route: confirmed.update(called=True))

    page.locator("button", has_text="Confirm Pickup").click()
    page.wait_for_selector("#coach-toast.show")
    assert not confirmed["called"]
    assert page.locator("#btn-done").is_disabled()


def test_yellow_decline_does_not_call_confirm_and_unblocks_done(coach_page):
    page = coach_page()
    _open_pickup(page)
    _mock_scan_once(page, {
        "status": "yellow",
        "kid": {"kidId": "K-3H9VBN", "name": "Owen Lee"},
        "adult": {"parentId": "P-9TQW1R", "name": "Mike Lee"},
        "authorizedAdults": ["Sarah Lee"],
        "alreadyOut": None
    })

    _manual_scan(page, "P-9TQW1R")
    _manual_scan(page, "K-3H9VBN")
    page.wait_for_selector(".coach-result-card.status-yellow")

    confirmed = {"called": False}
    page.route("**/coach/api/pickup/confirm", lambda route: confirmed.update(called=True))

    page.locator("button", has_text="Don't Release").click()

    page.wait_for_selector(".coach-result-card.status-red")
    assert "not released" in page.locator(".coach-result-card").first.inner_text()
    assert not confirmed["called"]
    assert page.locator("#btn-done").is_enabled()


# ─── Offline queue + sync ────────────────────────────────────────────────────

def test_scan_failure_queues_offline_and_sync_clears_it(coach_page):
    page = coach_page()
    _open_pickup(page)

    # Simulate the network being unavailable for the scan call.
    page.route("**/coach/api/pickup/scan", lambda route: route.abort())

    _manual_scan(page, "P-2M8KD4")
    _manual_scan(page, "K-7F3QX9")

    page.wait_for_selector(".coach-card-queued")
    assert "UNVERIFIED" in page.locator("#offline-banner").inner_text()
    queue = page.evaluate("JSON.parse(localStorage.getItem('spikefit_coach_queue') || '[]')")
    assert len(queue) == 1
    assert queue[0]["kidId"] == "K-7F3QX9"
    assert queue[0]["offline"] is True

    def handle_sync(route):
        posted = json.loads(route.request.post_data)
        results = [{
            "eventId": evt["eventId"], "status": "green",
            "kid": {"kidId": evt["kidId"], "name": "Emma Lee"},
            "adult": {"parentId": evt["adultId"], "name": "Sarah Lee"}
        } for evt in posted["events"]]
        route.fulfill(status=200, content_type="application/json", body=json.dumps({"results": results}))

    page.route("**/coach/api/pickup/sync", handle_sync)
    page.evaluate("trySync()")
    page.wait_for_function("JSON.parse(localStorage.getItem('spikefit_coach_queue') || '[]').length === 0")

    assert page.locator("#pickup-queue-badge").is_hidden()
    assert page.locator("#offline-banner").is_hidden()


def test_offline_scan_does_not_block_the_re_scan_guard(coach_page):
    """A kid queued offline still counts as resolved for the same-session re-scan guard."""
    page = coach_page()
    _open_pickup(page)
    page.route("**/coach/api/pickup/scan", lambda route: route.abort())

    _manual_scan(page, "P-2M8KD4")
    _manual_scan(page, "K-7F3QX9")
    page.wait_for_selector(".coach-card-queued")

    _manual_scan(page, "K-7F3QX9")
    page.wait_for_selector("#coach-toast.show")
    # .toast-title is text-transform: uppercase — compare case-insensitively.
    assert "already scanned" in page.locator("#coach-toast-title").inner_text().lower()
    # Still only one queued event — the re-scan never called /scan again.
    queue = page.evaluate("JSON.parse(localStorage.getItem('spikefit_coach_queue') || '[]')")
    assert len(queue) == 1
