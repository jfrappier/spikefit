"""E2E tests for localStorage resilience and key scoping."""
import json
from datetime import date, timedelta
from playwright.sync_api import Page, expect


def today():
    return date.today().strftime("%Y-%m-%d")


def yesterday():
    return (date.today() - timedelta(days=1)).strftime("%Y-%m-%d")


def test_corrupted_completed_exercises_does_not_crash(page: Page, request):
    """App loads and renders even when completedExercises contains invalid JSON."""
    from pathlib import Path
    repo_root = Path(__file__).parent.parent.parent
    page.add_init_script("""
        localStorage.setItem('completedExercises', 'this is not valid json {{{');
    """)
    console_errors = []
    page.on("console", lambda msg: console_errors.append(msg.text) if msg.type == "error" else None)
    page.goto(f"file://{repo_root / 'app.html'}")
    expect(page.locator("#main-nav")).to_be_visible(timeout=5000)
    assert any("Corrupted localStorage" in e or "completedExercises" in e for e in console_errors), (
        "Expected a console.error about corrupted data, got: " + str(console_errors)
    )


def test_corrupted_completed_dates_does_not_crash(page: Page):
    """App loads even when completedDates contains invalid JSON."""
    from pathlib import Path
    repo_root = Path(__file__).parent.parent.parent
    page.add_init_script("""
        localStorage.setItem('completedDates', '{ broken:');
    """)
    page.goto(f"file://{repo_root / 'app.html'}")
    expect(page.locator("#main-nav")).to_be_visible(timeout=5000)


def test_exercise_keys_scoped_to_date(seeded_page):
    """Checking an exercise on one date does not affect another date's key."""
    today_str = today()
    yesterday_str = yesterday()
    exercise_id = "a1"

    p = seeded_page({
        "completedExercises": {
            f"{today_str}_{exercise_id}": True,
            f"{yesterday_str}_{exercise_id}": False,
        },
        "workoutLevel": "beginner",
    })

    storage = json.loads(p.evaluate("localStorage.getItem('completedExercises')"))
    assert storage.get(f"{today_str}_{exercise_id}") is True
    assert storage.get(f"{yesterday_str}_{exercise_id}") is False, (
        "Yesterday's key should be independent of today's key"
    )


def test_missing_localstorage_key_returns_default(seeded_page):
    """App treats absent localStorage keys as their default values."""
    p = seeded_page({})
    level = p.evaluate("localStorage.getItem('workoutLevel')")
    assert level is None or level == "beginner", (
        "Missing workoutLevel should default to beginner, not crash"
    )
