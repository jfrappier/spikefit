// js/events.js — Team events & RSVP page (ADR-015)
//
// Loaded after js/team.js on events.html only. Does not load js/app.js, so it
// carries its own toast helper (same approach as js/coach.js). The Worker
// decides what each person may see — this file renders what /events/api/*
// returns and never writes server data through innerHTML.
//
// No localStorage keys, no offline queue: answering needs a connection and
// shows a toast if it fails.

// ─── Toast (mirrors js/coach.js against events.html's own markup) ───────────

let evToastTimeout = null;

function showToast(title, text, icon = '🏐', duration = 5000) {
    document.getElementById('ev-toast-icon').textContent = icon;
    document.getElementById('ev-toast-title').textContent = title;
    document.getElementById('ev-toast-text').textContent = text;
    document.getElementById('ev-toast').classList.add('show');
    if (evToastTimeout) clearTimeout(evToastTimeout);
    evToastTimeout = setTimeout(closeEvToast, duration);
}

function closeEvToast() {
    document.getElementById('ev-toast').classList.remove('show');
}

document.getElementById('ev-toast-close').addEventListener('click', closeEvToast);

// ─── Constants / state ───────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ANSWERS = [
    { value: 'yes',   label: 'Going' },
    { value: 'maybe', label: 'Maybe' },
    { value: 'no',    label: "Can't go" }
];
const ERROR_MESSAGES = {
    name_required:    'Add your name first.',
    bad_name:         'Use a first name and last initial — no emails or phone numbers.',
    event_canceled:   'That event was canceled.',
    event_ended:      'That event has already ended.',
    event_not_found:  'That event is no longer available.',
    event_full:       'That event is full.',
    too_many_kids:    "You've reached the limit of players.",
    too_many_events:  'Too many upcoming events — delete an old one first.',
    rate_limited:     'Slow down a little and try again.',
    not_authenticated: 'Your session expired. Please sign in again.',
    title_required:   'Give the event a title.',
    bad_date:         'Pick a valid date.',
    date_in_past:     "That date is in the past.",
    bad_time:         'Pick a valid time.',
    end_before_start: 'The end time must be after the start time.',
    bad_type:         'Pick an event type.'
};

const state = {
    data: null,          // last /events/api/list response
    showPast: false,
    editingId: null,     // event id being edited (null = new)
    deepLinkId: new URLSearchParams(location.search).get('e'),
    deepLinkHandled: false
};

// ─── Small helpers ───────────────────────────────────────────────────────────

function el(tag, className, text) {
    const node = document.createElement(tag);
    if (className) node.className = className;
    if (text !== undefined) node.textContent = text;
    return node;
}

function errorText(code) {
    return (typeof code === 'string' && Object.hasOwn(ERROR_MESSAGES, code))
        ? ERROR_MESSAGES[code] // NOSONAR -- guarded by Object.hasOwn above
        : 'Something went wrong. Please try again.';
}

function shiftDate(dateStr, days) {
    const [y, m, d] = dateStr.split('-').map(Number);
    return new Date(Date.UTC(y, m - 1, d + days)).toISOString().slice(0, 10);
}

function formatDay(dateStr) {
    const [y, m, d] = dateStr.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    return `${DAY_NAMES[dow]} ${MONTH_NAMES[m - 1]} ${d}`;
}

function formatTime(t) {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatWhen(ev) {
    const range = ev.endTime ? `${formatTime(ev.time)} – ${formatTime(ev.endTime)}` : formatTime(ev.time);
    return `${formatDay(ev.date)} · ${range}`;
}

function typeLabel(typeId) {
    const t = ((state.data && state.data.types) || []).find(x => x.id === typeId);
    return t ? t.label : 'Event';
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        return await fetch(url, { ...options, signal: controller.signal });
    } finally {
        clearTimeout(timer);
    }
}

// Returns {ok, status, data}. Never throws — a network failure is {ok:false, status:0}.
async function api(path, body) {
    const options = body === undefined
        ? {}
        : { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) };
    try {
        const res = await fetchWithTimeout(path, options);
        let data = null;
        try { data = await res.json(); } catch { /* non-JSON error body */ }
        return { ok: res.ok, status: res.status, data };
    } catch (err) {
        console.error(`Request to ${path} failed.`, err);
        return { ok: false, status: 0, data: null };
    }
}

function showView(id) {
    ['view-loading', 'view-unavailable', 'view-main', 'view-editor'].forEach(v => {
        document.getElementById(v).classList.toggle('u-hidden', v !== id);
    });
}

function showUnavailable(text) {
    document.getElementById('unavailable-text').textContent = text;
    showView('view-unavailable');
}

// ─── Load + render ───────────────────────────────────────────────────────────

async function load() {
    const res = await api(`/events/api/list${state.showPast ? '?past=1' : ''}`);
    if (res.status === 401) {
        window.location.href = `/auth.html?redirect=${encodeURIComponent(location.pathname + location.search)}`;
        return;
    }
    if (res.status === 403) {
        showUnavailable("Team events aren't enabled here. Open your team's SpikeFit page to see them.");
        return;
    }
    if (!res.ok || !res.data) {
        showUnavailable("Couldn't load events. Check your connection and try again.");
        return;
    }
    state.data = res.data;
    render();
}

function render() {
    const d = state.data;
    showView('view-main');
    document.getElementById('ev-team-name').textContent = d.teamName ? `${d.teamName} Events` : 'Team Events';
    document.getElementById('ev-coach-bar').classList.toggle('u-hidden', !d.isCoach);
    document.getElementById('ev-name-card').classList.toggle('u-hidden', d.me.hasName);
    document.getElementById('btn-toggle-past').textContent = state.showPast ? 'Hide past events' : 'Show past events';

    renderKids();
    renderEvents();
    handleDeepLink();
}

function renderEvents() {
    const d = state.data;
    const list = document.getElementById('ev-events');
    list.textContent = '';
    document.getElementById('ev-empty').classList.toggle('u-hidden', d.events.length > 0);
    d.events.forEach(ev => list.appendChild(buildEventCard(ev)));
}

function buildEventCard(ev) {
    const d = state.data;
    const card = el('article', 'ev-card');
    card.dataset.eventId = ev.id;
    if (ev.canceled) card.classList.add('ev-canceled');
    if (ev.ended) card.classList.add('ev-ended');

    const top = el('div', 'ev-card-top');
    top.appendChild(el('span', 'ev-badge', typeLabel(ev.type)));
    if (ev.canceled) top.appendChild(el('span', 'ev-badge ev-badge-canceled', 'Canceled'));
    else if (ev.ended) top.appendChild(el('span', 'ev-badge ev-badge-ended', 'Ended'));
    card.appendChild(top);

    card.appendChild(el('h3', 'ev-title', ev.title));
    card.appendChild(el('p', 'ev-when', formatWhen(ev)));
    if (ev.location) card.appendChild(el('p', 'ev-where', `📍 ${ev.location}`));
    if (ev.notes) card.appendChild(el('p', 'ev-notes', ev.notes));

    const going = ev.counts.yes;
    const maybe = ev.counts.maybe;
    card.appendChild(el('p', 'ev-going', `${going} going${maybe ? ` · ${maybe} maybe` : ''}`));

    const answerable = !ev.canceled && !ev.ended;
    if (answerable) {
        if (d.me.hasName) {
            card.appendChild(buildAnswerRow(ev, 'You', ev.mine ? ev.mine.response : null, null));
        } else if (d.kids.length === 0) {
            const row = el('div', 'ev-answer-row');
            row.appendChild(el('p', 'ev-answer-hint', 'Add your name below to answer for yourself, or add your player if you’re a parent.'));
            card.appendChild(row);
        }
        ev.kidAnswers.forEach(k => {
            card.appendChild(buildAnswerRow(ev, k.name, k.response, k.memberId));
        });
    }

    if (d.isCoach) {
        card.appendChild(buildAttendees(ev));
        card.appendChild(buildCoachActions(ev));
    }
    return card;
}

function buildAnswerRow(ev, who, current, memberId) {
    const row = el('div', 'ev-answer-row');
    row.appendChild(el('span', 'ev-answer-who', who));
    ANSWERS.forEach(a => {
        const btn = el('button', 'ev-answer-btn', a.label);
        btn.type = 'button';
        if (current === a.value) btn.classList.add(`ev-sel-${a.value}`);
        btn.setAttribute('aria-pressed', current === a.value ? 'true' : 'false');
        btn.addEventListener('click', () => submitRsvp(ev.id, a.value, memberId, row));
        row.appendChild(btn);
    });
    return row;
}

async function submitRsvp(eventId, response, memberId, row) {
    const buttons = row.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    const body = { eventId, response };
    if (memberId) body.memberId = memberId;
    const res = await api('/events/api/rsvp', body);
    if (!res.ok) {
        buttons.forEach(b => { b.disabled = false; });
        showToast("Couldn't save", errorText(res.data && res.data.error), '⚠️');
        if (res.data && ['event_canceled', 'event_ended', 'event_not_found'].includes(res.data.error)) await load();
        return;
    }
    await load();
}

function buildAttendees(ev) {
    const attendees = Array.isArray(ev.attendees) ? ev.attendees : [];
    const details = el('details', 'ev-attendees');
    details.appendChild(el('summary', null, `Who's coming (${attendees.length} answered)`));
    if (attendees.length === 0) {
        details.appendChild(el('p', 'ev-attendee-group', 'No answers yet.'));
        return details;
    }
    ANSWERS.forEach(a => {
        const group = attendees.filter(x => x.response === a.value);
        if (group.length === 0) return;
        const p = el('p', 'ev-attendee-group');
        p.appendChild(el('strong', null, `${a.label} (${group.length})`));
        p.appendChild(el('span', null, group.map(x => x.by === 'guardian' ? `${x.name} (by parent)` : x.name).join(', ')));
        details.appendChild(p);
    });
    return details;
}

function buildCoachActions(ev) {
    const bar = el('div', 'ev-coach-actions');
    const add = (label, handler, extraClass) => {
        const b = el('button', `ev-link-btn${extraClass ? ` ${extraClass}` : ''}`, label);
        b.type = 'button';
        b.addEventListener('click', handler);
        bar.appendChild(b);
    };
    add('Share', () => shareEvent(ev));
    add('Edit', () => openEditor(ev, false));
    add('Duplicate', () => openEditor(ev, true));
    add(ev.canceled ? 'Restore' : 'Cancel event', () => toggleCanceled(ev));
    add('Delete', () => deleteEvent(ev), 'ev-danger');
    return bar;
}

// ─── Share (client-only: nothing is sent to or stored by the Worker) ─────────

async function shareEvent(ev) {
    const url = `${location.origin}/events?e=${ev.id}`;
    const lines = [`🏐 ${typeLabel(ev.type)} · ${ev.title}`, formatWhen(ev)];
    if (ev.location) lines.push(ev.location);
    lines.push(`RSVP: ${url}`);
    const text = lines.join('\n');

    if (navigator.share) {
        try {
            await navigator.share({ text });
            return;
        } catch (err) {
            if (err && err.name === 'AbortError') return; // user closed the share sheet
            console.error('navigator.share failed, falling back to copy.', err);
        }
    }
    try {
        await navigator.clipboard.writeText(text);
        showToast('Copied', 'Paste it into your team chat.', '📋');
    } catch (err) {
        console.error('Clipboard write failed.', err);
        showToast("Couldn't copy", url, '⚠️', 12000);
    }
}

// ─── Deep link (?e=<eventId>) ────────────────────────────────────────────────

async function handleDeepLink() {
    if (!state.deepLinkId || state.deepLinkHandled) return;
    const notice = document.getElementById('ev-deeplink-msg');
    // Compared in JS rather than interpolated into a selector — the id comes from the URL.
    const card = Array.from(document.querySelectorAll('[data-event-id]'))
        .find(c => c.dataset.eventId === state.deepLinkId);

    if (!card && !state.showPast) {
        // It may have ended already — look in the past list once before giving up.
        state.showPast = true;
        await load();
        return;
    }
    state.deepLinkHandled = true;
    if (!card) {
        notice.textContent = 'That event is no longer available.';
        notice.classList.remove('u-hidden');
        return;
    }
    card.classList.add('ev-highlight');
    if (card.scrollIntoView) card.scrollIntoView({ block: 'start', behavior: 'smooth' });
}

// ─── My name / my players ────────────────────────────────────────────────────

function renderKids() {
    const kids = state.data.kids;
    const list = document.getElementById('ev-kids-list');
    list.textContent = '';
    kids.forEach(k => {
        const li = el('li');
        const label = el('span', null, k.name);
        if (k.linked) label.appendChild(el('span', 'ev-kid-tag', ' · has their own login'));
        li.appendChild(label);
        const btn = el('button', 'ev-link-btn ev-danger', 'Remove');
        btn.type = 'button';
        btn.addEventListener('click', () => removeKid(k));
        li.appendChild(btn);
        list.appendChild(li);
    });
}

document.getElementById('form-name').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('input-name');
    const res = await api('/events/api/profile', { name: input.value });
    if (!res.ok) {
        showToast("Couldn't save", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    input.value = '';
    await load();
});

document.getElementById('form-kid').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('input-kid');
    const res = await api('/events/api/kids', { action: 'add', name: input.value });
    if (!res.ok) {
        showToast("Couldn't add player", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    input.value = '';
    await load();
});

async function removeKid(kid) {
    const note = kid.linked
        ? `Stop seeing ${kid.name}'s answers? (They keep their own login and answers.)`
        : `Remove ${kid.name} and their answers?`;
    if (!confirm(note)) return;
    const res = await api('/events/api/kids', { action: 'remove', memberId: kid.memberId });
    if (!res.ok) {
        showToast("Couldn't remove", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    await load();
}

document.getElementById('btn-forget').addEventListener('click', async () => {
    if (!confirm('Remove your name, your players and all your answers from this team? This can’t be undone.')) return;
    const res = await api('/events/api/forget', {});
    if (!res.ok) {
        showToast("Couldn't remove", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    showToast('Done', 'Your data was removed from this team.', '✅');
    await load();
});

document.getElementById('btn-toggle-past').addEventListener('click', async () => {
    state.showPast = !state.showPast;
    await load();
});

// ─── Coach: editor ───────────────────────────────────────────────────────────

function fillTypeSelect() {
    const select = document.getElementById('ev-type');
    select.textContent = '';
    state.data.types.forEach(t => {
        const opt = el('option', null, t.label);
        opt.value = t.id;
        select.appendChild(opt);
    });
}

// `duplicate` opens a new event prefilled from `ev`, one week later (the
// common "same practice next week" case).
function openEditor(ev, duplicate) {
    state.editingId = (ev && !duplicate) ? ev.id : null;
    fillTypeSelect();
    document.getElementById('editor-title').textContent = state.editingId ? 'Edit event' : 'New event';
    document.getElementById('ev-type').value = ev ? ev.type : state.data.types[0].id;
    document.getElementById('ev-title').value = ev ? ev.title : '';
    document.getElementById('ev-date').value = ev ? (duplicate ? shiftDate(ev.date, 7) : ev.date) : '';
    document.getElementById('ev-time').value = ev ? ev.time : '';
    document.getElementById('ev-end').value = ev ? ev.endTime : '';
    document.getElementById('ev-location').value = ev ? ev.location : '';
    document.getElementById('ev-notes').value = ev ? ev.notes : '';
    document.getElementById('editor-error').classList.add('u-hidden');
    showView('view-editor');
}

document.getElementById('btn-new-event').addEventListener('click', () => openEditor(null, false));
document.getElementById('btn-cancel-editor').addEventListener('click', () => showView('view-main'));

document.getElementById('form-event').addEventListener('submit', async e => {
    e.preventDefault();
    const event = {
        type: document.getElementById('ev-type').value,
        title: document.getElementById('ev-title').value,
        date: document.getElementById('ev-date').value,
        time: document.getElementById('ev-time').value,
        endTime: document.getElementById('ev-end').value,
        location: document.getElementById('ev-location').value,
        notes: document.getElementById('ev-notes').value
    };
    if (state.editingId) {
        event.id = state.editingId;
        const existing = state.data.events.find(x => x.id === state.editingId);
        event.canceled = existing ? existing.canceled : false;
    }
    const btn = document.getElementById('btn-save-event');
    btn.disabled = true;
    const res = await api('/events/api/event/save', { event });
    btn.disabled = false;
    if (!res.ok) {
        const msg = document.getElementById('editor-error');
        msg.textContent = errorText(res.data && res.data.error);
        msg.classList.remove('u-hidden');
        return;
    }
    showToast('Saved', 'Tap Share on the event to send it to your team chat.', '✅');
    await load();
});

async function toggleCanceled(ev) {
    const verb = ev.canceled ? 'Restore' : 'Cancel';
    if (!confirm(`${verb} "${ev.title}"?`)) return;
    const event = {
        id: ev.id, type: ev.type, title: ev.title, date: ev.date, time: ev.time,
        endTime: ev.endTime, location: ev.location, notes: ev.notes, canceled: !ev.canceled
    };
    const res = await api('/events/api/event/save', { event });
    if (!res.ok) {
        showToast("Couldn't update", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    await load();
}

async function deleteEvent(ev) {
    if (!confirm(`Delete "${ev.title}" and everyone's answers? This can’t be undone.`)) return;
    const res = await api('/events/api/event/delete', { eventId: ev.id });
    if (!res.ok) {
        showToast("Couldn't delete", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    await load();
}

// ─── Boot ────────────────────────────────────────────────────────────────────

load();
