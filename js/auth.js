import { auth, db, googleProvider, signInWithPopup, createUserWithEmailAndPassword, signInWithEmailAndPassword, updateProfile, doc, setDoc, getDoc } from './firebase.js';

export function renderAuth() {
  return `
    <div class="auth-wrap">
      <div class="auth-card">
        <div class="auth-logo">
          <i class="ti ti-tennis" aria-hidden="true"></i>
          <h1>Padel Tournament</h1>
          <p>Live scoring for your group competitions</p>
        </div>

        <div id="auth-tabs" class="auth-tabs">
          <button class="auth-tab active" onclick="authSwitchTab('login')">Sign in</button>
          <button class="auth-tab" onclick="authSwitchTab('register')">Create account</button>
        </div>

        <div id="auth-error" class="auth-error" style="display:none"></div>

        <div id="auth-login">
          <button class="btn btn-google" onclick="signInGoogle()">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            Continue with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
          <input type="email" id="login-email" placeholder="Email address" autocomplete="email">
          <input type="password" id="login-password" placeholder="Password" autocomplete="current-password">
          <button class="btn btn-primary btn-full" onclick="signInEmail()">Sign in</button>
        </div>

        <div id="auth-register" style="display:none">
          <button class="btn btn-google" onclick="signInGoogle()">
            <svg width="18" height="18" viewBox="0 0 18 18" aria-hidden="true">
              <path fill="#4285F4" d="M16.51 8H8.98v3h4.3c-.18 1-.74 1.48-1.6 2.04v2.01h2.6a7.8 7.8 0 0 0 2.38-5.88c0-.57-.05-.66-.15-1.18z"/>
              <path fill="#34A853" d="M8.98 17c2.16 0 3.97-.72 5.3-1.94l-2.6-2.04a4.8 4.8 0 0 1-7.18-2.54H1.83v2.07A8 8 0 0 0 8.98 17z"/>
              <path fill="#FBBC05" d="M4.5 10.52a4.8 4.8 0 0 1 0-3.04V5.41H1.83a8 8 0 0 0 0 7.18z"/>
              <path fill="#EA4335" d="M8.98 4.18c1.17 0 2.23.4 3.06 1.2l2.3-2.3A8 8 0 0 0 1.83 5.4L4.5 7.49a4.77 4.77 0 0 1 4.48-3.3z"/>
            </svg>
            Sign up with Google
          </button>
          <div class="auth-divider"><span>or</span></div>
          <input type="text" id="reg-name" placeholder="Full name" autocomplete="name">
          <input type="email" id="reg-email" placeholder="Email address" autocomplete="email">
          <input type="password" id="reg-password" placeholder="Password (min 6 chars)" autocomplete="new-password">
          <button class="btn btn-primary btn-full" onclick="registerEmail()">Create account</button>
        </div>
      </div>
    </div>
  `;
}

window.authSwitchTab = (tab) => {
  document.querySelectorAll('.auth-tab').forEach((t, i) =>
    t.classList.toggle('active', ['login','register'][i] === tab)
  );
  document.getElementById('auth-login').style.display = tab === 'login' ? 'block' : 'none';
  document.getElementById('auth-register').style.display = tab === 'register' ? 'block' : 'none';
  clearAuthError();
};

window.signInGoogle = async () => {
  try {
    clearAuthError();
    const result = await signInWithPopup(auth, googleProvider);
    await ensureUserDoc(result.user);
  } catch(e) {
    showAuthError(friendlyError(e.code));
  }
};

window.signInEmail = async () => {
  const email = document.getElementById('login-email').value.trim();
  const password = document.getElementById('login-password').value;
  if (!email || !password) { showAuthError('Please enter your email and password.'); return; }
  try {
    clearAuthError();
    const cred = await signInWithEmailAndPassword(auth, email, password);
    await ensureUserDoc(cred.user);
  } catch(e) {
    showAuthError(friendlyError(e.code));
  }
};

window.registerEmail = async () => {
  const name = document.getElementById('reg-name').value.trim();
  const email = document.getElementById('reg-email').value.trim();
  const password = document.getElementById('reg-password').value;
  if (!name || !email || !password) { showAuthError('Please fill in all fields.'); return; }
  if (password.length < 6) { showAuthError('Password must be at least 6 characters.'); return; }
  try {
    clearAuthError();
    const cred = await createUserWithEmailAndPassword(auth, email, password);
    await updateProfile(cred.user, { displayName: name });
    await ensureUserDoc(cred.user, name);
  } catch(e) {
    showAuthError(friendlyError(e.code));
  }
};

export async function ensureUserDoc(user, name) {
  const ref = doc(db, 'users', user.uid);
  const snap = await getDoc(ref);
  if (!snap.exists()) {
    console.log('Creating user doc for', user.uid);
    await setDoc(ref, {
      uid: user.uid,
      displayName: name || user.displayName || 'Player',
      email: user.email || '',
      rating: 0,
      activeTournamentId: null,
      createdAt: new Date()
    });
    console.log('User doc created');
  } else {
    console.log('User doc already exists');
  }
}

function showAuthError(msg) {
  const el = document.getElementById('auth-error');
  if (el) { el.style.display = 'block'; el.textContent = msg; }
}
function clearAuthError() {
  const el = document.getElementById('auth-error');
  if (el) el.style.display = 'none';
}
function friendlyError(code) {
  const map = {
    'auth/user-not-found': 'No account found with that email.',
    'auth/wrong-password': 'Incorrect password.',
    'auth/invalid-credential': 'Incorrect email or password.',
    'auth/email-already-in-use': 'An account with that email already exists.',
    'auth/invalid-email': 'Please enter a valid email address.',
    'auth/weak-password': 'Password must be at least 6 characters.',
    'auth/popup-closed-by-user': 'Sign-in was cancelled.',
    'auth/network-request-failed': 'Network error. Please check your connection.',
  };
  return map[code] || 'Something went wrong. Please try again.';
}
