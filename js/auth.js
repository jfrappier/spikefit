const COOKIE       = 'sf_session';
const SESSION_DAYS = 30;

let emailValue  = '';
let otpAttempts = 0;

// --- Input listeners ---

document.getElementById('otp-input').addEventListener('input', e => {
  e.target.value = e.target.value.replace(/\D/g, '');
  if (e.target.value.length === 6) verifyOtp();
});

document.getElementById('email-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') sendOtp();
});

document.getElementById('otp-input').addEventListener('keydown', e => {
  if (e.key === 'Enter') verifyOtp();
});

// --- Button listeners (replaces inline onclick) ---

document.getElementById('email-btn').addEventListener('click', sendOtp);
document.getElementById('otp-btn').addEventListener('click', verifyOtp);
document.getElementById('goback-btn').addEventListener('click', goBack);

// --- Functions ---

async function sendOtp() {
  const emailInput = document.getElementById('email-input');
  const email      = emailInput.value.trim();
  const errEl      = document.getElementById('email-error');
  const btn        = document.getElementById('email-btn');

  if (!emailInput.validity.valid) {
    errEl.textContent = 'Please enter a valid email address.';
    return;
  }

  errEl.textContent = '';
  setLoading(btn, true);

  try {
    const res = await fetch('/auth/send', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email })
    });

    if (res.status === 403) {
      emailValue  = email;
      otpAttempts = 0;
      document.getElementById('otp-subtitle').textContent =
        `We sent a 6-digit code to ${email}.`;
      showStep('step-otp');
      document.getElementById('otp-input').focus();
      return;
    }

    if (!res.ok) {
      errEl.textContent = 'Something went wrong — please try again.';
      return;
    }

    emailValue  = email;
    otpAttempts = 0;
    document.getElementById('otp-subtitle').textContent =
      `We sent a 6-digit code to ${email}.`;
    showStep('step-otp');
    document.getElementById('otp-input').focus();

  } catch {
    errEl.textContent = 'Network error. Check your connection.';
  } finally {
    setLoading(btn, false);
  }
}

async function verifyOtp() {
  const code  = document.getElementById('otp-input').value.trim();
  const errEl = document.getElementById('otp-error');
  const btn   = document.getElementById('otp-btn');

  if (!emailValue) {
    errEl.textContent = 'Something went wrong — please start over.';
    showStep('step-email');
    return;
  }

  if (code.length !== 6) {
    errEl.textContent = 'Enter the 6-digit code from your email.';
    return;
  }

  if (otpAttempts >= 5) {
    errEl.textContent = 'Too many attempts. Please request a new code.';
    return;
  }
  otpAttempts++;

  errEl.textContent = '';
  setLoading(btn, true);

  try {
    const res = await fetch('/auth/verify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email: emailValue, code })
    });

    if (res.status === 429) {
      errEl.textContent = 'Too many attempts. Please request a new code.';
      document.getElementById('otp-input').value = '';
      return;
    }

    if (!res.ok) {
      errEl.textContent = 'Incorrect or expired code — try again.';
      document.getElementById('otp-input').value = '';
      return;
    }

    showStep('step-success');

    const params   = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    let safeDest   = '/';

    if (redirect) {
      try {
        const url = new URL(redirect, window.location.origin);
        if (url.origin === window.location.origin) {
          safeDest = url.pathname + url.search + url.hash;
        }
      } catch {
        // malformed URL — fall back to root
      }
    }

    setTimeout(() => {
      window.location.href = safeDest;
    }, 800);

  } catch {
    errEl.textContent = 'Network error. Check your connection.';
  } finally {
    setLoading(btn, false);
  }
}

function goBack() {
  document.getElementById('otp-input').value      = '';
  document.getElementById('otp-error').textContent = '';
  otpAttempts = 0;
  showStep('step-email');
  document.getElementById('email-input').focus();
}

function showStep(id) {
  ['step-email', 'step-otp', 'step-success'].forEach(s => {
    const el = document.getElementById(s);
    el.style.display = s === id ? 'block' : 'none';
    if (s === id) el.classList.add('step');
  });
}

function setLoading(btn, on) {
  btn.disabled = on;
  btn.classList.toggle('loading', on);
}
