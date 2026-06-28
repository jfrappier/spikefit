import json
from pathlib import Path
import pytest
from playwright.sync_api import Page

REPO_ROOT = Path(__file__).parent.parent.parent
APP_URL = f"file://{REPO_ROOT / 'app.html'}"
AUTH_URL = f"file://{REPO_ROOT / 'auth.html'}"


@pytest.fixture
def app_page(page: Page):
    """Open app.html with no pre-seeded state (clean localStorage)."""
    page.goto(APP_URL)
    return page


@pytest.fixture
def seeded_page(page: Page):
    """Factory fixture: returns a function that seeds localStorage and opens the app.

    Usage:
        def test_example(seeded_page):
            p = seeded_page({"workoutLevel": "intermediate"})
            # p is the Page with state already injected
    """
    def _seed(state: dict) -> Page:
        page.add_init_script(f"""
            const state = {json.dumps(state)};
            for (const [key, value] of Object.entries(state)) {{
                localStorage.setItem(key, typeof value === 'string' ? value : JSON.stringify(value));
            }}
        """)
        page.goto(APP_URL)
        return page

    return _seed


@pytest.fixture
def auth_page(page: Page):
    """Open auth.html with mocked /auth/send and /auth/verify endpoints."""
    page.route("**/auth/send", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"ok": True})
    ))
    page.route("**/auth/verify", lambda route: route.fulfill(
        status=200,
        content_type="application/json",
        body=json.dumps({"ok": True})
    ))
    page.goto(AUTH_URL)
    return page
