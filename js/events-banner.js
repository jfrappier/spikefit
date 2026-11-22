// js/events-banner.js — one-line "upcoming team event" strip for app.html (ADR-015)
//
// Deliberately a separate file from js/app.js, so the one network call this
// feature adds to app.html is isolated and easy to audit. It makes a single
// bodyless GET to /events/api/next (session cookie only) and nothing else —
// answering happens on the /events page the strip links to. It never reads
// localStorage or any workout data, and it renders only with
// textContent/createElement.
//
// Runs only on a team subdomain over http(s). On the apex domain, file://
// forks, an offline device, or any non-200 response it stays hidden, and
// app.html behaves exactly as it did before.

(function () {
    'use strict';

    const host = location.hostname;
    if ((location.protocol !== 'https:' && location.protocol !== 'http:') || !host.endsWith('.spikefit.app')) return;

    const container = document.getElementById('event-banner');
    if (!container) return;

    const FETCH_TIMEOUT_MS = 5000;
    const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
    const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

    let data = null;

    function el(tag, className, text) {
        const node = document.createElement(tag);
        if (className) node.className = className;
        if (text !== undefined) node.textContent = text;
        return node;
    }

    function formatDay(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        return `${DAY_NAMES[new Date(Date.UTC(y, m - 1, d)).getUTCDay()]} ${MONTH_NAMES[m - 1]} ${d}`;
    }

    function formatTime(t) {
        const [h, m] = t.split(':').map(Number);
        return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
    }

    async function request(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            // nosemgrep: SSRF rule targets server-side HTTP clients. This runs in the browser and the only caller passes the literal same-origin '/events/api/next' path.
            return await fetch(path, { ...options, signal: controller.signal });
        } finally {
            clearTimeout(timer);
        }
    }

    function statusText(who, response) {
        const prefix = who === 'You' ? "You're" : `${who}:`;
        if (response === 'yes') return who === 'You' ? "You're going ✓" : `${prefix} going ✓`;
        if (response === 'maybe') return who === 'You' ? "You're a maybe" : `${prefix} maybe`;
        return who === 'You' ? "You can't go" : `${prefix} can't go`;
    }

    // Who this person answers for on this event: themselves, plus their one
    // player if they have exactly one. With several players (or no name yet)
    // the /events page has the per-person rows.
    function targetsFor(ev) {
        const targets = [];
        if (data.hasName) targets.push({ who: 'You', response: ev.mine });
        if (data.kidCount === 1 && ev.kid) targets.push({ who: ev.kid.name, response: ev.kid.response });
        return targets;
    }

    // What the right-hand end of the strip says: a prompt, or their answer.
    function actionText(ev) {
        const targets = targetsFor(ev);
        const needsReply = targets.length === 0 || data.kidCount > 1 || targets.some(t => !t.response);
        return needsReply ? 'Click to RSVP ›' : targets.map(t => statusText(t.who, t.response)).join(' · ');
    }

    function render() {
        const ev = data.events[0];
        const action = ev.canceled ? 'Canceled' : actionText(ev);
        const more = data.events.length - 1;

        const link = el('a', 'event-banner-link');
        link.href = `/events?e=${encodeURIComponent(ev.id)}`;
        link.classList.toggle('is-canceled', ev.canceled === true);
        link.classList.toggle('is-answered', !ev.canceled && action !== 'Click to RSVP ›');
        link.setAttribute('aria-label', `Upcoming event: ${ev.title}, ${formatDay(ev.date)} at ${formatTime(ev.time)}. ${action.replace(' ›', '')}.`);

        link.appendChild(el('span', 'event-banner-icon', '📅'));
        const text = el('span', 'event-banner-text');
        text.appendChild(el('strong', null, ev.title));
        text.appendChild(document.createTextNode(` · ${formatDay(ev.date)} ${formatTime(ev.time)}`));
        link.appendChild(text);
        if (more > 0) link.appendChild(el('span', 'event-banner-more', `+${more}`));
        link.appendChild(el('span', 'event-banner-action', action));

        container.textContent = '';
        container.appendChild(link);
        container.classList.remove('u-hidden');
    }

    async function init() {
        try {
            const res = await request('/events/api/next', { credentials: 'same-origin' });
            if (res.status !== 200) return;
            const json = await res.json();
            if (!json || !Array.isArray(json.events) || json.events.length === 0) return;
            data = json;
            render();
        } catch (err) {
            console.error('Event banner unavailable.', err);
        }
    }

    init();
})();
