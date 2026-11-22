const COOKIE      = 'sf_session';
const ORIGIN      = 'https://spikefit.app';  // pinned origin for all fetch calls
const OTP_TTL     = 600;                    // 10 min OTP expiry
const SESSION_TTL = 60 * 60 * 24 * 30;     // 30-day sessions
const MAX_VERIFY_ATTEMPTS = 5;              // max OTP guesses before lockout
const MAX_SEND_ATTEMPTS   = 3;             // max OTP sends per IP per 10 min
const STATIC_FILES = new Set([
  '/logo.png',
  '/favicon.png',
  '/favicon.ico',
  '/fonts/fonts.css',
  '/fonts/source-sans-3-v19-latin-300.woff2',
  '/fonts/source-sans-3-v19-latin-regular.woff2',
  '/fonts/source-sans-3-v19-latin-600.woff2',
  '/fonts/source-sans-3-v19-latin-700.woff2',
  '/css/base.css',
  '/css/layout.css',
  '/css/landing.css',
  '/css/components/auth.css',
  '/css/components/buttons.css',
  '/css/components/calendar.css',
  '/css/components/cards.css',
  '/css/components/forms.css',
  '/css/components/modals.css',
  '/css/components/combine.css',
  '/css/components/storage.css',
  '/css/components/nav.css',
  '/css/components/splash.css',
  '/js/auth.js',
  '/js/combine.js',
  '/js/storage.js',
  '/js/index.js',
  '/js/team.js',
  '/js/workouts.js',
  '/js/app.js',
  '/css/themes/tigers.css',
  '/css/themes/lions.css',
  '/css/themes/millis.css',
  '/img/teams/tigers-logo.svg',
  '/img/teams/lions-logo.png',
  '/img/teams/millis-logo.png',
  '/img/1.jpg',
  '/img/2.jpg',
  '/img/3.jpg',
  '/img/badge_char.png',
  '/img/social-banner.jpg',
  '/.well-known/security.txt',
  '/js/coach.js',
  '/js/vendor/jsQR.js',
  '/css/components/coach.css',
  '/js/events.js',
  '/js/events-banner.js',
  '/css/components/events.css'
  // coach.html and events.html are intentionally NOT listed here — the
  // /coach and /events routes below serve them behind their own session
  // gates (see ADR-014, ADR-015).
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Auth endpoints — always pass through
    if (url.pathname === '/auth/send')     return handleSend(req, env);
    if (url.pathname === '/auth/verify')   return handleVerify(req, env);
    if (url.pathname === '/auth/logout')   return handleLogout(req, env);

    // ToS/consent endpoints — always pass through
    if (url.pathname === '/consent/accept')  return handleConsentAccept(req, env);
    if (url.pathname === '/consent/send')    return handleConsentSend(req, env);
    if (url.pathname === '/consent/confirm') return handleConsentConfirm(req, env);

    // Coach module (ADR-014) — routed above the static/catch-all gate, since
    // the API routes need their own auth+CSRF handling, not the generic
    // session-cookie redirect the catch-all applies to page loads.
    if (url.pathname === '/coach' || url.pathname === '/coach/') return handleCoachPage(req, env, url);
    if (url.pathname === '/coach/api/config')         return handleCoachConfig(req, env, url);
    if (url.pathname === '/coach/api/pickup/scan')    return handlePickupScan(req, env, url);
    if (url.pathname === '/coach/api/pickup/confirm') return handlePickupConfirm(req, env, url);
    if (url.pathname === '/coach/api/pickup/sync')    return handlePickupSync(req, env, url);

    // Events module (ADR-015) — same placement/reasoning as the coach routes.
    // An unknown /events/api/* path gets a JSON 404 from handleEventsApi
    // instead of falling through to the catch-all (which would serve app.html).
    // events.html uses relative asset URLs, so /events/ would resolve them under
    // /events/ and break — send it to the canonical path instead.
    if (url.pathname === '/events/') return Response.redirect(`${url.origin}/events${url.search}`, 302);
    if (url.pathname === '/events') return handleEventsPage(req, env, url);
    if (url.pathname.startsWith('/events/api/')) return handleEventsApi(req, env, url);

    // Static assets — always pass through (logo, favicon, fonts, etc.)
    if (STATIC_FILES.has(url.pathname)) {
      const safeReq = new Request(new URL(url.pathname, ORIGIN), req);
      const res = addSecurityHeaders(await fetch(safeReq));
      // JS/CSS are cache-busted via a ?v= query string on the referencing tag (see CLAUDE.md),
      // so it's safe to cache them aggressively — a version bump changes the URL, not this file.
      if (url.pathname.endsWith('.js') || url.pathname.endsWith('.css')) {
        res.headers.set('Cache-Control', 'public, max-age=31536000, immutable');
      }
      return res;
    }

    // Public pages: Landing page and Auth page
    if (url.pathname === '/' || url.pathname === '/index.html' || url.pathname === '/auth.html') {
      const session = await getSession(req, env);
      const hasToken = (req.headers.get('Cookie') || '').includes(`${COOKIE}=`);
      
      // If user is already logged in, skip the landing/auth pages and send them to the app.
      // We also check `hasToken` to catch immediate post-login redirects from the frontend 
      // before Cloudflare KV has fully synced, forcing the correct route to /app.html.
      if (session || (hasToken && url.pathname !== '/auth.html')) {
        return Response.redirect(`${url.origin}/app.html`, 302);
      }
      
      // Otherwise, serve the public page they requested
      const targetPath = (url.pathname === '/auth.html') ? '/auth.html' : '/index.html';
      const safeReq = new Request(new URL(targetPath, ORIGIN), req);
      return addSecurityHeaders(await fetch(safeReq));
    }

    // Gate everything else on a valid session cookie
    const session = await getSession(req, env);
    if (!session) {
      // Send them to auth.html, passing the path they were trying to reach
      return Response.redirect(`${url.origin}/auth.html?redirect=${encodeURIComponent(url.pathname)}`, 302);
    }

    // Authenticated state: Serve app.html (formerly index.html) for all gated requests
    const safeReq = new Request(new URL('/app.html', ORIGIN), req);
    return addSecurityHeaders(await fetch(safeReq));
  }
};

// ─── Session validation ───────────────────────────────────────────────────────

async function getSession(req, env) {
  const cookie = req.headers.get('Cookie') || '';
  const token  = cookie.match(/sf_session=([^;]+)/)?.[1];
  if (!token) return null;
  return env.SESSIONS.get(token); // returns stored email, or null if expired/missing
}

// ─── Send OTP ─────────────────────────────────────────────────────────────────

async function handleSend(req, env) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  let email;
  try { ({ email } = await req.json()); } catch { return respond({ error: 'bad_request' }, 400); }

  email = (email || '').trim().toLowerCase();
  if (!email) return respond({ error: 'bad_request' }, 400);

  // Rate limit: max 3 OTP sends per IP per 10 minutes
  const ip      = req.headers.get('CF-Connecting-IP') || 'unknown';
  const sendKey = `send:${ip}`;
  const sends   = Number.parseInt(await env.RATELIMIT.get(sendKey) || '0');
  if (sends >= MAX_SEND_ATTEMPTS) {
    return respond({ error: 'rate_limited' }, 429);
  }
  await env.RATELIMIT.put(sendKey, String(sends + 1), { expirationTtl: OTP_TTL });

  // Check allowlist
  const isAllowed = await env.ALLOWLIST.get(email);
  if (!isAllowed) {
    return respond({ error: 'not_allowed' }, 403);
  }

  // Generate 6-digit code and store with TTL
  const array = new Uint32Array(1);
  crypto.getRandomValues(array);
  const code = (100000 + (array[0] % 900000)).toString();
  await env.OTPS.put(email, code, { expirationTtl: OTP_TTL });

  // Send via Resend
  const sent = await sendEmail(env.RESEND_API_KEY, email, code);
  if (!sent) return respond({ error: 'email_failed' }, 500);

  return respond({ ok: true });
}

// ─── Verify OTP ───────────────────────────────────────────────────────────────

async function handleVerify(req, env) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  let email, code;
  try { ({ email, code } = await req.json()); } catch { return respond({ error: 'bad_request' }, 400); }

  email = (email || '').trim().toLowerCase();
  code  = (code  || '').trim();

  // Rate limit: max 5 attempts per IP+email combination within the OTP window
  const ip         = req.headers.get('CF-Connecting-IP') || 'unknown';
  const verifyKey  = `verify:${ip}:${email}`;
  const attempts   = Number.parseInt(await env.RATELIMIT.get(verifyKey) || '0');
  if (attempts >= MAX_VERIFY_ATTEMPTS) {
    return respond({ error: 'rate_limited' }, 429);
  }

  await env.RATELIMIT.put(verifyKey, String(attempts + 1), { expirationTtl: OTP_TTL });

  const stored = await env.OTPS.get(email);

  // Constant-time comparison
  const valid = stored && timingSafeEqual(stored, code);
  if (!valid) return respond({ error: 'invalid_code' }, 401);

  // Clean up on success
  await env.OTPS.delete(email);
  await env.RATELIMIT.delete(verifyKey);

  // Create session
  const token = crypto.randomUUID();
  await env.SESSIONS.put(token, email, { expirationTtl: SESSION_TTL });

  return respond({ ok: true }, 200, {
    'Set-Cookie': `${COOKIE}=${token}; Max-Age=${SESSION_TTL}; Path=/; HttpOnly; Secure; SameSite=Strict`
  });
}

// ─── Logout ───────────────────────────────────────────────────────────────────

async function handleLogout(req, env) {
  const cookie = req.headers.get('Cookie') || '';
  const token  = cookie.match(/sf_session=([^;]+)/)?.[1];
  if (token) await env.SESSIONS.delete(token);

  return new Response(null, {
    status: 302,
    headers: {
      Location:     '/', // Redirects back to the public landing page
      'Set-Cookie': `${COOKIE}=; Max-Age=0; Path=/; HttpOnly; Secure; SameSite=Strict`
    }
  });
}

// ─── ToS/consent tracking ──────────────────────────────────────────────────────
//
// ALLOWLIST already gates hosted access by email (see handleSend above); these
// endpoints extend its value from the bare string 'true' to a JSON record so we
// have a durable, non-repudiable log of when/what version of the terms a user
// (or their guardian) accepted — separate from the client-side disclaimerAgreed
// localStorage flag, which the user can clear at will.

const CONSENT_TTL = 60 * 60 * 24 * 7; // 7 days to click the guardian confirmation link

async function handleConsentAccept(req, env) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const email = await getSession(req, env);
  if (!email) return respond({ error: 'not_authenticated' }, 401);

  let tosVersion;
  try { ({ tosVersion } = await req.json()); } catch { return respond({ error: 'bad_request' }, 400); }
  if (!tosVersion) return respond({ error: 'bad_request' }, 400);

  const record = await readAllowlistRecord(env, email);
  record.tosAcceptedAt = new Date().toISOString();
  record.tosVersion    = tosVersion;
  await env.ALLOWLIST.put(email, JSON.stringify(record));

  return respond({ ok: true });
}

async function handleConsentSend(req, env) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const email = await getSession(req, env);
  if (!email) return respond({ error: 'not_authenticated' }, 401);

  let guardianEmail, tosVersion;
  try { ({ guardianEmail, tosVersion } = await req.json()); } catch { return respond({ error: 'bad_request' }, 400); }
  guardianEmail = (guardianEmail || '').trim().toLowerCase();
  if (!guardianEmail || !tosVersion) return respond({ error: 'bad_request' }, 400);

  const token = crypto.randomUUID();
  await env.CONSENTS.put(token, JSON.stringify({ email, guardianEmail, tosVersion, requestedAt: new Date().toISOString() }), { expirationTtl: CONSENT_TTL });

  const sent = await sendConsentEmail(env.RESEND_API_KEY, guardianEmail, token);
  if (!sent) return respond({ error: 'email_failed' }, 500);

  return respond({ ok: true });
}

async function handleConsentConfirm(req, env) {
  const url   = new URL(req.url);
  const token = url.searchParams.get('token') || '';
  const stored = token && await env.CONSENTS.get(token);

  if (!stored) return htmlResponse('This confirmation link is invalid or has expired.');

  const { email, guardianEmail, tosVersion } = JSON.parse(stored);
  await env.CONSENTS.delete(token);

  const record = await readAllowlistRecord(env, email);
  record.guardianEmail       = guardianEmail;
  record.tosVersion          = tosVersion;
  record.guardianAcceptedAt  = new Date().toISOString();
  record.minor               = true;
  await env.ALLOWLIST.put(email, JSON.stringify(record));

  return htmlResponse('Thank you — your consent has been recorded.');
}

async function readAllowlistRecord(env, email) {
  const stored = await env.ALLOWLIST.get(email);
  if (!stored) return { allowed: true };
  try {
    const parsed = JSON.parse(stored);
    // Legacy admin-set values are bare strings like 'true' or '1' — both parse
    // successfully as JSON (a boolean/number), so guard for an actual object
    // rather than just checking JSON.parse didn't throw.
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {
    // fall through — non-JSON legacy value
  }
  return { allowed: true };
}

function htmlResponse(message) {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpikeFit</title></head>` +
    `<body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;color:#2d3748;">` +
    `<p>${message}</p></body></html>`,
    { status: 200, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

// ─── Resend email ─────────────────────────────────────────────────────────────
//
// sendResend() is the shared low-level call — every feature that emails
// through Resend (OTP codes, guardian consent, and the coach module's parent
// pickup/incident alerts) builds its own subject/html and calls this.

async function sendResend(apiKey, to, subject, html) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from: 'SpikeFit <noreply@spikefit.app>',
        to,
        subject,
        html
      })
    });
    return res.ok;
  } catch {
    return false;
  }
}

async function sendEmail(apiKey, to, code) {
  const html = `
    <div style="font-family:'Source Sans Pro',Helvetica,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;">
      <img src="https://spikefit.app/logo.png" alt="SpikeFit" style="width:160px;display:block;margin:0 auto 32px;">
      <h2 style="color:#2d3748;text-align:center;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Your sign-in code</h2>
      <p style="color:#718096;text-align:center;margin-bottom:32px;">Enter this code to access SpikeFit. It expires in 10 minutes.</p>
      <div style="background:#f4f6f8;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
        <span style="font-size:40px;font-weight:700;letter-spacing:0.3em;color:#e80a89;">${code}</span>
      </div>
      <p style="color:#718096;font-size:14px;text-align:center;">If you didn't request this, you can safely ignore it.</p>
    </div>
  `;
  return sendResend(apiKey, to, 'Your SpikeFit code', html);
}

async function sendConsentEmail(apiKey, to, token) {
  const confirmUrl = `${ORIGIN}/consent/confirm?token=${token}`;
  const html = `
    <div style="font-family:'Source Sans Pro',Helvetica,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;">
      <img src="https://spikefit.app/logo.png" alt="SpikeFit" style="width:160px;display:block;margin:0 auto 32px;">
      <h2 style="color:#2d3748;text-align:center;margin-bottom:8px;">Parent/guardian confirmation</h2>
      <p style="color:#718096;text-align:center;margin-bottom:32px;">A student athlete has listed you as their parent or legal guardian to use SpikeFit, a volleyball training app. Please review the app's <a href="${ORIGIN}/tos.html">Terms &amp; Disclaimer</a> and confirm below.</p>
      <p style="text-align:center;margin-bottom:32px;">
        <a href="${confirmUrl}" style="background:#e80a89;color:#fff;padding:14px 28px;border-radius:8px;text-decoration:none;font-weight:700;">I Confirm</a>
      </p>
      <p style="color:#718096;font-size:14px;text-align:center;">If you don't recognize this request, you can safely ignore it — the link expires in 7 days.</p>
    </div>
  `;
  return sendResend(apiKey, to, 'Please confirm: your child wants to use SpikeFit', html);
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

function respond(body, status = 200, extraHeaders = {}) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { 'Content-Type': 'application/json', ...extraHeaders }
  });
}

function addSecurityHeaders(response) {
  const headers = new Headers(response.headers);
  headers.set('Content-Security-Policy',
    "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data: raw.githubusercontent.com; font-src 'self'; connect-src 'self'");
  headers.set('X-Content-Type-Options', 'nosniff');
  headers.set('X-Frame-Options', 'DENY');
  headers.set('Referrer-Policy', 'strict-origin-when-cross-origin');
  return new Response(response.body, { status: response.status, headers });
}

function timingSafeEqual(a, b) {
  if (a.length !== b.length) return false;
  let diff = 0;
  for (let i = 0; i < a.length; i++) {
    diff |= a.charCodeAt(i) ^ b.charCodeAt(i);
  }
  return diff === 0;
}

// ═══════════════════════════════════════════════════════════════════════════
// Coach module (ADR-014) — pickup sign-out
//
// The Worker decides every green/yellow/red status; js/coach.js only renders
// what comes back. No kid/adult name, email, or phone number is ever written
// to a Cloudflare-owned store (KV or the Cache API) — IDs only, short bounded
// TTLs. The team's Google Sheet (owned by the team admin) is the only
// durable store of that data. See docs/decisions.md ADR-014.
// ═══════════════════════════════════════════════════════════════════════════

const COACH_ID_RE            = /^[PK]-[0-9A-HJKMNP-TV-Z]{6}$/;
const UUID_V4_RE             = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;
const COACH_API_RATE_LIMIT   = 60;              // requests per coach per minute
const COACH_API_RATE_WINDOW  = 60;              // seconds
const EVT_TTL                = 60 * 60 * 48;    // 48h — scan/confirm idempotency
const OUT_TTL                = 60 * 60 * 36;    // 36h — "already signed out today" marker
const PENDING_TTL            = 60 * 10;         // 10 min — pending yellow override
const GTOKEN_TTL             = 55 * 60;         // 55 min — Google access token KV fallback
const SHEETS_API             = 'https://sheets.googleapis.com/v4/spreadsheets';

const RED_REASON_MESSAGES = {
  unknown_card:      'Unknown card',
  inactive_card:     'Inactive card',
  kid_card_as_adult: "That's a kid card",
  adult_card_as_kid: "That's an adult card"
};

// ─── Pure decision logic (node --test coverage: tests/worker/) ─────────────

function normalizeId(raw) {
  return String(raw || '').trim().toUpperCase();
}

function isValidId(id) {
  return typeof id === 'string' && COACH_ID_RE.test(id);
}

function isValidEventId(id) {
  return typeof id === 'string' && UUID_V4_RE.test(id);
}

function isActiveValue(v) {
  return v === 'TRUE' || v === 'true' || v === 'yes' || v === '1';
}

function indexHeader(headerRow) {
  const idx = {};
  (headerRow || []).forEach((h, i) => { idx[String(h ?? '').trim().toLowerCase()] = i; });
  return idx;
}

// Header row on row 1, matched case-insensitively by name (not column
// position). IDs are trimmed/uppercased. AuthorizedParentIDs splits on
// commas or whitespace. A blank Active column is inactive — every card has
// to be switched on deliberately.
function parseKidsSheet(rows) {
  const kids = new Map();
  if (!Array.isArray(rows) || rows.length < 2) return kids;
  const idx = indexHeader(rows[0]);
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const kidId = normalizeId(row[idx.kidid]);
    if (!kidId) continue;
    const kidName = String(row[idx.kidname] ?? '').trim();
    const authRaw = String(row[idx.authorizedparentids] ?? '');
    const authorizedParentIds = new Set(
      authRaw.split(/[,\s]+/).map(s => s.trim().toUpperCase()).filter(Boolean)
    );
    const active = isActiveValue(String(row[idx.active] ?? '').trim());
    kids.set(kidId, { kidId, kidName, authorizedParentIds, active });
  }
  return kids;
}

function parseParentsSheet(rows) {
  const parents = new Map();
  if (!Array.isArray(rows) || rows.length < 2) return parents;
  const idx = indexHeader(rows[0]);
  for (let r = 1; r < rows.length; r++) {
    const row = rows[r];
    if (!row) continue;
    const parentId = normalizeId(row[idx.parentid]);
    if (!parentId) continue;
    const name   = String(row[idx.name] ?? '').trim();
    const email  = String(row[idx.email] ?? '').trim();
    const phone  = String(row[idx.phone] ?? '').trim();
    const active = isActiveValue(String(row[idx.active] ?? '').trim());
    parents.set(parentId, { parentId, name, email, phone, active });
  }
  return parents;
}

function parseRoster(kidsRows, parentsRows) {
  return { kids: parseKidsSheet(kidsRows), parents: parseParentsSheet(parentsRows) };
}

// The Worker decides every state; js/coach.js only renders the result.
function decidePickup(roster, adultId, kidId) {
  if (!isValidId(adultId)) {
    return { status: 'red', reason: adultId?.[0] === 'K' ? 'kid_card_as_adult' : 'unknown_card' };
  }
  if (!isValidId(kidId)) {
    return { status: 'red', reason: kidId?.[0] === 'P' ? 'adult_card_as_kid' : 'unknown_card' };
  }
  if (adultId[0] !== 'P') return { status: 'red', reason: 'kid_card_as_adult' };
  if (kidId[0]   !== 'K') return { status: 'red', reason: 'adult_card_as_kid' };

  const adult = roster.parents.get(adultId);
  if (!adult || !adult.active) {
    return { status: 'red', reason: adult ? 'inactive_card' : 'unknown_card' };
  }

  const kid = roster.kids.get(kidId);
  if (!kid || !kid.active) {
    return { status: 'red', reason: kid ? 'inactive_card' : 'unknown_card' };
  }

  const authorizedAdults = [...kid.authorizedParentIds]
    .map(id => roster.parents.get(id))
    .filter(Boolean);

  if (kid.authorizedParentIds.has(adultId)) {
    return { status: 'green', kid, adult, authorizedAdults };
  }
  return { status: 'yellow', kid, adult, authorizedAdults };
}

// Hostname only *proposes* a team — a subdomain a coach isn't assigned to
// resolves to null here, same as an unregistered label, the apex domain, or
// `tigers.spikefit.app.evil.com` (fails the suffix check). The caller still
// has to check coach.teams before trusting the result.
function resolveCoachHostTeam(hostname) {
  if (!hostname || !hostname.endsWith('.spikefit.app')) return null;
  const label = hostname.split('.')[0];
  return (label && label !== 'www') ? label : null;
}

function resolveCoachTeam({ hostname, bodyTeam, coachTeams }) {
  const teams = Array.isArray(coachTeams) ? coachTeams : [];
  const hostTeam = resolveCoachHostTeam(hostname);
  if (hostTeam) {
    return teams.includes(hostTeam) ? hostTeam : null;
  }
  const candidate = bodyTeam ? String(bodyTeam).trim().toLowerCase() : null;
  return (candidate && teams.includes(candidate)) ? candidate : null;
}

// A missing or non-boolean flag counts as off.
function isFeatureOn(teamConfig, key) {
  return !!(teamConfig && teamConfig.features && teamConfig.features[key] === true);
}

// Sheets append request builder, separated from the fetch call so the RAW
// requirement is covered by node --test without a live Sheets call. RAW is
// required — USER_ENTERED would evaluate a note or roster name starting with
// =, +, -, or @ as a formula.
function buildAppendRequest(sheetId, sheetTab, values, { valueInputOption = 'RAW' } = {}) {
  if (valueInputOption !== 'RAW') {
    throw new Error('valueInputOption must be RAW');
  }
  const range = encodeURIComponent(`${sheetTab}!A:Z`);
  return {
    url: `${SHEETS_API}/${sheetId}/values/${range}:append?valueInputOption=RAW&insertDataOption=INSERT_ROWS`,
    method: 'POST',
    body: { values: [values] }
  };
}

function formatLocalTimestamp(date, timezone) {
  try {
    // hourCycle: 'h23' (not just hour12: false) — some ICU builds render
    // midnight as "24:00" under hour12:false alone; h23 guarantees 00-23.
    const fmt = new Intl.DateTimeFormat('en-CA', {
      timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', second: '2-digit', hour12: false, hourCycle: 'h23'
    });
    const parts = Object.fromEntries(fmt.formatToParts(date).map(p => [p.type, p.value]));
    return `${parts.year}-${parts.month}-${parts.day} ${parts.hour}:${parts.minute}:${parts.second}`;
  } catch {
    return date.toISOString();
  }
}

function todayLocalDate(timezone) {
  try {
    return new Intl.DateTimeFormat('en-CA', { timeZone: timezone, year: 'numeric', month: '2-digit', day: '2-digit' }).format(new Date());
  } catch {
    return new Date().toISOString().slice(0, 10);
  }
}

// ScannedAt is server-stamped for a live scan. The client-supplied value is
// only honored when offline:true — a genuinely offline-queued event replayed
// through /sync, where it reflects real device-side capture time.
function resolveScannedAt(offline, clientScannedAt) {
  if (offline === true && clientScannedAt) {
    const d = new Date(clientScannedAt);
    if (!Number.isNaN(d.getTime())) return d;
  }
  return new Date();
}

function escapeHtml(str) {
  return String(str).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
}

// ─── Google service account auth ────────────────────────────────────────────

let cachedGoogleToken = null; // { token, expiresAt } — best-effort, resets on cold start

async function importGoogleSigningKey(pkcs8Pem) {
  const pem = pkcs8Pem
    .replace(/-----BEGIN PRIVATE KEY-----/, '')
    .replace(/-----END PRIVATE KEY-----/, '')
    .replace(/\s+/g, '');
  const binary = atob(pem);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return crypto.subtle.importKey(
    'pkcs8', bytes.buffer, { name: 'RSASSA-PKCS1-v1_5', hash: 'SHA-256' }, false, ['sign']
  );
}

function base64url(bytes) {
  const arr = bytes instanceof Uint8Array ? bytes : new Uint8Array(bytes);
  let binary = '';
  for (let i = 0; i < arr.length; i++) binary += String.fromCharCode(arr[i]);
  return btoa(binary).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function base64urlJSON(obj) {
  return base64url(new TextEncoder().encode(JSON.stringify(obj)));
}

async function signGoogleJWT(serviceAccount) {
  const now = Math.floor(Date.now() / 1000);
  const header = { alg: 'RS256', typ: 'JWT' };
  const claims = {
    iss:   serviceAccount.client_email,
    scope: 'https://www.googleapis.com/auth/spreadsheets',
    aud:   'https://oauth2.googleapis.com/token',
    iat:   now,
    exp:   now + 3600
  };
  const signingInput = `${base64urlJSON(header)}.${base64urlJSON(claims)}`;
  const key = await importGoogleSigningKey(serviceAccount.private_key);
  const signature = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', key, new TextEncoder().encode(signingInput));
  return `${signingInput}.${base64url(signature)}`;
}

async function getGoogleAccessToken(env) {
  const now = Date.now();
  if (cachedGoogleToken && cachedGoogleToken.expiresAt > now) return cachedGoogleToken.token;

  const kvCached = await env.RATELIMIT.get('gtoken');
  if (kvCached) {
    try {
      const parsed = JSON.parse(kvCached);
      if (parsed.expiresAt > now) {
        cachedGoogleToken = parsed;
        return parsed.token;
      }
    } catch { /* fall through and mint a new one */ }
  }

  const serviceAccount = JSON.parse(env.GOOGLE_SA_KEY);
  const assertion = await signGoogleJWT(serviceAccount);

  const res = await fetch('https://oauth2.googleapis.com/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer',
      assertion
    })
  });
  if (!res.ok) throw new Error('google_token_exchange_failed');

  const { access_token, expires_in } = await res.json();
  cachedGoogleToken = { token: access_token, expiresAt: now + (expires_in - 60) * 1000 };
  await env.RATELIMIT.put('gtoken', JSON.stringify(cachedGoogleToken), { expirationTtl: GTOKEN_TTL });
  return access_token;
}

// ─── Google Sheets I/O ───────────────────────────────────────────────────────

// Thrown when the team's Sheet setup is permanently broken (missing ID,
// wrong ID, or not shared with the service account) rather than a transient
// network/Sheets-outage blip. Callers must never let the client queue this
// offline for retry — retrying can't fix a misconfigured team, only an
// admin can. See requireCoachApi's early isSheetConfigured() check and the
// pickup handlers' catch blocks below.
class TeamNotConfiguredError extends Error {}

// Shared by every handler that calls getRoster() — distinguishes "this
// team's Sheet setup is broken" (never queue offline, tell the coach to
// contact an admin) from an ordinary transient Sheets failure (queue and
// retry is fine).
function respondForRosterError(err) {
  if (err instanceof TeamNotConfiguredError) return respond({ error: 'team_not_configured' }, 409);
  return respond({ error: 'log_failed' }, 503);
}

// Presence-only check — never validates or reveals the sheetId itself, just
// whether the admin has set one. A non-empty-but-wrong ID (the sheet was
// deleted, or never shared with the service account) is caught separately,
// by fetchRosterFromSheets() below reading the Sheets API's own response.
function isSheetConfigured(teamConfig) {
  return typeof teamConfig?.sheetId === 'string' && teamConfig.sheetId.trim().length > 0;
}

async function fetchRosterFromSheets(env, sheetId) {
  const token = await getGoogleAccessToken(env);
  const ranges = ['Kids!A:E', 'Parents!A:E'].map(r => `ranges=${encodeURIComponent(r)}`).join('&');
  const res = await fetch(`${SHEETS_API}/${sheetId}/values:batchGet?${ranges}`, {
    headers: { Authorization: `Bearer ${token}` }
  });
  if (!res.ok) {
    // 400 (malformed ID), 404 (sheet doesn't exist), 403 (exists but not
    // shared with the service account) are permanent setup problems, not a
    // transient Sheets outage — anything else falls through as retryable.
    if (res.status === 400 || res.status === 403 || res.status === 404) {
      throw new TeamNotConfiguredError();
    }
    throw new Error('sheets_read_failed');
  }
  const data = await res.json();
  const kidsRows    = data.valueRanges?.[0]?.values || [];
  const parentsRows = data.valueRanges?.[1]?.values || [];
  return parseRoster(kidsRows, parentsRows);
}

function serializeRoster(roster) {
  return {
    kids: [...roster.kids.values()].map(k => ({ ...k, authorizedParentIds: [...k.authorizedParentIds] })),
    parents: [...roster.parents.values()]
  };
}

function deserializeRoster(plain) {
  const kids = new Map();
  (plain.kids || []).forEach(k => kids.set(k.kidId, { ...k, authorizedParentIds: new Set(k.authorizedParentIds) }));
  const parents = new Map();
  (plain.parents || []).forEach(p => parents.set(p.parentId, p));
  return { kids, parents };
}

// 60-second edge cache via the Workers Cache API — deliberately not KV (KV
// writes are quota-limited on the free plan, and a roster cache doesn't need
// cross-region durability). See ADR-014.
async function getRoster(env, team, sheetId) {
  const cache = caches.default;
  const cacheKey = new Request(`https://cache.internal/roster/${team}`);
  const cached = await cache.match(cacheKey);
  if (cached) return deserializeRoster(await cached.json());

  const roster = await fetchRosterFromSheets(env, sheetId);
  const cacheRes = new Response(JSON.stringify(serializeRoster(roster)), {
    headers: { 'Content-Type': 'application/json', 'Cache-Control': 'max-age=60' }
  });
  await cache.put(cacheKey, cacheRes);
  return roster;
}

async function appendRow(env, sheetId, sheetTab, values) {
  try {
    const token = await getGoogleAccessToken(env);
    const built = buildAppendRequest(sheetId, sheetTab, values);
    const res = await fetch(built.url, {
      method: built.method,
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify(built.body)
    });
    return res.ok;
  } catch {
    return false;
  }
}

// ─── TEAMS config ────────────────────────────────────────────────────────────

async function getTeamConfig(env, slug) {
  const raw = await env.TEAMS.get(`team:${slug}`);
  if (!raw) return null;
  try {
    const parsed = JSON.parse(raw);
    return (parsed && typeof parsed === 'object') ? parsed : null;
  } catch {
    return null;
  }
}

// ─── Authorization ───────────────────────────────────────────────────────────

async function bumpCoachApiRateLimit(env, email) {
  const key = `coachapi:${email}`;
  const count = Number.parseInt(await env.RATELIMIT.get(key) || '0');
  if (count >= COACH_API_RATE_LIMIT) return false;
  await env.RATELIMIT.put(key, String(count + 1), { expirationTtl: COACH_API_RATE_WINDOW });
  return true;
}

// Re-reads ALLOWLIST on every call (not just at session creation) — removing
// a coach's `coach` field has to cut off access right away, not after their
// existing 30-day session expires. See docs/architecture.md.
async function getCoachTeams(env, email) {
  const record = await readAllowlistRecord(env, email);
  return (record.coach && Array.isArray(record.coach.teams)) ? record.coach.teams : [];
}

// Every /coach/api/pickup/* route: session, coach role + team + feature flag
// (re-checked every request), and CSRF defense in depth. Returns either
// {email, team, teamConfig, body} or a Response to return directly.
async function requireCoachApi(req, env, url, { feature } = {}) {
  if (req.method !== 'POST') return respond({ error: 'method_not_allowed' }, 405);

  const contentType = req.headers.get('Content-Type') || '';
  if (!contentType.includes('application/json')) return respond({ error: 'bad_request' }, 400);
  if (req.headers.get('Origin') !== url.origin) return respond({ error: 'bad_request' }, 400);

  const email = await getSession(req, env);
  if (!email) return respond({ error: 'not_authenticated' }, 401);
  if (!(await bumpCoachApiRateLimit(env, email))) return respond({ error: 'rate_limited' }, 429);

  const coachTeams = await getCoachTeams(env, email);
  if (coachTeams.length === 0) return respond({ error: 'not_a_coach' }, 403);

  let body;
  try { body = await req.json(); } catch { return respond({ error: 'bad_request' }, 400); }
  if (!body || typeof body !== 'object' || Array.isArray(body)) return respond({ error: 'bad_request' }, 400);

  const team = resolveCoachTeam({ hostname: url.hostname, bodyTeam: body.team, coachTeams });
  if (!team) return respond({ error: 'no_coach_access' }, 403);

  const teamConfig = await getTeamConfig(env, team);
  if (!teamConfig) return respond({ error: 'no_coach_access' }, 403);
  if (feature && !isFeatureOn(teamConfig, feature)) return respond({ error: 'feature_disabled' }, 403);
  // Cheap short-circuit for the common "admin never filled in sheetId" case
  // — skips a wasted Sheets round-trip. A present-but-wrong ID is instead
  // caught where it's actually used, by fetchRosterFromSheets().
  if (feature === 'pickup' && !isSheetConfigured(teamConfig)) {
    return respond({ error: 'team_not_configured' }, 409);
  }

  return { email, team, teamConfig, body };
}

// ─── /coach (hub page) ───────────────────────────────────────────────────────

async function handleCoachPage(req, env, url) {
  const email = await getSession(req, env);
  if (!email) {
    return Response.redirect(`${url.origin}/auth.html?redirect=${encodeURIComponent(url.pathname)}`, 302);
  }
  const coachTeams = await getCoachTeams(env, email);
  if (coachTeams.length === 0) return coachForbiddenPage();

  const safeReq = new Request(new URL('/coach.html', ORIGIN), req);
  return addSecurityHeaders(await fetch(safeReq));
}

function coachForbiddenPage() {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpikeFit Coach</title></head>` +
    `<body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;color:#2d3748;">` +
    `<p>No coach tools are enabled for your account.</p>` +
    `<p><a href="/app.html">Back to SpikeFit</a></p></body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

// ─── /coach/api/config ───────────────────────────────────────────────────────

async function handleCoachConfig(req, env, url) {
  if (req.method !== 'GET') return respond({ error: 'method_not_allowed' }, 405);

  const email = await getSession(req, env);
  if (!email) return respond({ error: 'not_authenticated' }, 401);
  if (!(await bumpCoachApiRateLimit(env, email))) return respond({ error: 'rate_limited' }, 429);

  const coachTeams = await getCoachTeams(env, email);
  if (coachTeams.length === 0) return respond({ error: 'not_a_coach' }, 403);

  // On a team subdomain, only that team is ever revealed — a coach on the
  // wrong subdomain gets an empty list (the hub shows "No coach tools are
  // enabled for this team"), never a peek at their other teams.
  const hostTeam = resolveCoachHostTeam(url.hostname);
  const slugs = hostTeam ? (coachTeams.includes(hostTeam) ? [hostTeam] : []) : coachTeams;

  const teams = [];
  for (const slug of slugs) {
    const cfg = await getTeamConfig(env, slug);
    if (!cfg) continue;
    teams.push({
      slug,
      name: cfg.name || slug,
      features: (cfg.features && typeof cfg.features === 'object') ? cfg.features : {},
      overrideReasons: Array.isArray(cfg.overrideReasons) ? cfg.overrideReasons : [],
      // Presence-only — never the sheetId itself. Lets the hub show "Setup
      // Needed" on a tile before the coach ever attempts a scan.
      configured: isSheetConfigured(cfg)
    });
  }

  return respond({ teams });
}

// ─── /coach/api/pickup/scan ──────────────────────────────────────────────────

async function handlePickupScan(req, env, url) {
  const ctx = await requireCoachApi(req, env, url, { feature: 'pickup' });
  if (ctx instanceof Response) return ctx;
  const { email: coach, team, teamConfig, body } = ctx;

  const eventId = body.eventId;
  if (!isValidEventId(eventId)) return respond({ error: 'bad_request' }, 400);

  const evtKey = `evt:${eventId}`;
  const cached = await env.RATELIMIT.get(evtKey);
  if (cached) {
    try { return respond(JSON.parse(cached)); } catch { /* recompute below */ }
  }

  const offline = body.offline === true;
  const scannedAtDate = resolveScannedAt(offline, body.scannedAt);
  const scannedAtStr  = formatLocalTimestamp(scannedAtDate, teamConfig.timezone);
  const receivedAt    = new Date().toISOString();

  const adultId = normalizeId(body.adultId);
  const kidId   = normalizeId(body.kidId);

  if (!isValidId(adultId) || !isValidId(kidId)) {
    const written = await appendRow(env, teamConfig.sheetId, 'Rejected',
      [eventId, scannedAtStr, receivedAt, `${adultId || '?'} / ${kidId || '?'}`, 'Unknown card', coach, offline ? 'TRUE' : 'FALSE']);
    if (!written) return respond({ error: 'log_failed' }, 503);
    const result = { status: 'red', reason: 'Unknown card' };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return respond(result);
  }

  let roster;
  try {
    roster = await getRoster(env, team, teamConfig.sheetId);
  } catch (err) {
    return respondForRosterError(err);
  }

  const decision = decidePickup(roster, adultId, kidId);
  const outKey = `out:${team}:${todayLocalDate(teamConfig.timezone)}:${kidId}`;

  if (decision.status === 'red') {
    const reasonMsg = RED_REASON_MESSAGES[decision.reason] || 'Unknown card';
    const written = await appendRow(env, teamConfig.sheetId, 'Rejected',
      [eventId, scannedAtStr, receivedAt, `${adultId} / ${kidId}`, reasonMsg, coach, offline ? 'TRUE' : 'FALSE']);
    if (!written) return respond({ error: 'log_failed' }, 503);
    const result = { status: 'red', reason: reasonMsg };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return respond(result);
  }

  // Resolve any prior pickup of this kid today BEFORE this scan overwrites it.
  const prevOutRaw = await env.RATELIMIT.get(outKey);
  const alreadyOut = resolveAlreadyOut(prevOutRaw, roster);

  if (decision.status === 'green') {
    const row = [eventId, scannedAtStr, receivedAt, decision.kid.kidName, decision.kid.kidId,
      decision.adult.name, decision.adult.parentId, 'green', coach, '', '', offline ? 'TRUE' : 'FALSE'];
    const written = await appendRow(env, teamConfig.sheetId, 'Log', row);
    if (!written) return respond({ error: 'log_failed' }, 503);

    await env.RATELIMIT.put(outKey, JSON.stringify({ at: receivedAt, adultId: decision.adult.parentId, coach }), { expirationTtl: OUT_TTL });

    const result = {
      status: 'green',
      kid:   { kidId: decision.kid.kidId, name: decision.kid.kidName },
      adult: { parentId: decision.adult.parentId, name: decision.adult.name },
      loggedAt: receivedAt,
      alreadyOut
    };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return respond(result);
  }

  // yellow — not logged until /confirm
  await env.RATELIMIT.put(`pending:${eventId}`,
    JSON.stringify({ team, coach, adultId: decision.adult.parentId, kidId: decision.kid.kidId }),
    { expirationTtl: PENDING_TTL });

  return respond({
    status: 'yellow',
    kid:   { kidId: decision.kid.kidId, name: decision.kid.kidName },
    adult: { parentId: decision.adult.parentId, name: decision.adult.name },
    authorizedAdults: decision.authorizedAdults.map(a => a.name),
    alreadyOut
  });
}

function resolveAlreadyOut(prevOutRaw, roster) {
  if (!prevOutRaw) return null;
  try {
    const prev = JSON.parse(prevOutRaw);
    const prevAdult = roster.parents.get(prev.adultId);
    return { at: prev.at, adult: prevAdult ? prevAdult.name : prev.adultId, coach: prev.coach };
  } catch {
    return null;
  }
}

// ─── /coach/api/pickup/confirm ───────────────────────────────────────────────

async function handlePickupConfirm(req, env, url) {
  const ctx = await requireCoachApi(req, env, url, { feature: 'pickup' });
  if (ctx instanceof Response) return ctx;
  const { email: coach, team, teamConfig, body } = ctx;

  const eventId = body.eventId;
  if (!isValidEventId(eventId)) return respond({ error: 'bad_request' }, 400);

  const evtKey = `evt:${eventId}`;
  const cached = await env.RATELIMIT.get(evtKey);
  if (cached) {
    try { return respond(JSON.parse(cached)); } catch { /* recompute below */ }
  }

  const pendingKey = `pending:${eventId}`;
  const pendingRaw = await env.RATELIMIT.get(pendingKey);
  if (!pendingRaw) return respond({ error: 'no_pending_event' }, 409);

  let pending;
  try { pending = JSON.parse(pendingRaw); } catch { return respond({ error: 'no_pending_event' }, 409); }
  if (pending.team !== team || pending.coach !== coach) return respond({ error: 'no_pending_event' }, 409);

  const overrideReasons = Array.isArray(teamConfig.overrideReasons) ? teamConfig.overrideReasons : [];
  const reason = typeof body.reason === 'string' ? body.reason.trim() : '';
  if (!overrideReasons.includes(reason)) return respond({ error: 'bad_request' }, 400);

  const rawNote = typeof body.note === 'string' ? body.note.trim() : '';
  // eslint-disable-next-line no-control-regex -- stripping control chars from a user-supplied note is the point
  const note = rawNote.replace(/[\x00-\x1F\x7F]/g, '').slice(0, 280);
  if (reason.startsWith('Other') && !note) return respond({ error: 'note_required' }, 400);

  let roster;
  try {
    roster = await getRoster(env, team, teamConfig.sheetId);
  } catch (err) {
    return respondForRosterError(err);
  }

  const kid   = roster.kids.get(pending.kidId);
  const adult = roster.parents.get(pending.adultId);
  if (!kid || !adult) return respond({ error: 'no_pending_event' }, 409);

  const scannedAtStr = formatLocalTimestamp(new Date(), teamConfig.timezone);
  const receivedAt   = new Date().toISOString();
  const row = [eventId, scannedAtStr, receivedAt, kid.kidName, kid.kidId, adult.name, adult.parentId,
    'yellow-override', coach, reason, note, 'FALSE'];

  const loggedOk   = await appendRow(env, teamConfig.sheetId, 'Log', row);
  const overrideOk = loggedOk && await appendRow(env, teamConfig.sheetId, 'Overrides', row);
  if (!loggedOk || !overrideOk) return respond({ error: 'log_failed' }, 503);

  await env.RATELIMIT.put(`out:${team}:${todayLocalDate(teamConfig.timezone)}:${kid.kidId}`,
    JSON.stringify({ at: receivedAt, adultId: adult.parentId, coach }), { expirationTtl: OUT_TTL });

  let alertSent = true;
  if (isFeatureOn(teamConfig, 'pickupOverrideAlerts')) {
    const authorizedAdultRecords = [...kid.authorizedParentIds].map(id => roster.parents.get(id)).filter(Boolean);
    alertSent = await sendParentAlerts(env, teamConfig, kid, adult, authorizedAdultRecords, coach, reason);
  }

  const result = {
    status: 'yellow-override',
    kid:   { kidId: kid.kidId, name: kid.kidName },
    adult: { parentId: adult.parentId, name: adult.name },
    alertSent
  };
  await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
  await env.RATELIMIT.delete(pendingKey);
  return respond(result);
}

// ─── /coach/api/pickup/sync (offline queue) ──────────────────────────────────

async function handlePickupSync(req, env, url) {
  const ctx = await requireCoachApi(req, env, url, { feature: 'pickup' });
  if (ctx instanceof Response) return ctx;
  const { email: coach, team, teamConfig, body } = ctx;

  const events = Array.isArray(body.events) ? body.events.slice(0, 50) : [];
  if (events.length === 0) return respond({ results: [] });

  const sorted = [...events].sort((a, b) => new Date(a.scannedAt) - new Date(b.scannedAt));

  let roster;
  try {
    roster = await getRoster(env, team, teamConfig.sheetId);
  } catch (err) {
    return respondForRosterError(err);
  }

  const results = [];
  for (const evt of sorted) {
    results.push(await processSyncEvent(env, team, teamConfig, roster, coach, evt));
  }
  return respond({ results });
}

async function processSyncEvent(env, team, teamConfig, roster, coach, evt) {
  const eventId = evt && evt.eventId;
  if (!isValidEventId(eventId)) return { eventId: eventId || null, status: 'error', error: 'bad_request' };

  const evtKey = `evt:${eventId}`;
  const cached = await env.RATELIMIT.get(evtKey);
  if (cached) {
    try { return { eventId, ...JSON.parse(cached) }; } catch { /* recompute below */ }
  }

  const adultId = normalizeId(evt.adultId);
  const kidId   = normalizeId(evt.kidId);
  const scannedAtDate = resolveScannedAt(true, evt.scannedAt);
  const scannedAtStr  = formatLocalTimestamp(scannedAtDate, teamConfig.timezone);
  const receivedAt    = new Date().toISOString();

  if (!isValidId(adultId) || !isValidId(kidId)) {
    const written = await appendRow(env, teamConfig.sheetId, 'Rejected',
      [eventId, scannedAtStr, receivedAt, `${adultId || '?'} / ${kidId || '?'}`, 'Unknown card', coach, 'TRUE']);
    if (!written) return { eventId, status: 'error', error: 'log_failed' };
    await sendIncidentEmail(env, teamConfig, 'SpikeFit incident: rejected offline scan',
      incidentEmailHtml(team, coach, 'Unknown card scanned offline', scannedAtStr));
    const result = { status: 'red', reason: 'Unknown card' };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return { eventId, ...result };
  }

  const decision = decidePickup(roster, adultId, kidId);
  const outKey = `out:${team}:${todayLocalDate(teamConfig.timezone)}:${kidId}`;

  if (decision.status === 'red') {
    const reasonMsg = RED_REASON_MESSAGES[decision.reason] || 'Unknown card';
    const written = await appendRow(env, teamConfig.sheetId, 'Rejected',
      [eventId, scannedAtStr, receivedAt, `${adultId} / ${kidId}`, reasonMsg, coach, 'TRUE']);
    if (!written) return { eventId, status: 'error', error: 'log_failed' };
    await sendIncidentEmail(env, teamConfig, 'SpikeFit incident: rejected offline scan',
      incidentEmailHtml(team, coach, reasonMsg, scannedAtStr));
    const result = { status: 'red', reason: reasonMsg };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return { eventId, ...result };
  }

  if (decision.status === 'green') {
    const row = [eventId, scannedAtStr, receivedAt, decision.kid.kidName, decision.kid.kidId,
      decision.adult.name, decision.adult.parentId, 'green', coach, '', '', 'TRUE'];
    const written = await appendRow(env, teamConfig.sheetId, 'Log', row);
    if (!written) return { eventId, status: 'error', error: 'log_failed' };

    await env.RATELIMIT.put(outKey, JSON.stringify({ at: receivedAt, adultId: decision.adult.parentId, coach }), { expirationTtl: OUT_TTL });
    const result = {
      status: 'green',
      kid:   { kidId: decision.kid.kidId, name: decision.kid.kidName },
      adult: { parentId: decision.adult.parentId, name: decision.adult.name }
    };
    await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
    return { eventId, ...result };
  }

  // yellow — the kid is already gone by the time this syncs, so no
  // confirmation is possible; auto-release, flag it, and alert everyone.
  const overrideReason = 'RELEASED OFFLINE — NOT VERIFIED';
  const row = [eventId, scannedAtStr, receivedAt, decision.kid.kidName, decision.kid.kidId,
    decision.adult.name, decision.adult.parentId, 'yellow-override', coach, overrideReason, '', 'TRUE'];
  const loggedOk   = await appendRow(env, teamConfig.sheetId, 'Log', row);
  const overrideOk = loggedOk && await appendRow(env, teamConfig.sheetId, 'Overrides', row);
  if (!loggedOk || !overrideOk) return { eventId, status: 'error', error: 'log_failed' };

  await env.RATELIMIT.put(outKey, JSON.stringify({ at: receivedAt, adultId: decision.adult.parentId, coach }), { expirationTtl: OUT_TTL });

  let alertSent = true;
  if (isFeatureOn(teamConfig, 'pickupOverrideAlerts')) {
    alertSent = await sendParentAlerts(env, teamConfig, decision.kid, decision.adult, decision.authorizedAdults, coach, overrideReason);
  }
  await sendIncidentEmail(env, teamConfig, 'SpikeFit incident: offline release not verified',
    incidentEmailHtml(team, coach, `${decision.kid.kidName} was released offline without verification`, scannedAtStr));

  const result = {
    status: 'yellow-override',
    kid:   { kidId: decision.kid.kidId, name: decision.kid.kidName },
    adult: { parentId: decision.adult.parentId, name: decision.adult.name },
    alertSent
  };
  await env.RATELIMIT.put(evtKey, JSON.stringify(result), { expirationTtl: EVT_TTL });
  return { eventId, ...result };
}

// ─── Coach emails (Resend) ────────────────────────────────────────────────────

async function sendParentAlerts(env, teamConfig, kid, releasingAdult, authorizedAdultRecords, coach, reason) {
  const recipients = authorizedAdultRecords.filter(a => a.email);
  if (recipients.length === 0) return true;

  const timeStr = formatLocalTimestamp(new Date(), teamConfig.timezone);
  let allOk = true;
  for (const parent of recipients) {
    // One recipient per email — never several addresses in `to` — so parents
    // never see each other's addresses.
    const ok = await sendParentAlertEmail(env.RESEND_API_KEY, parent.email, {
      kidName: kid.kidName, adultName: releasingAdult.name, coach, reason, timeStr
    });
    if (!ok) allOk = false;
  }
  return allOk;
}

async function sendParentAlertEmail(apiKey, to, { kidName, adultName, coach, reason, timeStr }) {
  const html = `
    <div style="font-family:'Source Sans Pro',Helvetica,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;">
      <img src="https://spikefit.app/logo.png" alt="SpikeFit" style="width:160px;display:block;margin:0 auto 32px;">
      <h2 style="color:#2d3748;text-align:center;margin-bottom:8px;">Pickup notice</h2>
      <p style="color:#2d3748;text-align:center;margin-bottom:16px;"><strong>${escapeHtml(kidName)}</strong> was picked up by <strong>${escapeHtml(adultName)}</strong> at ${escapeHtml(timeStr)}.</p>
      <p style="color:#718096;text-align:center;font-size:14px;">Coach: ${escapeHtml(coach)}<br>Reason: ${escapeHtml(reason)}</p>
      <p style="color:#718096;font-size:13px;text-align:center;margin-top:24px;">If this doesn't look right, contact your team's coach right away.</p>
    </div>`;
  return sendResend(apiKey, to, `${kidName} was picked up`, html);
}

async function sendIncidentEmail(env, teamConfig, subject, html) {
  const admins = Array.isArray(teamConfig.adminEmails) ? teamConfig.adminEmails : [];
  let allOk = true;
  for (const to of admins) {
    const ok = await sendResend(env.RESEND_API_KEY, to, subject, html);
    if (!ok) allOk = false;
  }
  return allOk;
}

function incidentEmailHtml(team, coach, detail, timeStr) {
  return `
    <div style="font-family:'Source Sans Pro',Helvetica,sans-serif;max-width:480px;margin:0 auto;padding:32px 24px;">
      <h2 style="color:#2d3748;">SpikeFit coach incident — ${escapeHtml(team)}</h2>
      <p style="color:#2d3748;">${escapeHtml(detail)}</p>
      <p style="color:#718096;font-size:14px;">Coach: ${escapeHtml(coach)}<br>Time: ${escapeHtml(timeStr)}</p>
    </div>`;
}

// ═══════════════════════════════════════════════════════════════════════════
// Events module (ADR-015) — team events + RSVP
//
// Coaches publish events; players and parents RSVP. Data lives in the
// `EVENTS` KV namespace, NOT the team Sheet. What is stored, exhaustively:
//   ev:<team>:<date>T<HHMM>:<eventId>        event details (no personal data)
//   rsvp:<team>:<eventId>:<memberId>         value '1'; metadata {n,r,b,at}
//   me:<team>:<selfId>                       {n} — the player's display name
//   kid:<team>:<guardianId>:<memberId>       value '1'; metadata {n,l}
// Identity is an HMAC of the login email (EVENTS_HMAC_KEY) — never the email
// itself. No email, phone number, or roster data is ever written to any
// Cloudflare-owned store. Every key expires (event date + 30 days, or a
// rolling 180-day idle TTL for profile keys). Team membership is the
// subdomain the request arrives on. See docs/decisions.md ADR-015.
// ═══════════════════════════════════════════════════════════════════════════

const EVENTS_RATE_LIMIT      = 60;   // mutating requests per user per minute
const EVENTS_RATE_WINDOW     = 60;   // seconds
const EVENT_RETENTION_DAYS   = 30;   // keys live this long after the event date
const PROFILE_TTL            = 60 * 60 * 24 * 180;
const MAX_UPCOMING_EVENTS    = 50;
const MAX_RSVPS_PER_EVENT    = 500;
const MAX_KIDS_PER_GUARDIAN  = 8;
const MAX_EVENTS_LOADED      = 60;   // caps KV gets per request
const NEXT_WINDOW_DAYS       = 14;
const NEXT_MAX_EVENTS        = 3;
const DEFAULT_EVENT_MINUTES  = 120;  // assumed length when no end time is set
const RSVP_RESPONSES         = ['yes', 'maybe', 'no'];
const DEFAULT_EVENT_TYPES = [
  { id: 'practice',    label: 'Practice' },
  { id: 'game',        label: 'Game' },
  { id: 'team_dinner', label: 'Team dinner' },
  { id: 'fundraiser',  label: 'Fundraiser' },
  { id: 'other',       label: 'Other' }
];
const EVENT_KEY_RE  = /^ev:([^:]+):(\d{4}-\d{2}-\d{2})T(\d{2})(\d{2}):([0-9a-f-]{36})$/;
const MEMBER_ID_RE  = /^([0-9a-f]{32}|[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12})$/i;

// ─── Pure helpers (node --test coverage: tests/worker/events.test.js) ───────

function stripControlChars(str, keepNewlines) {
  let out = '';
  for (const ch of String(str ?? '')) {
    const code = ch.codePointAt(0);
    if (code === 10 && keepNewlines) { out += ch; continue; }
    if (code < 32 || code === 127) continue;
    out += ch;
  }
  return out;
}

function cleanText(raw, max, { multiline = false } = {}) {
  if (typeof raw !== 'string') return '';
  let s = stripControlChars(raw, multiline);
  s = multiline
    ? s.replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n')
    : s.replace(/\s+/g, ' ');
  return Array.from(s.trim()).slice(0, max).join('');
}

// A display name is a name, not a contact detail: anything containing an '@'
// or a run of 7+ digits (an email address or phone number) is rejected, so
// the events module can't be used to park contact info in KV (ADR-015(c)).
function normalizeDisplayName(raw) {
  const name = cleanText(raw, 30);
  if (name.includes('@') || /\d[\s().-]*(\d[\s().-]*){6}/.test(name)) return '';
  return name;
}

// 'bad_name' = something was typed but it looked like contact info; otherwise
// nothing usable was typed.
function nameError(raw) {
  return cleanText(raw, 30) ? 'bad_name' : 'name_required';
}

function isValidDate(s) {
  if (typeof s !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(s)) return false;
  const [y, m, d] = s.split('-').map(Number);
  const dt = new Date(Date.UTC(y, m - 1, d));
  return dt.getUTCFullYear() === y && dt.getUTCMonth() === m - 1 && dt.getUTCDate() === d;
}

function isValidTime(s) {
  return typeof s === 'string' && /^([01]\d|2[0-3]):[0-5]\d$/.test(s);
}

function shiftDate(dateStr, days) {
  const [y, m, d] = dateStr.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function isValidMemberId(id) {
  return typeof id === 'string' && MEMBER_ID_RE.test(id);
}

// A team can define its own event types in TEAMS config (`eventTypes`); a
// missing or malformed list falls back to the defaults so a typo can never
// leave a team unable to create events.
function eventTypesFor(teamConfig) {
  const raw = teamConfig && teamConfig.eventTypes;
  if (!Array.isArray(raw)) return DEFAULT_EVENT_TYPES;
  const seen = new Set();
  const types = [];
  for (const t of raw) {
    if (!t || typeof t.id !== 'string' || typeof t.label !== 'string') continue;
    if (!/^[a-z0-9_]{1,24}$/.test(t.id) || seen.has(t.id)) continue;
    const label = cleanText(t.label, 30);
    if (!label) continue;
    seen.add(t.id);
    types.push({ id: t.id, label });
    if (types.length >= 12) break;
  }
  return types.length > 0 ? types : DEFAULT_EVENT_TYPES;
}

// Returns {ok:true, event} or {ok:false, error}. `today` ('YYYY-MM-DD' in the
// team's timezone) enables the "not older than yesterday" check; pass null to
// skip it (editing an existing event without moving its date).
function validateEventInput(input, types, today) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) return { ok: false, error: 'bad_request' };
  if (!types.some(t => t.id === input.type)) return { ok: false, error: 'bad_type' };
  const title = cleanText(input.title, 80);
  if (!title) return { ok: false, error: 'title_required' };
  if (!isValidDate(input.date)) return { ok: false, error: 'bad_date' };
  if (today && input.date < shiftDate(today, -1)) return { ok: false, error: 'date_in_past' };
  if (!isValidTime(input.time)) return { ok: false, error: 'bad_time' };
  let endTime = '';
  if (input.endTime) {
    if (!isValidTime(input.endTime)) return { ok: false, error: 'bad_time' };
    if (input.endTime <= input.time) return { ok: false, error: 'end_before_start' };
    endTime = input.endTime;
  }
  return {
    ok: true,
    event: {
      type: input.type,
      title,
      date: input.date,
      time: input.time,
      endTime,
      location: cleanText(input.location, 120),
      notes: cleanText(input.notes, 500, { multiline: true }),
      canceled: input.canceled === true
    }
  };
}

// Events are stored as wall-clock date+time in the team's timezone, so
// "now" and "ended" comparisons are plain string compares on
// 'YYYY-MM-DD HH:MM' — no timezone conversion anywhere.
function eventEndStamp(ev) {
  if (ev.endTime) return `${ev.date} ${ev.endTime}`;
  const [h, m] = ev.time.split(':').map(Number);
  const total = h * 60 + m + DEFAULT_EVENT_MINUTES;
  const date = total >= 1440 ? shiftDate(ev.date, 1) : ev.date;
  const t = total % 1440;
  return `${date} ${String(Math.floor(t / 60)).padStart(2, '0')}:${String(t % 60).padStart(2, '0')}`;
}

function hasEnded(ev, nowStamp) {
  return eventEndStamp(ev) <= nowStamp;
}

function nowStampInTz(timezone) {
  return formatLocalTimestamp(new Date(), timezone).replace('T', ' ').slice(0, 16);
}

// Absolute unix-seconds expiry: end of the event day + retention. Never less
// than 2 minutes out (KV rejects expirations under 60s).
function eventExpiry(dateStr, nowMs = Date.now()) {
  const [y, m, d] = dateStr.split('-').map(Number);
  const exp = Math.floor(Date.UTC(y, m - 1, d) / 1000) + (1 + EVENT_RETENTION_DAYS) * 86400;
  return Math.max(exp, Math.floor(nowMs / 1000) + 120);
}

// HMAC-SHA256(secret, "<scope>:<team>:<email>") → 32 hex chars. scope 'm' =
// a person's own member id, 'g' = a guardian's id. The team is mixed in so
// the same person isn't linkable across teams.
async function hmacId(secret, scope, team, email) {
  if (typeof secret !== 'string' || secret.length < 16) {
    throw new Error('EVENTS_HMAC_KEY missing or too short');
  }
  const enc = new TextEncoder();
  const key = await crypto.subtle.importKey('raw', enc.encode(secret), { name: 'HMAC', hash: 'SHA-256' }, false, ['sign']);
  const sig = await crypto.subtle.sign('HMAC', key, enc.encode(`${scope}:${team}:${String(email).trim().toLowerCase()}`));
  return [...new Uint8Array(sig)].map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 32);
}

function eventKey(team, date, time, id) {
  return `ev:${team}:${date}T${time.replace(':', '')}:${id}`;
}

function parseEventKey(name) {
  const m = EVENT_KEY_RE.exec(name || '');
  if (!m) return null;
  return { name, team: m[1], date: m[2], time: `${m[3]}:${m[4]}`, id: m[5] };
}

function rsvpKey(team, eventId, memberId) {
  return `rsvp:${team}:${eventId}:${memberId}`;
}

function parseRsvpKey(name) {
  const parts = String(name || '').split(':');
  if (parts.length !== 4 || parts[0] !== 'rsvp') return null;
  return { team: parts[1], eventId: parts[2], memberId: parts[3] };
}

// Turns a `list({prefix:'rsvp:<team>:'})` result (keys carry their metadata)
// into per-event counts + entries, with no per-key get.
function summarizeRsvps(keys) {
  const byEvent = new Map();
  for (const k of keys || []) {
    const p = parseRsvpKey(k.name);
    const md = k.metadata;
    if (!p || !md || !RSVP_RESPONSES.includes(md.r)) continue;
    let s = byEvent.get(p.eventId);
    if (!s) {
      s = { counts: { yes: 0, maybe: 0, no: 0 }, entries: [] };
      byEvent.set(p.eventId, s);
    }
    s.counts[md.r]++;
    s.entries.push({
      memberId: p.memberId,
      name: typeof md.n === 'string' ? md.n : '',
      response: md.r,
      by: md.b === 'guardian' ? 'guardian' : 'self'
    });
  }
  return byEvent;
}

// A caller may answer for themselves, or for a kid on their own guardian list.
function canRsvpFor(memberId, selfId, kidIds) {
  return memberId === selfId || (Array.isArray(kidIds) && kidIds.includes(memberId));
}

// ─── KV helpers ──────────────────────────────────────────────────────────────

// Reads cap at maxPages x 1000 keys. Anything that DELETES (forget, removing a
// managed kid) passes DELETE_LIST_PAGES so a "remove my data" request can't
// silently miss rows past the read cap.
const DELETE_LIST_PAGES = 100;

async function kvListAll(kv, prefix, maxPages = 5) {
  const keys = [];
  let cursor;
  for (let i = 0; i < maxPages; i++) {
    const res = await kv.list({ prefix, cursor });
    keys.push(...res.keys);
    if (res.list_complete) break;
    cursor = res.cursor;
  }
  return keys;
}

async function bumpRateLimit(env, key, limit, windowSec) {
  const count = Number.parseInt(await env.RATELIMIT.get(key) || '0');
  if (count >= limit) return false;
  await env.RATELIMIT.put(key, String(count + 1), { expirationTtl: windowSec });
  return true;
}

function eventsRespond(body, status = 200) {
  return respond(body, status, { 'Cache-Control': 'no-store' });
}

async function listEventInfos(env, team) {
  const keys = await kvListAll(env.EVENTS, `ev:${team}:`);
  return keys.map(k => parseEventKey(k.name)).filter(Boolean);
}

async function loadEvent(env, info) {
  const raw = await env.EVENTS.get(info.name);
  if (!raw) return null;
  try {
    const v = JSON.parse(raw);
    if (!v || typeof v !== 'object') return null;
    return {
      id: info.id, date: info.date, time: info.time,
      type: String(v.type || ''), title: String(v.title || ''),
      endTime: typeof v.endTime === 'string' ? v.endTime : '',
      location: String(v.location || ''), notes: String(v.notes || ''),
      canceled: v.canceled === true
    };
  } catch {
    return null;
  }
}

async function listKids(env, team, guardianId) {
  const keys = await kvListAll(env.EVENTS, `kid:${team}:${guardianId}:`);
  return keys
    .map(k => ({
      memberId: k.name.split(':')[3],
      name: (k.metadata && typeof k.metadata.n === 'string') ? k.metadata.n : '',
      linked: !!(k.metadata && k.metadata.l === 1)
    }))
    .filter(k => isValidMemberId(k.memberId));
}

async function readOwnName(env, team, selfId) {
  const raw = await env.EVENTS.get(`me:${team}:${selfId}`);
  if (!raw) return '';
  try {
    const v = JSON.parse(raw);
    return (v && typeof v.n === 'string') ? v.n : '';
  } catch {
    return '';
  }
}

// Writes/refreshes the caller's display name and, for a minor whose guardian
// has confirmed consent (ALLOWLIST guardianEmail — set only by the emailed
// confirmation link), links them into that guardian's kid list.
async function writeProfile(env, ctx, name) {
  await env.EVENTS.put(`me:${ctx.team}:${ctx.selfId}`, JSON.stringify({ n: name }), { expirationTtl: PROFILE_TTL });
  const record = await readAllowlistRecord(env, ctx.email);
  if (typeof record.guardianEmail === 'string' && record.guardianEmail && record.guardianAcceptedAt) {
    const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, record.guardianEmail);
    await env.EVENTS.put(`kid:${ctx.team}:${guardianId}:${ctx.selfId}`, '1', {
      metadata: { n: name, l: 1 }, expirationTtl: PROFILE_TTL
    });
  }
}

// ─── Context / auth ──────────────────────────────────────────────────────────

// Shared gate for every /events/api/* route. Returns a context object or a
// Response to return directly. Membership = the subdomain the request arrived
// on (no roster lookup); the team must exist in TEAMS with features.events.
async function requireEventsContext(req, env, url, { mutating = false, coach = false } = {}) {
  if (mutating) {
    if (req.method !== 'POST') return eventsRespond({ error: 'method_not_allowed' }, 405);
    if (!(req.headers.get('Content-Type') || '').includes('application/json')) return eventsRespond({ error: 'bad_request' }, 400);
    if (req.headers.get('Origin') !== url.origin) return eventsRespond({ error: 'bad_request' }, 400);
  } else if (req.method !== 'GET') {
    return eventsRespond({ error: 'method_not_allowed' }, 405);
  }

  const email = await getSession(req, env);
  if (!email) return eventsRespond({ error: 'not_authenticated' }, 401);

  const team = resolveCoachHostTeam(url.hostname);
  if (!team) return eventsRespond({ error: 'events_unavailable' }, 403);
  const teamConfig = await getTeamConfig(env, team);
  if (!teamConfig || !isFeatureOn(teamConfig, 'events')) return eventsRespond({ error: 'events_unavailable' }, 403);
  if (!env.EVENTS || typeof env.EVENTS_HMAC_KEY !== 'string' || env.EVENTS_HMAC_KEY.length < 16) {
    return eventsRespond({ error: 'events_not_configured' }, 503);
  }

  const selfId = await hmacId(env.EVENTS_HMAC_KEY, 'm', team, email);

  if (mutating && !(await bumpRateLimit(env, `evapi:${selfId}`, EVENTS_RATE_LIMIT, EVENTS_RATE_WINDOW))) {
    return eventsRespond({ error: 'rate_limited' }, 429);
  }

  const isCoach = (await getCoachTeams(env, email)).includes(team);
  if (coach && !isCoach) return eventsRespond({ error: 'not_a_coach' }, 403);

  let body = null;
  if (mutating) {
    try { body = await req.json(); } catch { return eventsRespond({ error: 'bad_request' }, 400); }
    if (!body || typeof body !== 'object' || Array.isArray(body)) return eventsRespond({ error: 'bad_request' }, 400);
  }

  return {
    email, team, teamConfig, isCoach, selfId, body,
    tz: teamConfig.timezone || 'America/New_York'
  };
}

// ─── /events (page) ──────────────────────────────────────────────────────────

async function handleEventsPage(req, env, url) {
  const email = await getSession(req, env);
  if (!email) {
    // pathname + search so a /events?e=<eventId> deep link survives login.
    return Response.redirect(`${url.origin}/auth.html?redirect=${encodeURIComponent(url.pathname + url.search)}`, 302);
  }
  const team = resolveCoachHostTeam(url.hostname);
  const teamConfig = team ? await getTeamConfig(env, team) : null;
  if (!teamConfig || !isFeatureOn(teamConfig, 'events')) return eventsUnavailablePage();

  const safeReq = new Request(new URL('/events.html', ORIGIN), req);
  return addSecurityHeaders(await fetch(safeReq));
}

function eventsUnavailablePage() {
  return new Response(
    `<!DOCTYPE html><html><head><meta charset="UTF-8"><title>SpikeFit Events</title></head>` +
    `<body style="font-family:sans-serif;max-width:400px;margin:80px auto;text-align:center;color:#2d3748;">` +
    `<p>Team events aren't enabled here. Open your team's SpikeFit page to see them.</p>` +
    `<p><a href="/app.html">Back to SpikeFit</a></p></body></html>`,
    { status: 403, headers: { 'Content-Type': 'text/html; charset=UTF-8' } }
  );
}

// ─── /events/api/* ───────────────────────────────────────────────────────────

async function handleEventsApi(req, env, url) {
  switch (url.pathname) {
    case '/events/api/list':        return handleEventsList(req, env, url);
    case '/events/api/next':        return handleEventsNext(req, env, url);
    case '/events/api/profile':     return handleEventsProfile(req, env, url);
    case '/events/api/kids':        return handleEventsKids(req, env, url);
    case '/events/api/rsvp':        return handleEventsRsvp(req, env, url);
    case '/events/api/event/save':  return handleEventSave(req, env, url);
    case '/events/api/event/delete': return handleEventDelete(req, env, url);
    case '/events/api/forget':      return handleEventsForget(req, env, url);
    default:                        return eventsRespond({ error: 'not_found' }, 404);
  }
}

function publicEvent(ev, ended) {
  return {
    id: ev.id, type: ev.type, title: ev.title, date: ev.date, time: ev.time,
    endTime: ev.endTime, location: ev.location, notes: ev.notes,
    canceled: ev.canceled, ended: !!ended
  };
}

async function handleEventsList(req, env, url) {
  const ctx = await requireEventsContext(req, env, url);
  if (ctx instanceof Response) return ctx;

  const includePast = url.searchParams.get('past') === '1';
  const nowStamp = nowStampInTz(ctx.tz);
  const today = nowStamp.slice(0, 10);
  const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, ctx.email);

  const infos = await listEventInfos(env, ctx.team);
  const candidates = (includePast ? infos : infos.filter(i => i.date >= shiftDate(today, -1)))
    .slice(includePast ? -MAX_EVENTS_LOADED : 0, includePast ? undefined : MAX_EVENTS_LOADED);
  const loaded = (await Promise.all(candidates.map(i => loadEvent(env, i)))).filter(Boolean);
  const events = loaded.filter(ev => includePast || !hasEnded(ev, nowStamp));

  const [rsvpKeys, name, kids] = await Promise.all([
    events.length > 0 ? kvListAll(env.EVENTS, `rsvp:${ctx.team}:`) : Promise.resolve([]),
    readOwnName(env, ctx.team, ctx.selfId),
    listKids(env, ctx.team, guardianId)
  ]);
  const summary = summarizeRsvps(rsvpKeys);

  return eventsRespond({
    team: ctx.team,
    teamName: ctx.teamConfig.name || ctx.team,
    tz: ctx.tz,
    types: eventTypesFor(ctx.teamConfig),
    isCoach: ctx.isCoach,
    me: { hasName: !!name, name },
    kids,
    events: events.map(ev => {
      const s = summary.get(ev.id) || { counts: { yes: 0, maybe: 0, no: 0 }, entries: [] };
      const mine = s.entries.find(e => e.memberId === ctx.selfId) || null;
      const out = {
        ...publicEvent(ev, hasEnded(ev, nowStamp)),
        counts: s.counts,
        mine: mine ? { response: mine.response, by: mine.by } : null,
        kidAnswers: kids.map(k => {
          const e = s.entries.find(x => x.memberId === k.memberId);
          return { memberId: k.memberId, name: k.name, response: e ? e.response : null, by: e ? e.by : null };
        })
      };
      // Names are only ever returned to a coach of this team.
      if (ctx.isCoach) {
        out.attendees = s.entries
          .map(e => ({ memberId: e.memberId, name: e.name, response: e.response, by: e.by }))
          .sort((a, b) => a.name.localeCompare(b.name));
      }
      return out;
    })
  });
}

// Lightweight feed for the app.html banner: the next few events that haven't
// ended yet, plus the caller's own (or their only kid's) answer.
async function handleEventsNext(req, env, url) {
  const ctx = await requireEventsContext(req, env, url);
  if (ctx instanceof Response) return ctx;

  const nowStamp = nowStampInTz(ctx.tz);
  const today = nowStamp.slice(0, 10);
  const horizon = shiftDate(today, NEXT_WINDOW_DAYS);
  const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, ctx.email);

  const infos = (await listEventInfos(env, ctx.team))
    .filter(i => i.date >= shiftDate(today, -1) && i.date <= horizon)
    .slice(0, MAX_EVENTS_LOADED);
  const loaded = (await Promise.all(infos.map(i => loadEvent(env, i)))).filter(Boolean);
  const upcoming = loaded.filter(ev => !hasEnded(ev, nowStamp)).slice(0, NEXT_MAX_EVENTS);

  const [name, kids] = await Promise.all([
    readOwnName(env, ctx.team, ctx.selfId),
    listKids(env, ctx.team, guardianId)
  ]);
  const singleKid = kids.length === 1 ? kids[0] : null;

  const events = await Promise.all(upcoming.map(async ev => {
    const mineRes = await env.EVENTS.getWithMetadata(rsvpKey(ctx.team, ev.id, ctx.selfId));
    const kidRes = singleKid ? await env.EVENTS.getWithMetadata(rsvpKey(ctx.team, ev.id, singleKid.memberId)) : null;
    const resp = md => (md && RSVP_RESPONSES.includes(md.r)) ? md.r : null;
    return {
      ...publicEvent(ev, false),
      mine: resp(mineRes && mineRes.metadata),
      kid: singleKid ? { memberId: singleKid.memberId, name: singleKid.name, response: resp(kidRes && kidRes.metadata) } : null
    };
  }));

  return eventsRespond({
    team: ctx.team,
    teamName: ctx.teamConfig.name || ctx.team,
    types: eventTypesFor(ctx.teamConfig),
    hasName: !!name,
    kidCount: kids.length,
    events
  });
}

async function handleEventsProfile(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true });
  if (ctx instanceof Response) return ctx;

  const name = normalizeDisplayName(ctx.body.name);
  if (!name) return eventsRespond({ error: nameError(ctx.body.name) }, 400);
  await writeProfile(env, ctx, name);
  return eventsRespond({ ok: true, name });
}

// Parent-managed kids (kids without their own login). A kid who has a login
// is linked automatically through writeProfile(); those entries can be
// unlinked here but not renamed (the name is the kid's own).
async function handleEventsKids(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true });
  if (ctx instanceof Response) return ctx;

  const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, ctx.email);
  const action = ctx.body.action;

  if (action === 'add') {
    const name = normalizeDisplayName(ctx.body.name);
    if (!name) return eventsRespond({ error: nameError(ctx.body.name) }, 400);
    const kids = await listKids(env, ctx.team, guardianId);
    if (kids.length >= MAX_KIDS_PER_GUARDIAN) return eventsRespond({ error: 'too_many_kids' }, 409);
    const memberId = crypto.randomUUID();
    await env.EVENTS.put(`kid:${ctx.team}:${guardianId}:${memberId}`, '1', {
      metadata: { n: name, l: 0 }, expirationTtl: PROFILE_TTL
    });
    return eventsRespond({ ok: true, memberId, name });
  }

  const memberId = ctx.body.memberId;
  if (!isValidMemberId(memberId)) return eventsRespond({ error: 'bad_request' }, 400);
  const key = `kid:${ctx.team}:${guardianId}:${memberId}`;
  const existing = await env.EVENTS.getWithMetadata(key);
  if (!existing || existing.value === null || !existing.metadata) return eventsRespond({ error: 'not_found' }, 404);

  if (action === 'rename') {
    if (existing.metadata.l === 1) return eventsRespond({ error: 'linked_kid' }, 400);
    const name = normalizeDisplayName(ctx.body.name);
    if (!name) return eventsRespond({ error: nameError(ctx.body.name) }, 400);
    await env.EVENTS.put(key, '1', { metadata: { n: name, l: 0 }, expirationTtl: PROFILE_TTL });
    return eventsRespond({ ok: true, name });
  }

  if (action === 'remove') {
    await env.EVENTS.delete(key);
    if (existing.metadata.l !== 1) {
      // A managed kid's RSVP rows are this parent's data — remove them too.
      // (A linked kid's rows belong to the kid and are left alone.)
      const rsvps = await kvListAll(env.EVENTS, `rsvp:${ctx.team}:`, DELETE_LIST_PAGES);
      await Promise.all(rsvps
        .filter(k => { const p = parseRsvpKey(k.name); return p && p.memberId === memberId; })
        .map(k => env.EVENTS.delete(k.name)));
    }
    return eventsRespond({ ok: true });
  }

  return eventsRespond({ error: 'bad_request' }, 400);
}

async function findEventInfo(env, team, eventId) {
  const infos = await listEventInfos(env, team);
  return infos.find(i => i.id === eventId) || null;
}

async function handleEventsRsvp(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true });
  if (ctx instanceof Response) return ctx;

  const { eventId, response } = ctx.body;
  if (!isValidEventId(eventId) || !RSVP_RESPONSES.includes(response)) return eventsRespond({ error: 'bad_request' }, 400);
  const memberId = ctx.body.memberId === undefined || ctx.body.memberId === null ? ctx.selfId : ctx.body.memberId;
  if (!isValidMemberId(memberId)) return eventsRespond({ error: 'bad_request' }, 400);

  const info = await findEventInfo(env, ctx.team, eventId);
  if (!info) return eventsRespond({ error: 'event_not_found' }, 404);
  const ev = await loadEvent(env, info);
  if (!ev) return eventsRespond({ error: 'event_not_found' }, 404);
  if (ev.canceled) return eventsRespond({ error: 'event_canceled' }, 409);
  if (hasEnded(ev, nowStampInTz(ctx.tz))) return eventsRespond({ error: 'event_ended' }, 409);

  const isSelf = memberId === ctx.selfId;
  let displayName;
  if (isSelf) {
    displayName = await readOwnName(env, ctx.team, ctx.selfId);
    if (!displayName) return eventsRespond({ error: 'name_required' }, 400);
  } else {
    const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, ctx.email);
    const kids = await listKids(env, ctx.team, guardianId);
    if (!canRsvpFor(memberId, ctx.selfId, kids.map(k => k.memberId))) return eventsRespond({ error: 'not_your_player' }, 403);
    const kid = kids.find(k => k.memberId === memberId);
    displayName = kid.name;
    // Keep the kid on the parent's list while it's in use (rolling idle TTL).
    await env.EVENTS.put(`kid:${ctx.team}:${guardianId}:${memberId}`, '1', {
      metadata: { n: kid.name, l: kid.linked ? 1 : 0 }, expirationTtl: PROFILE_TTL
    });
  }

  const key = rsvpKey(ctx.team, eventId, memberId);
  const existing = await kvListAll(env.EVENTS, `rsvp:${ctx.team}:${eventId}:`);
  if (existing.length >= MAX_RSVPS_PER_EVENT && !existing.some(k => k.name === key)) {
    return eventsRespond({ error: 'event_full' }, 409);
  }

  await env.EVENTS.put(key, '1', {
    metadata: { n: displayName, r: response, b: isSelf ? 'self' : 'guardian', at: new Date().toISOString() },
    expiration: eventExpiry(ev.date)
  });
  // Refreshes the rolling profile TTL and (re)links a minor to their guardian.
  if (isSelf) await writeProfile(env, ctx, displayName);

  return eventsRespond({ ok: true, memberId, response });
}

async function handleEventSave(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true, coach: true });
  if (ctx instanceof Response) return ctx;

  const input = ctx.body.event;
  if (!input || typeof input !== 'object' || Array.isArray(input)) return eventsRespond({ error: 'bad_request' }, 400);

  const today = nowStampInTz(ctx.tz).slice(0, 10);
  const infos = await listEventInfos(env, ctx.team);

  let existing = null;
  if (input.id !== undefined && input.id !== null && input.id !== '') {
    if (!isValidEventId(input.id)) return eventsRespond({ error: 'bad_request' }, 400);
    existing = infos.find(i => i.id === input.id) || null;
    if (!existing) return eventsRespond({ error: 'event_not_found' }, 404);
  } else if (infos.filter(i => i.date >= today).length >= MAX_UPCOMING_EVENTS) {
    return eventsRespond({ error: 'too_many_events' }, 409);
  }

  // An update that doesn't say `canceled` keeps the event's current state
  // (only an explicit true/false changes it).
  let payload = input;
  if (existing && typeof input.canceled !== 'boolean') {
    const current = await loadEvent(env, existing);
    payload = { ...input, canceled: !!(current && current.canceled) };
  }
  const check = validateEventInput(payload, eventTypesFor(ctx.teamConfig),
    existing && existing.date === input.date ? null : today);
  if (!check.ok) return eventsRespond({ error: check.error }, 400);
  const ev = check.event;

  const id = existing ? existing.id : crypto.randomUUID();
  const newName = eventKey(ctx.team, ev.date, ev.time, id);
  await env.EVENTS.put(newName, JSON.stringify({
    type: ev.type, title: ev.title, endTime: ev.endTime,
    location: ev.location, notes: ev.notes, canceled: ev.canceled
  }), { expiration: eventExpiry(ev.date) });

  if (existing && existing.name !== newName) await env.EVENTS.delete(existing.name);

  if (existing && existing.date !== ev.date) {
    // Rescheduled: RSVP keys were stamped with the old date's expiry, so
    // re-put them (same metadata) with the new one.
    const rsvps = await kvListAll(env.EVENTS, `rsvp:${ctx.team}:${id}:`);
    await Promise.all(rsvps.map(k => env.EVENTS.put(k.name, '1', {
      metadata: k.metadata, expiration: eventExpiry(ev.date)
    })));
  }

  return eventsRespond({ ok: true, id });
}

async function handleEventDelete(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true, coach: true });
  if (ctx instanceof Response) return ctx;

  const { eventId } = ctx.body;
  if (!isValidEventId(eventId)) return eventsRespond({ error: 'bad_request' }, 400);
  const info = await findEventInfo(env, ctx.team, eventId);
  if (!info) return eventsRespond({ error: 'event_not_found' }, 404);

  const rsvps = await kvListAll(env.EVENTS, `rsvp:${ctx.team}:${eventId}:`);
  await Promise.all(rsvps.map(k => env.EVENTS.delete(k.name)));
  await env.EVENTS.delete(info.name);
  return eventsRespond({ ok: true });
}

// "Remove my data": the caller's display name, kid list, parent-managed kids'
// RSVPs, and their own RSVPs on this team.
async function handleEventsForget(req, env, url) {
  const ctx = await requireEventsContext(req, env, url, { mutating: true });
  if (ctx instanceof Response) return ctx;

  const guardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, ctx.email);
  const kids = await listKids(env, ctx.team, guardianId);
  const ids = new Set([ctx.selfId, ...kids.filter(k => !k.linked).map(k => k.memberId)]);

  const toDelete = [`me:${ctx.team}:${ctx.selfId}`];
  kids.forEach(k => toDelete.push(`kid:${ctx.team}:${guardianId}:${k.memberId}`));

  const record = await readAllowlistRecord(env, ctx.email);
  if (typeof record.guardianEmail === 'string' && record.guardianEmail) {
    const theirGuardianId = await hmacId(env.EVENTS_HMAC_KEY, 'g', ctx.team, record.guardianEmail);
    toDelete.push(`kid:${ctx.team}:${theirGuardianId}:${ctx.selfId}`);
  }

  const rsvps = await kvListAll(env.EVENTS, `rsvp:${ctx.team}:`, DELETE_LIST_PAGES);
  rsvps.forEach(k => {
    const p = parseRsvpKey(k.name);
    if (p && ids.has(p.memberId)) toDelete.push(k.name);
  });

  await Promise.all(toDelete.map(name => env.EVENTS.delete(name)));
  return eventsRespond({ ok: true });
}

// Pure/testable exports for tests/worker/ (node --test). Everything else in
// this section makes live KV/Sheets/Resend calls and is exercised through
// the Playwright coach e2e suite (mocked API) and manual QA instead.
export {
  // events module (ADR-015)
  cleanText, normalizeDisplayName, nameError, isValidDate, isValidTime, shiftDate, isValidMemberId,
  eventTypesFor, validateEventInput, eventEndStamp, hasEnded, eventExpiry, hmacId,
  eventKey, parseEventKey, rsvpKey, parseRsvpKey, summarizeRsvps, canRsvpFor,
  DEFAULT_EVENT_TYPES,
  decidePickup, parseRoster, parseKidsSheet, parseParentsSheet,
  isValidId, isValidEventId, normalizeId,
  resolveCoachHostTeam, resolveCoachTeam, isFeatureOn, isSheetConfigured,
  buildAppendRequest, formatLocalTimestamp, todayLocalDate, resolveScannedAt, escapeHtml
};
