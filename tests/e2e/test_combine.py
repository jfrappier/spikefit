"""E2E tests for the Combine baseline testing feature."""
import json
import time
from datetime import date
from playwright.sync_api import expect


def today():
    return date.today().strftime("%Y-%m-%d")


def days_ago_ts(n):
    """Return a millisecond timestamp for n days ago."""
    return int((time.time() - n * 86400) * 1000)


def sample_result(ts=None, plank=90, vertical=24):
    return {
        "date": today(),
        "timestamp": ts if ts is not None else int(time.time() * 1000),
        "metrics": {
            "standingReach": 84,
            "jumpTouch": 84 + vertical,
            "vertical": vertical,
            "plankSec": plank,
            "wallSitSec": 75,
            "toeTaps": 50,
            "jumpingJacks": 50,
            "agilitySec": 12.0
        }
    }


def test_fresh_user_sees_disclaimer_before_combine(app_page):
    """Disclaimer appears before combine modal on first load; combine appears only after TOS accepted."""
    p = app_page
    # Splash takes ~3s; disclaimer check fires 600ms after that
    p.wait_for_timeout(4500)
    # Disclaimer must be visible; combine must be hidden
    expect(p.locator("#disclaimer-modal")).to_be_visible(timeout=3000)
    expect(p.locator("#combine-onboard-modal")).to_be_hidden(timeout=1000)
    # Accept the TOS
    p.locator("#btn-accept-disclaimer").click()
    # Now combine modal should appear (afterDisclaimerChecks fires after 500ms)
    expect(p.locator("#combine-onboard-modal")).to_be_visible(timeout=3000)
    expect(p.locator("#disclaimer-modal")).to_be_hidden(timeout=1000)


def test_new_user_sees_onboarding_modal(seeded_page):
    """After disclaimer, onboarding modal appears for a user with no combine data."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)  # splash (3s) + 500ms afterDisclaimerChecks delay
    modal = p.locator("#combine-onboard-modal")
    expect(modal).to_be_visible(timeout=3000)


def test_onboard_go_switches_to_combine_tab(seeded_page):
    """Clicking 'Measure My Baseline' switches to the Combine tab."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    p.locator("#btn-combine-onboard-go").click()
    expect(p.locator("#combine.active")).to_be_visible(timeout=2000)


def test_onboard_later_dismisses_modal(seeded_page):
    """Clicking 'Maybe Later' closes the modal without navigating away."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    p.locator("#btn-combine-onboard-later").click()
    modal = p.locator("#combine-onboard-modal")
    expect(modal).to_be_hidden(timeout=2000)
    # Should still be on the daily tab
    expect(p.locator("#daily.active")).to_be_visible(timeout=2000)


def test_combine_tab_renders_test_cards(seeded_page):
    """Combine tab shows all 7 test input cards."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    p.locator("#btn-combine-onboard-go").click()
    cards = p.locator(".combine-test-card")
    expect(cards).to_have_count(7, timeout=3000)


def test_saving_result_writes_to_localstorage(seeded_page):
    """Entering values and saving writes a combineResults entry."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    # Use onboarding modal to navigate to the Combine tab (mirrors real first-run flow)
    p.locator("#btn-combine-onboard-go").click()

    p.locator("#combine-input-standingReach").fill("84")
    p.locator("#combine-input-jumpTouch").fill("108")
    # plankSec is a hidden input (populated by the Stop timer button); set via JS
    p.evaluate("document.getElementById('combine-input-plankSec').value = '90'")
    p.locator("#btn-save-combine").click()

    results = json.loads(p.evaluate("localStorage.getItem('combineResults') || '[]'"))
    assert len(results) == 1  # nosemgrep: python.lang.security.audit.assert-used
    assert results[0]["metrics"]["standingReach"] == 84  # nosemgrep: python.lang.security.audit.assert-used
    assert results[0]["metrics"]["jumpTouch"] == 108  # nosemgrep: python.lang.security.audit.assert-used
    assert results[0]["metrics"]["vertical"] == 24  # nosemgrep: python.lang.security.audit.assert-used
    assert results[0]["metrics"]["plankSec"] == 90  # nosemgrep: python.lang.security.audit.assert-used


def test_vertical_computed_on_input(seeded_page):
    """Entering reach + touch updates the computed vertical preview."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    p.locator("#btn-combine-onboard-go").click()

    p.locator("#combine-input-standingReach").fill("84")
    p.locator("#combine-input-jumpTouch").fill("108")
    preview = p.locator("#combine-vertical-computed")
    expect(preview).to_contain_text("24", timeout=2000)


def test_summary_shows_baseline_on_second_attempt(seeded_page):
    """After two attempts, summary shows delta vs. baseline."""
    baseline = sample_result(ts=days_ago_ts(10), plank=60, vertical=20)
    p = seeded_page({
        "disclaimerAgreed": "true",
        "combineResults": [baseline]
    })
    p.wait_for_timeout(4000)
    # Existing combine data means no onboarding modal; nav to Combine tab directly
    p.locator("button[data-tab='combine']").click()

    # Enter a better result
    p.locator("#combine-input-standingReach").fill("84")
    p.locator("#combine-input-jumpTouch").fill("109")  # vertical = 25
    # plankSec is a hidden input (timer); set via JS
    p.evaluate("document.getElementById('combine-input-plankSec').value = '90'")
    p.locator("#btn-save-combine").click()

    # Summary should now show delta for plank (+30)
    summary = p.locator("#combine-summary")
    expect(summary).to_contain_text("+30", timeout=3000)


def test_existing_combine_data_suppresses_onboard_modal(seeded_page):
    """A user with prior combine data does NOT see the onboarding modal."""
    existing = sample_result()
    p = seeded_page({
        "disclaimerAgreed": "true",
        "combineResults": [existing]
    })
    p.wait_for_timeout(4000)
    modal = p.locator("#combine-onboard-modal")
    expect(modal).to_be_hidden(timeout=3000)


def test_retest_toast_after_28_days(seeded_page):
    """A user with a >28-day-old result sees the retest toast."""
    old_result = sample_result(ts=days_ago_ts(30))
    p = seeded_page({
        "disclaimerAgreed": "true",
        "combineResults": [old_result]
    })
    p.wait_for_timeout(5000)
    # Toast with 'show' class means it's visible
    expect(p.locator("#app-toast.show")).to_be_visible(timeout=4000)
    expect(p.locator("#app-toast")).to_contain_text("Combine", timeout=2000)


def test_dont_ask_again_suppresses_modal_permanently(seeded_page):
    """Clicking 'Don't ask again' sets combineSkipped and permanently suppresses the modal."""
    p = seeded_page({"disclaimerAgreed": "true"})
    p.wait_for_timeout(4000)
    # Click "Don't ask again" — should write combineSkipped to localStorage
    p.locator("#btn-combine-onboard-skip").click()
    skipped = p.evaluate("localStorage.getItem('combineSkipped')")
    assert skipped == 'true'  # nosemgrep: python.lang.security.audit.assert-used
    # Reload — modal must not appear even in a fresh session
    p.reload()
    p.wait_for_timeout(4000)
    expect(p.locator("#combine-onboard-modal")).to_be_hidden(timeout=3000)


def test_no_retest_toast_within_28_days(seeded_page):
    """A user with a recent result does NOT see the retest toast on load."""
    recent_result = sample_result(ts=days_ago_ts(10))
    p = seeded_page({
        "disclaimerAgreed": "true",
        "combineResults": [recent_result]
    })
    p.wait_for_timeout(5000)
    # Toast should not be showing (no 'show' class)
    expect(p.locator("#app-toast.show")).to_be_hidden(timeout=3000)
