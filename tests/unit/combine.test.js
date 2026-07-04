/**
 * Unit tests for pure Combine functions.
 * Functions under test are inlined here to avoid DOM/localStorage dependencies.
 */

// ── Inline stubs ──────────────────────────────────────────────────────────────

const _combineStore = {};
const _stubLS = {
    getItem: k => _combineStore[k] ?? null,
    setItem: (k, v) => { _combineStore[k] = v; },
    removeItem: k => { delete _combineStore[k]; }
};

function _safeParseJSON(key, fallback) {
    const raw = _stubLS.getItem(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
}

// ── Functions under test (copies of combine.js pure functions) ────────────────

function computeVertical(reach, touch) {
    const r = parseFloat(reach);
    const t = parseFloat(touch);
    if (isNaN(r) || isNaN(t) || r <= 0 || t <= 0) return null;
    const v = t - r;
    return v > 0 ? Math.round(v * 10) / 10 : null;
}

const COMBINE_METRICS_TEST = [
    { id: 'vertical',      higherIsBetter: true  },
    { id: 'plankSec',      higherIsBetter: true  },
    { id: 'wallSitSec',    higherIsBetter: true  },
    { id: 'toeTaps',       higherIsBetter: true  },
    { id: 'jumpingJacks',  higherIsBetter: true  },
    { id: 'standingReach', higherIsBetter: true  },
    { id: 'jumpTouch',     higherIsBetter: true  },
    { id: 'agilitySec',    higherIsBetter: false }
];

function getBestInline(metricId, results) {
    const config = COMBINE_METRICS_TEST.find(m => m.id === metricId);
    const higherIsBetter = config ? config.higherIsBetter : true;
    let best = null;
    for (const r of results) {
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

const COMBINE_RETEST_DAYS_TEST = 28;

function combineRetestDueInline(latestTimestamp) {
    if (latestTimestamp == null) return false;
    const daysSince = (Date.now() - latestTimestamp) / 86400000;
    return daysSince >= COMBINE_RETEST_DAYS_TEST;
}

// ── Tests ─────────────────────────────────────────────────────────────────────

QUnit.module('computeVertical', () => {
    QUnit.test('typical measurement', assert => {
        assert.equal(computeVertical(84, 108), 24);
    });

    QUnit.test('decimal precision preserved', assert => {
        assert.equal(computeVertical(83.5, 108.0), 24.5);
    });

    QUnit.test('rounds to 1 decimal place', assert => {
        assert.equal(computeVertical(84, 108.15), 24.2);
    });

    QUnit.test('returns null when touch <= reach', assert => {
        assert.equal(computeVertical(108, 84), null, 'touch < reach');
        assert.equal(computeVertical(84, 84), null, 'touch = reach');
    });

    QUnit.test('returns null for zero or negative inputs', assert => {
        assert.equal(computeVertical(0, 108), null, 'reach = 0');
        assert.equal(computeVertical(84, 0), null, 'touch = 0');
        assert.equal(computeVertical(-1, 108), null, 'negative reach');
    });

    QUnit.test('returns null for non-numeric inputs', assert => {
        assert.equal(computeVertical('abc', 108), null);
        assert.equal(computeVertical(84, ''), null);
        assert.equal(computeVertical(undefined, 108), null);
        assert.equal(computeVertical(null, null), null);
    });

    QUnit.test('accepts string numbers', assert => {
        assert.equal(computeVertical('84', '108'), 24);
    });
});

QUnit.module('getBest', () => {
    QUnit.test('returns max for higher-is-better metrics', assert => {
        const results = [
            { metrics: { plankSec: 60 } },
            { metrics: { plankSec: 90 } },
            { metrics: { plankSec: 75 } }
        ];
        assert.equal(getBestInline('plankSec', results), 90);
    });

    QUnit.test('returns min for agilitySec (lower is better)', assert => {
        const results = [
            { metrics: { agilitySec: 12.5 } },
            { metrics: { agilitySec: 11.0 } },
            { metrics: { agilitySec: 11.8 } }
        ];
        assert.equal(getBestInline('agilitySec', results), 11.0);
    });

    QUnit.test('returns null when metric missing from all results', assert => {
        const results = [
            { metrics: { plankSec: 60 } },
            { metrics: { plankSec: 90 } }
        ];
        assert.equal(getBestInline('agilitySec', results), null);
    });

    QUnit.test('tolerates undefined and null metric values', assert => {
        const results = [
            { metrics: { plankSec: undefined } },
            { metrics: { plankSec: null } },
            { metrics: { plankSec: 80 } }
        ];
        assert.equal(getBestInline('plankSec', results), 80);
    });

    QUnit.test('returns null for empty results array', assert => {
        assert.equal(getBestInline('plankSec', []), null);
    });

    QUnit.test('single result returns that value', assert => {
        const results = [{ metrics: { toeTaps: 55 } }];
        assert.equal(getBestInline('toeTaps', results), 55);
    });
});

QUnit.module('combineRetestDue', () => {
    QUnit.test('returns false when null (no data)', assert => {
        assert.false(combineRetestDueInline(null));
    });

    QUnit.test('returns false at 27 days', assert => {
        const ts = Date.now() - 27 * 86400000;
        assert.false(combineRetestDueInline(ts));
    });

    QUnit.test('returns true at exactly 28 days', assert => {
        const ts = Date.now() - 28 * 86400000;
        assert.true(combineRetestDueInline(ts));
    });

    QUnit.test('returns true beyond 28 days', assert => {
        const ts = Date.now() - 35 * 86400000;
        assert.true(combineRetestDueInline(ts));
    });
});
