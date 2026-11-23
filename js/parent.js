// js/parent.js — Parent / family view (ADR-016)
//
// Loaded after js/team.js on parent.html only. Does not load js/app.js, so it
// carries its own toast helper (same approach as js/events.js). It has no API
// of its own: everything goes through /events/api/* (list, rsvp, profile,
// kids), which is where the Worker decides what a parent may see and do. Names
// and event text are only ever written with textContent.
//
// No localStorage keys. After each change we update the page from what we just
// did instead of re-reading the list, because KV's list() can lag a minute
// behind our own write (see js/events.js for the long version).
//
// Pickup status for teams that opt in (ADR-014) is a later addition; it would
// be one more section under each player, fed by its own endpoint.

// ─── Toast ───────────────────────────────────────────────────────────────────

let paToastTimeout = null;

function showToast(title, text, icon = '🏐', duration = 5000) {
    document.getElementById('pa-toast-icon').textContent = icon;
    document.getElementById('pa-toast-title').textContent = title;
    document.getElementById('pa-toast-text').textContent = text;
    document.getElementById('pa-toast').classList.add('show');
    if (paToastTimeout) clearTimeout(paToastTimeout);
    paToastTimeout = setTimeout(closePaToast, duration);
}

function closePaToast() {
    document.getElementById('pa-toast').classList.remove('show');
}

document.getElementById('pa-toast-close').addEventListener('click', closePaToast);

// ─── Constants / state ───────────────────────────────────────────────────────

const FETCH_TIMEOUT_MS = 8000;
const DAY_NAMES   = ['Sun', 'Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat'];
const MONTH_NAMES = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
const ANSWERS = [
    { value: 'yes',   label: 'Going' },
    { value: 'maybe', label: 'Maybe' },
    { value: 'no',    label: "Can't go" }
];
const ANSWER_LABELS = { yes: 'Going', maybe: 'Maybe', no: "Can't go" };
const ERROR_MESSAGES = {
    name_required:     'Add your name first.',
    bad_name:          'Use a first name and last initial — no emails or phone numbers.',
    event_canceled:    'That event was canceled.',
    event_ended:       'That event has already ended.',
    event_not_found:   'That event is no longer available.',
    event_full:        'That event is full.',
    too_many_kids:     "You've reached the limit of players.",
    rate_limited:      'Slow down a little and try again.',
    not_authenticated: 'Your session expired. Please sign in again.',
    not_your_player:   "That player isn't on your list."
};

const state = {
    data: null,         // last /events/api/list response, with our own changes applied
    renamingId: null    // memberId of the player whose name is being edited
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

function formatTime(t) {
    const [h, m] = t.split(':').map(Number);
    return `${h % 12 || 12}:${String(m).padStart(2, '0')} ${h >= 12 ? 'PM' : 'AM'}`;
}

function formatWhen(ev) {
    const [y, m, d] = ev.date.split('-').map(Number);
    const dow = new Date(Date.UTC(y, m - 1, d)).getUTCDay();
    const range = ev.endTime ? `${formatTime(ev.time)} – ${formatTime(ev.endTime)}` : formatTime(ev.time);
    return `${DAY_NAMES[dow]} ${MONTH_NAMES[m - 1]} ${d} · ${range}`;
}

async function fetchWithTimeout(url, options = {}) {
    const controller = new AbortController();
    const timer = setTimeout(() => controller.abort(), FETCH_TIMEOUT_MS);
    try {
        // nosemgrep: SSRF rule targets server-side HTTP clients. This runs in the browser and every caller passes a literal same-origin '/events/api/...' path.
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
        console.error('Parent view request failed.', path, err);
        return { ok: false, status: 0, data: null };
    }
}

function showView(id) {
    ['view-loading', 'view-unavailable', 'view-main'].forEach(v => {
        document.getElementById(v).classList.toggle('u-hidden', v !== id);
    });
}

function showUnavailable(text) {
    document.getElementById('unavailable-text').textContent = text;
    showView('view-unavailable');
}

// ─── Load ────────────────────────────────────────────────────────────────────

async function load() {
    const res = await api('/events/api/list');
    if (res.status === 401) {
        window.location.href = `/auth.html?redirect=${encodeURIComponent(location.pathname)}`;
        return;
    }
    if (res.status === 403) {
        showUnavailable("The parent view isn't enabled here. Open your team's SpikeFit page to see events.");
        return;
    }
    if (!res.ok || !res.data) {
        showUnavailable("Couldn't load your family. Check your connection and try again.");
        return;
    }
    state.data = res.data;
    render();
}

// ─── Render ──────────────────────────────────────────────────────────────────

function render() {
    const d = state.data;
    showView('view-main');
    document.getElementById('pa-title').textContent = d.teamName ? `${d.teamName} · Family` : 'Family';
    document.getElementById('pa-me-name').classList.toggle('u-hidden', d.me.hasName);
    document.getElementById('pa-no-players').classList.toggle('u-hidden', d.kids.length > 0);

    const people = document.getElementById('pa-people');
    people.textContent = '';
    if (d.me.hasName) people.appendChild(buildPerson({ memberId: null, name: d.me.name, isMe: true }));
    d.kids.forEach(k => people.appendChild(buildPerson({ ...k, isMe: false })));
}

// What this person answered for an event (null = no answer yet).
function answerFor(ev, person) {
    if (person.isMe) return ev.mine ? ev.mine.response : null;
    const slot = ev.kidAnswers.find(k => k.memberId === person.memberId);
    return slot ? slot.response : null;
}

function buildPerson(person) {
    const section = el('section', 'pa-person');
    section.dataset.person = person.isMe ? 'me' : person.memberId;

    const head = el('div', 'pa-person-head');
    if (state.renamingId !== null && state.renamingId === person.memberId) {
        head.appendChild(buildRenameForm(person));
    } else {
        head.appendChild(el('h2', 'pa-person-name', person.isMe ? `${person.name} (you)` : person.name));
        if (person.linked) head.appendChild(el('span', 'pa-person-tag', 'has their own login'));
    }
    section.appendChild(head);

    if (!person.isMe) section.appendChild(buildPersonActions(person));

    const open = state.data.events.filter(ev => !ev.ended);
    if (open.length === 0) {
        section.appendChild(el('p', 'pa-none', 'No upcoming events.'));
        return section;
    }
    open.forEach(ev => section.appendChild(buildEvent(ev, person)));
    return section;
}

function buildPersonActions(person) {
    const bar = el('div', 'pa-person-actions');
    const add = (label, fn, extra) => {
        const b = el('button', `ev-link-btn${extra ? ` ${extra}` : ''}`, label);
        b.type = 'button';
        b.addEventListener('click', fn);
        bar.appendChild(b);
    };
    add('Edit name', () => { state.renamingId = person.memberId; render(); });
    if (person.parentNamed) add('Use their own name', () => resetName(person));
    add('Remove', () => removeKid(person), 'ev-danger');
    return bar;
}

function buildRenameForm(person) {
    const form = el('form', 'ev-inline-form pa-rename-form');
    form.autocomplete = 'off';
    const label = el('label', 'ev-sr', `Name to show for ${person.name}`);
    label.htmlFor = 'input-rename';
    const input = el('input');
    input.type = 'text';
    input.id = 'input-rename';
    input.maxLength = 30;
    input.required = true;
    input.value = person.name;
    const save = el('button', 'btn', 'Save');
    save.type = 'submit';
    const cancel = el('button', 'btn btn-ghost', 'Cancel');
    cancel.type = 'button';
    cancel.addEventListener('click', () => { state.renamingId = null; render(); });
    form.addEventListener('submit', e => {
        e.preventDefault();
        renameKid(person, input.value);
    });
    [label, input, save, cancel].forEach(n => form.appendChild(n));
    // Focus once the form is in the page.
    setTimeout(() => input.focus(), 0);
    return form;
}

function buildEvent(ev, person) {
    const box = el('article', 'pa-event');
    box.dataset.eventId = ev.id;
    if (ev.canceled) box.classList.add('pa-canceled');

    const title = el('p', 'pa-event-title', ev.title);
    box.appendChild(title);
    box.appendChild(el('p', 'pa-event-when', formatWhen(ev)));

    const current = answerFor(ev, person);
    if (ev.canceled) {
        box.appendChild(el('span', 'pa-status', 'Canceled'));
        return box;
    }
    box.appendChild(buildAnswerRow(ev, person, current));
    return box;
}

function buildAnswerRow(ev, person, current) {
    const row = el('div', 'ev-answer-row');
    ANSWERS.forEach(a => {
        const btn = el('button', 'ev-answer-btn', a.label);
        btn.type = 'button';
        if (current === a.value) btn.classList.add(`ev-sel-${a.value}`);
        btn.setAttribute('aria-pressed', current === a.value ? 'true' : 'false');
        btn.setAttribute('aria-label', `${a.label} — ${person.name}, ${ev.title}`);
        btn.addEventListener('click', () => submitRsvp(ev, person, a.value, row));
        row.appendChild(btn);
    });
    return row;
}

// ─── Actions ─────────────────────────────────────────────────────────────────

function applyAnswer(ev, person, response) {
    const previous = answerFor(ev, person);
    if (previous) ev.counts[previous] = Math.max(0, ev.counts[previous] - 1);
    ev.counts[response] += 1;
    if (person.isMe) {
        ev.mine = { response, by: 'self' };
    } else {
        const slot = ev.kidAnswers.find(k => k.memberId === person.memberId);
        if (slot) { slot.response = response; slot.by = 'guardian'; }
    }
}

async function submitRsvp(ev, person, response, row) {
    const buttons = row.querySelectorAll('button');
    buttons.forEach(b => { b.disabled = true; });
    const body = { eventId: ev.id, response };
    if (!person.isMe) body.memberId = person.memberId;
    const res = await api('/events/api/rsvp', body);
    if (!res.ok) {
        buttons.forEach(b => { b.disabled = false; });
        showToast("Couldn't save", errorText(res.data && res.data.error), '⚠️');
        if (res.data && ['event_canceled', 'event_ended', 'event_not_found'].includes(res.data.error)) await load();
        return;
    }
    applyAnswer(ev, person, response);
    render();
    showToast('Saved', `${person.name}: ${ANSWER_LABELS[response]} — ${ev.title}`, '✅', 2500);
}

function setKidName(memberId, name, parentNamed) {
    const d = state.data;
    const kid = d.kids.find(k => k.memberId === memberId);
    if (kid) { kid.name = name; kid.parentNamed = parentNamed; }
    d.events.forEach(ev => {
        const slot = ev.kidAnswers.find(k => k.memberId === memberId);
        if (slot) slot.name = name;
    });
}

async function renameKid(person, rawName) {
    const res = await api('/events/api/kids', { action: 'rename', memberId: person.memberId, name: rawName });
    if (!res.ok) {
        showToast("Couldn't save the name", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    state.renamingId = null;
    setKidName(person.memberId, (res.data && res.data.name) ?? rawName.trim(), !!person.linked);
    render();
}

async function resetName(person) {
    const res = await api('/events/api/kids', { action: 'reset_name', memberId: person.memberId });
    if (!res.ok) {
        showToast("Couldn't reset the name", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    setKidName(person.memberId, (res.data && res.data.name) || person.name, false);
    render();
}

async function removeKid(person) {
    const note = person.linked
        ? `Stop seeing ${person.name}'s answers? (They keep their own login and answers.)`
        : `Remove ${person.name} and their answers?`;
    if (!confirm(note)) return;
    const res = await api('/events/api/kids', { action: 'remove', memberId: person.memberId });
    if (!res.ok) {
        showToast("Couldn't remove", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    const d = state.data;
    d.kids = d.kids.filter(k => k.memberId !== person.memberId);
    d.events.forEach(ev => { ev.kidAnswers = ev.kidAnswers.filter(k => k.memberId !== person.memberId); });
    render();
}

document.getElementById('form-name').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('input-name');
    const res = await api('/events/api/profile', { name: input.value });
    if (!res.ok) {
        showToast("Couldn't save", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    state.data.me = { hasName: true, name: (res.data && res.data.name) ?? input.value.trim() };
    input.value = '';
    render();
});

document.getElementById('form-kid').addEventListener('submit', async e => {
    e.preventDefault();
    const input = document.getElementById('input-kid');
    const res = await api('/events/api/kids', { action: 'add', name: input.value });
    if (!res.ok) {
        showToast("Couldn't add player", errorText(res.data && res.data.error), '⚠️');
        return;
    }
    const name = (res.data && res.data.name) ?? input.value.trim();
    input.value = '';
    if (res.data && res.data.memberId) {
        const d = state.data;
        d.kids.push({ memberId: res.data.memberId, name, linked: false, parentNamed: false });
        d.events.forEach(ev => ev.kidAnswers.push({ memberId: res.data.memberId, name, response: null, by: null }));
        render();
    } else {
        await load();
    }
});

load();
