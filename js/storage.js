// js/storage.js — BYOS: manual export/import and storage preference
// Depends on globals from app.js: safeParseJSON, showToast
// Loaded after js/combine.js (script order = dependency order)

// ─── Storage Preference ───────────────────────────────────────────────────────

function getStoragePreference() {
    return localStorage.getItem('storagePreference') || 'local';
}

function setStoragePreference(pref) {
    try {
        localStorage.setItem('storagePreference', pref);
    } catch (err) {
        console.error('Failed to save storagePreference to localStorage.', err);
        showToast('⚠️ Save Failed', "Couldn't save your storage preference — storage may be full or restricted.", '⚠️', 8000);
    }
}

// ─── Export ───────────────────────────────────────────────────────────────────

function exportData() {
    const now = new Date();
    const bundle = {
        app: 'SpikeFit',
        schemaVersion: 1,
        exportedAt: now.toISOString(),
        data: {
            completedExercises:  safeParseJSON('completedExercises', {}),
            completedDates:      safeParseJSON('completedDates', {}),
            spikefit_fresh_logs: safeParseJSON('spikefit_fresh_logs', []),
            workoutLevel:        localStorage.getItem('workoutLevel') || 'beginner',
            activeWorkoutStart:  localStorage.getItem('activeWorkoutStart'),
            disclaimerAgreed:    localStorage.getItem('disclaimerAgreed'),
            combineResults:      safeParseJSON('combineResults', []),
            combineSkipped:      localStorage.getItem('combineSkipped'),
            storagePreference:   localStorage.getItem('storagePreference')
        }
    };

    const dateStr  = now.toISOString().slice(0, 10);
    const filename = `spikefit-backup-${dateStr}.json`;
    const json     = JSON.stringify(bundle, null, 2);
    const file     = new File([json], filename, { type: 'application/json' });

    (async () => { // NOPMD -- async IIFE is the correct pattern for top-level await in a non-module script
        try {
            let saved = false;

            if (window.showSaveFilePicker) {
                // File System Access API: opens a folder picker (Android SAF, desktop Chrome/Edge).
                // User can navigate to Google Drive, SD card, any registered storage provider.
                try {
                    const fileHandle = await window.showSaveFilePicker({
                        suggestedName: filename,
                        types: [{ description: 'SpikeFit Backup', accept: { 'application/json': ['.json'] } }]
                    });
                    const writable = await fileHandle.createWritable();
                    await writable.write(json);
                    await writable.close();
                    saved = true;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    // Any other error (SecurityError, etc.): fall through to next method.
                }
            }

            if (!saved && navigator.canShare && navigator.canShare({ files: [file] })) {
                // Web Share API: iOS native share sheet surfaces iCloud Drive, AirDrop, etc.
                try {
                    await navigator.share({ files: [file], title: 'SpikeFit Backup', text: 'My SpikeFit training data backup.' });
                    saved = true;
                } catch (err) {
                    if (err.name === 'AbortError') return;
                    // Fall through to download.
                }
            }

            if (!saved) {
                const blob = new Blob([json], { type: 'application/json' });
                const link = document.createElement('a');
                link.href     = URL.createObjectURL(blob);
                link.download = filename;
                link.click();
                setTimeout(() => URL.revokeObjectURL(link.href), 60000);
            }

            try {
                localStorage.setItem('lastBackupAt', new Date().toISOString());
            } catch (err) {
                console.error('Failed to record lastBackupAt.', err);
                showToast('⚠️ Save Failed', "Couldn't record backup timestamp — storage may be full or restricted.", '⚠️', 8000);
            }
            updateStorageSettingsUI();
            showToast('Backup Saved', `Your data was saved as ${filename}.`, '💾', 6000);
        } catch (err) {
            console.error('Export failed:', err);
            showToast('⚠️ Backup Failed', 'Something went wrong exporting your data. Try again.', '⚠️', 8000);
        }
    })();
}

// ─── Import (Restore) ─────────────────────────────────────────────────────────

let pendingRestoreData = null;

function importData() {
    const input  = document.createElement('input');
    input.type   = 'file';
    input.accept = 'application/json';
    input.addEventListener('change', () => {
        const file = input.files[0];
        if (!file) return;
        file.text().then(text => {
            let parsed;
            try {
                parsed = JSON.parse(text);
            } catch (err) {
                console.error('Failed to parse backup JSON:', err);
                showToast('⚠️ Restore Failed', 'The file could not be read as valid JSON.', '⚠️', 8000);
                return;
            }
            if (parsed.app !== 'SpikeFit' || parsed.schemaVersion !== 1) {
                showToast('⚠️ Restore Failed', 'This does not appear to be a valid SpikeFit backup file.', '⚠️', 8000);
                return;
            }
            pendingRestoreData = parsed.data;
            document.getElementById('restore-confirm-modal').style.display = 'flex';
        }).catch(() => {
            showToast('⚠️ Restore Failed', 'The file could not be read.', '⚠️', 8000);
        });
    });
    input.click();
}

function confirmRestore() {
    if (!pendingRestoreData) return;
    const data = pendingRestoreData;
    pendingRestoreData = null;
    document.getElementById('restore-confirm-modal').style.display = 'none';

    const writeJSON = (key, val) => {
        if (val === null || val === undefined) return;
        try { localStorage.setItem(key, JSON.stringify(val)); }
        catch (err) {
            console.error('Failed to restore key "' + key + '".', err); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring -- key is always a hardcoded localStorage key, not user input
            showToast('⚠️ Restore Error', "Couldn't write all data — storage may be full or restricted.", '⚠️', 8000);
        }
    };
    const writeStr = (key, val) => {
        if (val === null || val === undefined) return;
        try { localStorage.setItem(key, val); }
        catch (err) {
            console.error('Failed to restore key "' + key + '".', err); // nosemgrep: javascript.lang.security.audit.unsafe-formatstring -- key is always a hardcoded localStorage key, not user input
            showToast('⚠️ Restore Error', "Couldn't write all data — storage may be full or restricted.", '⚠️', 8000);
        }
    };

    writeJSON('completedExercises',  data.completedExercises);
    writeJSON('completedDates',      data.completedDates);
    writeJSON('spikefit_fresh_logs', data.spikefit_fresh_logs);
    writeStr('workoutLevel',        data.workoutLevel);
    localStorage.removeItem('activeWorkoutStart'); // never restore a stale active workout
    writeStr('disclaimerAgreed',    data.disclaimerAgreed);
    writeJSON('combineResults',      data.combineResults);
    writeStr('combineSkipped',      data.combineSkipped);
    writeStr('storagePreference',   data.storagePreference);

    showToast('Restored!', 'Your data has been restored. Reloading...', '💾', 3000);
    setTimeout(() => location.reload(), 1500);
}

// ─── First-Run Wizard Step ────────────────────────────────────────────────────

function checkStorageChoice() {
    if (localStorage.getItem('storagePreference')) return;
    document.getElementById('storage-choice-modal').style.display = 'flex';
}

function chooseStorage(pref) {
    setStoragePreference(pref);
    document.getElementById('storage-choice-modal').style.display = 'none';
    // Proceed to the combine/streak checks that normally follow disclaimer acceptance
    if (typeof runPostOnboardingChecks === 'function') runPostOnboardingChecks();
}

// Called from storage-choice modal's restore link — importData handles the rest
function wizardRestore() {
    document.getElementById('storage-choice-modal').style.display = 'none';
    importData();
}

// ─── Post-Workout Backup Nudge ────────────────────────────────────────────────

function shouldShowBackupNudge() {
    if (getStoragePreference() !== 'drive') return false;
    const last = localStorage.getItem('lastBackupAt');
    if (!last) return true;
    const hoursSinceLast = (Date.now() - new Date(last).getTime()) / 3600000;
    return hoursSinceLast >= 20; // throttle to ~once per day
}

function showBackupNudge() {
    document.getElementById('backup-nudge-modal').style.display = 'flex';
}

function backupThenBadge() {
    document.getElementById('backup-nudge-modal').style.display = 'none';
    exportData();
    setTimeout(() => {
        if (typeof openBadgeModal === 'function') openBadgeModal();
    }, 800);
}

function dismissBackupNudge() {
    document.getElementById('backup-nudge-modal').style.display = 'none';
    if (typeof openBadgeModal === 'function') openBadgeModal();
}

// ─── Settings Modal ───────────────────────────────────────────────────────────

function openStorageModal() {
    updateStorageSettingsUI();
    document.getElementById('storage-settings-modal').style.display = 'flex';
}

function closeStorageModal() {
    document.getElementById('storage-settings-modal').style.display = 'none';
}

function updateStorageSettingsUI() {
    const pref  = getStoragePreference();
    const el    = document.getElementById('storage-pref-current');
    if (el) el.textContent = pref === 'drive' ? 'Cloud backup' : 'Local only';

    const lastEl = document.getElementById('storage-last-backup');
    if (lastEl) {
        const last = localStorage.getItem('lastBackupAt');
        lastEl.textContent = last
            ? 'Last backed up: ' + new Date(last).toLocaleString()
            : 'No backup recorded yet.';
    }

    const warnEl = document.getElementById('storage-warning-copy');
    if (warnEl) {
        warnEl.textContent = pref === 'drive'
            ? "Saves a backup file to any cloud app on your device (Google Drive, iCloud, Dropbox, Box, and more). SpikeFit never connects to these services — you pick where to save it from your device's share menu."
            : "Your data stays on this device. If you clear your browser storage or switch devices, it's gone. You can back up manually any time using the button above.";
    }
}

function toggleStoragePref() {
    const current = getStoragePreference();
    setStoragePreference(current === 'drive' ? 'local' : 'drive');
    updateStorageSettingsUI();
}

// ─── Wire Event Listeners ─────────────────────────────────────────────────────

(function wireStorageListeners() {
    const gearBtn = document.getElementById('btn-storage-settings');
    if (gearBtn) gearBtn.addEventListener('click', openStorageModal);

    const btnLocal = document.getElementById('btn-choose-local');
    if (btnLocal) btnLocal.addEventListener('click', () => chooseStorage('local'));

    const btnDrive = document.getElementById('btn-choose-drive');
    if (btnDrive) btnDrive.addEventListener('click', () => chooseStorage('drive'));

    const btnWizardRestore = document.getElementById('btn-wizard-restore');
    if (btnWizardRestore) btnWizardRestore.addEventListener('click', wizardRestore);

    const btnCloseSettings = document.getElementById('btn-close-storage-settings');
    if (btnCloseSettings) btnCloseSettings.addEventListener('click', closeStorageModal);

    const btnBackupNow = document.getElementById('btn-backup-now');
    if (btnBackupNow) btnBackupNow.addEventListener('click', exportData);

    const btnRestoreFile = document.getElementById('btn-restore-file');
    if (btnRestoreFile) btnRestoreFile.addEventListener('click', importData);

    const btnTogglePref = document.getElementById('btn-toggle-storage-pref');
    if (btnTogglePref) btnTogglePref.addEventListener('click', toggleStoragePref);

    const btnConfirmRestore = document.getElementById('btn-confirm-restore');
    if (btnConfirmRestore) btnConfirmRestore.addEventListener('click', confirmRestore);

    const btnCancelRestore = document.getElementById('btn-cancel-restore');
    if (btnCancelRestore) btnCancelRestore.addEventListener('click', () => {
        pendingRestoreData = null;
        document.getElementById('restore-confirm-modal').style.display = 'none';
    });

    const btnNudgeBackup = document.getElementById('btn-nudge-backup');
    if (btnNudgeBackup) btnNudgeBackup.addEventListener('click', backupThenBadge);

    const btnNudgeDismiss = document.getElementById('btn-nudge-dismiss');
    if (btnNudgeDismiss) btnNudgeDismiss.addEventListener('click', dismissBackupNudge);
})();
