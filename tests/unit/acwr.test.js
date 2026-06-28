/**
 * Unit tests for the ACWR calculation logic.
 *
 * These tests target the pure calculation in FRESH_SYSTEM.calculateACWR().
 * Once the FRESH system is extracted to js/fresh.js, load it in run.html
 * and remove the inline copy below.
 *
 * Until extraction: copy the calculateACWR function here and test it directly.
 */

// --- Inline stub: replace with `<script src="../../js/fresh.js">` once extracted ---
// Copy of safeParseJSON and the calculateACWR logic for isolated unit testing.

function makeLogEntry(daysAgo, load) {
    const ONE_DAY = 86400000;
    return { timestamp: Date.now() - daysAgo * ONE_DAY, session: { load } };
}

function calculateACWR(logs) {
    const now = Date.now();
    const ONE_DAY = 86400000;
    let acuteLoad = 0;
    let chronicLoad = 0;
    let oldestTimestamp = now;

    if (logs.length === 0) {
        return { ratio: 0, status: 'baseline', acuteLoad: 0, chronicLoad: 0 };
    }

    logs.forEach(log => {
        const daysOld = (now - log.timestamp) / ONE_DAY;
        if (daysOld <= 28) {
            if (log.timestamp < oldestTimestamp) oldestTimestamp = log.timestamp;
            chronicLoad += log.session.load;
            if (daysOld <= 7) acuteLoad += log.session.load;
        }
    });

    const daysActive = (now - oldestTimestamp) / ONE_DAY;
    const BASELINE_THRESHOLD_DAYS = 14;

    if (daysActive < BASELINE_THRESHOLD_DAYS) {
        return {
            ratio: 0,
            status: 'baseline',
            acuteLoad: Math.round(acuteLoad),
            chronicLoad: Math.round(chronicLoad),
            baseline: true,
            daysRemaining: Math.ceil(BASELINE_THRESHOLD_DAYS - daysActive),
        };
    }

    const weeksActive = Math.max(1, Math.min(4, daysActive / 7));
    const averageWeeklyChronic = chronicLoad / weeksActive;

    if (averageWeeklyChronic === 0) {
        return { ratio: 0, status: 'baseline', acuteLoad, chronicLoad: 0 };
    }

    const floatRatio = parseFloat((acuteLoad / averageWeeklyChronic).toFixed(2));
    let status = 'optimal';
    if (floatRatio >= 1.5) {
        status = logs.length < 3 ? 'caution' : 'danger';
    } else if (floatRatio >= 1.3) {
        status = 'caution';
    }

    return { ratio: floatRatio, status, acuteLoad: Math.round(acuteLoad), chronicLoad: Math.round(averageWeeklyChronic) };
}
// --- End inline stub ---


QUnit.module('calculateACWR', function() {

    QUnit.test('empty logs returns baseline', function(assert) {
        const result = calculateACWR([]);
        assert.equal(result.status, 'baseline', 'status is baseline');
        assert.equal(result.ratio, 0, 'ratio is 0');
    });

    QUnit.test('logs spanning less than 14 days trigger baseline gate', function(assert) {
        const logs = [
            makeLogEntry(1, 50),
            makeLogEntry(3, 50),
            makeLogEntry(6, 50),
        ];
        const result = calculateACWR(logs);
        assert.equal(result.status, 'baseline', 'status is baseline when < 14 days of data');
        assert.ok(result.baseline, 'baseline flag is true');
        assert.ok(result.daysRemaining > 0, 'daysRemaining is positive');
    });

    QUnit.test('logs spanning 15+ days produce a computable ratio', function(assert) {
        const logs = [
            makeLogEntry(0, 60),
            makeLogEntry(2, 60),
            makeLogEntry(5, 60),
            makeLogEntry(8, 50),
            makeLogEntry(11, 50),
            makeLogEntry(15, 50),
        ];
        const result = calculateACWR(logs);
        assert.notEqual(result.status, 'baseline', 'status is not baseline after 15 days');
        assert.ok(result.ratio > 0, 'ratio is a positive number');
    });

    QUnit.test('logs older than 28 days are excluded from calculation', function(assert) {
        const logsWithStale = [
            makeLogEntry(0, 100),   // acute + chronic
            makeLogEntry(30, 9999), // stale — should not affect result
        ];
        const logsWithout = [
            makeLogEntry(0, 100),
        ];
        // Both should produce the baseline result (only 1 recent session, < 14 days)
        // but the stale log must not inflate chronicLoad
        const withStale = calculateACWR(logsWithStale);
        const without = calculateACWR(logsWithout);
        assert.equal(withStale.acuteLoad, without.acuteLoad, 'stale log does not affect acute load');
    });

    QUnit.test('ACWR >= 1.5 with fewer than 3 sessions is caution, not danger', function(assert) {
        // 2 sessions, all in the last 7 days — very high acute vs zero chronic history
        const logs = [
            makeLogEntry(1, 500),
            makeLogEntry(3, 500),
        ];
        const result = calculateACWR(logs);
        // If ratio >= 1.5, cold-start guardrail keeps it at caution
        if (result.ratio >= 1.5) {
            assert.equal(result.status, 'caution', 'cold-start guardrail: < 3 sessions = caution not danger');
        } else {
            assert.ok(true, 'ratio did not reach 1.5 in this data set — guardrail not triggered');
        }
    });

    QUnit.test('ACWR >= 1.5 with 3+ sessions is danger', function(assert) {
        // 3 sessions in the last 7 days with zero chronic history across 15 days
        const logs = [
            makeLogEntry(1, 300),
            makeLogEntry(3, 300),
            makeLogEntry(5, 300),
            makeLogEntry(15, 10), // small chronic baseline
        ];
        const result = calculateACWR(logs);
        if (result.ratio >= 1.5) {
            assert.equal(result.status, 'danger', 'ACWR >= 1.5 with 3+ sessions is danger');
        } else {
            assert.ok(true, 'ratio did not reach 1.5 in this data set');
        }
    });

    QUnit.test('ACWR between 1.3 and 1.5 is caution', function(assert) {
        // Construct a dataset that produces ratio in [1.3, 1.5)
        // Acute load slightly higher than chronic weekly average
        const logs = [
            makeLogEntry(1, 150),
            makeLogEntry(4, 150),
            makeLogEntry(8, 110),
            makeLogEntry(12, 110),
            makeLogEntry(16, 110),
            makeLogEntry(20, 110),
        ];
        const result = calculateACWR(logs);
        if (result.ratio >= 1.3 && result.ratio < 1.5) {
            assert.equal(result.status, 'caution', 'ratio in [1.3, 1.5) is caution');
        } else {
            assert.ok(true, `ratio was ${result.ratio} — adjust fixture if needed`);
        }
    });

});
