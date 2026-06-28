"""E2E tests for the core workout lifecycle."""
import json
from datetime import date
from playwright.sync_api import expect


def today():
    return date.today().strftime("%Y-%m-%d")


def test_app_loads(app_page):
    """App shell renders without errors on a clean start."""
    expect(app_page.locator(".splash-screen")).to_be_hidden(timeout=5000)
    expect(app_page.locator("nav")).to_be_visible()


def test_daily_tab_shows_exercises(app_page):
    """Daily tab renders exercise cards after splash clears."""
    expect(app_page.locator(".exercise-card").first).to_be_visible(timeout=5000)


def test_start_workout_enables_exercise_toggle(app_page):
    """Clicking Start Workout makes exercise cards interactive."""
    app_page.locator("text=Start Workout").click()
    card = app_page.locator(".exercise-card").first
    expect(card).not_to_have_class("locked", timeout=2000)


def test_reset_day_clears_checked_exercises(seeded_page):
    """Reset Today's Progress clears completedExercises for today."""
    today_str = today()
    p = seeded_page({
        "workoutLevel": "beginner",
        "activeWorkoutStart": "2024-01-01T10:00:00.000Z",
        "completedExercises": {f"{today_str}_a1": True, f"{today_str}_a2": True},
    })
    p.locator("text=Reset Today's Progress").click()
    p.locator("text=Confirm").click()
    storage = json.loads(p.evaluate("localStorage.getItem('completedExercises') || '{}'"))
    for key in storage:
        if key.startswith(today_str):
            assert not storage[key], f"Exercise {key} should be unchecked after reset"


def test_schedule_tab_renders(app_page):
    """Schedule tab shows 7 day entries."""
    app_page.locator("button", has_text="Schedule").click()
    days = app_page.locator("#schedule-content .schedule-day")
    expect(days).to_have_count(7, timeout=3000)


def test_history_tab_renders_calendar(app_page):
    """History tab renders a monthly calendar grid."""
    app_page.locator("button", has_text="History").click()
    expect(app_page.locator(".month-grid")).to_be_visible(timeout=3000)


def test_completed_workout_appears_in_history(seeded_page):
    """A date marked complete in completedDates shows as filled in the calendar."""
    today_str = today()
    p = seeded_page({
        "completedDates": {today_str: {"completed": True, "level": "beginner"}},
    })
    p.locator("button", has_text="History").click()
    completed_days = p.locator(".month-date.completed, .calendar-day.completed")
    expect(completed_days.first).to_be_visible(timeout=3000)
