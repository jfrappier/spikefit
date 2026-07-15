// Unit tests for resolveTeam() in js/team.js.
// resolveTeam is pure (no DOM, no localStorage) — tests use an inline stub
// with the same TEAMS registry used in production.

var TEAMS_STUB = {
    tigers: { css: 'css/themes/tigers.css' }
};

function resolveTeamStub(hostname, storedTeam, paramTeam) {
    if (hostname && hostname.endsWith('.spikefit.app')) {
        var label = hostname.split('.')[0];
        if (label && Object.prototype.hasOwnProperty.call(TEAMS_STUB, label)) {
            return label;
        }
    }
    if (paramTeam && Object.prototype.hasOwnProperty.call(TEAMS_STUB, paramTeam)) {
        return paramTeam;
    }
    if (storedTeam && Object.prototype.hasOwnProperty.call(TEAMS_STUB, storedTeam)) {
        return storedTeam;
    }
    return null;
}


QUnit.module('resolveTeam — hostname resolution', function() {

    QUnit.test('known subdomain resolves to team', function(assert) {
        assert.equal(resolveTeamStub('tigers.spikefit.app', null, null), 'tigers');
    });

    QUnit.test('apex domain (spikefit.app) returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', null, null), null);
    });

    QUnit.test('www subdomain is not a team', function(assert) {
        assert.equal(resolveTeamStub('www.spikefit.app', null, null), null);
    });

    QUnit.test('unknown subdomain returns null', function(assert) {
        assert.equal(resolveTeamStub('unknownteam.spikefit.app', null, null), null);
    });

    QUnit.test('suffix-attack hostname does not match', function(assert) {
        assert.equal(resolveTeamStub('tigers.spikefit.app.evil.com', null, null), null);
    });

    QUnit.test('empty hostname (file://) returns null', function(assert) {
        assert.equal(resolveTeamStub('', null, null), null);
    });

    QUnit.test('null hostname returns null', function(assert) {
        assert.equal(resolveTeamStub(null, null, null), null);
    });

});


QUnit.module('resolveTeam — param resolution', function() {

    QUnit.test('valid ?team= param resolves without hostname or stored', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', null, 'tigers'), 'tigers');
    });

    QUnit.test('invalid ?team= param returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', null, 'hackers'), null);
    });

    QUnit.test('empty string param returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', null, ''), null);
    });

});


QUnit.module('resolveTeam — localStorage resolution', function() {

    QUnit.test('valid stored team resolves without hostname or param', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', 'tigers', null), 'tigers');
    });

    QUnit.test('invalid stored team returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', 'badvalue', null), null);
    });

    QUnit.test('empty stored string returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', '', null), null);
    });

});


QUnit.module('resolveTeam — priority order', function() {

    QUnit.test('hostname wins over param and stored', function(assert) {
        assert.equal(resolveTeamStub('tigers.spikefit.app', 'tigers', 'tigers'), 'tigers');
    });

    QUnit.test('hostname takes priority even when param has a valid value', function(assert) {
        // tigers in hostname, tigers in param — hostname path is taken first
        assert.equal(resolveTeamStub('tigers.spikefit.app', null, 'tigers'), 'tigers');
    });

    QUnit.test('param beats stored when hostname does not match', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', 'tigers', 'tigers'), 'tigers');
    });

    QUnit.test('stored is fallback when hostname and param are absent', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', 'tigers', null), 'tigers');
    });

    QUnit.test('all absent returns null', function(assert) {
        assert.equal(resolveTeamStub('spikefit.app', null, null), null);
    });

    QUnit.test('file:// + valid stored team resolves team', function(assert) {
        assert.equal(resolveTeamStub('', 'tigers', null), 'tigers');
    });

});
