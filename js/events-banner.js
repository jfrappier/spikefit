// js/events-banner.js — "upcoming team event" banner for app.html (ADR-015)
//
// Deliberately a separate file from js/app.js, so the one network call this
// feature adds to app.html is isolated and easy to audit. It makes a single
// bodyless GET to /events/api/next (session cookie only) and a POST to
// /events/api/rsvp when someone taps an answer. It never reads localStorage
// or any workout data, and it renders only with textContent/createElement.
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
    const ANSWERS = [
        { value: 'yes',   label: 'Going' },
        { value: 'maybe', label: 'Maybe' },
        { value: 'no',    label: "Can't go" }
    ];

    let data = null;
    const editing = new Set();   // "<eventId>:<memberId|self>" rows showing buttons despite an answer
    const failed  = new Set();   // rows whose last save failed

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

    function typeLabel(typeId) {
        const t = (data.types || []).find(x => x.id === typeId);
        return t ? t.label : 'Event';
    }

    async function request(path, options) {
        const controller = new AbortController();
        const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
        try {
            // nosemgrep: SSRF rule targets server-side HTTP clients. This runs in the browser and callers pass only the literal same-origin '/events/api/...' paths below.
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

    function buildTargetRow(ev, target) {
        const rowKey = `${ev.id}:${target.memberId || 'self'}`;
        const row = el('div', 'event-banner-actions');

        if (target.response && !editing.has(rowKey)) {
            row.appendChild(el('span', 'event-banner-status', statusText(target.who, target.response)));
            const change = el('button', 'event-banner-btn', 'Change');
            change.type = 'button';
            change.addEventListener('click', () => { editing.add(rowKey); render(); });
            row.appendChild(change);
            return row;
        }

        row.appendChild(el('span', 'event-banner-who', target.who === 'You' ? 'Going?' : `${target.who}:`));
        ANSWERS.forEach(a => {
            const btn = el('button', 'event-banner-btn', a.label);
            btn.type = 'button';
            if (target.response === a.value) btn.classList.add(`ev-sel-${a.value}`);
            btn.addEventListener('click', () => answer(ev, target, rowKey, a.value, row));
            row.appendChild(btn);
        });
        if (failed.has(rowKey)) row.appendChild(el('span', 'event-banner-canceled', "Couldn't save — try again"));
        return row;
    }

    async function answer(ev, target, rowKey, response, row) {
        row.querySelectorAll('button').forEach(b => { b.disabled = true; });
        const body = { eventId: ev.id, response };
        if (target.memberId) body.memberId = target.memberId;
        try {
            const res = await request('/events/api/rsvp', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(body)
            });
            if (!res.ok) throw new Error(`rsvp_failed_${res.status}`);
            failed.delete(rowKey);
            editing.delete(rowKey);
            if (target.memberId) ev.kid.response = response;
            else ev.mine = response;
        } catch (err) {
            console.error('Could not save RSVP from banner.', err);
            failed.add(rowKey);
        }
        render();
    }

    function buildEventRow(ev) {
        const row = el('div', 'event-banner-row');
        row.appendChild(el('p', 'event-banner-title', `${typeLabel(ev.type)} · ${ev.title}`));

        const range = ev.endTime ? `${formatTime(ev.time)} – ${formatTime(ev.endTime)}` : formatTime(ev.time);
        const when = el('p', 'event-banner-when', `${formatDay(ev.date)} · ${range}${ev.location ? ` · ${ev.location}` : ''}`);
        if (ev.canceled) when.appendChild(el('span', 'event-banner-canceled', '  Canceled'));
        row.appendChild(when);
        if (ev.canceled) return row;

        const targets = [];
        if (data.hasName) targets.push({ who: 'You', memberId: null, response: ev.mine });
        if (data.kidCount === 1 && ev.kid) targets.push({ who: ev.kid.name, memberId: ev.kid.memberId, response: ev.kid.response });
        targets.forEach(t => row.appendChild(buildTargetRow(ev, t)));

        // No name yet, or several players: the full page has the name prompt / per-player rows.
        if (targets.length === 0 || data.kidCount > 1) {
            const link = el('a', 'event-banner-btn', data.kidCount > 1 ? 'Respond for your players' : 'Respond');
            link.href = `/events?e=${encodeURIComponent(ev.id)}`;
            const wrap = el('div', 'event-banner-actions');
            wrap.appendChild(link);
            row.appendChild(wrap);
        }
        return row;
    }

    function render() {
        container.textContent = '';
        const inner = el('div', 'event-banner-inner');
        inner.appendChild(el('p', 'event-banner-head', `Upcoming · ${data.teamName || 'Your team'}`));
        data.events.forEach(ev => inner.appendChild(buildEventRow(ev)));
        const more = el('a', 'event-banner-more', 'See all events →');
        more.href = '/events';
        inner.appendChild(more);
        container.appendChild(inner);
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
