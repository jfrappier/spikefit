"""E2E tests for the long-workout duration confirmation prompt.

A forgotten timer inflates a session's duration, which feeds directly into the
F.R.E.S.H. load. When the auto-detected duration is abnormally long, the app should
prompt the user to confirm or correct it before saving; normal-length sessions save
straight through.
"""
import json
from datetime import datetime, timedelta, timezone
from playwright.sync_api import expect

BASE_STATE = {
    "disclaimerAgreed": "0.0.723",
    "storagePreference": "local",
    "combineSkipped": "true",
}

# A handful of ~40-minute prior sessions so the personalized threshold has history.
NORMAL_PRIOR_LOGS = [
    {"timestamp": 0, "session": {"durationMins": d, "rpe": 6, "load": d * 6}}
    for d in (40, 45, 38, 42, 46)
]


def _iso_minutes_ago(minutes: int) -> str:
    return (datetime.now(timezone.utc) - timedelta(minutes=minutes)).isoformat().replace("+00:00", "Z")


def test_long_workout_prompts_and_saves_corrected_duration(seeded_page):
    """A ~3-hour auto-detected duration opens the prompt; correcting it stores the fix."""
    p = seeded_page({
        **BASE_STATE,
        "activeWorkoutStart": _iso_minutes_ago(180),
        "spikefit_fresh_logs": NORMAL_PRIOR_LOGS,
    })

    p.locator("#btn-mark-complete").click()
    expect(p.locator("#fresh-rpe-modal")).to_be_visible(timeout=3000)
    p.locator("#btn-save-rpe").click()

    # Abnormal duration -> long-workout modal appears instead of saving immediately.
    expect(p.locator("#long-workout-modal")).to_be_visible(timeout=3000)

    # Correct the duration and save.
    p.locator("#long-workout-input").fill("45")
    p.locator("#btn-long-workout-save").click()
    expect(p.locator("#long-workout-modal")).to_be_hidden(timeout=3000)

    logs = json.loads(p.evaluate("localStorage.getItem('spikefit_fresh_logs')"))
    assert logs[-1]["session"]["durationMins"] == 45  # nosemgrep: python.lang.security.audit.assert-used


def test_normal_workout_saves_without_prompt(seeded_page):
    """A normal-length session saves straight through with no long-workout prompt."""
    p = seeded_page({
        **BASE_STATE,
        "activeWorkoutStart": _iso_minutes_ago(30),
        "spikefit_fresh_logs": NORMAL_PRIOR_LOGS,
    })

    p.locator("#btn-mark-complete").click()
    expect(p.locator("#fresh-rpe-modal")).to_be_visible(timeout=3000)
    p.locator("#btn-save-rpe").click()

    # No prompt; the session is logged directly with the ~30-min duration.
    expect(p.locator("#long-workout-modal")).to_be_hidden()
    logs = json.loads(p.evaluate("localStorage.getItem('spikefit_fresh_logs')"))
    assert logs[-1]["session"]["durationMins"] <= 75  # nosemgrep: python.lang.security.audit.assert-used
