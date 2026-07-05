// js/combine.js — Combine baseline testing feature
// Globals consumed from app.js (loaded before this file via script load order):
/* global safeParseJSON, showToast, getTodayDateStr */
// Functions exposed as globals for app.js to call after this file loads:
/* exported checkCombineBaseline, checkCombineRetest */

const COMBINE_RETEST_DAYS = 28;

// ─── Metrics config ──────────────────────────────────────────────────────────
// Order determines display order throughout the feature.
const COMBINE_METRICS = [
    {
        id: 'standingReach',
        label: 'Standing Reach',
        unit: 'in',
        type: 'number',
        higherIsBetter: true,
        instructions: 'Stand next to a wall, feet flat, arm fully extended overhead. Mark or measure how high you can touch.',
        video: 'how to measure standing reach volleyball'
    },
    {
        id: 'jumpTouch',
        label: 'Jump Touch',
        unit: 'in',
        type: 'number',
        higherIsBetter: true,
        instructions: 'Jump and reach as high as possible, touching the wall. Measure that height. Your vertical = Jump Touch − Standing Reach.',
        video: 'how to measure vertical jump touch height wall'
    },
    {
        id: 'plankSec',
        label: 'Plank Hold',
        unit: 'sec',
        type: 'timer-up',
        higherIsBetter: true,
        instructions: 'Forearms on floor, body in a straight line. Hold as long as possible. Tap Stop when you break form.',
        video: 'perfect plank form tutorial'
    },
    {
        id: 'wallSitSec',
        label: 'Wall Sit',
        unit: 'sec',
        type: 'timer-up',
        higherIsBetter: true,
        instructions: 'Back flat against the wall, thighs parallel to the floor, knees at 90°. Hold as long as possible.',
        video: 'wall sit exercise tutorial'
    },
    {
        id: 'toeTaps',
        label: 'Toe Taps (30s)',
        unit: 'reps',
        type: 'timer-countdown',
        higherIsBetter: true,
        instructions: 'Alternate tapping your toe on a line or low object as fast as possible. Count each tap (left + right = 2). Timer runs for 30 seconds.',
        video: 'toe taps volleyball drill'
    },
    {
        id: 'jumpingJacks',
        label: 'Jumping Jacks',
        unit: 'reps',
        type: 'number',
        higherIsBetter: true,
        instructions: 'Do as many jumping jacks as you can until you cannot continue. Enter your total.',
        video: 'jumping jacks exercise'
    },
    {
        id: 'agilitySec',
        label: 'Lateral Shuttle',
        unit: 'sec',
        type: 'number',
        higherIsBetter: false,
        step: '0.1',
        instructions: 'Mark two points 15 ft apart. Sprint side-to-side 3 times (6 touches total). Record your best time in seconds.',
        video: 'lateral shuttle run agility drill'
    }
];

// ─── Data helpers ─────────────────────────────────────────────────────────────

function getCombineResults() {
    return safeParseJSON('combineResults', []);
}

function saveCombineResult(metrics) {
    const results = getCombineResults();
    results.push({
        date: getTodayDateStr(),
        timestamp: Date.now(),
        metrics: metrics
    });
    try {
        localStorage.setItem('combineResults', JSON.stringify(results));
    } catch (err) {
        console.error('Failed to save Combine result to localStorage.', err);
        showToast('⚠️ Save Failed', "Your browser couldn't save this result — storage may be full or restricted.", '⚠️', 8000);
    }
}

function computeVertical(reach, touch) {
    const r = parseFloat(reach);
    const t = parseFloat(touch);
    if (isNaN(r) || isNaN(t) || r <= 0 || t <= 0) return null;
    const v = t - r;
    return v > 0 ? Math.round(v * 10) / 10 : null;
}

function getBaseline() {
    const results = getCombineResults();
    return results.length > 0 ? results[0] : null;
}

function getLatest() {
    const results = getCombineResults();
    return results.length > 0 ? results[results.length - 1] : null;
}

function getBest(metricId) {
    const results = getCombineResults();
    if (results.length === 0) return null;
    const config = COMBINE_METRICS.find(m => m.id === metricId);
    const higherIsBetter = config ? config.higherIsBetter : true;

    let best = null;
    for (const r of results) {
        // eslint-disable-next-line security/detect-object-injection -- metricId is always a known string from COMBINE_METRICS, not user input
        const val = r.metrics[metricId];
        if (val == null || isNaN(val)) continue;
        if (best === null) {
            best = val;
        } else {
            best = higherIsBetter ? Math.max(best, val) : Math.min(best, val);
        }
    }
    return best;
}

function combineRetestDue() {
    const latest = getLatest();
    if (!latest) return false;
    const daysSince = (Date.now() - latest.timestamp) / 86400000; // NOPMD -- 86400000 ms/day is exact and within JS safe integer range
    return daysSince >= COMBINE_RETEST_DAYS;
}

// ─── Onboarding / retest prompts ─────────────────────────────────────────────

function checkCombineBaseline() {
    if (getCombineResults().length > 0) return;
    if (localStorage.getItem('combineSkipped')) return;
    if (sessionStorage.getItem('combinePromptShown')) return;
    sessionStorage.setItem('combinePromptShown', 'true');
    document.getElementById('combine-onboard-modal').style.display = 'flex';
}

function checkCombineRetest() {
    if (getCombineResults().length === 0) return;
    if (!combineRetestDue()) return;
    showToast(
        '📋 Combine Check-In',
        `It's been ${COMBINE_RETEST_DAYS}+ days since your last baseline. Head to the Combine tab to track your progress!`,
        '📋',
        10000
    );
}

// ─── Render: summary card ────────────────────────────────────────────────────

function formatValue(val, unit) {
    if (val == null || isNaN(val)) return '—';
    if (unit === 'sec') {
        const m = Math.floor(val / 60);
        const s = Math.round(val % 60);
        return m > 0 ? `${m}:${String(s).padStart(2, '0')}` : `${s}`;
    }
    return String(val);
}

// ─── Summary card helpers ─────────────────────────────────────────────────────

function buildDeltaEl(m, latestVal, baselineVal) {
    if (baselineVal == null) return null;
    if (latestVal !== baselineVal) {
        const diff     = latestVal - baselineVal;
        const improved = m.higherIsBetter ? diff > 0 : diff < 0;
        const sign     = diff > 0 ? '+' : '';
        const el       = document.createElement('div');
        el.className   = 'combine-metric-delta ' + (improved ? 'up' : 'down');
        el.textContent = `${sign}${formatValue(Math.abs(diff), m.unit)} vs baseline`;
        return el;
    }
    if (getCombineResults().length > 1) {
        const el       = document.createElement('div');
        el.className   = 'combine-metric-delta same';
        el.textContent = '= baseline';
        return el;
    }
    return null;
}

function buildBestEl(m, latestVal, bestVal) {
    if (bestVal == null || bestVal === latestVal) return null;
    const isBest = m.higherIsBetter ? latestVal >= bestVal : latestVal <= bestVal;
    if (isBest) return null;
    const el       = document.createElement('div');
    el.className   = 'combine-metric-delta same';
    el.textContent = `Best: ${formatValue(bestVal, m.unit)} ${m.unit}`;
    return el;
}

function renderCombineSummary() {
    const container = document.getElementById('combine-summary');
    if (!container) return;

    const latest   = getLatest();
    const baseline = getBaseline();

    if (!latest) {
        container.innerHTML = '';
        const card = document.createElement('div');
        card.className = 'combine-summary';
        const h3 = document.createElement('h3');
        h3.textContent = 'Your Baseline';
        const p = document.createElement('p');
        p.className = 'combine-summary-empty';
        p.textContent = 'No results yet. Complete the tests below to set your baseline.';
        card.appendChild(h3);
        card.appendChild(p);
        container.appendChild(card);
        return;
    }

    const verticalLatest   = computeVertical(latest.metrics.standingReach, latest.metrics.jumpTouch);
    const verticalBaseline = baseline ? computeVertical(baseline.metrics.standingReach, baseline.metrics.jumpTouch) : null;
    const verticalBest     = (() => {
        const all = getCombineResults().map(r => computeVertical(r.metrics.standingReach, r.metrics.jumpTouch)).filter(v => v != null);
        return all.length > 0 ? Math.max(...all) : null;
    })();

    const displayMetrics = [
        ...COMBINE_METRICS,
        { id: 'vertical', label: 'Vertical Jump', unit: 'in', higherIsBetter: true, _derived: true }
    ];

    const card = document.createElement('div');
    card.className = 'combine-summary';

    const h3 = document.createElement('h3');
    h3.textContent = 'Your Baseline';
    card.appendChild(h3);

    const grid = document.createElement('div');
    grid.className = 'combine-summary-grid';

    displayMetrics.forEach(m => {
        let latestVal, baselineVal, bestVal;
        if (m._derived) {
            latestVal   = verticalLatest;
            baselineVal = verticalBaseline;
            bestVal     = verticalBest;
        } else {
            // eslint-disable-next-line security/detect-object-injection -- m.id is always a key from COMBINE_METRICS
            latestVal   = latest.metrics[m.id];
            // eslint-disable-next-line security/detect-object-injection -- m.id is always a key from COMBINE_METRICS
            baselineVal = baseline ? baseline.metrics[m.id] : null;
            bestVal     = getBest(m.id);
        }

        if (latestVal == null || isNaN(latestVal)) return;

        const cell = document.createElement('div');
        cell.className = 'combine-metric-cell';

        const labelEl = document.createElement('div');
        labelEl.className = 'combine-metric-label';
        labelEl.textContent = m.label;

        const valueEl = document.createElement('div');
        valueEl.className = 'combine-metric-value';
        valueEl.textContent = formatValue(latestVal, m.unit);
        const unitEl = document.createElement('span');
        unitEl.className = 'combine-metric-unit';
        unitEl.textContent = m.unit;
        valueEl.appendChild(unitEl);

        cell.appendChild(labelEl);
        cell.appendChild(valueEl);

        const deltaEl = buildDeltaEl(m, latestVal, baselineVal);
        if (deltaEl) cell.appendChild(deltaEl);

        const bestEl = buildBestEl(m, latestVal, bestVal);
        if (bestEl) cell.appendChild(bestEl);

        grid.appendChild(cell);
    });

    card.appendChild(grid);

    const meta = document.createElement('div');
    meta.className = 'combine-meta';
    const attempts = getCombineResults().length;
    meta.textContent = `${attempts} attempt${attempts !== 1 ? 's' : ''} • Last: ${latest.date}`;
    card.appendChild(meta);

    container.innerHTML = '';
    container.appendChild(card);
}

// ─── Timer factory ────────────────────────────────────────────────────────────

function makeCountUpTimer(displayEl, startBtn, stopBtn, hiddenInput) {
    let seconds = 0;
    let interval = null;

    function tick() {
        seconds++;
        const m = Math.floor(seconds / 60);
        const s = seconds % 60;
        displayEl.textContent = m > 0
            ? `${m}:${String(s).padStart(2, '0')}`
            : `${s}s`;
        displayEl.className = 'combine-timer-display running';
    }

    startBtn.addEventListener('click', () => {
        if (interval) return;
        seconds = 0;
        displayEl.textContent = '0s';
        displayEl.className = 'combine-timer-display running';
        startBtn.disabled = true;
        stopBtn.disabled  = false;
        interval = setInterval(tick, 1000);
    });

    stopBtn.addEventListener('click', () => {
        if (!interval) return;
        clearInterval(interval);
        interval = null;
        startBtn.disabled = false;
        stopBtn.disabled  = true;
        hiddenInput.value = seconds;
        displayEl.className = 'combine-timer-display';
    });
}

function makeCountdownTimer(displayEl, startBtn, repEntryEl) {
    const DURATION = 30;
    let remaining = DURATION;
    let interval  = null;

    startBtn.addEventListener('click', () => {
        if (interval) return;
        remaining = DURATION;
        displayEl.textContent = `${remaining}s`;
        displayEl.className = 'combine-timer-display countdown';
        startBtn.disabled = true;
        repEntryEl.classList.remove('visible');

        interval = setInterval(() => {
            remaining--;
            displayEl.textContent = remaining > 0 ? `${remaining}s` : '0s';
            if (remaining <= 0) {
                clearInterval(interval);
                interval = null;
                displayEl.className = 'combine-timer-display';
                startBtn.disabled = false;
                repEntryEl.classList.add('visible');
            }
        }, 1000);
    });
}

// ─── Render: test input cards ────────────────────────────────────────────────

function createCombineTestCard(metric) {
    const card = document.createElement('div');
    card.className = 'combine-test-card';
    card.dataset.metric = metric.id;

    const info = document.createElement('div');
    info.className = 'combine-test-info';

    const name = document.createElement('div');
    name.className = 'combine-test-name';
    name.textContent = metric.label;

    const notes = document.createElement('p');
    notes.className = 'combine-test-notes';
    notes.textContent = metric.instructions;

    const links = document.createElement('div');
    links.className = 'combine-test-links';
    const videoLink = document.createElement('a');
    videoLink.href      = `https://www.youtube.com/results?search_query=${encodeURIComponent(metric.video)}`;
    videoLink.target    = '_blank';
    videoLink.rel       = 'noopener noreferrer';
    videoLink.className = 'combine-video-link';
    videoLink.textContent = 'Watch';
    links.appendChild(videoLink);

    info.appendChild(name);
    info.appendChild(notes);
    info.appendChild(links);
    card.appendChild(info);

    // Control area — differs by metric type
    if (metric.id === 'standingReach' || metric.id === 'jumpTouch') {
        const group = document.createElement('div');
        group.className = 'combine-vj-pair';

        const labelEl = document.createElement('div');
        labelEl.className = 'combine-input-label';
        labelEl.textContent = metric.unit;

        const input = document.createElement('input');
        input.type        = 'number';
        input.min         = '0';
        input.step        = '0.5';
        input.id          = `combine-input-${metric.id}`;
        input.className   = 'combine-input';
        input.placeholder = '0';
        input.setAttribute('inputmode', 'decimal');

        const computed = document.createElement('div');
        computed.className = 'combine-vj-computed';
        computed.id        = 'combine-vertical-computed';

        group.appendChild(labelEl);
        group.appendChild(input);
        if (metric.id === 'jumpTouch') group.appendChild(computed);
        card.appendChild(group);

    } else if (metric.type === 'timer-up') {
        const group = document.createElement('div');
        group.className = 'combine-timer-group';

        const display = document.createElement('div');
        display.className = 'combine-timer-display';
        display.textContent = '0s';

        const hidden = document.createElement('input');
        hidden.type = 'hidden';
        hidden.id   = `combine-input-${metric.id}`;
        hidden.value = '';

        const startBtn = document.createElement('button');
        startBtn.type      = 'button';
        startBtn.className = 'combine-timer-btn';
        startBtn.textContent = 'Start';

        const stopBtn = document.createElement('button');
        stopBtn.type      = 'button';
        stopBtn.className = 'combine-timer-btn stop-btn';
        stopBtn.textContent = 'Stop';
        stopBtn.disabled  = true;

        group.appendChild(display);
        group.appendChild(startBtn);
        group.appendChild(stopBtn);
        group.appendChild(hidden);
        card.appendChild(group);

        makeCountUpTimer(display, startBtn, stopBtn, hidden);

    } else if (metric.type === 'timer-countdown') {
        const group = document.createElement('div');
        group.className = 'combine-timer-group';

        const display = document.createElement('div');
        display.className = 'combine-timer-display';
        display.textContent = '30s';

        const startBtn = document.createElement('button');
        startBtn.type      = 'button';
        startBtn.className = 'combine-timer-btn';
        startBtn.textContent = 'Start 30s';

        const repEntry = document.createElement('div');
        repEntry.className = 'combine-rep-entry';

        const repLabel = document.createElement('span');
        repLabel.className = 'combine-input-label';
        repLabel.textContent = 'Reps:';

        const repInput = document.createElement('input');
        repInput.type        = 'number';
        repInput.min         = '0';
        repInput.step        = '1';
        repInput.id          = `combine-input-${metric.id}`;
        repInput.className   = 'combine-input';
        repInput.placeholder = '0';
        repInput.setAttribute('inputmode', 'numeric');

        repEntry.appendChild(repLabel);
        repEntry.appendChild(repInput);

        group.appendChild(display);
        group.appendChild(startBtn);
        group.appendChild(repEntry);
        card.appendChild(group);

        makeCountdownTimer(display, startBtn, repEntry);

    } else {
        // plain number input
        const group = document.createElement('div');
        group.className = 'combine-input-group';

        const labelEl = document.createElement('div');
        labelEl.className = 'combine-input-label';
        labelEl.textContent = metric.unit;

        const input = document.createElement('input');
        input.type        = 'number';
        input.min         = '0';
        input.step        = metric.step || '1';
        input.id          = `combine-input-${metric.id}`;
        input.className   = 'combine-input';
        input.placeholder = '0';
        input.setAttribute('inputmode', metric.step ? 'decimal' : 'numeric');

        group.appendChild(labelEl);
        group.appendChild(input);
        card.appendChild(group);
    }

    return card;
}

// ─── Render: full Combine tab ─────────────────────────────────────────────────

function renderCombine() {
    renderCombineSummary();

    const testsContainer = document.getElementById('combine-tests');
    if (!testsContainer) return;

    testsContainer.textContent = '';

    const section = document.createElement('div');
    section.className = 'workout-section';

    const heading = document.createElement('h2');
    heading.textContent = 'Run the Tests';
    section.appendChild(heading);

    COMBINE_METRICS.forEach(metric => {
        section.appendChild(createCombineTestCard(metric));
    });

    testsContainer.appendChild(section);

    const saveWrap = document.createElement('div');
    saveWrap.className = 'combine-save-wrap';
    const saveBtn = document.createElement('button');
    saveBtn.type      = 'button';
    saveBtn.id        = 'btn-save-combine';
    saveBtn.className = 'combine-save-btn';
    saveBtn.textContent = 'Save My Results';
    saveWrap.appendChild(saveBtn);
    testsContainer.appendChild(saveWrap);

    // Wire up save
    saveBtn.addEventListener('click', saveCombine);

    // Wire up vertical computed preview
    wireVerticalPreview();
}

function wireVerticalPreview() {
    const reachInput = document.getElementById('combine-input-standingReach');
    const touchInput = document.getElementById('combine-input-jumpTouch');
    const computed   = document.getElementById('combine-vertical-computed');
    if (!reachInput || !touchInput || !computed) return;

    function updatePreview() {
        const v = computeVertical(reachInput.value, touchInput.value);
        computed.textContent = v != null ? `= ${v} in vertical` : '';
    }

    reachInput.addEventListener('input', updatePreview);
    touchInput.addEventListener('input', updatePreview);
}

// ─── Save handler ─────────────────────────────────────────────────────────────

function saveCombine() {
    const metrics = {};
    let hasAnyValue = false;

    COMBINE_METRICS.forEach(m => {
        const el = document.getElementById(`combine-input-${m.id}`);
        if (!el) return;
        const raw = el.value.trim();
        if (raw === '' || isNaN(parseFloat(raw))) return;
        metrics[m.id] = parseFloat(raw);
        hasAnyValue = true;
    });

    if (!hasAnyValue) {
        showToast('No data entered', 'Enter at least one result before saving.', '📋', 5000);
        return;
    }

    // Compute and store derived vertical
    if (metrics.standingReach != null && metrics.jumpTouch != null) {
        const v = computeVertical(metrics.standingReach, metrics.jumpTouch);
        if (v != null) metrics.vertical = v;
    }

    // Check for personal bests before saving (compare against current best)
    const prs = [];
    COMBINE_METRICS.forEach(m => {
        if (metrics[m.id] == null) return;
        const prev = getBest(m.id);
        if (prev == null) return;
        const improved = m.higherIsBetter
            ? metrics[m.id] > prev
            : metrics[m.id] < prev;
        if (improved) prs.push(m.label);
    });
    if (metrics.vertical != null) {
        const prevBest = (() => {
            const all = getCombineResults().map(r => computeVertical(r.metrics.standingReach, r.metrics.jumpTouch)).filter(v => v != null);
            return all.length > 0 ? Math.max(...all) : null;
        })();
        if (prevBest != null && metrics.vertical > prevBest) prs.push('Vertical Jump');
    }

    saveCombineResult(metrics);
    renderCombineSummary();

    const saveBtn = document.getElementById('btn-save-combine');
    if (saveBtn) {
        saveBtn.textContent = '✔ Saved!';
        saveBtn.classList.add('saved');
        setTimeout(() => {
            saveBtn.textContent = 'Save My Results';
            saveBtn.classList.remove('saved');
        }, 3000);
    }

    if (prs.length > 0) {
        showToast('🏆 New Personal Best!', `You set a new PR in: ${prs.join(', ')}!`, '🏆', 8000);
    } else {
        showToast('Results Saved!', 'Your Combine results have been recorded. Keep training and retest in 4 weeks!', '📋', 6000);
    }
}

// ─── Event listeners ──────────────────────────────────────────────────────────

document.getElementById('btn-combine-onboard-go').addEventListener('click', () => {
    document.getElementById('combine-onboard-modal').style.display = 'none';
    const combineBtn = document.querySelector('#main-nav button[data-tab="combine"]');
    if (combineBtn) {
        // Reuse the existing nav delegation by simulating the tab switch
        document.querySelectorAll('.container').forEach(c => c.classList.remove('active'));
        document.querySelectorAll('.nav button').forEach(b => b.classList.remove('active'));
        document.getElementById('combine').classList.add('active');
        combineBtn.classList.add('active');
    }
});

document.getElementById('btn-combine-onboard-later').addEventListener('click', () => {
    document.getElementById('combine-onboard-modal').style.display = 'none';
});

document.getElementById('btn-combine-onboard-skip').addEventListener('click', () => {
    try {
        localStorage.setItem('combineSkipped', 'true');
    } catch (err) {
        console.error('Failed to save combine skip preference.', err);
    }
    document.getElementById('combine-onboard-modal').style.display = 'none';
});

// ─── Init ─────────────────────────────────────────────────────────────────────

renderCombine();
