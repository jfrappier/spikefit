"""E2E tests for the BYOS storage preference, backup, and restore feature."""
import json
from playwright.sync_api import expect


def test_fresh_user_sees_storage_choice_after_disclaimer(app_page):
    """Storage-choice modal appears after disclaimer acceptance for a brand-new user."""
    p = app_page
    p.wait_for_timeout(4500)
    expect(p.locator("#disclaimer-modal")).to_be_visible(timeout=3000)
    p.locator("#btn-accept-disclaimer").click()
    expect(p.locator("#storage-choice-modal")).to_be_visible(timeout=3000)
    expect(p.locator("#disclaimer-modal")).to_be_hidden(timeout=1000)


def test_choosing_local_persists_preference(app_page):
    """Choosing 'Local only' sets storagePreference='local' and hides the modal."""
    p = app_page
    p.wait_for_timeout(4500)
    p.locator("#btn-accept-disclaimer").click()
    expect(p.locator("#storage-choice-modal")).to_be_visible(timeout=3000)
    p.locator("#btn-choose-local").click()
    expect(p.locator("#storage-choice-modal")).to_be_hidden(timeout=2000)
    pref = p.evaluate("localStorage.getItem('storagePreference')")
    assert pref == 'local'  # nosemgrep: python.lang.security.audit.assert-used


def test_choosing_drive_persists_preference(app_page):
    """Choosing 'Google Drive' sets storagePreference='drive' and hides the modal."""
    p = app_page
    p.wait_for_timeout(4500)
    p.locator("#btn-accept-disclaimer").click()
    expect(p.locator("#storage-choice-modal")).to_be_visible(timeout=3000)
    p.locator("#btn-choose-drive").click()
    expect(p.locator("#storage-choice-modal")).to_be_hidden(timeout=2000)
    pref = p.evaluate("localStorage.getItem('storagePreference')")
    assert pref == 'drive'  # nosemgrep: python.lang.security.audit.assert-used


def test_returning_user_skips_storage_choice_modal(seeded_page):
    """A returning user with storagePreference set does NOT see the storage-choice modal."""
    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)
    expect(p.locator("#storage-choice-modal")).to_be_hidden(timeout=3000)


def test_gear_icon_opens_settings_modal(seeded_page):
    """Clicking the gear icon opens the Storage & Backup modal."""
    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)
    p.locator("#btn-storage-settings").click()
    expect(p.locator("#storage-settings-modal")).to_be_visible(timeout=2000)


def test_settings_modal_close_button_works(seeded_page):
    """Clicking Close in the settings modal hides it."""
    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)
    p.locator("#btn-storage-settings").click()
    expect(p.locator("#storage-settings-modal")).to_be_visible(timeout=2000)
    p.locator("#btn-close-storage-settings").click()
    expect(p.locator("#storage-settings-modal")).to_be_hidden(timeout=2000)


def test_settings_modal_shows_current_preference(seeded_page):
    """Settings modal reflects the current storagePreference value."""
    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "drive"})
    p.wait_for_timeout(4000)
    p.locator("#btn-storage-settings").click()
    expect(p.locator("#storage-pref-current")).to_contain_text("Cloud backup", timeout=2000)


def test_toggle_changes_preference(seeded_page):
    """Clicking Change toggles storagePreference between local and drive."""
    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)
    p.locator("#btn-storage-settings").click()
    expect(p.locator("#storage-settings-modal")).to_be_visible(timeout=2000)
    p.locator("#btn-toggle-storage-pref").click()
    pref = p.evaluate("localStorage.getItem('storagePreference')")
    assert pref == 'drive'  # nosemgrep: python.lang.security.audit.assert-used


def test_backup_nudge_not_shown_for_local_preference(seeded_page):
    """Post-workout nudge does not appear when preference is 'local'."""
    p = seeded_page({
        "disclaimerAgreed": "0.0.720",
        "storagePreference": "local",
        "workoutLevel": "beginner"
    })
    p.wait_for_timeout(4000)
    # Simulate workout completion via JS (avoids the full 30-min flow)
    p.evaluate("""
        const btn = document.getElementById('btn-mark-complete');
        if (btn) btn.disabled = false;
        if (typeof markWorkoutComplete === 'function') markWorkoutComplete();
    """)
    p.wait_for_timeout(500)
    expect(p.locator("#backup-nudge-modal")).to_be_hidden(timeout=2000)


def test_backup_nudge_shown_for_drive_preference_with_no_prior_backup(seeded_page):
    """Post-workout nudge appears when preference is 'drive' and no prior backup."""
    p = seeded_page({
        "disclaimerAgreed": "0.0.720",
        "storagePreference": "drive",
        "workoutLevel": "beginner"
    })
    p.wait_for_timeout(4000)
    p.evaluate("if (typeof markWorkoutComplete === 'function') markWorkoutComplete();")
    p.wait_for_timeout(500)
    expect(p.locator("#backup-nudge-modal")).to_be_visible(timeout=2000)


def test_nudge_dismiss_leaves_share_button_available(seeded_page):
    """Dismissing the backup nudge closes it without auto-opening the badge/share
    modal — sharing is available via the persistent 'Share Today's Workout' button
    instead of a forced popup."""
    p = seeded_page({
        "disclaimerAgreed": "0.0.720",
        "storagePreference": "drive",
        "workoutLevel": "beginner"
    })
    p.wait_for_timeout(4000)
    p.evaluate("if (typeof markWorkoutComplete === 'function') markWorkoutComplete();")
    p.wait_for_timeout(500)
    expect(p.locator("#backup-nudge-modal")).to_be_visible(timeout=2000)
    p.locator("#btn-nudge-dismiss").click()
    expect(p.locator("#backup-nudge-modal")).to_be_hidden(timeout=2000)
    expect(p.locator("#badge-modal")).to_be_hidden()
    expect(p.locator("#btn-share-today")).to_be_visible(timeout=2000)


def test_restore_confirm_cancel_clears_pending_data(seeded_page, tmp_path):
    """Cancelling the restore confirm modal discards the pending restore."""
    good_backup = json.dumps({
        "app": "SpikeFit",
        "schemaVersion": 1,
        "exportedAt": "2026-07-05T00:00:00.000Z",
        "data": {
            "completedExercises": {},
            "completedDates": {},
            "spikefit_fresh_logs": [],
            "workoutLevel": "intermediate",
            "activeWorkoutStart": None,
            "disclaimerAgreed": "0.0.720",
            "combineResults": [],
            "combineSkipped": None,
            "storagePreference": "local"
        }
    })
    backup_file = tmp_path / "spikefit-backup-test.json"
    backup_file.write_text(good_backup)

    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)

    # Inject the backup data directly (simulates file picker result)
    p.evaluate(f"""
        const data = JSON.parse({json.dumps(good_backup)}).data;
        pendingRestoreData = data;
        document.getElementById('restore-confirm-modal').style.display = 'flex';
    """)
    expect(p.locator("#restore-confirm-modal")).to_be_visible(timeout=2000)
    p.locator("#btn-cancel-restore").click()
    expect(p.locator("#restore-confirm-modal")).to_be_hidden(timeout=2000)
    # workoutLevel should still be 'beginner' (not restored to intermediate)
    level = p.evaluate("localStorage.getItem('workoutLevel')")
    assert level != 'intermediate'  # nosemgrep: python.lang.security.audit.assert-used


def test_restore_confirm_writes_data_and_reloads(seeded_page):
    """Confirming restore writes all keys and triggers a page reload."""
    good_backup_data = json.dumps({
        "completedExercises": {},
        "completedDates": {"2026-07-01": {"completed": True, "level": "advanced"}},
        "spikefit_fresh_logs": [],
        "workoutLevel": "advanced",
        "activeWorkoutStart": "stale-start-should-be-cleared",
        "disclaimerAgreed": "0.0.720",
        "combineResults": [],
        "combineSkipped": None,
        "storagePreference": "drive"
    })

    p = seeded_page({"disclaimerAgreed": "0.0.720", "storagePreference": "local"})
    p.wait_for_timeout(4000)

    # Inject pending restore data and show the confirm modal
    p.evaluate(f"""
        pendingRestoreData = JSON.parse({json.dumps(good_backup_data)});
        document.getElementById('restore-confirm-modal').style.display = 'flex';
    """)
    expect(p.locator("#restore-confirm-modal")).to_be_visible(timeout=2000)

    # Listen for reload via navigation event
    with p.expect_navigation(timeout=5000):
        p.locator("#btn-confirm-restore").click()

    # After reload, verify restored data is present
    level = p.evaluate("localStorage.getItem('workoutLevel')")
    assert level == 'advanced'  # nosemgrep: python.lang.security.audit.assert-used
    # activeWorkoutStart must have been cleared (never restore a stale workout)
    active = p.evaluate("localStorage.getItem('activeWorkoutStart')")
    assert active is None  # nosemgrep: python.lang.security.audit.assert-used
