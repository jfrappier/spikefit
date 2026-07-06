/**
 * Unit tests for storage.js export/import logic.
 * Pure functions inlined here to avoid DOM/localStorage dependencies.
 */

// ── Stubs ─────────────────────────────────────────────────────────────────────

const _storageStore = {};
const _storageLS = {
    getItem:    k     => _storageStore[k] ?? null,
    setItem:    (k,v) => { _storageStore[k] = v; },
    removeItem: k     => { delete _storageStore[k]; }
};

function _safeParseJSONStorage(key, fallback) {
    const raw = _storageLS.getItem(key);
    if (raw === null) return fallback;
    try { return JSON.parse(raw); } catch (e) { return fallback; }
}

// ── Functions under test (extracted from storage.js) ─────────────────────────

function buildExportBundle(ls) {
    return {
        app: 'SpikeFit',
        schemaVersion: 1,
        exportedAt: new Date().toISOString(),
        data: {
            completedExercises:  _safeParseJSONStorage('completedExercises',  {}),
            completedDates:      _safeParseJSONStorage('completedDates',      {}),
            spikefit_fresh_logs: _safeParseJSONStorage('spikefit_fresh_logs', []),
            workoutLevel:        ls.getItem('workoutLevel') || 'beginner',
            activeWorkoutStart:  ls.getItem('activeWorkoutStart'),
            disclaimerAgreed:    ls.getItem('disclaimerAgreed'),
            combineResults:      _safeParseJSONStorage('combineResults',      []),
            combineSkipped:      ls.getItem('combineSkipped'),
            storagePreference:   ls.getItem('storagePreference')
        }
    };
}

function validateImport(parsed) {
    if (typeof parsed !== 'object' || parsed === null) return false;
    if (parsed.app !== 'SpikeFit')  return false;
    if (parsed.schemaVersion !== 1) return false;
    return true;
}

function parseImport(jsonText) {
    try {
        return JSON.parse(jsonText);
    } catch (e) {
        return null;
    }
}

// ── Export bundle shape ───────────────────────────────────────────────────────

QUnit.module('storage — export bundle', function() {

    QUnit.test('bundle has required top-level fields', function(assert) {
        const bundle = buildExportBundle(_storageLS);
        assert.strictEqual(bundle.app, 'SpikeFit', 'app field is SpikeFit');
        assert.strictEqual(bundle.schemaVersion, 1, 'schemaVersion is 1');
        assert.ok(bundle.exportedAt, 'exportedAt is present');
        assert.ok(bundle.data, 'data object is present');
    });

    QUnit.test('exportedAt is a valid ISO timestamp', function(assert) {
        const bundle = buildExportBundle(_storageLS);
        const d = new Date(bundle.exportedAt);
        assert.ok(!isNaN(d.getTime()), 'exportedAt parses to a valid Date');
    });

    QUnit.test('bundle.data includes all protected keys', function(assert) {
        const bundle = buildExportBundle(_storageLS);
        const expected = [
            'completedExercises', 'completedDates', 'spikefit_fresh_logs',
            'workoutLevel', 'activeWorkoutStart', 'disclaimerAgreed',
            'combineResults', 'combineSkipped', 'storagePreference'
        ];
        for (const key of expected) {
            assert.ok(Object.prototype.hasOwnProperty.call(bundle.data, key), 'data has key: ' + key);
        }
    });

    QUnit.test('workoutLevel defaults to beginner when not set', function(assert) {
        const bundle = buildExportBundle(_storageLS);
        assert.strictEqual(bundle.data.workoutLevel, 'beginner', 'defaults to beginner');
    });

    QUnit.test('workoutLevel reflects localStorage value when set', function(assert) {
        _storageLS.setItem('workoutLevel', 'advanced');
        const bundle = buildExportBundle(_storageLS);
        assert.strictEqual(bundle.data.workoutLevel, 'advanced', 'reads advanced from storage');
        _storageLS.removeItem('workoutLevel');
    });

});

// ── Import validator ──────────────────────────────────────────────────────────

QUnit.module('storage — import validation', function() {

    QUnit.test('accepts a valid SpikeFit backup envelope', function(assert) {
        const good = { app: 'SpikeFit', schemaVersion: 1, data: {} };
        assert.ok(validateImport(good), 'valid bundle passes');
    });

    QUnit.test('rejects wrong app name', function(assert) {
        const bad = { app: 'OtherApp', schemaVersion: 1, data: {} };
        assert.notOk(validateImport(bad), 'wrong app name fails');
    });

    QUnit.test('rejects unknown schemaVersion', function(assert) {
        const bad = { app: 'SpikeFit', schemaVersion: 99, data: {} };
        assert.notOk(validateImport(bad), 'unknown schemaVersion fails');
    });

    QUnit.test('rejects missing app field', function(assert) {
        const bad = { schemaVersion: 1, data: {} };
        assert.notOk(validateImport(bad), 'missing app fails');
    });

    QUnit.test('rejects null input', function(assert) {
        assert.notOk(validateImport(null), 'null fails');
    });

    QUnit.test('rejects non-object input', function(assert) {
        assert.notOk(validateImport('hello'), 'string fails');
        assert.notOk(validateImport(42), 'number fails');
    });

    QUnit.test('parseImport returns null for malformed JSON', function(assert) {
        assert.strictEqual(parseImport('{bad json'), null, 'malformed JSON returns null');
    });

    QUnit.test('parseImport returns parsed object for valid JSON', function(assert) {
        const text = JSON.stringify({ app: 'SpikeFit', schemaVersion: 1, data: {} });
        const result = parseImport(text);
        assert.ok(result !== null, 'valid JSON returns object');
        assert.strictEqual(result.app, 'SpikeFit', 'app field preserved');
    });

});
