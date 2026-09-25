import functools
import http.server
import json
import threading
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
    """
    Factory fixture: returns a function that seeds localStorage and opens the app.

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


@pytest.fixture(scope="session")
def http_server_base_url():
    """
    Serve the repo root over real HTTP for tests that can't use file:// —
    coach.html's fetch() calls to /coach/api/* would resolve against a
    file:// origin instead of hitting page.route() mocks the way they do
    against an http:// origin. See tests/e2e/test_coach.py.
    """
    handler = functools.partial(http.server.SimpleHTTPRequestHandler, directory=str(REPO_ROOT))
    # Bind to port 0 (OS-assigned free port) directly on the server itself,
    # rather than probing with a separate socket first, to avoid a race
    # where something else grabs the port in between.
    server = http.server.ThreadingHTTPServer(("127.0.0.1", 0), handler)
    port = server.server_address[1]
    thread = threading.Thread(target=server.serve_forever, daemon=True)
    thread.start()
    try:
        yield f"http://127.0.0.1:{port}"
    finally:
        server.shutdown()
        server.server_close()
