// js/coach.js — Coach module (ADR-014): hub, QR scanner, pickup sign-out
//
// Loaded after js/team.js (early theme loader) and js/vendor/jsQR.js on
// coach.html only. Does not load js/app.js, so safeParseJSON/showToast are
// copied here rather than shared — see CLAUDE.md JS File Conventions and
// coach-module-plan.md §7.4.
//
// The Worker decides every green/yellow/red status (cloudflare/worker.js,
// decidePickup()) — this file only renders what /coach/api/* returns and
// never writes server data through innerHTML.

// ─── Local copy of safeParseJSON (see js/app.js) ───────────────────────────

function safeParseJSON(key, fallback) {
    const raw = localStorage.getItem(key);
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (err) {
        console.error(`Corrupted localStorage data for "${key}", resetting to default.`, err);
        return fallback;
    }
}

// ─── Toast (mirrors js/app.js's showToast against coach.html's own markup) ──

let coachToastTimeout = null;

function showToast(title, text, icon = '🏐', duration = 6000) {
    document.getElementById('coach-toast-icon').textContent = icon;
    document.getElementById('coach-toast-title').textContent = title;
    document.getElementById('coach-toast-text').textContent = text;

    const toast = document.getElementById('coach-toast');
    toast.classList.add('show');

    if (coachToastTimeout) clearTimeout(coachToastTimeout);
    coachToastTimeout = setTimeout(closeCoachToast, duration);
}

function closeCoachToast() {
    document.getElementById('coach-toast').classList.remove('show');
}

document.getElementById('coach-toast-close').addEventListener('click', closeCoachToast);

// ─── Constants ───────────────────────────────────────────────────────────────

const COACH_ID_RE      = /^[PK]-[0-9A-HJKMNP-TV-Z]{6}$/;
const SCAN_INTERVAL_MS = 100;   // ~10fps frame sampling for the jsQR fallback
const DECODE_DEDUPE_MS = 5000;  // ignore the same decoded value for 5s
const FETCH_TIMEOUT_MS = 5000;
const SYNC_INTERVAL_MS = 30000;
const QUEUE_KEY = 'spikefit_coach_queue';
const TEAM_KEY  = 'spikefit_coach_team';

// ─── State ───────────────────────────────────────────────────────────────────

const state = {
    teams: [],             // [{slug, name, features, overrideReasons}]
    activeTeam: null,       // slug
    activeTeamConfig: null
};

const scanner = {
    stream: null,
    timerHandle: null,
    usingBarcodeDetector: false,
    detector: null,
    lastValue: null,
    lastDecodedAt: 0
};

// Client-side re-scan guard (§7.3) — in-memory only, cleared on Done/new adult.
const pickup = {
    adultId: null,
    adultName: null,
    resolvedKidIds: new Set(),
    pendingYellowCount: 0
};

// ─── Fetch helper (timeout -> treated as offline) ───────────────────────────

async function fetchWithTimeout(url, options = {}, timeoutMs = FETCH_TIMEOUT_MS) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), timeoutMs);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// ─── Config load / view routing ─────────────────────────────────────────────

async function loadConfig() {
    try {
        const res = await fetchWithTimeout('/coach/api/config');
        if (!res.ok) throw new Error(`config_failed_${res.status}`);
        const data = await res.json();
        state.teams = Array.isArray(data.teams) ? data.teams : [];
    } catch (err) {
        console.error('Failed to load coach config.', err);
        state.teams = [];
    }
    renderEntry();
}

function hideAllViews() {
    ['view-loading', 'view-team-picker', 'view-hub', 'view-pickup'].forEach(id => {
        document.getElementById(id).classList.add('u-hidden');
    });
}

function renderEntry() {
    hideAllViews();
    renderQueueBadge();

    if (state.teams.length === 0) {
        document.getElementById('view-hub').classList.remove('u-hidden');
        document.getElementById('hub-team-name').textContent = 'Coach';
        document.getElementById('hub-subtitle').textContent = 'No coach tools are enabled for this team.';
        document.getElementById('hub-tiles').innerHTML = '';
        document.getElementById('hub-no-features').classList.remove('u-hidden');
        document.getElementById('btn-switch-team').classList.add('u-hidden');
        return;
    }

    if (state.teams.length === 1) {
        selectTeam(state.teams[0].slug);
        return;
    }

    const stored = localStorage.getItem(TEAM_KEY);
    if (stored && state.teams.some(t => t.slug === stored)) {
        selectTeam(stored);
        return;
    }

    renderTeamPicker();
}

function renderTeamPicker() {
    hideAllViews();
    document.getElementById('view-team-picker').classList.remove('u-hidden');

    const list = document.getElementById('team-picker-list');
    list.innerHTML = '';
    state.teams.forEach(team => {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'coach-team-btn';
        btn.textContent = team.name;
        btn.addEventListener('click', () => selectTeam(team.slug));
        list.appendChild(btn);
    });
}

function selectTeam(slug) {
    const team = state.teams.find(t => t.slug === slug);
    if (!team) { renderTeamPicker(); return; }

    state.activeTeam = slug;
    state.activeTeamConfig = team;
    try {
        localStorage.setItem(TEAM_KEY, slug);
    } catch (err) {
        console.error('Failed to save spikefit_coach_team to localStorage.', err);
    }
    renderHub();
}

function renderHub() {
    hideAllViews();
    document.getElementById('view-hub').classList.remove('u-hidden');

    const team = state.activeTeamConfig;
    document.getElementById('hub-team-name').textContent = team.name || 'Coach';
    document.getElementById('hub-subtitle').textContent = `Coach tools for ${team.name || 'your team'}.`;
    document.getElementById('btn-switch-team').classList.toggle('u-hidden', state.teams.length <= 1);

    const tiles = document.getElementById('hub-tiles');
    tiles.innerHTML = '';
    const noFeatures = document.getElementById('hub-no-features');

    // team.configured is presence-only (never the sheetId itself — see
    // /coach/api/config in cloudflare/worker.js). A team with pickup "on"
    // but no Sheet configured yet still gets a tile, just a disabled-looking
    // one that explains what's missing instead of silently failing on scan.
    const configured = team.configured !== false;

    const featureTiles = [];
    if (team.features && team.features.pickup === true) {
        featureTiles.push({
            label: 'Pickup',
            configured,
            onClick: configured ? openPickup : () => showTeamNotConfiguredToast(team.name)
        });
    }

    if (featureTiles.length === 0) {
        noFeatures.classList.remove('u-hidden');
    } else {
        noFeatures.classList.add('u-hidden');
        featureTiles.forEach(f => {
            const tile = document.createElement('button');
            tile.type = 'button';
            tile.className = f.configured ? 'coach-tile' : 'coach-tile coach-tile-unconfigured';

            const title = document.createElement('span');
            title.className = 'coach-tile-title';
            title.textContent = f.configured ? f.label : `${f.label} — Setup Needed`;

            const arrow = document.createElement('span');
            arrow.className = 'coach-tile-arrow';
            arrow.textContent = '→';

            tile.appendChild(title);
            tile.appendChild(arrow);
            tile.addEventListener('click', f.onClick);
            tiles.appendChild(tile);
        });
    }

    renderQueueBadge();
}

document.getElementById('btn-switch-team').addEventListener('click', () => {
    state.activeTeam = null;
    state.activeTeamConfig = null;
    try {
        localStorage.removeItem(TEAM_KEY);
    } catch (err) {
        console.error('Failed to clear spikefit_coach_team from localStorage.', err);
    }
    renderTeamPicker();
});

document.getElementById('btn-logout').addEventListener('click', () => {
    const queue = safeParseJSON(QUEUE_KEY, []);
    if (queue.length > 0 && !confirm(`You have ${queue.length} pickup scan(s) waiting to sync. Log out anyway?`)) {
        return;
    }
    window.location.href = '/auth/logout';
});

document.getElementById('btn-back-to-hub').addEventListener('click', () => {
    stopScanner();
    renderHub();
});

// ─── Pickup feature ──────────────────────────────────────────────────────────

function openPickup() {
    hideAllViews();
    document.getElementById('view-pickup').classList.remove('u-hidden');
    resetPickupSession();
    startScanner();
    renderQueueBadge();
}

function resetPickupSession() {
    pickup.adultId = null;
    pickup.adultName = null;
    pickup.resolvedKidIds = new Set();
    pickup.pendingYellowCount = 0;
    document.getElementById('pickup-results').innerHTML = '';
    document.getElementById('pickup-status').textContent = "Scan the adult's card.";
    updateDoneButton();
}

function updateDoneButton() {
    document.getElementById('btn-done').disabled = pickup.pendingYellowCount > 0;
}

document.getElementById('btn-done').addEventListener('click', () => {
    if (pickup.pendingYellowCount > 0) return;
    resetPickupSession();
});

// ─── Camera scanner (BarcodeDetector when available, else jsQR) ────────────

async function startScanner() {
    document.getElementById('camera-denied').classList.add('u-hidden');
    const video = document.getElementById('coach-video');

    try {
        scanner.stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'environment' } });
        video.srcObject = scanner.stream;
        await video.play();
    } catch (err) {
        console.error('Camera access failed.', err);
        document.getElementById('camera-denied').classList.remove('u-hidden');
        return;
    }

    scanner.usingBarcodeDetector = false;
    if ('BarcodeDetector' in window) {
        try {
            const formats = await window.BarcodeDetector.getSupportedFormats();
            if (formats.includes('qr_code')) {
                scanner.detector = new window.BarcodeDetector({ formats: ['qr_code'] });
                scanner.usingBarcodeDetector = true;
            }
        } catch (err) {
            console.error('BarcodeDetector unavailable — falling back to jsQR.', err);
        }
    }

    scanLoop();
}

function stopScanner() {
    if (scanner.timerHandle) {
        clearTimeout(scanner.timerHandle);
        scanner.timerHandle = null;
    }
    if (scanner.stream) {
        scanner.stream.getTracks().forEach(track => track.stop());
        scanner.stream = null;
    }
    document.getElementById('coach-video').srcObject = null;
}

document.addEventListener('visibilitychange', () => {
    const pickupVisible = !document.getElementById('view-pickup').classList.contains('u-hidden');
    if (document.hidden) {
        stopScanner();
    } else if (pickupVisible) {
        startScanner();
        trySync();
    }
});

function scanLoop() {
    scanner.timerHandle = setTimeout(async () => {
        await scanFrame();
        if (scanner.stream) scanLoop();
    }, SCAN_INTERVAL_MS);
}

async function scanFrame() {
    const video = document.getElementById('coach-video');
    if (!video.videoWidth) return;

    if (scanner.usingBarcodeDetector) {
        try {
            const codes = await scanner.detector.detect(video);
            if (codes.length > 0) handleDecodedValue(codes[0].rawValue);
        } catch (err) {
            console.error('BarcodeDetector decode failed.', err);
        }
        return;
    }

    const canvas = document.getElementById('coach-canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(video, 0, 0, canvas.width, canvas.height);
    const imageData = ctx.getImageData(0, 0, canvas.width, canvas.height);
    const decoded = jsQR(imageData.data, imageData.width, imageData.height);
    if (decoded && decoded.data) handleDecodedValue(decoded.data);
}

function handleDecodedValue(raw) {
    const value = String(raw || '').trim().toUpperCase();
    if (!value) return;

    const now = Date.now();
    if (value === scanner.lastValue && (now - scanner.lastDecodedAt) < DECODE_DEDUPE_MS) return;
    scanner.lastValue = value;
    scanner.lastDecodedAt = now;

    if (navigator.vibrate) navigator.vibrate(80);
    processScannedId(value);
}

document.getElementById('manual-submit-btn').addEventListener('click', () => {
    const input = document.getElementById('manual-id-input');
    const value = input.value.trim().toUpperCase();
    if (!value) return;
    input.value = '';
    processScannedId(value);
});

document.getElementById('manual-id-input').addEventListener('keydown', e => {
    if (e.key === 'Enter') document.getElementById('manual-submit-btn').click();
});

// ─── Pickup state machine (idle -> adultScanned -> ... -> done) ────────────

function processScannedId(value) {
    if (!COACH_ID_RE.test(value)) {
        showToast('Unrecognized Card', "That card couldn't be read. Try again or enter the ID manually.", '❓');
        return;
    }

    const kind = value[0]; // 'P' or 'K'

    if (pickup.adultId === null) {
        if (kind === 'K') {
            document.getElementById('pickup-status').textContent = 'Scan the adult first.';
            flash('red');
            return;
        }
        pickup.adultId = value;
        pickup.adultName = null; // resolved from the first kid's /scan response
        document.getElementById('pickup-status').textContent = 'Adult card read. Now scan each kid.';
        return;
    }

    if (kind === 'P') {
        // Another adult card ends this pickup and starts a new one.
        resetPickupSession();
        pickup.adultId = value;
        document.getElementById('pickup-status').textContent = 'Adult card read. Now scan each kid.';
        return;
    }

    if (pickup.resolvedKidIds.has(value)) {
        showToast('Already Scanned', 'This kid was already scanned this pickup.', '↩️');
        return;
    }

    submitScan(pickup.adultId, value);
}

// ─── /scan ───────────────────────────────────────────────────────────────────

function createPendingResultCard(eventId, kidId) {
    const card = document.createElement('div');
    card.className = 'coach-result-card';
    card.dataset.eventId = eventId;
    card.dataset.kidId = kidId;
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = 'Checking…';
    card.appendChild(title);
    return card;
}

async function submitScan(adultId, kidId) {
    const eventId = crypto.randomUUID();
    const scannedAt = new Date().toISOString();

    const card = createPendingResultCard(eventId, kidId);
    document.getElementById('pickup-results').prepend(card);

    const payload = { eventId, team: state.activeTeam, adultId, kidId, scannedAt, offline: false };

    let result;
    try {
        const res = await fetchWithTimeout('/coach/api/pickup/scan', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(payload)
        });
        if (res.status === 409 && await isTeamNotConfigured(res)) {
            renderTeamNotConfiguredCard(card);
            return;
        }
        if (res.status === 503 || !res.ok) throw new Error(`scan_failed_${res.status}`);
        result = await res.json();
    } catch (err) {
        console.error('Pickup scan failed — queueing offline.', err);
        enqueueOfflineScan({ eventId, team: state.activeTeam, adultId, kidId, scannedAt, offline: true });
        pickup.resolvedKidIds.add(kidId);
        flash('yellow');
        renderQueuedCard(card, kidId);
        renderQueueBadge();
        return;
    }

    if (result.status === 'green' || result.status === 'red') {
        pickup.resolvedKidIds.add(kidId);
    }
    renderResultInto(card, result, eventId);
}

function renderQueuedCard(card, kidId) {
    card.textContent = '';
    card.classList.add('status-yellow');
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = `${kidId} — queued`;
    const note = document.createElement('div');
    note.className = 'coach-card-queued';
    note.textContent = 'UNVERIFIED — check manually. Will verify when back online.';
    card.appendChild(title);
    card.appendChild(note);
}

// A 409 { error: 'team_not_configured' } means the team's roster Sheet
// isn't set up (or set up wrong) — a permanent problem, not a connectivity
// blip. Never queue this offline: retrying can't fix a missing/bad sheetId,
// only an admin editing the TEAMS config can. Consumes `res`'s body, so
// only call this once you've already committed to not reading it again.
async function isTeamNotConfigured(res) {
    try {
        const body = await res.json();
        return !!(body && body.error === 'team_not_configured');
    } catch {
        return false;
    }
}

function showTeamNotConfiguredToast(teamName) {
    showToast('Setup Needed', `Pickup isn't fully configured for ${teamName} yet. Contact your SpikeFit admin.`, '⚠️', 10000);
}

function renderTeamNotConfiguredCard(card) {
    card.textContent = '';
    card.className = 'coach-result-card status-red';
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = "Pickup Isn't Set Up Yet";
    const meta = document.createElement('div');
    meta.className = 'coach-result-meta';
    meta.textContent = `Contact your SpikeFit admin — ${state.activeTeamConfig.name} needs its roster sheet finished before pickup can be used.`;
    card.appendChild(title);
    card.appendChild(meta);
    showTeamNotConfiguredToast(state.activeTeamConfig.name);
}

function formatTime(iso) {
    try {
        return new Date(iso).toLocaleTimeString([], { hour: 'numeric', minute: '2-digit' });
    } catch {
        return iso;
    }
}

function flash(color) {
    const el = document.getElementById('scan-flash');
    el.className = 'coach-scan-flash';
    void el.offsetWidth; // force reflow so re-triggering the same color still re-animates
    el.classList.add(`flash-${color}`);
    setTimeout(() => el.classList.remove(`flash-${color}`), 350);
}

function appendAlreadyOut(card, alreadyOut) {
    if (!alreadyOut) return;
    const banner = document.createElement('div');
    banner.className = 'coach-already-out';
    banner.textContent = `⚠ Already signed out today at ${formatTime(alreadyOut.at)} to ${alreadyOut.adult} (coach: ${alreadyOut.coach}).`;
    card.appendChild(banner);
}

function renderResultInto(card, result, eventId) {
    card.textContent = '';
    card.className = 'coach-result-card';

    if (result.adult && result.adult.name && !pickup.adultName) {
        pickup.adultName = result.adult.name;
        document.getElementById('pickup-status').textContent = `Adult: ${pickup.adultName}`;
    }

    if (result.status === 'green') {
        card.classList.add('status-green');
        flash('green');
        const title = document.createElement('div');
        title.className = 'coach-result-title';
        title.textContent = `✓ ${result.kid.name}`;
        const meta = document.createElement('div');
        meta.className = 'coach-result-meta';
        meta.textContent = `Picked up by ${result.adult.name} at ${formatTime(result.loggedAt)}`;
        card.appendChild(title);
        card.appendChild(meta);
        appendAlreadyOut(card, result.alreadyOut);
        return;
    }

    if (result.status === 'yellow') {
        card.classList.add('status-yellow');
        flash('yellow');
        pickup.pendingYellowCount++;
        updateDoneButton();
        renderYellowCard(card, result, eventId);
        appendAlreadyOut(card, result.alreadyOut);
        return;
    }

    if (result.status === 'yellow-override') {
        card.classList.add('status-yellow');
        flash('yellow');
        const title = document.createElement('div');
        title.className = 'coach-result-title';
        title.textContent = `✓ ${result.kid.name} (override)`;
        const meta = document.createElement('div');
        meta.className = 'coach-result-meta';
        meta.textContent = `Released to ${result.adult.name} by override.`
            + (result.alertSent === false ? ' Parent alert failed to send.' : '');
        card.appendChild(title);
        card.appendChild(meta);
        return;
    }

    // red
    card.classList.add('status-red');
    flash('red');
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = '✕ Not released';
    const meta = document.createElement('div');
    meta.className = 'coach-result-meta';
    meta.textContent = result.reason || 'Unknown card';
    card.appendChild(title);
    card.appendChild(meta);
}

// ─── Yellow override UI ──────────────────────────────────────────────────────

function renderYellowCard(card, result, eventId) {
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = result.kid.name;
    card.appendChild(title);

    const meta = document.createElement('div');
    meta.className = 'coach-result-meta';
    const authNames = (result.authorizedAdults && result.authorizedAdults.length > 0)
        ? result.authorizedAdults.join(', ')
        : 'no one on file';
    meta.textContent = `${result.adult.name} is not authorized for ${result.kid.name}. Authorized: ${authNames}.`;
    card.appendChild(meta);

    const form = document.createElement('div');
    form.className = 'coach-override-form';

    const reasons = (state.activeTeamConfig && Array.isArray(state.activeTeamConfig.overrideReasons))
        ? state.activeTeamConfig.overrideReasons
        : [];
    const radioName = `reason-${eventId}`;

    reasons.forEach(reason => {
        const row = document.createElement('label');
        row.className = 'radio-row';
        const radio = document.createElement('input');
        radio.type = 'radio';
        radio.name = radioName;
        radio.value = reason;
        const span = document.createElement('span');
        span.textContent = reason;
        row.appendChild(radio);
        row.appendChild(span);
        form.appendChild(row);
    });

    const note = document.createElement('textarea');
    note.placeholder = 'Optional note (required for "Other")';
    note.maxLength = 280;
    form.appendChild(note);

    const actions = document.createElement('div');
    actions.className = 'coach-override-actions';

    const confirmBtn = document.createElement('button');
    confirmBtn.type = 'button';
    confirmBtn.className = 'btn';
    confirmBtn.textContent = 'Confirm Pickup';

    const cancelBtn = document.createElement('button');
    cancelBtn.type = 'button';
    cancelBtn.className = 'btn btn-ghost';
    cancelBtn.textContent = "Don't Release";

    confirmBtn.addEventListener('click', () => {
        const selected = [...form.querySelectorAll('input[type="radio"]')].find(r => r.checked);
        if (!selected) {
            showToast('Reason Required', 'Pick a reason before confirming the pickup.', '⚠️');
            return;
        }
        if (selected.value.startsWith('Other') && !note.value.trim()) {
            showToast('Note Required', 'Add a note for "Other".', '⚠️');
            return;
        }
        confirmOverride(eventId, selected.value, note.value.trim(), card);
    });

    cancelBtn.addEventListener('click', () => resolveYellowCardAsDeclined(card, result));

    actions.appendChild(confirmBtn);
    actions.appendChild(cancelBtn);
    form.appendChild(actions);
    card.appendChild(form);
}

async function confirmOverride(eventId, reason, note, card) {
    const buttons = card.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });

    try {
        const res = await fetchWithTimeout('/coach/api/pickup/confirm', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ eventId, team: state.activeTeam, reason, note })
        });
        if (res.status === 409 && await isTeamNotConfigured(res)) {
            showTeamNotConfiguredToast(state.activeTeamConfig.name);
            buttons.forEach(b => { b.disabled = false; });
            return;
        }
        if (!res.ok) throw new Error(`confirm_failed_${res.status}`);
        const result = await res.json();

        pickup.pendingYellowCount = Math.max(0, pickup.pendingYellowCount - 1);
        if (result.kid) pickup.resolvedKidIds.add(result.kid.kidId);
        updateDoneButton();
        renderResultInto(card, result, eventId);
    } catch (err) {
        console.error('Confirm override failed.', err);
        buttons.forEach(b => { b.disabled = false; });
        showToast('Network Error', "Couldn't confirm the pickup — check your connection and try again.", '⚠️');
    }
}

function resolveYellowCardAsDeclined(card, result) {
    pickup.pendingYellowCount = Math.max(0, pickup.pendingYellowCount - 1);
    pickup.resolvedKidIds.add(result.kid.kidId);
    updateDoneButton();

    card.textContent = '';
    card.className = 'coach-result-card status-red';
    const title = document.createElement('div');
    title.className = 'coach-result-title';
    title.textContent = `✕ ${result.kid.name} — not released`;
    const meta = document.createElement('div');
    meta.className = 'coach-result-meta';
    meta.textContent = 'Coach declined to release.';
    card.appendChild(title);
    card.appendChild(meta);
}

// ─── Offline queue (§7.4) ────────────────────────────────────────────────────

function enqueueOfflineScan(event) {
    const queue = safeParseJSON(QUEUE_KEY, []);
    queue.push(event);
    saveQueue(queue);
}

function saveQueue(queue) {
    try {
        localStorage.setItem(QUEUE_KEY, JSON.stringify(queue));
    } catch (err) {
        console.error('Failed to save offline pickup queue to localStorage.', err);
        showToast('Save Failed', "Your browser couldn't save this queued scan — storage may be full or restricted.", '⚠️');
    }
}

function renderQueueBadge() {
    const queue = safeParseJSON(QUEUE_KEY, []);
    const count = queue.length;
    ['hub-queue-badge', 'pickup-queue-badge'].forEach(id => {
        const el = document.getElementById(id);
        if (!el) return;
        if (count > 0) {
            el.textContent = `${count} scan${count === 1 ? '' : 's'} waiting to sync`;
            el.classList.remove('u-hidden');
        } else {
            el.classList.add('u-hidden');
        }
    });
    const offlineBanner = document.getElementById('offline-banner');
    if (offlineBanner) offlineBanner.classList.toggle('u-hidden', count === 0);
}

async function trySync() {
    const queue = safeParseJSON(QUEUE_KEY, []);
    const teamEvents = queue.filter(evt => evt.team === state.activeTeam);
    if (!state.activeTeam || teamEvents.length === 0) return;

    let res;
    try {
        res = await fetchWithTimeout('/coach/api/pickup/sync', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ team: state.activeTeam, events: teamEvents.slice(0, 50) })
        }, 10000);
    } catch (err) {
        console.error('Offline queue sync failed (still offline?).', err);
        return;
    }
    if (!res.ok) return;

    let data;
    try {
        data = await res.json();
    } catch (err) {
        console.error('Malformed sync response.', err);
        return;
    }

    const results = Array.isArray(data.results) ? data.results : [];
    const confirmedIds = new Set(results.filter(r => r.status && r.status !== 'error').map(r => r.eventId));

    const remaining = queue.filter(evt => !(evt.team === state.activeTeam && confirmedIds.has(evt.eventId)));
    saveQueue(remaining);
    renderQueueBadge();

    const flagged = results.filter(r => r.status === 'yellow-override' || r.status === 'red');
    if (flagged.length > 0) {
        showToast('Sync Results', `${flagged.length} queued scan(s) needed review — check the team's Log/Overrides sheet.`, '⚠️', 10000);
    } else if (confirmedIds.size > 0) {
        showToast('Synced', `${confirmedIds.size} queued scan(s) synced successfully.`, '✅');
    }
}

window.addEventListener('online', trySync);
document.addEventListener('visibilitychange', () => {
    if (!document.hidden) trySync();
});
setInterval(() => {
    const queue = safeParseJSON(QUEUE_KEY, []);
    if (queue.length > 0) trySync();
}, SYNC_INTERVAL_MS);

// ─── Init ────────────────────────────────────────────────────────────────────

loadConfig();
