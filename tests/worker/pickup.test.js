// node --test tests/worker/pickup.test.js
//
// Pure-function coverage for the coach module's pickup decision logic
// (ADR-014, coach-module-plan.md §10). No Cloudflare runtime needed — these
// functions only touch plain objects, Maps, and Sets.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import {
  decidePickup, parseRoster, isValidId, isValidEventId, normalizeId
} from '../../cloudflare/worker.js';

// ─── Fixture roster ─────────────────────────────────────────────────────────

// IDs are 6-char Crockford base32 after the prefix (excludes I, L, O, U — see
// COACH_ID_RE in cloudflare/worker.js) — keep fixture IDs to that alphabet.
const KIDS_ROWS = [
  ['KidID', 'KidName', 'AuthorizedParentIDs', 'Active', 'Notes'],
  ['K-7F3QX9', 'Emma Lee', 'P-2M8KD4, P-9TQW1R', 'TRUE', ''],
  ['K-3H9VBN', 'Owen Lee', 'P-2M8KD4', 'TRUE', 'sibling of Emma'],
  ['k-4rs7tw', 'Inactive Kid', 'P-2M8KD4', '', ''],        // blank Active -> inactive; lowercase in sheet, normalized on parse
  ['K-8CDG5S', 'Orphan Kid', 'P-000000', 'TRUE', '']       // authorized parent well-formed but not on the roster
];

const PARENTS_ROWS = [
  ['ParentID', 'Name', 'Email', 'Phone', 'Active'],
  ['P-2M8KD4', 'Sarah Lee', 'sarah@example.com', '555-0100', 'TRUE'],
  ['P-9TQW1R', 'Mike Lee', 'mike@example.com', '555-0101', 'true'],
  ['p-5ckr3s', 'Revoked Parent', 'revoked@example.com', '', 'FALSE'],
  ['P-6DFH2T', 'Blank Active Parent', 'blank@example.com', '', '']
];

function fixtureRoster() {
  return parseRoster(KIDS_ROWS, PARENTS_ROWS);
}

// ─── parseRoster / parsing rules ────────────────────────────────────────────

test('parseRoster trims and uppercases IDs', () => {
  const roster = fixtureRoster();
  assert.ok(roster.kids.has('K-7F3QX9'));
  assert.ok(roster.kids.has('K-4RS7TW')); // lowercase in the sheet, normalized on parse
  assert.ok(roster.parents.has('P-5CKR3S'));
});

test('parseRoster splits AuthorizedParentIDs on commas and whitespace, uppercased', () => {
  const roster = fixtureRoster();
  const emma = roster.kids.get('K-7F3QX9');
  assert.deepEqual([...emma.authorizedParentIds].sort(), ['P-2M8KD4', 'P-9TQW1R']);
});

test('parseRoster treats only TRUE/true/yes/1 as active; blank is inactive', () => {
  const roster = fixtureRoster();
  assert.equal(roster.kids.get('K-7F3QX9').active, true);
  assert.equal(roster.kids.get('K-4RS7TW').active, false);
  assert.equal(roster.parents.get('P-2M8KD4').active, true);
  assert.equal(roster.parents.get('P-9TQW1R').active, true); // lowercase 'true' still counts
  assert.equal(roster.parents.get('P-5CKR3S').active, false);
  assert.equal(roster.parents.get('P-6DFH2T').active, false); // blank Active column
});

test('parseRoster is case-insensitive on header names', () => {
  const rows = [
    ['kidid', 'KIDNAME', 'authorizedparentids', 'ACTIVE'],
    ['K-1A2B3C', 'Test Kid', 'P-1A2B3C', 'TRUE']
  ];
  const roster = parseRoster(rows, []);
  assert.equal(roster.kids.get('K-1A2B3C').kidName, 'Test Kid');
});

test('parseRoster returns empty maps for missing/header-only sheets', () => {
  assert.equal(parseRoster([], []).kids.size, 0);
  assert.equal(parseRoster([['KidID']], [['ParentID']]).kids.size, 0);
});

// ─── ID validator ────────────────────────────────────────────────────────────

test('isValidId accepts well-formed P-/K- Crockford base32 IDs', () => {
  assert.equal(isValidId('P-2M8KD4'), true);
  assert.equal(isValidId('K-7F3QX9'), true);
});

test('isValidId rejects malformed IDs', () => {
  assert.equal(isValidId('P-2M8KD'), false);     // too short
  assert.equal(isValidId('P-2M8KD44'), false);   // too long
  assert.equal(isValidId('X-2M8KD4'), false);    // bad prefix
  assert.equal(isValidId('P2M8KD4'), false);     // missing dash
  assert.equal(isValidId('P-2M8KDI'), false);    // I is excluded from Crockford base32
  assert.equal(isValidId(''), false);
  assert.equal(isValidId(null), false);
  assert.equal(isValidId(undefined), false);
});

test('normalizeId trims and uppercases before validation', () => {
  assert.equal(normalizeId('  p-2m8kd4 '), 'P-2M8KD4');
  assert.equal(isValidId(normalizeId('p-2m8kd4')), true);
});

test('isValidEventId requires a v4 UUID', () => {
  assert.equal(isValidEventId(randomUUID()), true);
  assert.equal(isValidEventId('not-a-uuid'), false);
  assert.equal(isValidEventId('11111111-1111-1111-1111-111111111111'), false); // version nibble is '1', not '4'
});

// ─── decidePickup ────────────────────────────────────────────────────────────

test('decidePickup: green when the adult is active and authorized for the kid', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-2M8KD4', 'K-7F3QX9');
  assert.equal(result.status, 'green');
  assert.equal(result.kid.kidId, 'K-7F3QX9');
  assert.equal(result.adult.parentId, 'P-2M8KD4');
});

test('decidePickup: green is case/whitespace-insensitive via normalizeId upstream', () => {
  const roster = fixtureRoster();
  // decidePickup itself expects already-normalized IDs (the endpoint normalizes
  // before calling it) — this asserts the normalized form still resolves.
  const result = decidePickup(roster, normalizeId(' p-2m8kd4 '), normalizeId(' k-7f3qx9 '));
  assert.equal(result.status, 'green');
});

test('decidePickup: yellow when the adult is active but not authorized for this kid', () => {
  const roster = fixtureRoster();
  // Sarah (P-2M8KD4) is authorized for Emma but let's use Mike for Owen, who is Emma-only.
  const result = decidePickup(roster, 'P-9TQW1R', 'K-3H9VBN');
  assert.equal(result.status, 'yellow');
  assert.equal(result.kid.kidId, 'K-3H9VBN');
  assert.deepEqual(result.authorizedAdults.map(a => a.parentId), ['P-2M8KD4']);
});

test('decidePickup: adult authorized for one sibling but not another', () => {
  const roster = fixtureRoster();
  assert.equal(decidePickup(roster, 'P-9TQW1R', 'K-7F3QX9').status, 'green'); // Emma: Mike is authorized
  assert.equal(decidePickup(roster, 'P-9TQW1R', 'K-3H9VBN').status, 'yellow'); // Owen: Mike is not
});

test('decidePickup: red for an unknown adult ID', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-000000', 'K-7F3QX9');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'unknown_card');
});

test('decidePickup: red for an unknown kid ID', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-2M8KD4', 'K-000000');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'unknown_card');
});

test('decidePickup: red for an inactive adult', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-5CKR3S', 'K-7F3QX9');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'inactive_card');
});

test('decidePickup: red for an inactive kid', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-2M8KD4', 'K-4RS7TW');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'inactive_card');
});

test('decidePickup: red when a kid card is scanned as the adult', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'K-7F3QX9', 'K-3H9VBN');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'kid_card_as_adult');
});

test('decidePickup: red when an adult card is scanned as the kid', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-2M8KD4', 'P-9TQW1R');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'adult_card_as_kid');
});

test('decidePickup: red for a malformed adult ID (rejected before any lookup)', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'garbage', 'K-7F3QX9');
  assert.equal(result.status, 'red');
  assert.equal(result.reason, 'unknown_card');
});

test('decidePickup: an authorized-adult record listed for a kid but missing from Parents is dropped, not crashed on', () => {
  const roster = fixtureRoster();
  const result = decidePickup(roster, 'P-9TQW1R', 'K-8CDG5S'); // K-8CDG5S lists P-000000, which doesn't exist
  assert.equal(result.status, 'yellow');
  assert.deepEqual(result.authorizedAdults, []);
});
