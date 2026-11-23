"""
Parent / family view E2E tests (ADR-016).

parent.js only ever calls /events/api/*, so the page is served over real HTTP
(http_server_base_url fixture) with every API call mocked via page.route(),
like test_events.py. The Worker's own logic (provisioning, the parent-chosen
name, the /parent gate) is covered by tests/worker/events.test.js.
"""
import json

import pytest
from playwright.sync_api import Page, expect

EVENT_ID = "11111111-1111-4111-8111-111111111111"
EVENT2_ID = "33333333-3333-4333-8333-333333333333"
LINKED_ID = "22222222-2222-4222-8222-222222222222"
MANAGED_ID = "55555555-5555-4555-8555-555555555555"


def _event(**over):
    base = {
        "id": EVENT_ID, "type": "game", "title": "Home game", "date": "2030-06-15",
        "time": "18:00", "endTime": "20:00", "location": "Lincoln HS", "notes": "",
        "canceled": False, "ended": False,
        "counts": {"yes": 3, "maybe": 1, "no": 0}, "mine": None,
        "kidAnswers": [
            {"memberId": LINKED_ID, "name": "Alex M.", "response": "maybe", "by": "self"},
        ],
    }
    base.update(over)
    return base


def _list(events=None, *, has_name=True, kids=None):
    return {
        "team": "millis", "teamName": "Millis", "tz": "America/New_York", "types": [],
        "isCoach": False, "me": {"hasName": has_name, "name": "Pat M." if has_name else ""},
        "kids": kids if kids is not None else [
            {"memberId": LINKED_ID, "name": "Alex M.", "linked": True, "parentNamed": False},
        ],
        "events": events if events is not None else [_event()],
    }


class Api:
    def __init__(self, page: Page, listing, *, list_status=200, replies=None):
        self.listing = listing
        self.list_status = list_status
        self.replies = replies or {}
        self.posts = []
        page.route("**/events/api/list*", self._list)
        for name in ("rsvp", "profile", "kids"):
            page.route(f"**/events/api/{name}", self._handler(name))

    def _handler(self, name):
        # A closure, not a lambda default: Playwright passes a second argument
        # (the request) to any handler that declares two parameters.
        return lambda route: self._post(route, name)

    def _list(self, route):
        route.fulfill(status=self.list_status, content_type="application/json", body=json.dumps(self.listing))

    def _post(self, route, name):
        body = json.loads(route.request.post_data or "{}")
        self.posts.append((name, body))
        reply = self.replies.get((name, body.get("action")), {"ok": True})
        route.fulfill(status=200, content_type="application/json", body=json.dumps(reply))

    def posted(self, name):
        return [b for n, b in self.posts if n == name]


def _wait_for_post(page: Page, api: Api, name: str, count: int = 1):
    for _ in range(100):
        if len(api.posted(name)) >= count:
            return
        page.wait_for_timeout(50)
    raise AssertionError(f"expected {count} POST(s) to {name}, saw {api.posted(name)}")


@pytest.fixture
def open_parent(page: Page, http_server_base_url):
    def _open(listing, *, list_status=200, replies=None):
        api = Api(page, listing, list_status=list_status, replies=replies)
        page.goto(f"{http_server_base_url}/parent.html")
        page.wait_for_selector("#view-loading", state="hidden")
        return api
    return _open


def test_shows_each_person_with_their_events_and_current_answer(page, open_parent):
    open_parent(_list(events=[_event(mine={"response": "yes", "by": "self"})]))
    people = page.locator(".pa-person")
    assert people.count() == 2  # me + the linked player
    assert "Pat M. (you)" in people.nth(0).text_content()
    assert "Alex M." in people.nth(1).text_content()
    assert "has their own login" in people.nth(1).text_content()
    assert "Home game" in people.nth(1).text_content()
    # My answer is Going; the player's is Maybe.
    assert people.nth(0).locator(".ev-sel-yes").count() == 1
    assert people.nth(1).locator(".ev-sel-maybe").count() == 1


def test_parent_answers_for_themselves_and_for_the_player(page, open_parent):
    api = open_parent(_list())
    people = page.locator(".pa-person")

    people.nth(0).get_by_role("button", name="Going").click()
    _wait_for_post(page, api, "rsvp", 1)
    assert api.posted("rsvp")[0] == {"eventId": EVENT_ID, "response": "yes"}  # no memberId = me

    page.locator(".pa-person").nth(1).get_by_role("button", name="Can't go").click()
    _wait_for_post(page, api, "rsvp", 2)
    assert api.posted("rsvp")[1] == {"eventId": EVENT_ID, "response": "no", "memberId": LINKED_ID}
    # The page reflects both answers without waiting for a reload.
    expect(page.locator(".pa-person").nth(0).locator(".ev-sel-yes")).to_have_count(1)
    expect(page.locator(".pa-person").nth(1).locator(".ev-sel-no")).to_have_count(1)


def test_parent_chooses_the_name_for_a_linked_player(page, open_parent):
    api = open_parent(_list(), replies={("kids", "rename"): {"ok": True, "name": "Lex M."}})
    player = page.locator(".pa-person").nth(1)
    player.get_by_role("button", name="Edit name").click()
    page.fill("#input-rename", "Lex M.")
    page.get_by_role("button", name="Save").click()
    _wait_for_post(page, api, "kids")
    assert api.posted("kids")[0] == {"action": "rename", "memberId": LINKED_ID, "name": "Lex M."}
    expect(page.locator(".pa-person").nth(1).locator(".pa-person-name")).to_have_text("Lex M.")
    # A parent-chosen name can be undone.
    expect(page.locator(".pa-person").nth(1).get_by_role("button", name="Use their own name")).to_have_count(1)


def test_use_their_own_name_resets_a_parent_chosen_name(page, open_parent):
    kids = [{"memberId": LINKED_ID, "name": "Lex M.", "linked": True, "parentNamed": True}]
    api = open_parent(
        _list(kids=kids, events=[_event(kidAnswers=[{"memberId": LINKED_ID, "name": "Lex M.", "response": None, "by": None}])]),
        replies={("kids", "reset_name"): {"ok": True, "name": "Alex M."}},
    )
    page.locator(".pa-person").nth(1).get_by_role("button", name="Use their own name").click()
    _wait_for_post(page, api, "kids")
    assert api.posted("kids")[0] == {"action": "reset_name", "memberId": LINKED_ID}
    expect(page.locator(".pa-person").nth(1).locator(".pa-person-name")).to_have_text("Alex M.")
    expect(page.locator(".pa-person").nth(1).get_by_role("button", name="Use their own name")).to_have_count(0)


def test_rename_error_is_shown_and_the_old_name_stays(page, open_parent):
    open_parent(_list())
    # The shared mock always answers 200, so swap in a 400 for this route.
    page.unroute("**/events/api/kids")
    page.route("**/events/api/kids", lambda r: r.fulfill(
        status=400, content_type="application/json", body=json.dumps({"error": "bad_name"})))
    page.locator(".pa-person").nth(1).get_by_role("button", name="Edit name").click()
    page.fill("#input-rename", "lex@example.com")
    page.get_by_role("button", name="Save").click()
    page.wait_for_selector("#pa-toast.show")
    assert "no emails or phone numbers" in page.text_content("#pa-toast")
    assert page.locator("#input-rename").count() == 1  # still editing


def test_player_names_and_event_text_are_never_rendered_as_html(page, open_parent):
    nasty = "<img src=x onerror=alert(1)>"
    kids = [{"memberId": LINKED_ID, "name": nasty, "linked": True, "parentNamed": False}]
    open_parent(_list(kids=kids, events=[_event(title=nasty, kidAnswers=[
        {"memberId": LINKED_ID, "name": nasty, "response": None, "by": None}])]))
    assert page.locator(".pa-person img").count() == 0
    assert nasty in page.locator(".pa-person").nth(1).text_content()


def test_empty_state_explains_how_a_player_shows_up_and_lets_a_parent_add_one(page, open_parent):
    api = open_parent(_list(kids=[], events=[_event(kidAnswers=[])]),
                      replies={("kids", "add"): {"ok": True, "memberId": MANAGED_ID, "name": "Sam S."}})
    assert page.locator("#pa-no-players").is_visible()
    page.fill("#input-kid", "Sam S.")
    page.get_by_role("button", name="Add player").click()
    _wait_for_post(page, api, "kids")
    assert api.posted("kids")[0] == {"action": "add", "name": "Sam S."}
    expect(page.locator("#pa-no-players")).to_be_hidden()
    expect(page.locator(".pa-person").nth(1).locator(".pa-person-name")).to_have_text("Sam S.")


def test_parent_without_a_name_is_asked_for_one_and_can_still_answer_for_players(page, open_parent):
    api = open_parent(_list(has_name=False), replies={("profile", None): {"ok": True, "name": "Pat M."}})
    assert page.locator("#pa-me-name").is_visible()
    assert page.locator(".pa-person").count() == 1  # just the player
    page.fill("#input-name", "Pat M.")
    page.locator("#form-name").get_by_role("button", name="Save").click()
    _wait_for_post(page, api, "profile")
    expect(page.locator("#pa-me-name")).to_be_hidden()
    expect(page.locator(".pa-person")).to_have_count(2)


def test_canceled_events_cannot_be_answered(page, open_parent):
    open_parent(_list(events=[_event(canceled=True)]))
    assert page.locator(".pa-person").nth(1).locator(".ev-answer-btn").count() == 0
    assert "Canceled" in page.locator(".pa-person").nth(1).text_content()


def test_two_events_show_under_each_person(page, open_parent):
    second = _event(id=EVENT2_ID, title="Practice", date="2030-06-17",
                    kidAnswers=[{"memberId": LINKED_ID, "name": "Alex M.", "response": None, "by": None}])
    open_parent(_list(events=[_event(), second]))
    assert page.locator(".pa-person").nth(1).locator(".pa-event").count() == 2


def test_unavailable_when_the_team_has_not_enabled_events(page, open_parent):
    open_parent(_list(), list_status=403)
    assert page.locator("#view-unavailable").is_visible()
    assert "isn't enabled" in page.text_content("#unavailable-text")
