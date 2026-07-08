// js/team.js — team resolver, TEAMS registry, and early theme loader
//
// Non-deferred: runs synchronously before first paint so the theme <link> is
// inserted before the browser renders any content (no FOUC).
// Touches only document.head, location, history, and localStorage — safe at
// early execution time before the rest of the DOM exists.
//
// spikefit_team in localStorage: plain string, no JSON parse needed.
// localStorage.setItem is wrapped in try/catch; showToast() is not available
// this early so failures are console-only (documented deviation from the
// canonical saveState() pattern in app.js).

/* global history */

var TEAMS = {
    tigers: { css: 'css/themes/tigers.css', logo: 'img/teams/tigers-logo.svg' },
    lions:  { css: 'css/themes/lions.css',  logo: 'img/teams/lions-logo.png'  }
};

// Pure, testable. Returns the resolved team slug or null.
// Resolution priority: hostname > ?team= param > localStorage > null.
// Every candidate is validated against TEAMS — no arbitrary CSS path construction.
function resolveTeam(hostname, storedTeam, paramTeam) {
    // 1. Hostname: left-most label only when hostname is a direct *.spikefit.app subdomain.
    //    Suffix check prevents spikefit.app.evil.com from matching.
    //    'www' and unregistered labels fall through to the whitelist check and produce null.
    if (hostname && hostname.endsWith('.spikefit.app')) {
        var label = hostname.split('.')[0];
        if (label && Object.prototype.hasOwnProperty.call(TEAMS, label)) {
            return label;
        }
    }
    // 2. ?team= seed link — coach-shared URL
    if (paramTeam && Object.prototype.hasOwnProperty.call(TEAMS, paramTeam)) {
        return paramTeam;
    }
    // 3. localStorage — persisted from a previous seed link (or future settings picker)
    if (storedTeam && Object.prototype.hasOwnProperty.call(TEAMS, storedTeam)) {
        return storedTeam;
    }
    // 4. Default — no team (standard SpikeFit colors)
    return null;
}

(function applyTeam() {
    var params    = new URLSearchParams(location.search);
    var paramTeam = params.get('team');
    var stored    = localStorage.getItem('spikefit_team');
    var team      = resolveTeam(location.hostname, stored, paramTeam);

    // Persist a valid ?team= seed to localStorage so it survives navigation.
    // Strip the param from the URL via replaceState (no page reload).
    if (paramTeam && Object.prototype.hasOwnProperty.call(TEAMS, paramTeam)) {
        if (paramTeam !== stored) {
            try {
                localStorage.setItem('spikefit_team', paramTeam);
            } catch (err) {
                console.error('Failed to persist spikefit_team to localStorage.', err);
            }
        }
        params.delete('team');
        var newSearch = params.toString();
        history.replaceState(
            null,
            '',
            location.pathname + (newSearch ? '?' + newSearch : '') + location.hash
        );
    }

    if (!team) return;

    // Insert the theme stylesheet immediately after base.css.
    // Dynamic <link> is covered by CSP style-src 'self' (same-origin file).
    // No inline style — keeps the 'unsafe-inline' removal unblocked.
    var link = document.createElement('link');
    link.rel  = 'stylesheet';
    link.href = TEAMS[team].css;
    document.head.appendChild(link);

    // Swap logo images once the DOM is ready.
    // team.js runs in <head> before <body> exists, so logo swaps must wait for
    // DOMContentLoaded. Targets any <img src="logo.png"> across all pages
    // (app.html, index.html, auth.html) without enumerating page-specific IDs.
    if (TEAMS[team].logo) {
        var teamLogo = TEAMS[team].logo;
        document.addEventListener('DOMContentLoaded', function() {
            document.querySelectorAll('img').forEach(function(img) {
                if (img.getAttribute('src') === 'logo.png') {
                    img.src = teamLogo;
                }
            });
        });
    }
})();
