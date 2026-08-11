/**
 * Unit tests for the long-workout duration sanity check.
 *
 * Targets the pure detection logic in js/app.js (isAbnormalDuration + medianOf).
 * Until app.js is loadable in the harness, the functions under test are copied
 * inline below, kept in sync with the originals.
 */

// --- Inline copy: keep in sync with js/app.js ---
const LONG_WORKOUT_FLOOR_MINS  = 75;
const LONG_WORKOUT_MEDIAN_MULT = 2.5;
const LONG_WORKOUT_MIN_HISTORY = 3;

function medianOf(nums) {
    if (!nums.length) return 0;
    const sorted = [...nums].sort((a, b) => a - b);
    const mid = Math.floor(sorted.length / 2);
    return sorted.length % 2 ? sorted[mid] : (sorted[mid - 1] + sorted[mid]) / 2;
}

function isAbnormalDuration(minutes, priorDurations) {
    if (minutes <= LONG_WORKOUT_FLOOR_MINS) return false;
    const valid = (priorDurations || []).filter(d => typeof d === 'number' && d > 0);
    if (valid.length < LONG_WORKOUT_MIN_HISTORY) return true;
    return minutes > medianOf(valid) * LONG_WORKOUT_MEDIAN_MULT;
}
// --- end inline copy ---

QUnit.module('medianOf');

QUnit.test('empty array returns 0', assert => {
    assert.equal(medianOf([]), 0);
});

QUnit.test('odd length returns middle value', assert => {
    assert.equal(medianOf([40, 20, 30]), 30);
});

QUnit.test('even length averages the two middle values', assert => {
    assert.equal(medianOf([20, 40, 30, 50]), 35);
});

QUnit.module('isAbnormalDuration');

QUnit.test('durations at or below the floor are never flagged', assert => {
    assert.false(isAbnormalDuration(75, []), '75 (== floor) not flagged even with no history');
    assert.false(isAbnormalDuration(45, [10, 12, 11]), 'normal 45-min session not flagged');
    assert.false(isAbnormalDuration(0, [40, 40, 40]), 'zero not flagged');
});

QUnit.test('over the floor with too little history falls back to the floor alone', assert => {
    assert.true(isAbnormalDuration(90, []), 'no history: over floor -> flagged');
    assert.true(isAbnormalDuration(90, [40, 40]), 'only 2 priors: over floor -> flagged');
});

QUnit.test("real-world case: 131 min against a ~40-min median is flagged", assert => {
    const priors = [45, 15, 34, 59, 38, 46, 45, 40, 37]; // median 40
    assert.true(isAbnormalDuration(131, priors), '131 > 75 and > 2.5*40 (100)');
});

QUnit.test('does not nag a legitimate long-session athlete', assert => {
    const priors = [90, 100, 110, 95, 105]; // median 100 -> threshold 250
    assert.false(isAbnormalDuration(120, priors), '120 over floor but well under 2.5*100');
});

QUnit.test('personalized threshold gates just above 2.5x the median', assert => {
    const priors = [40, 40, 40]; // median 40 -> threshold 100
    assert.false(isAbnormalDuration(100, priors), '100 == 2.5*40 boundary, not flagged');
    assert.true(isAbnormalDuration(101, priors), '101 just over threshold, flagged');
});

QUnit.test('non-numeric and non-positive priors are ignored', assert => {
    // Only 40, 42, 44 are valid -> median 42 -> threshold 105. 76 is over the floor but
    // there are 3 valid priors, so the personalized threshold (105) applies and 76 < 105.
    const priors = [40, null, '50', 42, -5, 0, 44, undefined];
    assert.false(isAbnormalDuration(76, priors), 'garbage filtered; 76 under personalized threshold');
    assert.true(isAbnormalDuration(110, priors), '110 over both floor and personalized threshold');
});
