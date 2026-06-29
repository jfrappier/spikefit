<div align="center">

  <img src="https://raw.githubusercontent.com/jfrappier/spikefit/refs/heads/main/logo.png" alt="SpikeFit Banner" width="100%">

  *A zero-dependency, progressive 30-minute daily power program for volleyball players.*

  [![HTML5](https://img.shields.io/badge/HTML5-E34F26?style=for-the-badge&logo=html5&logoColor=white)]()
  [![Vanilla JS](https://img.shields.io/badge/Vanilla_JS-F7DF1E?style=for-the-badge&logo=javascript&logoColor=black)]()
  [![Privacy First](https://img.shields.io/badge/Local_Storage-Privacy_First-4CAF50?style=for-the-badge)]()
  [![Zero Dependencies](https://img.shields.io/badge/Dependencies-0-blue?style=for-the-badge)]()
  [![Codacy Badge](https://app.codacy.com/project/badge/Grade/a6b03bddf556455691b54619d270aed4)](https://app.codacy.com/gh/jfrappier/spikefit/dashboard?utm_source=gh&utm_medium=referral&utm_content=&utm_campaign=Badge_grade)

</div>

---

> This project is set up for personal use. If you use it, please consult a qualified healthcare provider before beginning any exercise program. This is not a commercial application — use at your own risk.

**SpikeFit** is a mobile-responsive volleyball training app built on a single principle: your workout data belongs to you. There is no account, no backend, no data collection. Everything runs in your browser and stays on your device.

Open the app, see today's workout, check off exercises as you complete them, answer a quick readiness check-in, and earn a shareable badge when you finish. The F.R.E.S.H. system monitors your training load week over week and automatically swaps high-impact exercises on days when your body needs recovery — without you having to think about it.

## The Science

**Progressive overload** — the foundation of the program — is drawn from the [ACSM Position Stand on Progression Models in Resistance Training](https://pubmed.ncbi.nlm.nih.gov/19204579/), which recommends 2–3 sessions/week for novice trainees, 3–4 for intermediate, and 4–5 for advanced. SpikeFit auto-promotes you from Beginner → Intermediate → Advanced once you demonstrate consistent training pace: 16 workouts at your current level within any 35-day window (≈3.2 sessions/week).

**F.R.E.S.H.** (Fatigue & Readiness Evaluation System for Health) implements Tim Gabbett's Acute:Chronic Workload Ratio framework. ACWR compares your recent training load (last 7 days) against your average load over the past 28 days. The ratio tells you whether you're building fitness or accumulating excessive fatigue:

| ACWR | Zone | What it means |
|---|---|---|
| < 0.8 | Underload | Risk of deconditioning |
| 0.8–1.3 | Optimal | Sweet spot for adaptation |
| 1.3–1.5 | Caution | Elevated load — monitor recovery |
| > 1.5 | Danger | High injury risk — high-impact exercises auto-regulated |

The system waits until you have 14 days of logged workouts before showing a ratio — before that point, the acute and chronic windows overlap too much to produce a meaningful number.

## Getting Started

Because SpikeFit is a static application, you do not need a package manager, build tools, or a local server.

**To run locally:** Download or clone the repository and open `index.html` in any modern browser. The app initializes immediately. All your data is stored in your browser's local storage.

**To host on GitHub Pages:**

1. Navigate to the **Settings** tab of your repository.
2. Select **Pages** from the left sidebar.
3. Under **Build and deployment**, select **Deploy from a branch**.
4. Select your `main` branch and click **Save**.

GitHub provides a live URL accessible on any device, formatted for mobile.

## Optional: Access Control via Cloudflare Workers

The app works completely without any backend. If you're hosting a shared instance and want to limit who can access it, `cloudflare/worker.js` provides an allowlist-based access gate.

The Worker sits in front of your GitHub Pages deployment and requires email-based OTP authentication before serving `app.html`. It never handles or stores user workout data — only session tokens and rate limit counters.

**What you'll need to deploy it:**

- A Cloudflare account with Workers and KV enabled
- A [Resend](https://resend.com) account and API key for sending OTP emails
- `wrangler.toml` in the `cloudflare/` directory with four KV namespace bindings:

| Namespace | Purpose |
|---|---|
| `SESSIONS` | Maps session tokens to email addresses (30-day TTL) |
| `OTPS` | Stores one-time codes while they're valid (10-minute TTL) |
| `RATELIMIT` | Tracks OTP send and verify attempt counts |
| `ALLOWLIST` | The set of email addresses allowed to log in |

Add users by putting their email address as a key in the `ALLOWLIST` namespace (value can be anything, e.g. `'true'`). There is no self-registration.

## Resetting Data

To clear a single day: use the **Reset Today's Progress** button in the app.

To wipe everything and start fresh: clear your browser's site data or local storage for the app's domain.

## Architecture

Static HTML/CSS/JS served from GitHub Pages. All state in browser local storage. Optional Cloudflare Worker for access control. No build step, no framework, no server-side user data.

See [`docs/architecture.md`](docs/architecture.md) for a full breakdown of the system, localStorage schema, and F.R.E.S.H. data flow. See [`docs/decisions.md`](docs/decisions.md) for the rationale behind key design choices. See [`docs/quality.md`](docs/quality.md) for how Codacy and SonarCloud are configured and how to run them locally.

## Contributing

Before making changes, read [`guardrails/coding-rules.md`](guardrails/coding-rules.md) for the non-negotiables (especially around privacy and the zero-dependency constraint). Run [`guardrails/review-checklist.md`](guardrails/review-checklist.md) before submitting a PR. See [`tests/README.md`](tests/README.md) for how to run the test suite.

---

**Disclaimer:** *This project is for educational and personal use only. Users should always consult a qualified healthcare provider or physician before beginning any new exercise program. The repository owner assumes no liability for injuries incurred while using this application.*
