// node --test tests/worker/events.test.js
//
// Events module (ADR-015). Two halves:
//   1. Pure helpers (validation, time math, HMAC ids, RSVP summaries).
//   2. Handler-level tests driven through the Worker's default export with an
//      in-memory fake env — including the privacy invariant that no email
//      address is ever written to the EVENTS or RATELIMIT namespaces.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import worker, {
  cleanText, normalizeDisplayName, isValidDate, isValidTime, shiftDate, isValidMemberId,
  eventTypesFor, validateEventInput, eventEndStamp, hasEnded, eventExpiry, hmacId,
  eventKey, parseEventKey, rsvpKey, parseRsvpKey, summarizeRsvps, canRsvpFor,
  DEFAULT_EVENT_TYPES, todayLocalDate, nameError
} from '../../cloudflare/worker.js';
import { FakeKV } from './helpers/fake-kv.js';

const SECRET = 'test-secret-test-secret-test-secret';

// ─── Pure helpers ────────────────────────────────────────────────────────────

test('cleanText strips control characters, collapses whitespace, and caps length', () => {
  assert.equal(cleanText('  Hello\u0000\u0007   world \n ', 80), 'Hello world');
  assert.equal(cleanText('x'.repeat(200), 10), 'xxxxxxxxxx');
  assert.equal(cleanText(42, 10), '');
});

test('cleanText multiline keeps single newlines but collapses runs', () => {
  assert.equal(cleanText('a\nb\n\n\n\nc', 100, { multiline: true }), 'a\nb\n\nc');
});

test('cleanText does not split a surrogate pair at the cap', () => {
  assert.equal(cleanText('🏐🏐🏐', 2), '🏐🏐');
});

test('normalizeDisplayName caps at 30 chars and rejects empty', () => {
  assert.equal(normalizeDisplayName('Alex M.'), 'Alex M.');
  assert.equal(normalizeDisplayName('   '), '');
  assert.equal(normalizeDisplayName('a'.repeat(50)).length, 30);
});

test('isValidDate / isValidTime', () => {
  assert.equal(isValidDate('2026-11-29'), true);
  assert.equal(isValidDate('2026-02-30'), false);
  assert.equal(isValidDate('2026-1-5'), false);
  assert.equal(isValidTime('09:00'), true);
  assert.equal(isValidTime('24:00'), false);
  assert.equal(isValidTime('9:00'), false);
});

test('shiftDate crosses month and year boundaries', () => {
  assert.equal(shiftDate('2026-12-31', 1), '2027-01-01');
  assert.equal(shiftDate('2026-03-01', -1), '2026-02-28');
});

test('eventTypesFor falls back to defaults on missing or junk config', () => {
  assert.deepEqual(eventTypesFor({}), DEFAULT_EVENT_TYPES);
  assert.deepEqual(eventTypesFor({ eventTypes: 'nope' }), DEFAULT_EVENT_TYPES);
  assert.deepEqual(eventTypesFor({ eventTypes: [{ id: 'BAD ID', label: 'x' }] }), DEFAULT_EVENT_TYPES);
});

test('eventTypesFor uses a valid team list and drops duplicates', () => {
  const types = eventTypesFor({ eventTypes: [
    { id: 'tournament', label: 'Tournament' }, { id: 'tournament', label: 'Dup' }, { id: 'other', label: 'Other' }
  ] });
  assert.deepEqual(types, [{ id: 'tournament', label: 'Tournament' }, { id: 'other', label: 'Other' }]);
});

const good = { type: 'practice', title: 'Practice', date: '2026-11-29', time: '18:00', location: 'Gym', notes: '' };

test('validateEventInput accepts a good event and normalizes fields', () => {
  const r = validateEventInput({ ...good, title: '  Practice  ' }, DEFAULT_EVENT_TYPES, '2026-11-21');
  assert.equal(r.ok, true);
  assert.equal(r.event.title, 'Practice');
  assert.equal(r.event.endTime, '');
  assert.equal(r.event.canceled, false);
});

test('validateEventInput rejects bad type, title, date, time, end time', () => {
  const t = DEFAULT_EVENT_TYPES;
  assert.equal(validateEventInput({ ...good, type: 'party' }, t, null).error, 'bad_type');
  assert.equal(validateEventInput({ ...good, title: '   ' }, t, null).error, 'title_required');
  assert.equal(validateEventInput({ ...good, date: '2026-13-01' }, t, null).error, 'bad_date');
  assert.equal(validateEventInput({ ...good, time: '7pm' }, t, null).error, 'bad_time');
  assert.equal(validateEventInput({ ...good, endTime: '17:00' }, t, null).error, 'end_before_start');
  assert.equal(validateEventInput(null, t, null).error, 'bad_request');
});

test('validateEventInput rejects dates older than yesterday only when `today` is given', () => {
  const old = { ...good, date: '2026-11-01' };
  assert.equal(validateEventInput(old, DEFAULT_EVENT_TYPES, '2026-11-21').error, 'date_in_past');
  assert.equal(validateEventInput(old, DEFAULT_EVENT_TYPES, null).ok, true);
  assert.equal(validateEventInput({ ...good, date: '2026-11-20' }, DEFAULT_EVENT_TYPES, '2026-11-21').ok, true);
});

test('eventEndStamp uses endTime, else start + 2h, rolling past midnight', () => {
  assert.equal(eventEndStamp({ date: '2026-11-29', time: '18:00', endTime: '19:30' }), '2026-11-29 19:30');
  assert.equal(eventEndStamp({ date: '2026-11-29', time: '18:00', endTime: '' }), '2026-11-29 20:00');
  assert.equal(eventEndStamp({ date: '2026-11-29', time: '23:00', endTime: '' }), '2026-11-30 01:00');
});

test('hasEnded is false while in progress and true after the end', () => {
  const ev = { date: '2026-11-29', time: '18:00', endTime: '' };
  assert.equal(hasEnded(ev, '2026-11-29 19:59'), false);
  assert.equal(hasEnded(ev, '2026-11-29 20:00'), true);
});

test('eventExpiry is date + 31 days, and never under 2 minutes away', () => {
  const now = Date.UTC(2026, 10, 21);
  assert.equal(eventExpiry('2026-11-29', now), Math.floor(Date.UTC(2026, 10, 29) / 1000) + 31 * 86400);
  assert.ok(eventExpiry('2020-01-01', now) >= Math.floor(now / 1000) + 120);
});

test('hmacId is deterministic, case-insensitive, team- and scope-separated, and hides the email', async () => {
  const a = await hmacId(SECRET, 'm', 'millis', 'Kid@Example.com');
  const b = await hmacId(SECRET, 'm', 'millis', 'kid@example.com ');
  assert.equal(a, b);
  assert.match(a, /^[0-9a-f]{32}$/);
  assert.notEqual(a, await hmacId(SECRET, 'm', 'tigers', 'kid@example.com'));
  assert.notEqual(a, await hmacId(SECRET, 'g', 'millis', 'kid@example.com'));
  assert.notEqual(a, await hmacId(SECRET + 'x', 'm', 'millis', 'kid@example.com'));
  assert.ok(!a.includes('kid'));
});

test('hmacId refuses a missing or short secret', async () => {
  await assert.rejects(() => hmacId('', 'm', 'millis', 'a@b.c'));
  await assert.rejects(() => hmacId('short', 'm', 'millis', 'a@b.c'));
});

test('event and rsvp keys round-trip', () => {
  const id = '11111111-1111-4111-8111-111111111111';
  const name = eventKey('millis', '2026-11-29', '09:05', id);
  assert.equal(name, `ev:millis:2026-11-29T0905:${id}`);
  assert.deepEqual(parseEventKey(name), { name, team: 'millis', date: '2026-11-29', time: '09:05', id });
  assert.equal(parseEventKey('ev:millis:garbage'), null);
  const mid = 'a'.repeat(32);
  assert.deepEqual(parseRsvpKey(rsvpKey('millis', id, mid)), { team: 'millis', eventId: id, memberId: mid });
  assert.equal(parseRsvpKey('me:millis:abc'), null);
});

test('isValidMemberId accepts 32-hex and v4 UUIDs only', () => {
  assert.equal(isValidMemberId('a'.repeat(32)), true);
  assert.equal(isValidMemberId('11111111-1111-4111-8111-111111111111'), true);
  assert.equal(isValidMemberId('nope'), false);
  assert.equal(isValidMemberId('a:b'), false);
});

test('summarizeRsvps counts by response and ignores malformed entries', () => {
  const ev = '11111111-1111-4111-8111-111111111111';
  const m = n => String(n).repeat(32).slice(0, 32);
  const s = summarizeRsvps([
    { name: rsvpKey('t', ev, m(1)), metadata: { n: 'Alex', r: 'yes', b: 'self' } },
    { name: rsvpKey('t', ev, m(2)), metadata: { n: 'Sam', r: 'no', b: 'guardian' } },
    { name: rsvpKey('t', ev, m(3)), metadata: { n: 'Bad', r: 'perhaps' } },
    { name: rsvpKey('t', ev, m(4)) }
  ]).get(ev);
  assert.deepEqual(s.counts, { yes: 1, maybe: 0, no: 1 });
  assert.equal(s.entries.length, 2);
  assert.equal(s.entries[1].by, 'guardian');
});

test('canRsvpFor allows self and own kids only', () => {
  assert.equal(canRsvpFor('me', 'me', []), true);
  assert.equal(canRsvpFor('kid1', 'me', ['kid1']), true);
  assert.equal(canRsvpFor('kid2', 'me', ['kid1']), false);
});

// ─── Handler-level tests ─────────────────────────────────────────────────────

const HOST = 'https://millis.spikefit.app';
const COACH   = 'coach@example.com';
const PLAYER  = 'player@example.com';
const MINOR   = 'minor@example.com';
const PARENT  = 'parent@example.com';
const OUTSIDER = 'outsider@example.com';
const EMAILS = [COACH, PLAYER, MINOR, PARENT, OUTSIDER];

function makeEnv({ events = true } = {}) {
  const sessions = {};
  EMAILS.forEach((e, i) => { sessions[`tok${i}`] = e; });
  return {
    EVENTS_HMAC_KEY: SECRET,
    SESSIONS: new FakeKV(sessions),
    ALLOWLIST: new FakeKV({
      [COACH]: JSON.stringify({ allowed: true, coach: { teams: ['millis'] } }),
      [PLAYER]: 'true',
      [MINOR]: JSON.stringify({ allowed: true, minor: true, guardianEmail: PARENT, guardianAcceptedAt: '2026-01-01T00:00:00Z' }),
      [PARENT]: 'true',
      [OUTSIDER]: JSON.stringify({ allowed: true, coach: { teams: ['tigers'] } })
    }),
    TEAMS: new FakeKV({
      'team:millis': JSON.stringify({ name: 'Millis', timezone: 'America/New_York', features: { events } })
    }),
    EVENTS: new FakeKV(),
    RATELIMIT: new FakeKV(),
    OTPS: new FakeKV(),
    CONSENTS: new FakeKV()
  };
}

const TOKEN = { [COACH]: 'tok0', [PLAYER]: 'tok1', [MINOR]: 'tok2', [PARENT]: 'tok3', [OUTSIDER]: 'tok4' };

async function call(env, as, path, body, { host = HOST, origin } = {}) {
  const headers = { Cookie: `sf_session=${TOKEN[as]}` };
  const init = { headers };
  if (body !== undefined) {
    init.method = 'POST';
    headers['Content-Type'] = 'application/json';
    headers.Origin = origin ?? host;
    init.body = JSON.stringify(body);
  }
  const res = await worker.fetch(new Request(`${host}${path}`, init), env);
  let json = null;
  try { json = await res.json(); } catch { /* non-JSON */ }
  return { status: res.status, json };
}

const TODAY = todayLocalDate('America/New_York');
const futureEvent = (over = {}) => ({
  type: 'game', title: 'Home game', date: shiftDate(TODAY, 3), time: '18:00', endTime: '20:00',
  location: 'Lincoln HS', notes: 'Wear white', ...over
});

async function createEvent(env, over) {
  const r = await call(env, COACH, '/events/api/event/save', { event: futureEvent(over) });
  assert.equal(r.status, 200, JSON.stringify(r.json));
  return r.json.id;
}

test('full flow: coach creates, players/parents RSVP, coach sees names, others see counts', async () => {
  const env = makeEnv();
  const id = await createEvent(env);

  // Player sets a name, then RSVPs.
  assert.equal((await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' })).json.error, 'name_required');
  assert.equal((await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' })).status, 200);
  assert.equal((await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' })).status, 200);

  // Minor with a confirmed guardian: auto-linked on profile save.
  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  assert.equal((await call(env, MINOR, '/events/api/rsvp', { eventId: id, response: 'maybe' })).status, 200);

  // Parent sees the linked kid's answer, adds a kid without a login, answers for them.
  let list = (await call(env, PARENT, '/events/api/list')).json;
  assert.equal(list.kids.length, 1);
  assert.deepEqual({ name: list.kids[0].name, linked: list.kids[0].linked }, { name: 'Alex M.', linked: true });
  assert.equal(list.events[0].kidAnswers[0].response, 'maybe');
  const add = (await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' })).json;
  assert.equal((await call(env, PARENT, '/events/api/rsvp', { eventId: id, response: 'yes', memberId: add.memberId })).status, 200);
  // Parent answering for the linked kid overrides it, marked as guardian.
  const linked = list.kids[0].memberId;
  await call(env, PARENT, '/events/api/rsvp', { eventId: id, response: 'no', memberId: linked });
  list = (await call(env, PARENT, '/events/api/list')).json;
  const alex = list.events[0].kidAnswers.find(k => k.memberId === linked);
  assert.deepEqual({ response: alex.response, by: alex.by }, { response: 'no', by: 'guardian' });

  // Coach sees names; players and parents never do.
  const coachView = (await call(env, COACH, '/events/api/list')).json;
  assert.equal(coachView.isCoach, true);
  assert.deepEqual(coachView.events[0].counts, { yes: 2, maybe: 0, no: 1 });
  assert.deepEqual(coachView.events[0].attendees.map(a => a.name), ['Alex M.', 'Pat P.', 'Sam S.']);
  const playerView = (await call(env, PLAYER, '/events/api/list')).json;
  assert.equal(playerView.isCoach, false);
  assert.equal(playerView.events[0].attendees, undefined);
  assert.deepEqual(playerView.events[0].mine, { response: 'yes', by: 'self' });
  assert.ok(!JSON.stringify(playerView).includes('Alex M.'));
});

test('PRIVACY: no email address is ever written to EVENTS or RATELIMIT', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' });
  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  await call(env, MINOR, '/events/api/rsvp', { eventId: id, response: 'no' });
  await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' });
  await call(env, PARENT, '/events/api/list');
  await call(env, PARENT, '/events/api/next');

  const dump = env.EVENTS.dump() + '\n' + env.RATELIMIT.dump();
  assert.ok(!dump.includes('@'), 'an @ appeared in EVENTS/RATELIMIT');
  for (const e of EMAILS) assert.ok(!dump.includes(e.split('@')[0]), `${e} leaked`);

  // Only the four approved key prefixes exist, and every key expires.
  for (const [name, entry] of env.EVENTS.store) {
    assert.match(name, /^(ev|rsvp|me|kid):/);
    assert.ok(entry.expiration > Date.now() / 1000, `${name} has no future expiry`);
  }
});

test('access: unauthenticated, wrong host, feature off, CSRF, and unknown route', async () => {
  const env = makeEnv();
  const unauth = await worker.fetch(new Request(`${HOST}/events/api/list`), env);
  assert.equal(unauth.status, 401);
  assert.equal((await call(env, PLAYER, '/events/api/list', undefined, { host: 'https://spikefit.app' })).status, 403);
  assert.equal((await call(env, PLAYER, '/events/api/list', undefined, { host: 'https://ghost.spikefit.app' })).status, 403);
  assert.equal((await call(makeEnv({ events: false }), PLAYER, '/events/api/list')).status, 403);
  assert.equal((await call(env, PLAYER, '/events/api/profile', { name: 'x' }, { origin: 'https://evil.example' })).status, 400);
  assert.equal((await call(env, PLAYER, '/events/api/nope')).status, 404);
  // GET on a mutating route.
  assert.equal((await call(env, PLAYER, '/events/api/rsvp')).status, 405);
});

test('only a coach of THIS team can save or delete events', async () => {
  const env = makeEnv();
  assert.equal((await call(env, PLAYER, '/events/api/event/save', { event: futureEvent() })).json.error, 'not_a_coach');
  assert.equal((await call(env, OUTSIDER, '/events/api/event/save', { event: futureEvent() })).json.error, 'not_a_coach');
  const id = await createEvent(env);
  assert.equal((await call(env, PARENT, '/events/api/event/delete', { eventId: id })).status, 403);
});

test('a parent cannot answer for a player who is not on their list', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  const stranger = await hmacId(SECRET, 'm', 'millis', PLAYER);
  const r = await call(env, OUTSIDER, '/events/api/rsvp', { eventId: id, response: 'no', memberId: stranger });
  assert.equal(r.json.error, 'not_your_player');
  assert.equal((await call(env, OUTSIDER, '/events/api/rsvp', { eventId: id, response: 'no', memberId: 'not-an-id' })).status, 400);
});

test('RSVP is refused for canceled and ended events', async () => {
  const env = makeEnv();
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  const canceled = await createEvent(env, { canceled: true });
  assert.equal((await call(env, PLAYER, '/events/api/rsvp', { eventId: canceled, response: 'yes' })).json.error, 'event_canceled');
  const ended = await createEvent(env, { date: shiftDate(TODAY, -1), time: '00:00', endTime: '00:30' });
  assert.equal((await call(env, PLAYER, '/events/api/rsvp', { eventId: ended, response: 'yes' })).json.error, 'event_ended');
});

test('event validation errors surface as 400 and past dates are refused for new events', async () => {
  const env = makeEnv();
  assert.equal((await call(env, COACH, '/events/api/event/save', { event: futureEvent({ title: '' }) })).json.error, 'title_required');
  assert.equal((await call(env, COACH, '/events/api/event/save', { event: futureEvent({ date: shiftDate(TODAY, -5) }) })).json.error, 'date_in_past');
  assert.equal((await call(env, COACH, '/events/api/event/save', { event: futureEvent({ type: 'rave' }) })).json.error, 'bad_type');
});

test('editing moves the event key and carries RSVPs forward with a new expiry', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' });

  const newDate = shiftDate(TODAY, 20);
  const r = await call(env, COACH, '/events/api/event/save', { event: { ...futureEvent({ date: newDate }), id } });
  assert.equal(r.status, 200);

  const evKeys = [...env.EVENTS.store.keys()].filter(k => k.startsWith('ev:'));
  assert.equal(evKeys.length, 1);
  assert.ok(evKeys[0].includes(newDate));
  const rsvp = [...env.EVENTS.store.entries()].find(([k]) => k.startsWith('rsvp:'));
  assert.ok(rsvp[1].expiration >= Math.floor(Date.UTC(...newDate.split('-').map((n, i) => i === 1 ? n - 1 : +n)) / 1000));
  const list = (await call(env, PLAYER, '/events/api/list')).json;
  assert.equal(list.events[0].date, newDate);
  assert.equal(list.events[0].mine.response, 'yes');
});

test('deleting an event removes its RSVPs; canceling keeps the event visible as canceled', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' });

  await call(env, COACH, '/events/api/event/save', { event: { ...futureEvent({ canceled: true }), id } });
  const list = (await call(env, PLAYER, '/events/api/list')).json;
  assert.equal(list.events[0].canceled, true);

  assert.equal((await call(env, COACH, '/events/api/event/delete', { eventId: id })).status, 200);
  assert.equal([...env.EVENTS.store.keys()].filter(k => k.startsWith('ev:') || k.startsWith('rsvp:')).length, 0);
});

test('/next returns the next events with my answer, and the single kid for a parent', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await createEvent(env, { title: 'Far away', date: shiftDate(TODAY, 40) });
  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  await call(env, MINOR, '/events/api/rsvp', { eventId: id, response: 'yes' });

  const player = (await call(env, MINOR, '/events/api/next')).json;
  assert.equal(player.events.length, 1);
  assert.equal(player.events[0].mine, 'yes');
  assert.equal(player.hasName, true);

  const parent = (await call(env, PARENT, '/events/api/next')).json;
  assert.equal(parent.kidCount, 1);
  assert.equal(parent.events[0].kid.name, 'Alex M.');
  assert.equal(parent.events[0].kid.response, 'yes');
});

test('kids: cap, rename, remove (managed kid RSVPs go too), linked kids cannot be renamed', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  const add = await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' });
  await call(env, PARENT, '/events/api/rsvp', { eventId: id, response: 'yes', memberId: add.json.memberId });
  assert.equal((await call(env, PARENT, '/events/api/kids', { action: 'rename', memberId: add.json.memberId, name: 'Samuel S.' })).status, 200);
  const list = (await call(env, PARENT, '/events/api/list')).json;
  assert.equal(list.kids[0].name, 'Samuel S.');

  await call(env, PARENT, '/events/api/kids', { action: 'remove', memberId: add.json.memberId });
  assert.equal([...env.EVENTS.store.keys()].filter(k => k.startsWith('rsvp:') || k.startsWith('kid:')).length, 0);

  for (let i = 0; i < 8; i++) await call(env, PARENT, '/events/api/kids', { action: 'add', name: `Kid ${i}` });
  assert.equal((await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'One too many' })).json.error, 'too_many_kids');

  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  const linked = (await call(env, PARENT, '/events/api/list')).json.kids.find(k => k.linked);
  assert.equal((await call(env, PARENT, '/events/api/kids', { action: 'rename', memberId: linked.memberId, name: 'Hax' })).json.error, 'linked_kid');
});

test('forget removes my name, my RSVPs, and my link under my guardian', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  await call(env, MINOR, '/events/api/rsvp', { eventId: id, response: 'yes' });
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' });

  assert.equal((await call(env, MINOR, '/events/api/forget', {})).status, 200);
  const remaining = [...env.EVENTS.store.keys()];
  assert.ok(!remaining.some(k => k.startsWith('kid:')), 'guardian link should be gone');
  assert.equal(remaining.filter(k => k.startsWith('rsvp:')).length, 1, 'only the other player RSVP remains');
  assert.equal((await call(env, MINOR, '/events/api/list')).json.me.hasName, false);
});

test('/events page: unauthenticated request redirects to login keeping the ?e= deep link', async () => {
  const env = makeEnv();
  const res = await worker.fetch(new Request(`${HOST}/events?e=abc123`), env);
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), `${HOST}/auth.html?redirect=%2Fevents%3Fe%3Dabc123`);
});

test('/events page: a team without the feature gets the unavailable page, not events.html', async () => {
  const res = await worker.fetch(new Request(`${HOST}/events`, { headers: { Cookie: 'sf_session=tok1' } }), makeEnv({ events: false }));
  assert.equal(res.status, 403);
});

// ─── Audit follow-ups ────────────────────────────────────────────────────────

test('normalizeDisplayName rejects emails and phone numbers; nameError says which problem it was', () => {
  assert.equal(normalizeDisplayName('alex@example.com'), '');
  assert.equal(normalizeDisplayName('call 555-123-4567'), '');
  assert.equal(normalizeDisplayName('(555) 123 4567'), '');
  assert.equal(normalizeDisplayName('Alex M. #12'), 'Alex M. #12');
  assert.equal(nameError('alex@example.com'), 'bad_name');
  assert.equal(nameError('   '), 'name_required');
});

test('a name that looks like contact info is refused by profile and kids', async () => {
  const env = makeEnv();
  assert.equal((await call(env, PLAYER, '/events/api/profile', { name: 'me@example.com' })).json.error, 'bad_name');
  assert.equal((await call(env, PARENT, '/events/api/kids', { action: 'add', name: '555-123-4567' })).json.error, 'bad_name');
  assert.equal((await call(env, PARENT, '/events/api/kids', { action: 'add', name: '' })).json.error, 'name_required');
  assert.equal(env.EVENTS.store.size, 0);
});

test('guardian link requires a CONFIRMED guardian: guardianEmail without guardianAcceptedAt links nobody', async () => {
  const env = makeEnv();
  const UNCONFIRMED = 'unconfirmed@example.com';
  await env.ALLOWLIST.put(UNCONFIRMED, JSON.stringify({ allowed: true, minor: true, guardianEmail: PARENT }));
  await env.SESSIONS.put('tok9', UNCONFIRMED);
  TOKEN[UNCONFIRMED] = 'tok9';
  await call(env, UNCONFIRMED, '/events/api/profile', { name: 'Kit K.' });
  assert.equal([...env.EVENTS.store.keys()].filter(k => k.startsWith('kid:')).length, 0);
  assert.equal((await call(env, PARENT, '/events/api/list')).json.kids.length, 0);
});

test('mutating routes are rate limited per user; the counter key is an HMAC id, never an email', async () => {
  const env = makeEnv();
  let last;
  for (let i = 0; i < 61; i++) last = await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  assert.equal(last.status, 429);
  assert.equal(last.json.error, 'rate_limited');
  const keys = [...env.RATELIMIT.store.keys()];
  assert.ok(keys.length > 0);
  for (const k of keys) assert.match(k, /^evapi:[0-9a-f]{32}$/);
  // Reads are not rate limited (and never write to RATELIMIT).
  const before = env.RATELIMIT.store.size;
  for (let i = 0; i < 70; i++) assert.equal((await call(env, PARENT, '/events/api/list')).status, 200);
  assert.equal(env.RATELIMIT.store.size, before);
});

test('forget removes managed kids, their answers, and links — but leaves a linked kid’s own answers', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, MINOR, '/events/api/profile', { name: 'Alex M.' });
  await call(env, MINOR, '/events/api/rsvp', { eventId: id, response: 'yes' });
  const managed = (await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' })).json.memberId;
  await call(env, PARENT, '/events/api/rsvp', { eventId: id, response: 'yes', memberId: managed });
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'no' });

  assert.equal((await call(env, PARENT, '/events/api/forget', {})).status, 200);
  const keys = [...env.EVENTS.store.keys()];
  assert.ok(!keys.some(k => k.startsWith('kid:')), 'parent kid list should be gone');
  assert.ok(!keys.some(k => k.endsWith(managed)), 'managed kid answers should be gone');
  // The minor's own answer and the unrelated player's answer survive.
  assert.equal(keys.filter(k => k.startsWith('rsvp:')).length, 2);
  assert.ok(keys.some(k => k.startsWith('me:')));
});

test('isolation: a coach of another team sees no names; crafted ids are rejected; other parents’ kids are untouchable', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  await call(env, PLAYER, '/events/api/profile', { name: 'Pat P.' });
  await call(env, PLAYER, '/events/api/rsvp', { eventId: id, response: 'yes' });
  const kid = (await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' })).json.memberId;

  const outsider = (await call(env, OUTSIDER, '/events/api/list')).json;
  assert.equal(outsider.isCoach, false);
  assert.equal(outsider.events[0].attendees, undefined);
  assert.equal((await call(env, OUTSIDER, '/events/api/event/save', { event: { ...futureEvent(), id } })).status, 403);

  const bad = (body) => call(env, PLAYER, '/events/api/rsvp', body);
  assert.equal((await bad({ eventId: id.toUpperCase(), response: 'yes' })).status, 404);   // not a key we hold
  assert.equal((await bad({ eventId: 'a:b', response: 'yes' })).status, 400);
  assert.equal((await bad({ eventId: id, response: 'yes', memberId: 'a:b' })).status, 400);
  assert.equal((await bad({ eventId: id, response: 'yes', memberId: kid.toUpperCase() })).status, 403);
  assert.equal((await bad({ eventId: id, response: 'definitely' })).status, 400);

  assert.equal((await call(env, OUTSIDER, '/events/api/kids', { action: 'rename', memberId: kid, name: 'Hax' })).status, 404);
  assert.equal((await call(env, OUTSIDER, '/events/api/kids', { action: 'remove', memberId: kid })).status, 404);
  assert.equal((await call(env, PARENT, '/events/api/list')).json.kids[0].name, 'Sam S.');
});

test('an update that omits `canceled` keeps the event canceled', async () => {
  const env = makeEnv();
  const id = await createEvent(env, { canceled: true });
  const rest = futureEvent({ title: 'Renamed' });
  assert.equal('canceled' in rest, false);   // the update says nothing about canceled
  await call(env, COACH, '/events/api/event/save', { event: { ...rest, id } });
  const ev = (await call(env, PLAYER, '/events/api/list')).json.events[0];
  assert.equal(ev.title, 'Renamed');
  assert.equal(ev.canceled, true);
  // An explicit false restores it.
  await call(env, COACH, '/events/api/event/save', { event: { ...rest, id, canceled: false } });
  assert.equal((await call(env, PLAYER, '/events/api/list')).json.events[0].canceled, false);
});

test('a parent answering for a managed kid refreshes that kid’s idle expiry', async () => {
  const env = makeEnv();
  const id = await createEvent(env);
  const kid = (await call(env, PARENT, '/events/api/kids', { action: 'add', name: 'Sam S.' })).json.memberId;
  const key = [...env.EVENTS.store.keys()].find(k => k.startsWith('kid:'));
  env.EVENTS.store.get(key).expiration = Math.floor(Date.now() / 1000) + 100;   // about to lapse
  await call(env, PARENT, '/events/api/rsvp', { eventId: id, response: 'yes', memberId: kid });
  assert.ok(env.EVENTS.store.get(key).expiration > Date.now() / 1000 + 60 * 60 * 24 * 170);
  assert.deepEqual(env.EVENTS.store.get(key).metadata, { n: 'Sam S.', l: 0 });
});

test('a missing or too-short EVENTS_HMAC_KEY is a clean 503, not a crash', async () => {
  const env = makeEnv();
  env.EVENTS_HMAC_KEY = 'short';
  const r = await call(env, PLAYER, '/events/api/list');
  assert.equal(r.status, 503);
  assert.equal(r.json.error, 'events_not_configured');
  delete env.EVENTS_HMAC_KEY;
  assert.equal((await call(env, PLAYER, '/events/api/list')).status, 503);
});

test('/events/ redirects to /events (keeping the query) so relative assets resolve', async () => {
  const res = await worker.fetch(new Request(`${HOST}/events/?e=abc`), makeEnv());
  assert.equal(res.status, 302);
  assert.equal(res.headers.get('Location'), `${HOST}/events?e=abc`);
});

test('/next shows a canceled event as canceled and skips ended ones', async () => {
  const env = makeEnv();
  await createEvent(env, { canceled: true, title: 'Called off' });
  await createEvent(env, { date: shiftDate(TODAY, -1), time: '00:00', endTime: '00:30', title: 'Already over' });
  const r = (await call(env, PLAYER, '/events/api/next')).json;
  assert.deepEqual(r.events.map(e => [e.title, e.canceled]), [['Called off', true]]);
});

test('/next reports how many more upcoming events there are, never counting past ones', async () => {
  const env = makeEnv();
  assert.equal((await call(env, PLAYER, '/events/api/next')).json.more, 0);
  await createEvent(env, { title: 'Soon' });
  assert.equal((await call(env, PLAYER, '/events/api/next')).json.more, 0);       // just the one
  await createEvent(env, { date: shiftDate(TODAY, 40), title: 'Far off' });        // beyond the 14-day window
  await createEvent(env, { date: shiftDate(TODAY, -1), time: '00:00', endTime: '00:30', title: 'Already over' });
  const r = (await call(env, PLAYER, '/events/api/next')).json;
  assert.deepEqual(r.events.map(e => e.title), ['Soon']);
  assert.equal(r.more, 1);                                                        // 'Far off' counts, 'Already over' doesn't
});

test('/next counts upcoming events beyond the three it returns', async () => {
  const env = makeEnv();
  for (let n = 1; n <= 5; n++) await createEvent(env, { date: shiftDate(TODAY, n), title: `Event ${n}` });
  const r = (await call(env, PLAYER, '/events/api/next')).json;
  assert.equal(r.events.length, 3);
  assert.equal(r.more, 2);
});

test('/list?past=1 includes ended events, marked ended', async () => {
  const env = makeEnv();
  await createEvent(env, { date: shiftDate(TODAY, -1), time: '00:00', endTime: '00:30', title: 'Already over' });
  assert.equal((await call(env, PLAYER, '/events/api/list')).json.events.length, 0);
  const past = (await call(env, PLAYER, '/events/api/list?past=1')).json.events;
  assert.deepEqual(past.map(e => [e.title, e.ended]), [['Already over', true]]);
});
