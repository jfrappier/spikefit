// node --test tests/worker/sheets.test.js
//
// Coverage for the pure Sheets-request builder and the timestamp/date
// helpers used by the pickup log. No live Sheets call — see ADR-014 §6.4.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import {
  buildAppendRequest, formatLocalTimestamp, todayLocalDate, resolveScannedAt, escapeHtml
} from '../../cloudflare/worker.js';

// ─── buildAppendRequest ──────────────────────────────────────────────────────

test('buildAppendRequest defaults to RAW and builds the expected URL/body', () => {
  const req = buildAppendRequest('sheet123', 'Log', ['a', 'b', 'c']);
  assert.match(req.url, /valueInputOption=RAW/);
  assert.match(req.url, /insertDataOption=INSERT_ROWS/);
  assert.match(req.url, /\/sheet123\/values\/Log!A%3AZ:append/);
  assert.equal(req.method, 'POST');
  assert.deepEqual(req.body, { values: [['a', 'b', 'c']] });
});

test('buildAppendRequest rejects any valueInputOption other than RAW', () => {
  // USER_ENTERED would let a coach note or roster name starting with =, +, -,
  // or @ get evaluated as a formula — must never be reachable.
  assert.throws(
    () => buildAppendRequest('sheet123', 'Log', ['=1+1'], { valueInputOption: 'USER_ENTERED' }),
    /RAW/
  );
});

// ─── Timestamp / date helpers ────────────────────────────────────────────────

test('formatLocalTimestamp renders in the given IANA timezone', () => {
  // 2026-01-01T05:00:00Z is 2026-01-01 00:00:00 in America/New_York (EST, UTC-5).
  const d = new Date('2026-01-01T05:00:00.000Z');
  assert.equal(formatLocalTimestamp(d, 'America/New_York'), '2026-01-01 00:00:00');
});

test('formatLocalTimestamp falls back to ISO on an invalid timezone', () => {
  const d = new Date('2026-01-01T05:00:00.000Z');
  assert.equal(formatLocalTimestamp(d, 'Not/AZone'), d.toISOString());
});

test('todayLocalDate returns YYYY-MM-DD', () => {
  assert.match(todayLocalDate('America/New_York'), /^\d{4}-\d{2}-\d{2}$/);
});

test('resolveScannedAt: live scans (offline:false) always use the server clock, ignoring a client value', () => {
  const clientClaimed = '2000-01-01T00:00:00.000Z';
  const result = resolveScannedAt(false, clientClaimed);
  assert.notEqual(result.toISOString(), clientClaimed);
});

test('resolveScannedAt: offline:true honors a valid client-supplied timestamp', () => {
  const clientClaimed = '2026-03-01T12:00:00.000Z';
  const result = resolveScannedAt(true, clientClaimed);
  assert.equal(result.toISOString(), clientClaimed);
});

test('resolveScannedAt: offline:true with a garbage timestamp falls back to now', () => {
  const before = Date.now();
  const result = resolveScannedAt(true, 'not-a-date');
  assert.ok(result.getTime() >= before);
});

// ─── escapeHtml ───────────────────────────────────────────────────────────────

test('escapeHtml neutralizes HTML metacharacters in interpolated values', () => {
  assert.equal(escapeHtml(`<script>alert('x')</script>`), '&lt;script&gt;alert(&#39;x&#39;)&lt;/script&gt;');
  assert.equal(escapeHtml('Tom & Jerry "the" <b>cat</b>'), 'Tom &amp; Jerry &quot;the&quot; &lt;b&gt;cat&lt;/b&gt;');
});
