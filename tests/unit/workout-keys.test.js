/**
 * Unit tests for workout key logic and safeParseJSON.
 *
 * Once these functions are extracted to js/workouts.js and js/utils.js,
 * load those files in run.html and remove the inline stubs below.
 */

// --- Inline stubs: replace with script tags once extracted ---

function safeParseJSONStub(raw, fallback) {
    if (raw === null) return fallback;
    try {
        return JSON.parse(raw);
    } catch (err) {
        return fallback;
    }
}

function getWorkoutKeyStub(baseKey, level) {
    if (baseKey === 'Rest/Run') return baseKey;
    if (level === 'advanced')     return baseKey + '3';
    if (level === 'intermediate') return baseKey + '2';
    return baseKey;
}

function getTodayDateStrStub() {
    const today = new Date();
    const year  = today.getFullYear();
    const month = String(today.getMonth() + 1).padStart(2, '0');
    const day   = String(today.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

function getExerciseKeyStub(exerciseId, dateStr) {
    return `${dateStr}_${exerciseId}`;
}

// --- End inline stubs ---


QUnit.module('getWorkoutKey', function() {

    QUnit.test('beginner returns bare key', function(assert) {
        assert.equal(getWorkoutKeyStub('A', 'beginner'), 'A');
        assert.equal(getWorkoutKeyStub('B', 'beginner'), 'B');
        assert.equal(getWorkoutKeyStub('C', 'beginner'), 'C');
        assert.equal(getWorkoutKeyStub('D', 'beginner'), 'D');
    });

    QUnit.test('intermediate appends 2', function(assert) {
        assert.equal(getWorkoutKeyStub('A', 'intermediate'), 'A2');
        assert.equal(getWorkoutKeyStub('B', 'intermediate'), 'B2');
    });

    QUnit.test('advanced appends 3', function(assert) {
        assert.equal(getWorkoutKeyStub('A', 'advanced'), 'A3');
        assert.equal(getWorkoutKeyStub('D', 'advanced'), 'D3');
    });

    QUnit.test('Rest/Run is returned as-is regardless of level', function(assert) {
        assert.equal(getWorkoutKeyStub('Rest/Run', 'beginner'),     'Rest/Run');
        assert.equal(getWorkoutKeyStub('Rest/Run', 'intermediate'), 'Rest/Run');
        assert.equal(getWorkoutKeyStub('Rest/Run', 'advanced'),     'Rest/Run');
    });

});


QUnit.module('getExerciseKey', function() {

    QUnit.test('key format is YYYY-MM-DD_exerciseId', function(assert) {
        const key = getExerciseKeyStub('a1', '2024-06-15');
        assert.equal(key, '2024-06-15_a1');
    });

    QUnit.test('same exercise on two dates produces distinct keys', function(assert) {
        const key1 = getExerciseKeyStub('a1', '2024-06-15');
        const key2 = getExerciseKeyStub('a1', '2024-06-22');
        assert.notEqual(key1, key2, 'same exercise ID on different dates is distinct');
    });

    QUnit.test('two different exercises on same date produce distinct keys', function(assert) {
        const today = getTodayDateStrStub();
        const key1 = getExerciseKeyStub('a1', today);
        const key2 = getExerciseKeyStub('a2', today);
        assert.notEqual(key1, key2, 'different exercise IDs on same date are distinct');
    });

});


QUnit.module('safeParseJSON', function() {

    QUnit.test('valid JSON returns parsed value', function(assert) {
        const raw = JSON.stringify({ level: 'beginner', count: 3 });
        const result = safeParseJSONStub(raw, {});
        assert.deepEqual(result, { level: 'beginner', count: 3 });
    });

    QUnit.test('null input returns the fallback', function(assert) {
        const result = safeParseJSONStub(null, []);
        assert.deepEqual(result, []);
    });

    QUnit.test('malformed JSON returns the fallback', function(assert) {
        const result = safeParseJSONStub('{ not valid json {{', {});
        assert.deepEqual(result, {});
    });

    QUnit.test('empty string returns the fallback', function(assert) {
        const result = safeParseJSONStub('', null);
        assert.equal(result, null);
    });

    QUnit.test('fallback can be a non-null primitive', function(assert) {
        const result = safeParseJSONStub('bad', 'default-value');
        assert.equal(result, 'default-value');
    });

});


QUnit.module('getTodayDateStr', function() {

    QUnit.test('returns a YYYY-MM-DD formatted string for today', function(assert) {
        const result = getTodayDateStrStub();
        assert.ok(/^\d{4}-\d{2}-\d{2}$/.test(result), `"${result}" matches YYYY-MM-DD format`);
    });

    QUnit.test('month and day are zero-padded', function(assert) {
        const result = getTodayDateStrStub();
        const parts = result.split('-');
        assert.equal(parts[1].length, 2, 'month is two digits');
        assert.equal(parts[2].length, 2, 'day is two digits');
    });

});
