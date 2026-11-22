"""
Team events & RSVP E2E tests (ADR-015).

events.js makes real fetch() calls to /events/api/*, so the events page is
served over real HTTP (http_server_base_url fixture) with every API call
mocked via page.route(), exactly like test_coach.py. The Cloudflare Worker is
never involved — its logic is covered by tests/worker/events.test.js.

The app.html banner only runs on a *.spikefit.app hostname, so those tests
point the page at http://millis.spikefit.app and have page.route() serve the
repo's files for that host (Playwright intercepts before DNS, so the fake
host never needs to resolve).
"""
import json
from pathlib import Path
from urllib.parse import urlparse

import pytest
from playwright.sync_api import Page

REPO_ROOT = Path(__file__).resolve().parent.parent.parent

EVENT_ID = "11111111-1111-4111-8111-111111111111"
NEW_EVENT_ID = "44444444-4444-4444-8444-444444444444"
KID_ID = "22222222-2222-4222-8222-222222222222"
TYPES = [
    {"id": "practice", "label": "Practice"},
    {"id": "game", "label": "Game"},
    {"id": "team_dinner", "label": "Team dinner"},
]


def _event(**over):
    base = {
        "id": EVENT_ID, "type": "game", "title": "Home game", "date": "2030-06-15",
        "time": "18:00", "endTime": "20:00", "location": "Lincoln HS", "notes": "Wear white",
        "canceled": False, "ended": False,
        "counts": {"yes": 3, "maybe": 1, "no": 0}, "mine": None, "kidAnswers": [],
    }
    base.update(over)
    return base


def _list(events=None, *, has_name=True, kids=None, is_coach=False):
    return {
        "team": "millis", "teamName": "Millis", "tz": "America/New_York", "types": TYPES,
        "isCoach": is_coach, "me": {"hasName": has_name, "name": "Pat P." if has_name else ""},
        "kids": kids or [], "events": events if events is not None else [_event()],
    }


class Api:
    """Stateful stand-in for /events/api/*: records POST bodies, serves a mutable list."""

    def __init__(self, page: Page, listing, *, list_status=200):
        self.listing = listing
        self.list_status = list_status
        self.posts = []          # [(path, body)]
        self.list_urls = []
        page.route("**/events/api/list*", self._list)
        page.route("**/events/api/rsvp", lambda r: self._post(r, "rsvp"))
        page.route("**/events/api/profile", lambda r: self._post(r, "profile"))
        page.route("**/events/api/kids", lambda r: self._post(r, "kids"))
        page.route("**/events/api/event/save", lambda r: self._post(r, "event/save"))
        page.route("**/events/api/event/delete", lambda r: self._post(r, "event/delete"))
        page.route("**/events/api/forget", lambda r: self._post(r, "forget"))

    def _list(self, route):
        self.list_urls.append(route.request.url)
        route.fulfill(status=self.list_status, content_type="application/json", body=json.dumps(self.listing))

    def _post(self, route, name):
        body = json.loads(route.request.post_data or "{}")
        self.posts.append((name, body))
        reply = {"ok": True, "memberId": KID_ID}
        if name == "event/save":
            reply = {"ok": True, "id": body.get("event", {}).get("id", NEW_EVENT_ID)}
        route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))

    def posted(self, name):
        return [b for n, b in self.posts if n == name]


def _wait_for_post(page: Page, api: Api, name: str, count: int = 1):
    """Block until the mocked API has recorded `count` POSTs to `name`."""
    for _ in range(100):
        if len(api.posted(name)) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"expected {count} POST(s) to {name}, saw {api.posted(name)}")


@pytest.fixture
def open_events(page: Page, http_server_base_url):
    def _open(listing, *, query="", list_status=200):
        api = Api(page, listing, list_status=list_status)
        page.goto(f"{http_server_base_url}/events.html{query}")
        page.wait_for_selector("#view-loading", state="hidden")
        return api
    return _open


# ─── Player ───────────────────────────────────────────────────────────────────

def test_player_sees_event_details_and_going_count(page, open_events):
    open_events(_list())
    card = page.locator(".ev-card")
    assert card.count() == 1
    text = card.text_content()
    assert "Home game" in text and "Sat Jun 15" in text and "6:00 PM" in text and "Lincoln HS" in text
    assert "3 going" in text and "1 maybe" in text
    assert page.locator("#ev-coach-bar").is_hidden()


def test_player_answer_is_posted_and_reflected(page, open_events):
    api = open_events(_list())
    api.listing = _list([_event(mine={"response": "yes", "by": "self"})])  # what the server returns after
    page.locator(".ev-answer-btn", has_text="Going").click()
    page.wait_for_selector(".ev-answer-btn.ev-sel-yes")
    assert api.posted("rsvp") == [{"eventId": EVENT_ID, "response": "yes"}]


def test_player_without_a_name_is_prompted_and_saves_it(page, open_events):
    api = open_events(_list(has_name=False))
    assert page.locator("#ev-name-card").is_visible()
    assert page.locator(".ev-answer-btn").count() == 0   # can't answer until named
    page.locator("#input-name").fill("Alex M.")
    page.locator("#form-name button[type=submit]").click()
    _wait_for_post(page, api, "profile")
    assert api.posted("profile") == [{"name": "Alex M."}]


def test_player_never_sees_attendee_names(page, open_events):
    open_events(_list())
    assert page.locator(".ev-attendees").count() == 0


def test_canceled_and_ended_events_have_no_answer_buttons(page, open_events):
    open_events(_list([_event(canceled=True), _event(id="33333333-3333-4333-8333-333333333333", ended=True)]))
    assert page.locator(".ev-badge-canceled").is_visible()
    assert page.locator(".ev-badge-ended").is_visible()
    assert page.locator(".ev-answer-btn").count() == 0


def test_unavailable_when_the_worker_says_events_are_off(page, open_events):
    open_events({}, list_status=403)
    assert page.locator("#view-unavailable").is_visible()
    assert page.locator("#view-main").is_hidden()


# ─── Parent ───────────────────────────────────────────────────────────────────

def test_parent_answers_for_their_player(page, open_events):
    kids = [{"memberId": KID_ID, "name": "Sam S.", "linked": False}]
    kid_answers = [{"memberId": KID_ID, "name": "Sam S.", "response": None, "by": None}]
    api = open_events(_list([_event(kidAnswers=kid_answers)], has_name=False, kids=kids))
    assert "Sam S." in page.locator(".ev-answer-who").first.text_content()
    page.locator(".ev-answer-row .ev-answer-btn", has_text="Going").first.click()
    _wait_for_post(page, api, "rsvp")
    assert api.posted("rsvp") == [{"eventId": EVENT_ID, "response": "yes", "memberId": KID_ID}]


def test_parent_can_add_and_remove_a_player(page, open_events):
    api = open_events(_list(kids=[{"memberId": KID_ID, "name": "Sam S.", "linked": False}]))
    page.locator("#input-kid").fill("Jo J.")
    page.locator("#form-kid button[type=submit]").click()
    _wait_for_post(page, api, "kids", 1)
    page.once("dialog", lambda d: d.accept())
    page.locator("#ev-kids-list .ev-link-btn", has_text="Remove").click()
    _wait_for_post(page, api, "kids", 2)
    assert api.posted("kids") == [
        {"action": "add", "name": "Jo J."},
        {"action": "remove", "memberId": KID_ID},
    ]


# ─── Coach ────────────────────────────────────────────────────────────────────

def test_coach_sees_controls_and_attendee_names(page, open_events):
    attendees = [
        {"memberId": "a" * 32, "name": "Alex M.", "response": "yes", "by": "self"},
        {"memberId": KID_ID, "name": "Sam S.", "response": "no", "by": "guardian"},
    ]
    open_events(_list([_event(attendees=attendees)], is_coach=True))
    assert page.locator("#ev-coach-bar").is_visible()
    page.locator(".ev-attendees summary").click()
    text = page.locator(".ev-attendees").text_content()
    assert "Alex M." in text and "Sam S. (by parent)" in text


def test_coach_creates_an_event(page, open_events):
    api = open_events(_list([], is_coach=True))
    page.locator("#btn-new-event").click()
    page.wait_for_selector("#view-editor:not(.u-hidden)")
    page.locator("#ev-type").select_option("practice")
    page.locator("#ev-title").fill("Tuesday practice")
    page.locator("#ev-date").fill("2030-07-02")
    page.locator("#ev-time").fill("17:30")
    page.locator("#ev-location").fill("Main gym")
    page.locator("#btn-save-event").click()
    page.wait_for_selector("#view-main:not(.u-hidden)")
    (body,) = api.posted("event/save")
    assert body["event"] == {
        "type": "practice", "title": "Tuesday practice", "date": "2030-07-02", "time": "17:30",
        "endTime": "", "location": "Main gym", "notes": "",
    }


def test_coach_duplicate_prefills_one_week_later(page, open_events):
    open_events(_list(is_coach=True))
    page.locator(".ev-link-btn", has_text="Duplicate").click()
    page.wait_for_selector("#view-editor:not(.u-hidden)")
    assert page.locator("#ev-title").input_value() == "Home game"
    assert page.locator("#ev-date").input_value() == "2030-06-22"
    assert page.locator("#editor-title").text_content() == "New event"


def test_coach_cancel_event_sends_canceled_flag(page, open_events):
    api = open_events(_list(is_coach=True))
    page.once("dialog", lambda d: d.accept())
    page.locator(".ev-link-btn", has_text="Cancel event").click()
    _wait_for_post(page, api, "event/save")
    (body,) = api.posted("event/save")
    assert body["event"]["id"] == EVENT_ID and body["event"]["canceled"] is True


def test_share_uses_the_native_share_sheet_with_a_deep_link(page, open_events):
    page.add_init_script("""
        window.__shared = null;
        Object.defineProperty(navigator, 'share', { configurable: true, value: async d => { window.__shared = d; } });
    """)
    open_events(_list(is_coach=True))
    page.locator(".ev-link-btn", has_text="Share").click()
    page.wait_for_function("window.__shared !== null")
    text = page.evaluate("window.__shared.text")
    assert "Home game" in text and "Lincoln HS" in text
    assert f"/events?e={EVENT_ID}" in text


def test_share_falls_back_to_copying_when_there_is_no_share_sheet(page, open_events):
    page.add_init_script("""
        window.__copied = null;
        Object.defineProperty(navigator, 'share', { configurable: true, value: undefined });
        Object.defineProperty(navigator, 'clipboard', { configurable: true, value: { writeText: async t => { window.__copied = t; } } });
    """)
    open_events(_list(is_coach=True))
    page.locator(".ev-link-btn", has_text="Share").click()
    page.wait_for_function("window.__copied !== null")
    assert f"/events?e={EVENT_ID}" in page.evaluate("window.__copied")
    page.wait_for_selector("#ev-toast.show")
    assert "copied" in page.locator("#ev-toast-title").text_content().lower()


def test_coach_edit_sends_the_event_id_and_current_values(page, open_events):
    api = open_events(_list(is_coach=True))
    page.locator(".ev-link-btn", has_text="Edit").click()
    page.wait_for_selector("#view-editor:not(.u-hidden)")
    assert page.locator("#editor-title").text_content() == "Edit event"
    page.locator("#ev-title").fill("Home game (moved)")
    page.locator("#btn-save-event").click()
    _wait_for_post(page, api, "event/save")
    (body,) = api.posted("event/save")
    assert body["event"]["id"] == EVENT_ID and body["event"]["title"] == "Home game (moved)"
    assert body["event"]["canceled"] is False


def test_coach_delete_and_restore(page, open_events):
    api = open_events(_list([_event(canceled=True)], is_coach=True))
    page.once("dialog", lambda d: d.accept())
    page.locator(".ev-link-btn", has_text="Restore").click()
    _wait_for_post(page, api, "event/save")
    assert api.posted("event/save")[0]["event"]["canceled"] is False
    page.once("dialog", lambda d: d.accept())
    page.locator(".ev-link-btn", has_text="Delete").click()
    _wait_for_post(page, api, "event/delete")
    assert api.posted("event/delete") == [{"eventId": EVENT_ID}]


def test_remove_my_data_asks_first_then_posts(page, open_events):
    api = open_events(_list())
    page.once("dialog", lambda d: d.dismiss())
    page.locator("#btn-forget").click()
    page.wait_for_timeout(200)
    assert api.posted("forget") == []
    page.once("dialog", lambda d: d.accept())
    page.locator("#btn-forget").click()
    _wait_for_post(page, api, "forget")


def test_show_past_events_toggle_requests_the_past_list(page, open_events):
    api = open_events(_list())
    page.locator("#btn-toggle-past").click()
    page.wait_for_function("document.getElementById('btn-toggle-past').textContent.includes('Hide')")
    assert any("past=1" in u for u in api.list_urls)


def test_a_failed_answer_shows_a_toast_and_re_enables_the_buttons(page, http_server_base_url):
    api = Api(page, _list())
    page.unroute("**/events/api/rsvp")
    page.route("**/events/api/rsvp", lambda r: r.fulfill(status=409, content_type="application/json", body='{"error":"event_ended"}'))
    page.goto(f"{http_server_base_url}/events.html")
    page.wait_for_selector(".ev-answer-btn")
    page.locator(".ev-answer-btn", has_text="Going").click()
    page.wait_for_selector("#ev-toast.show")
    assert "already ended" in page.locator("#ev-toast-text").text_content()
    assert api is not None


def test_contact_info_as_a_name_shows_the_friendly_error(page, http_server_base_url):
    Api(page, _list(has_name=False))
    page.unroute("**/events/api/profile")
    page.route("**/events/api/profile", lambda r: r.fulfill(status=400, content_type="application/json", body='{"error":"bad_name"}'))
    page.goto(f"{http_server_base_url}/events.html")
    page.locator("#input-name").fill("me@example.com")
    page.locator("#form-name button[type=submit]").click()
    page.wait_for_selector("#ev-toast.show")
    assert "no emails or phone numbers" in page.locator("#ev-toast-text").text_content()


def test_unauthenticated_load_redirects_to_login_keeping_the_deep_link(page, http_server_base_url):
    Api(page, {}, list_status=401)
    page.route("**/auth.html*", lambda r: r.fulfill(status=200, content_type="text/html", body="<title>login</title>"))
    page.goto(f"{http_server_base_url}/events.html?e={EVENT_ID}")
    page.wait_for_url("**/auth.html*")
    assert f"e%3D{EVENT_ID}" in page.url or f"e={EVENT_ID}" in page.url


# ─── Deep link ────────────────────────────────────────────────────────────────

def test_deep_link_highlights_the_event(page, open_events):
    open_events(_list(), query=f"?e={EVENT_ID}")
    page.wait_for_selector(".ev-card.ev-highlight")
    assert page.locator("#ev-deeplink-msg").is_hidden()


def test_deep_link_to_an_unknown_event_says_so_after_checking_past_events(page, open_events):
    api = open_events(_list(), query="?e=99999999-9999-4999-8999-999999999999")
    page.wait_for_selector("#ev-deeplink-msg:not(.u-hidden)")
    assert "no longer available" in page.locator("#ev-deeplink-msg").text_content()
    assert any("past=1" in u for u in api.list_urls)
    assert page.locator(".ev-card.ev-highlight").count() == 0


# ─── Coach hub tile ───────────────────────────────────────────────────────────

def _hub_config(features):
    return {"teams": [{"slug": "tigers", "name": "Tigers", "features": features, "overrideReasons": []}]}


@pytest.mark.parametrize("features,visible", [({"events": True}, True), ({"pickup": True}, False), ({"events": "yes"}, False)])
def test_coach_hub_events_tile_only_when_enabled(page, http_server_base_url, features, visible):
    page.add_init_script("navigator.mediaDevices.getUserMedia = () => Promise.reject(new DOMException('x', 'NotAllowedError'));")
    page.route("**/coach/api/config", lambda r: r.fulfill(status=200, content_type="application/json", body=json.dumps(_hub_config(features))))
    page.goto(f"{http_server_base_url}/coach.html")
    page.wait_for_selector("#view-hub:not(.u-hidden)")
    assert (page.locator(".coach-tile", has_text="Events").count() == 1) is visible


# ─── app.html banner ──────────────────────────────────────────────────────────

TEAM_HOST = "http://millis.spikefit.app"


def _serve_repo(page: Page, origin: str, api_handlers: dict):
    """Serve the repo's files for a fake host; `api_handlers` maps a path to a route handler."""
    def handler(route):
        path = urlparse(route.request.url).path
        if path in api_handlers:
            return api_handlers[path](route)
        local = REPO_ROOT / path.lstrip("/")
        if local.is_file():
            return route.fulfill(path=str(local))
        return route.fulfill(status=404, body="")
    page.route(f"{origin}/**", handler)


def _next(events, *, has_name=True, kid_count=0):
    return {"team": "millis", "teamName": "Millis", "types": TYPES, "hasName": has_name, "kidCount": kid_count, "events": events}


def _banner_event(**over):
    base = {"id": EVENT_ID, "type": "practice", "title": "Tuesday practice", "date": "2030-06-18", "time": "17:30",
            "endTime": "", "location": "Main gym", "notes": "", "canceled": False, "ended": False, "mine": None, "kid": None}
    base.update(over)
    return base


@pytest.fixture
def banner_page(page: Page):
    calls = {"next": [], "other": []}

    def open_banner(payload, *, status=200):
        def next_handler(route):
            calls["next"].append(route.request)
            route.fulfill(status=status, content_type="application/json", body=json.dumps(payload))

        def other_handler(route):
            calls["other"].append(route.request.url)   # the strip must never call anything else
            route.fulfill(status=500, body="")

        # Pre-accept the first-run disclaimer and storage prompts, like the other app tests.
        page.add_init_script("""
            localStorage.setItem('disclaimerAgreed', '0.0.723');
            localStorage.setItem('storagePreference', 'local');
        """)
        _serve_repo(page, TEAM_HOST, {"/events/api/next": next_handler, "/events/api/rsvp": other_handler})
        page.goto(f"{TEAM_HOST}/app.html")
        return calls
    return open_banner


def _next_with_more(events, more):
    payload = _next(events)
    payload["more"] = more
    return payload


def _badge(page):
    return page.locator("#event-banner .event-banner-badge")


def test_banner_is_one_slim_pill_linking_to_the_event(page, banner_page):
    banner_page(_next([_banner_event()]))
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    link = page.locator("#event-banner a.event-banner-link")
    text = link.text_content()
    assert "Tuesday practice" in text and "Jun 18" in text and "5:30 PM" in text
    assert link.get_attribute("href") == f"/events?e={EVENT_ID}"
    assert "click to rsvp" in link.get_attribute("aria-label").lower()
    assert page.locator("#event-banner button").count() == 0
    assert page.locator("#event-banner .event-banner-strip").bounding_box()["height"] < 48   # a pill, not a card


def test_banner_shows_a_weekday_for_an_event_this_week(page, banner_page):
    import datetime
    day = datetime.date.today() + datetime.timedelta(days=2)
    banner_page(_next([_banner_event(date=day.isoformat())]))
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    text = page.locator("#event-banner a.event-banner-link").text_content()
    assert day.strftime("%a") in text and day.strftime("%b") not in text


def test_banner_stays_one_line_on_a_phone_with_a_long_title(page, banner_page):
    page.set_viewport_size({"width": 360, "height": 740})
    banner_page(_next_with_more([_banner_event(title="Annual end of season team dinner and awards night at the lodge")], 2))
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    strip = page.locator("#event-banner .event-banner-strip")
    assert strip.bounding_box()["height"] < 48
    assert page.evaluate("document.documentElement.scrollWidth <= window.innerWidth")
    assert _badge(page).is_visible()                                          # the status circle is never squeezed out
    assert page.locator("#event-banner a.event-banner-seemore").is_visible()  # nor the link to more events


def test_banner_makes_one_bodyless_get_and_nothing_else(page, banner_page):
    calls = banner_page(_next([_banner_event()]))
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    page.wait_for_load_state("networkidle")
    (req,) = calls["next"]
    assert req.method == "GET"
    assert req.post_data is None
    assert urlparse(req.url).query == ""
    assert calls["other"] == []


@pytest.mark.parametrize("mine,css,glyph", [
    (None, "is-none", "?"),
    ("yes", "is-yes", "✓"),
    ("maybe", "is-maybe", "~"),
    ("no", "is-no", "✕"),
])
def test_banner_status_circle_reflects_the_answer(page, banner_page, mine, css, glyph):
    banner_page(_next([_banner_event(mine=mine)]))
    page.wait_for_selector("#event-banner .event-banner-badge")
    badge = _badge(page)
    assert badge.count() == 1
    assert css in badge.get_attribute("class") and badge.text_content() == glyph
    assert "Click to RSVP" not in page.locator("#event-banner a.event-banner-link").text_content()   # no words, just the circle


def test_banner_answered_pill_turns_neutral_and_unanswered_stays_bold(page, banner_page):
    banner_page(_next([_banner_event(mine="yes")]))
    page.wait_for_selector("#event-banner .event-banner-badge")
    assert "is-answered" in page.locator("#event-banner .event-banner-strip").get_attribute("class")


def test_banner_prompts_a_new_player_with_a_question_mark(page, banner_page):
    banner_page(_next([_banner_event()], has_name=False))
    page.wait_for_selector("#event-banner .event-banner-badge")
    assert "is-none" in _badge(page).get_attribute("class")
    assert page.locator("#event-banner a.event-banner-link").get_attribute("href") == f"/events?e={EVENT_ID}"


def test_banner_follows_a_parents_single_player(page, banner_page):
    kid = {"memberId": KID_ID, "name": "Sam S.", "response": None}
    banner_page(_next([_banner_event(kid=kid)], has_name=False, kid_count=1))
    page.wait_for_selector("#event-banner .event-banner-badge")
    assert _badge(page).count() == 1 and "is-none" in _badge(page).get_attribute("class")
    assert "Sam S." in _badge(page).get_attribute("title")


def test_banner_shows_a_circle_for_the_player_and_their_one_kid(page, banner_page):
    kid = {"memberId": KID_ID, "name": "Sam S.", "response": "no"}
    banner_page(_next([_banner_event(mine="yes", kid=kid)], has_name=True, kid_count=1))
    page.wait_for_selector("#event-banner .event-banner-badge")
    assert _badge(page).count() == 2
    assert "is-yes" in _badge(page).nth(0).get_attribute("class")
    assert "is-no" in _badge(page).nth(1).get_attribute("class")
    assert "Sam S.: can't go" in _badge(page).nth(1).get_attribute("title")


def test_banner_asks_a_parent_with_several_players_to_respond(page, banner_page):
    banner_page(_next([_banner_event(mine="yes")], has_name=True, kid_count=2))
    page.wait_for_selector("#event-banner .event-banner-badge")
    assert _badge(page).count() == 1 and "is-none" in _badge(page).get_attribute("class")


def test_banner_marks_a_canceled_event_without_a_circle(page, banner_page):
    banner_page(_next([_banner_event(canceled=True)]))
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    link = page.locator("#event-banner a.event-banner-link")
    assert "Canceled" in link.text_content()
    assert _badge(page).count() == 0
    assert "is-canceled" in page.locator("#event-banner .event-banner-strip").get_attribute("class")


def test_see_more_events_sits_to_the_right_of_the_status_circle_in_the_pill(page, banner_page):
    others = [_banner_event(id=f"{n}{n}{n}{n}{n}{n}{n}{n}-5555-4555-8555-555555555555", title=f"Extra {n}") for n in (6, 7)]
    banner_page(_next_with_more([_banner_event(mine="yes"), *others], 0))
    page.wait_for_selector("#event-banner .event-banner-seemore")
    more = page.locator("#event-banner a.event-banner-seemore")
    assert more.get_attribute("href") == "/events"
    assert "See more events" in more.text_content()
    strip = page.locator("#event-banner .event-banner-strip")
    assert strip.locator("a.event-banner-seemore").count() == 1                 # inside the pill, not under it
    assert more.bounding_box()["x"] > _badge(page).bounding_box()["x"]          # to the right of the circle
    assert abs(more.bounding_box()["y"] - strip.bounding_box()["y"]) < strip.bounding_box()["height"]   # same row
    assert "Tuesday practice" in page.locator("#event-banner a.event-banner-link").text_content()   # soonest is the one shown


def test_see_more_events_counts_ones_the_worker_left_out(page, banner_page):
    banner_page(_next_with_more([_banner_event()], 1))     # e.g. a second event further out than the feed's window
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    assert page.locator("#event-banner a.event-banner-seemore").count() == 1


@pytest.mark.parametrize("payload", [_next_with_more([_banner_event()], 0), _next([_banner_event()])])
def test_no_see_more_events_for_a_single_upcoming_event(page, banner_page, payload):
    banner_page(payload)
    page.wait_for_selector("#event-banner:not(.u-hidden)")
    assert page.locator("#event-banner a.event-banner-seemore").count() == 0


def test_see_more_events_is_shortened_on_a_very_narrow_phone(page, banner_page):
    page.set_viewport_size({"width": 340, "height": 700})
    banner_page(_next_with_more([_banner_event()], 2))
    page.wait_for_selector("#event-banner .event-banner-seemore")
    more = page.locator("#event-banner a.event-banner-seemore")
    assert more.locator(".event-banner-seemore-short").is_visible()
    assert more.locator(".event-banner-seemore-long").is_hidden()


@pytest.mark.parametrize("status,payload", [(403, {"error": "events_unavailable"}), (401, {}), (200, _next([]))])
def test_banner_stays_hidden_when_unavailable_or_empty(page, banner_page, status, payload):
    banner_page(payload, status=status)
    page.wait_for_load_state("networkidle")
    assert page.locator("#event-banner").is_hidden()


def test_banner_makes_no_request_off_a_team_host(page, http_server_base_url):
    requests = []
    page.on("request", lambda r: requests.append(r.url) if "/events/" in r.url else None)
    page.goto(f"{http_server_base_url}/app.html")   # 127.0.0.1 — not a *.spikefit.app host
    page.wait_for_load_state("networkidle")
    assert page.locator("#event-banner").is_hidden()
    assert requests == []


# ─── Stale list (KV list() is eventually consistent) ──────────────────────────
#
# The mocked list endpoint keeps returning the OLD picture, like KV can for up
# to a minute after a write. The page must show the coach's own change anyway.

def _coach_creates_event(page):
    page.locator("#btn-new-event").click()
    page.wait_for_selector("#view-editor:not(.u-hidden)")
    page.locator("#ev-type").select_option("practice")
    page.locator("#ev-title").fill("Tuesday practice")
    page.locator("#ev-date").fill("2030-07-02")
    page.locator("#ev-time").fill("17:30")
    page.locator("#btn-save-event").click()


def test_a_saved_event_shows_immediately_even_if_the_list_is_stale(page, open_events):
    api = open_events(_list([], is_coach=True))
    _coach_creates_event(page)
    page.wait_for_selector(".ev-card")
    assert "Tuesday practice" in page.locator(".ev-card").text_content()
    assert page.locator("#ev-empty").is_hidden()
    assert len(api.list_urls) == 1        # it didn't need to re-read the list to show it


def test_background_recheck_hands_over_to_the_server_once_it_catches_up(page, open_events):
    page.clock.install()
    api = open_events(_list([], is_coach=True))
    _coach_creates_event(page)
    page.wait_for_selector(".ev-card")
    api.listing = _list([_event(id=NEW_EVENT_ID, type="practice", title="Tuesday practice", date="2030-07-02",
                                time="17:30", endTime="", location="", notes="", counts={"yes": 4, "maybe": 0, "no": 0})],
                        is_coach=True)
    page.clock.fast_forward(66_000)
    page.wait_for_function("document.querySelector('.ev-going') && document.querySelector('.ev-going').textContent.startsWith('4 going')")
    assert page.locator(".ev-card").count() == 1      # one card, not a local copy plus the server's
    assert len(api.list_urls) == 2


def test_a_still_stale_list_wins_only_after_the_change_expires(page, open_events):
    page.clock.install()
    api = open_events(_list([], is_coach=True))
    _coach_creates_event(page)
    page.wait_for_selector(".ev-card")
    page.clock.fast_forward(66_000)               # re-check: server still hasn't got it
    for _ in range(100):
        if len(api.list_urls) >= 2:
            break
        page.wait_for_timeout(20)
    assert page.locator(".ev-card").count() == 1  # our change is kept for now
    page.clock.fast_forward(160_000)              # past the expiry
    page.wait_for_selector(".ev-card", state="detached")
    assert page.locator("#ev-empty").is_visible()


def test_a_failed_background_recheck_leaves_the_page_alone(page, open_events):
    page.clock.install()
    api = open_events(_list([], is_coach=True))
    _coach_creates_event(page)
    page.wait_for_selector(".ev-card")
    api.list_status = 500
    page.clock.fast_forward(66_000)
    for _ in range(100):
        if len(api.list_urls) >= 2:
            break
        page.wait_for_timeout(20)
    assert page.locator("#view-unavailable").is_hidden()
    assert page.locator(".ev-card").count() == 1


def test_a_canceled_event_shows_canceled_even_if_the_list_is_stale(page, open_events):
    open_events(_list(is_coach=True))
    page.once("dialog", lambda d: d.accept())
    page.locator(".ev-link-btn", has_text="Cancel event").click()
    page.wait_for_selector(".ev-badge-canceled")
    assert page.locator(".ev-answer-btn").count() == 0


def test_a_deleted_event_disappears_even_if_the_list_is_stale(page, open_events):
    open_events(_list(is_coach=True))
    page.once("dialog", lambda d: d.accept())
    page.locator(".ev-link-btn", has_text="Delete").click()
    page.wait_for_selector(".ev-card", state="detached")
    assert page.locator("#ev-empty").is_visible()


def test_an_answer_shows_immediately_and_moves_the_count(page, open_events):
    open_events(_list([_event(counts={"yes": 3, "maybe": 1, "no": 0})]))
    page.locator(".ev-answer-btn", has_text="Going").click()
    page.wait_for_selector(".ev-answer-btn.ev-sel-yes")
    assert "4 going" in page.locator(".ev-going").text_content()
    page.locator(".ev-answer-btn", has_text="Maybe").click()     # changing it moves the count back
    page.wait_for_selector(".ev-answer-btn.ev-sel-maybe")
    assert "3 going" in page.locator(".ev-going").text_content() and "2 maybe" in page.locator(".ev-going").text_content()


def test_a_coach_sees_their_own_answer_in_the_attendee_list_immediately(page, open_events):
    open_events(_list(is_coach=True))
    page.locator(".ev-answer-btn", has_text="Going").click()
    page.wait_for_selector(".ev-answer-btn.ev-sel-yes")
    page.locator(".ev-attendees summary").click()
    assert "Pat P." in page.locator(".ev-attendees").text_content()


def test_a_just_added_player_can_be_answered_for_right_away(page, open_events):
    api = open_events(_list())
    page.locator("#input-kid").fill("Jo J.")
    page.locator("#form-kid button[type=submit]").click()
    page.wait_for_selector("#ev-kids-list li")
    assert "Jo J." in page.locator("#ev-kids-list").text_content()
    page.locator(".ev-answer-row", has_text="Jo J.").locator(".ev-answer-btn", has_text="Going").click()
    _wait_for_post(page, api, "rsvp")
    assert api.posted("rsvp") == [{"eventId": EVENT_ID, "response": "yes", "memberId": KID_ID}]
    page.wait_for_selector(".ev-answer-row:has-text('Jo J.') .ev-answer-btn.ev-sel-yes")


def test_a_removed_player_disappears_even_if_the_list_is_stale(page, open_events):
    kid = {"memberId": KID_ID, "name": "Sam S.", "linked": False}
    kid_answers = [{"memberId": KID_ID, "name": "Sam S.", "response": None, "by": None}]
    open_events(_list([_event(kidAnswers=kid_answers)], kids=[kid]))
    page.once("dialog", lambda d: d.accept())
    page.locator("#ev-kids-list .ev-link-btn", has_text="Remove").click()
    page.wait_for_selector("#ev-kids-list li", state="detached")
    assert page.locator(".ev-answer-row", has_text="Sam S.").count() == 0
