"""E2E tests for the core workout lifecycle."""
import json
from datetime import date
from playwright.sync_api import expect


def today():
    return date.today().strftime("%Y-%m-%d")


def test_app_loads(app_page):
    """App shell renders without errors on a clean start."""
    expect(app_page.locator(".splash-screen")).to_be_hidden(timeout=5000)
    expect(app_page.locator("#main-nav")).to_be_visible()


def test_daily_tab_shows_exercises(app_page):
    """Daily tab renders exercise cards after splash clears."""
    expect(app_page.locator(".exercise-card").first).to_be_visible(timeout=5000)


def test_start_workout_enables_exercise_toggle(seeded_page):
    """Clicking Start Workout, confirming the readiness check-in, makes exercise cards interactive."""
    p = seeded_page({"disclaimerAgreed": "true", "storagePreference": "local", "combineSkipped": "true"})
    p.locator("#btn-start-workout").click()
    p.locator("#btn-save-readiness").click()
    card = p.locator(".exercise-card").first
    expect(card).not_to_have_class("locked", timeout=2000)


def test_reset_day_clears_active_workout_state(seeded_page):
    """Reset Today's Progress clears activeWorkoutStart from localStorage."""
    # resetDay() clears exercises from the current day's workout only, so
    # we test the state change that is always reliable: activeWorkoutStart → null.
    p = seeded_page({
        "disclaimerAgreed": "true",
        "storagePreference": "local",
        "combineSkipped": "true",
        "activeWorkoutStart": "2024-01-01T10:00:00.000Z",
    })
    # resetDay() uses window.confirm() — register handler before triggering click
    p.once("dialog", lambda dialog: dialog.accept())
    p.locator("#btn-reset-day").click()
    start = p.evaluate("localStorage.getItem('activeWorkoutStart')")
    assert start is None  # nosemgrep: python.lang.security.audit.assert-used


def test_schedule_tab_renders(seeded_page):
    """Schedule tab shows 7 day entries."""
    p = seeded_page({"disclaimerAgreed": "true", "storagePreference": "local", "combineSkipped": "true"})
    p.locator("button", has_text="Schedule").click()
    days = p.locator("#schedule-content .calendar-day")
    expect(days).to_have_count(7, timeout=3000)


def test_history_tab_renders_calendar(seeded_page):
    """History tab renders a monthly calendar grid."""
    p = seeded_page({"disclaimerAgreed": "true", "storagePreference": "local"})
    p.locator("button", has_text="Calendar").click()
    expect(p.locator(".month-grid")).to_be_visible(timeout=3000)


def test_completed_workout_appears_in_history(seeded_page):
    """A date marked complete in completedDates shows as filled in the calendar."""
    today_str = today()
    p = seeded_page({
        "disclaimerAgreed": "true",
        "storagePreference": "local",
        "completedDates": {today_str: {"completed": True, "level": "beginner"}},
    })
    p.locator("button", has_text="Calendar").click()
    completed_days = p.locator(".month-date.completed, .calendar-day.completed")
    expect(completed_days.first).to_be_visible(timeout=3000)
