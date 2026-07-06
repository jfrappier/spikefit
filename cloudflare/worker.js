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
  '/js/workouts.js',
  '/js/app.js',
  '/img/1.jpg',
  '/img/2.jpg',
  '/img/3.jpg',
  '/img/badge_char.png',
  '/img/social-banner.jpg',
  '/.well-known/security.txt'
]);

export default {
  async fetch(req, env) {
    const url = new URL(req.url);

    // Auth endpoints — always pass through
    if (url.pathname === '/auth/send')     return handleSend(req, env);
    if (url.pathname === '/auth/verify')   return handleVerify(req, env);
    if (url.pathname === '/auth/logout')   return handleLogout(req, env);

    // Static assets — always pass through (logo, favicon, fonts, etc.)
    if (STATIC_FILES.has(url.pathname)) {
      const safeReq = new Request(new URL(url.pathname, ORIGIN), req);
      return addSecurityHeaders(await fetch(safeReq));
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

// ─── Resend email ─────────────────────────────────────────────────────────────

async function sendEmail(apiKey, to, code) {
  try {
    const res = await fetch('https://api.resend.com/emails', {
      method: 'POST',
      headers: {
        Authorization:  `Bearer ${apiKey}`,
        'Content-Type': 'application/json'
      },
      body: JSON.stringify({
        from:    'SpikeFit <noreply@spikefit.app>',
        to,
        subject: `Your SpikeFit code`,
        html:    `
          <div style="font-family:'Source Sans Pro',Helvetica,sans-serif;max-width:400px;margin:0 auto;padding:40px 24px;">
            <img src="https://spikefit.app/logo.png" alt="SpikeFit" style="width:160px;display:block;margin:0 auto 32px;">
            <h2 style="color:#2d3748;text-align:center;letter-spacing:0.05em;text-transform:uppercase;margin-bottom:8px;">Your sign-in code</h2>
            <p style="color:#718096;text-align:center;margin-bottom:32px;">Enter this code to access SpikeFit. It expires in 10 minutes.</p>
            <div style="background:#f4f6f8;border-radius:12px;padding:24px;text-align:center;margin-bottom:32px;">
              <span style="font-size:40px;font-weight:700;letter-spacing:0.3em;color:#e80a89;">${code}</span>
            </div>
            <p style="color:#718096;font-size:14px;text-align:center;">If you didn't request this, you can safely ignore it.</p>
          </div>
        `
      })
    });
    return res.ok;
  } catch {
    return false;
  }
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
