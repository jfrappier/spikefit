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
  '/css/components/coach.css'
  // coach.html is intentionally NOT listed here — the /coach route below
  // serves it behind the auth+coach-role gate (see ADR-014).
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // ACME domain-validation challenge (GitHub Pages' custom-domain HTTPS
    // cert, issued/renewed via Let's Encrypt HTTP-01). GitHub serves this
    // dynamically at request time during issuance — it is never a file in
    // this repo. Must never be auth-gated or redirected: the validator
    // needs the literal challenge response, not a login page. Without this
    // exemption the catch-all session gate below 302s it to /auth.html,
    // which silently and permanently breaks certificate renewal.
    if (url.pathname.startsWith('/.well-known/acme-challenge/')) {
      const safeReq = new Request(new URL(url.pathname, ORIGIN), req);
      return fetch(safeReq);
    }

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

// Pure/testable exports for tests/worker/ (node --test). Everything else in
// this section makes live KV/Sheets/Resend calls and is exercised through
// the Playwright coach e2e suite (mocked API) and manual QA instead.
export {
  decidePickup, parseRoster, parseKidsSheet, parseParentsSheet,
  isValidId, isValidEventId, normalizeId,
  resolveCoachHostTeam, resolveCoachTeam, isFeatureOn, isSheetConfigured,
  buildAppendRequest, formatLocalTimestamp, todayLocalDate, resolveScannedAt, escapeHtml
};
