# Security Policy

## Reporting a Vulnerability

Please report security vulnerabilities privately via GitHub:
**[Report a vulnerability](https://github.com/jfrappier/spikefit/security/advisories/new)**

Do not open a public issue for security concerns.

## Scope

- `app.html` / `js/app.js` / `js/workouts.js` — client-side app logic
- `cloudflare/worker.js` — the optional hosting gate (One-time passwod (OTP auth), session management)

**Out of scope:** Cloudflare infrastructure, Resend email delivery, GitHub itself.

## What to Include

- Description of the vulnerability and potential impact
- Steps to reproduce
- Any proof-of-concept (screenshots, request/response, etc.)

## Response

I aim to acknowledge reports within 72 hours and resolve valid findings within 30 days.
