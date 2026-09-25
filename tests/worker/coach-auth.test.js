// node --test tests/worker/coach-auth.test.js
//
// Coverage for team resolution (the pure half of requireCoachApi/handleCoachPage)
// and the feature-flag reader. See ADR-014 and coach-module-plan.md §5, §10.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { resolveCoachHostTeam, resolveCoachTeam, isFeatureOn, isSheetConfigured } from '../../cloudflare/worker.js';

// ─── resolveCoachHostTeam ────────────────────────────────────────────────────

test('resolveCoachHostTeam: a team subdomain proposes its label', () => {
  assert.equal(resolveCoachHostTeam('tigers.spikefit.app'), 'tigers');
});

test('resolveCoachHostTeam: apex domain proposes no team', () => {
  assert.equal(resolveCoachHostTeam('spikefit.app'), null);
});

test('resolveCoachHostTeam: www proposes no team', () => {
  assert.equal(resolveCoachHostTeam('www.spikefit.app'), null);
});

test('resolveCoachHostTeam: a spoofed suffix does not match', () => {
  assert.equal(resolveCoachHostTeam('tigers.spikefit.app.evil.com'), null);
});

test('resolveCoachHostTeam: unrelated hostname proposes no team', () => {
  assert.equal(resolveCoachHostTeam('example.com'), null);
  assert.equal(resolveCoachHostTeam(''), null);
  assert.equal(resolveCoachHostTeam(null), null);
});

// ─── resolveCoachTeam ────────────────────────────────────────────────────────

test('resolveCoachTeam: team subdomain + coach assigned to it resolves that team', () => {
  const team = resolveCoachTeam({ hostname: 'tigers.spikefit.app', bodyTeam: null, coachTeams: ['tigers', 'lions'] });
  assert.equal(team, 'tigers');
});

test('resolveCoachTeam: team subdomain the coach is NOT assigned to resolves to null (not a redirect hint)', () => {
  const team = resolveCoachTeam({ hostname: 'lions.spikefit.app', bodyTeam: null, coachTeams: ['tigers'] });
  assert.equal(team, null);
});

test('resolveCoachTeam: hostname always wins over a body team on a team subdomain', () => {
  // Even if the client sends a different (valid) team in the body, the
  // subdomain is authoritative when present.
  const team = resolveCoachTeam({ hostname: 'tigers.spikefit.app', bodyTeam: 'lions', coachTeams: ['tigers', 'lions'] });
  assert.equal(team, 'tigers');
});

test('resolveCoachTeam: apex/www falls back to the body-supplied team', () => {
  const team = resolveCoachTeam({ hostname: 'spikefit.app', bodyTeam: 'tigers', coachTeams: ['tigers'] });
  assert.equal(team, 'tigers');
});

test('resolveCoachTeam: apex host with a body team the coach is not assigned to resolves to null', () => {
  const team = resolveCoachTeam({ hostname: 'www.spikefit.app', bodyTeam: 'lions', coachTeams: ['tigers'] });
  assert.equal(team, null);
});

test('resolveCoachTeam: no hostname match and no body team resolves to null', () => {
  assert.equal(resolveCoachTeam({ hostname: 'spikefit.app', bodyTeam: null, coachTeams: ['tigers'] }), null);
});

test('resolveCoachTeam: a spoofed subdomain suffix falls back to the body team, not the spoofed label', () => {
  const team = resolveCoachTeam({ hostname: 'tigers.spikefit.app.evil.com', bodyTeam: 'tigers', coachTeams: ['tigers'] });
  assert.equal(team, 'tigers'); // resolved via the body fallback, not the spoofed hostname label
});

test('resolveCoachTeam: coachTeams is treated as empty when missing/malformed', () => {
  assert.equal(resolveCoachTeam({ hostname: 'tigers.spikefit.app', bodyTeam: null, coachTeams: undefined }), null);
  assert.equal(resolveCoachTeam({ hostname: 'tigers.spikefit.app', bodyTeam: null, coachTeams: null }), null);
});

// ─── isFeatureOn ─────────────────────────────────────────────────────────────

test('isFeatureOn: true when the flag is strictly boolean true', () => {
  assert.equal(isFeatureOn({ features: { pickup: true } }, 'pickup'), true);
});

test('isFeatureOn: false when the flag is missing', () => {
  assert.equal(isFeatureOn({ features: {} }, 'pickup'), false);
  assert.equal(isFeatureOn({ features: { other: true } }, 'pickup'), false);
});

test('isFeatureOn: false when the flag is present but not a boolean', () => {
  assert.equal(isFeatureOn({ features: { pickup: 'true' } }, 'pickup'), false);
  assert.equal(isFeatureOn({ features: { pickup: 1 } }, 'pickup'), false);
  assert.equal(isFeatureOn({ features: { pickup: null } }, 'pickup'), false);
});

test('isFeatureOn: false when features or teamConfig itself is missing', () => {
  assert.equal(isFeatureOn({}, 'pickup'), false);
  assert.equal(isFeatureOn(null, 'pickup'), false);
});

test('isFeatureOn: explicit false is off', () => {
  assert.equal(isFeatureOn({ features: { pickup: false } }, 'pickup'), false);
});

// ─── isSheetConfigured ───────────────────────────────────────────────────────

test('isSheetConfigured: true for a non-empty sheetId string', () => {
  assert.equal(isSheetConfigured({ sheetId: '1AbC-xyz123' }), true);
});

test('isSheetConfigured: false when sheetId is missing, blank, or the wrong type', () => {
  assert.equal(isSheetConfigured({}), false);
  assert.equal(isSheetConfigured({ sheetId: '' }), false);
  assert.equal(isSheetConfigured({ sheetId: '   ' }), false);
  assert.equal(isSheetConfigured({ sheetId: null }), false);
  assert.equal(isSheetConfigured({ sheetId: 12345 }), false);
  assert.equal(isSheetConfigured(null), false);
});
