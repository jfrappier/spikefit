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

    // "Tue" within the coming week, "Jun 24" beyond it — short, so the title keeps its room.
    function shortDay(dateStr) {
        const [y, m, d] = dateStr.split('-').map(Number);
        const day = new Date(y, m - 1, d);
        const now = new Date();
        const ahead = Math.round((day - new Date(now.getFullYear(), now.getMonth(), now.getDate())) / 86400000);
        return ahead >= 0 && ahead < 7 ? DAY_NAMES[day.getDay()] : `${MONTH_NAMES[m - 1]} ${d}`;
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

    const BADGES = new Map([
        ['yes',   { glyph: '✓', cls: 'is-yes' }],
        ['maybe', { glyph: '~', cls: 'is-maybe' }],
        ['no',    { glyph: '✕', cls: 'is-no' }]
    ]);
    const UNANSWERED = { glyph: '?', cls: 'is-none' };

    // One status circle per person answered for: ✓ going, ~ maybe, ✕ can't go,
    // ? not answered yet. No name yet / several players -> a single "?".
    function badgesFor(ev) {
        const targets = targetsFor(ev);
        if (targets.length === 0 || data.kidCount > 1) return [{ response: null, title: 'Click to RSVP' }];
        return targets.map(t => ({
            response: t.response,
            title: t.response ? statusText(t.who, t.response) : `${t.who === 'You' ? 'You haven\u2019t' : t.who + ' hasn\u2019t'} answered yet — click to RSVP`
        }));
    }

    function buildBadge(badge) {
        const look = BADGES.get(badge.response) ?? UNANSWERED;
        const node = el('span', `event-banner-badge ${look.cls}`, look.glyph);
        node.title = badge.title;
        return node;
    }

    function buildSeeMore() {
        const link = el('a', 'event-banner-seemore');
        link.href = '/events';
        link.appendChild(el('span', 'event-banner-seemore-long', 'See more events'));
        link.appendChild(el('span', 'event-banner-seemore-short', 'More'));
        link.appendChild(document.createTextNode(' ›'));
        return link;
    }

    function render() {
        const ev = data.events[0];
        const badges = ev.canceled ? [] : badgesFor(ev);
        const summary = ev.canceled ? 'Canceled' : badges.map(b => b.title).join('. ');
        // Upcoming only: the feed never includes ended events, and `more` counts
        // the upcoming ones it left out (over its cap or past its window).
        const hasMore = data.events.length + (data.more ?? 0) > 1;

        const strip = el('div', 'event-banner-strip');
        strip.classList.toggle('is-canceled', ev.canceled === true);
        strip.classList.toggle('is-answered', !ev.canceled && badges.every(b => b.response));

        const link = el('a', 'event-banner-link');
        link.href = `/events?e=${encodeURIComponent(ev.id)}`;
        link.setAttribute('aria-label', `Upcoming event: ${ev.title}, ${formatDay(ev.date)} at ${formatTime(ev.time)}. ${summary}.`);
        link.appendChild(el('span', 'event-banner-icon', '📅'));
        const text = el('span', 'event-banner-text');
        text.appendChild(el('strong', 'event-banner-title', ev.title));
        text.appendChild(el('span', 'event-banner-when', `· ${shortDay(ev.date)} ${formatTime(ev.time)}`));
        link.appendChild(text);
        if (ev.canceled) link.appendChild(el('span', 'event-banner-action', 'Canceled'));
        badges.forEach(b => link.appendChild(buildBadge(b)));
        strip.appendChild(link);
        if (hasMore) strip.appendChild(buildSeeMore());

        container.textContent = '';
        container.appendChild(strip);
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
