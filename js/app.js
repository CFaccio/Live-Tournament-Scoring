import { auth, db, onAuthStateChanged, signOut, doc, getDoc, updateDoc } from './firebase.js';
import { renderAuth } from './auth.js';
import { renderDashboard, initDashboard, cleanupDashboard } from './dashboard.js';
import { renderCreate, initCreate } from './create.js';
import { renderTournament, initTournament, cleanupTournament } from './tournament-view.js';

// ── App shell ─────────────────────────────────────────────────────────────

let currentUser = null;
let currentScreen = null;

const app = document.getElementById('app');

function render(html) {
  app.innerHTML = html;
}

// ── Navigation ────────────────────────────────────────────────────────────

window.appNavigate = (screen, params = {}) => {
  cleanupDashboard();
  cleanupTournament();
  currentScreen = screen;

  switch(screen) {
    case 'auth':
      render(renderAuth());
      break;

    case 'dashboard':
      render(renderDashboard(currentUser));
      initDashboard(currentUser, appNavigate);
      break;

    case 'create':
      render(renderCreate());
      initCreate();
      break;

    case 'join':
      render(renderJoin(params));
      initJoin(params);
      break;

    case 'profile':
      render(renderProfile());
      initProfile();
      break;

    case 'tournament':
      render(renderTournament());
      initTournament(currentUser, params.id);
      break;

    default:
      appNavigate('dashboard');
  }
};

// ── Join tournament ───────────────────────────────────────────────────────

function renderJoin(params = {}) {
  return `
    <div class="page-header">
      <button class="btn btn-icon" onclick="appNavigate('dashboard')" aria-label="Back">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <div>
        <h1>Join tournament</h1>
        <p class="subtitle">Enter your invite code</p>
      </div>
    </div>
    <div class="card">
      <h3>Invite code</h3>
      <input type="text" id="join-code" placeholder="e.g. AB12CD" maxlength="6"
        style="text-transform:uppercase;letter-spacing:0.1em;font-size:20px;text-align:center"
        value="${params.code || ''}">
    </div>
    <div id="join-error" class="alert" style="display:none"></div>
    <button class="btn btn-primary btn-full" onclick="doJoin()">
      <i class="ti ti-search" aria-hidden="true"></i> Find tournament
    </button>
  `;
}

function renderRatingEntry(tournament) {
  const sport = tournament.sport || 'Padel';
  return `
    <div class="page-header">
      <div>
        <h1>One more step</h1>
        <p class="subtitle">You've been invited to ${escHtml(tournament.name)}</p>
      </div>
    </div>
    <div class="card">
      <div style="text-align:center;padding:8px 0 16px">
        <i class="ti ti-tennis" style="font-size:40px;color:var(--accent)" aria-hidden="true"></i>
        <div style="font-size:17px;font-weight:700;margin-top:8px">${escHtml(tournament.name)}</div>
        <div style="font-size:13px;color:var(--c-text-2);margin-top:4px">${escHtml(sport)} · ${tournament.playerCount} players</div>
      </div>
      <h3>Your ${escHtml(sport)} rating</h3>
      <p class="field-hint">This is used to create balanced pairs. Be honest — it makes the tournament fairer for everyone!</p>
      <div style="display:flex;align-items:center;gap:8px">
        <input type="number" id="player-rating" step="0.1" min="0" max="10"
          placeholder="e.g. 4.5" style="flex:1;font-size:18px;text-align:center">
        <span style="font-size:14px;color:var(--c-text-2);white-space:nowrap">out of 10</span>
      </div>
      <p style="font-size:12px;color:var(--c-text-3);margin-top:8px;text-align:center">
        Not sure? Ask the organiser or enter your best estimate.
      </p>
    </div>
    <div id="rating-error" class="alert" style="display:none"></div>
    <button class="btn btn-primary btn-full" onclick="submitRatingAndJoin()">
      <i class="ti ti-login" aria-hidden="true"></i> Join tournament
    </button>
  `;
}

function initJoin(params = {}) {
  const input = document.getElementById('join-code');
  if (input) {
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    });
    // Auto-search if code was passed in via URL
    if (params.code && params.code.length === 6) {
      setTimeout(() => doJoinLookup(params.code), 100);
    }
  }

  let pendingTournament = null;
  let pendingTournamentId = null;

  window.doJoin = () => doJoinLookup();

  async function doJoinLookup(autoCode) {
    const code = (autoCode || document.getElementById('join-code')?.value || '').trim().toUpperCase();
    const errEl = document.getElementById('join-error');
    if (errEl) errEl.style.display = 'none';

    if (code.length !== 6) {
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Please enter a 6-character invite code.'; }
      return;
    }

    try {
      const { collection, query, where } = await import('./firebase.js');
      const { getDocs } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const q = query(collection(db, 'tournaments'), where('inviteCode', '==', code));
      const snap = await getDocs(q);

      if (snap.empty) {
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'No tournament found with that code.'; }
        return;
      }

      const tDoc = snap.docs[0];
      const t = tDoc.data();

      // Already a member — just rejoin
      if (t.players?.some(p => p.uid === currentUser.uid)) {
        await setDoc(doc(db, 'users', currentUser.uid), { activeTournamentId: tDoc.id }, { merge: true });
        appNavigate('tournament', { id: tDoc.id });
        return;
      }

      if ((t.players?.length || 0) >= t.playerCount) {
        if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'This tournament is already full.'; }
        return;
      }

      // Show rating entry screen
      pendingTournament = t;
      pendingTournamentId = tDoc.id;
      const app = document.getElementById('app');
      app.innerHTML = renderRatingEntry(t);

    } catch(e) {
      console.error(e);
      if (errEl) { errEl.style.display = 'block'; errEl.textContent = 'Failed to find tournament. Please try again.'; }
    }
  }

  window.submitRatingAndJoin = async () => {
    const ratingInput = document.getElementById('player-rating');
    const errEl = document.getElementById('rating-error');
    const rating = parseFloat(ratingInput?.value);

    if (isNaN(rating) || rating < 0 || rating > 10) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please enter a valid rating between 0 and 10.';
      return;
    }

    try {
      const { arrayUnion } = await import('./firebase.js');
      const playerEntry = {
        uid: currentUser.uid,
        displayName: currentUser.displayName || 'Player',
        email: currentUser.email || '',
        rating,
        joinedAt: new Date()
      };

      await updateDoc(doc(db, 'tournaments', pendingTournamentId), {
        players: arrayUnion(playerEntry)
      });

      // Save rating to user profile too
      await setDoc(doc(db, 'users', currentUser.uid), {
        activeTournamentId: pendingTournamentId,
        rating
      }, { merge: true });

      appNavigate('tournament', { id: pendingTournamentId });
    } catch(e) {
      console.error(e);
      errEl.style.display = 'block';
      errEl.textContent = 'Failed to join. Please try again.';
    }
  };
}

function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

// ── Profile ───────────────────────────────────────────────────────────────

function renderProfile() {
  return `
    <div class="page-header">
      <button class="btn btn-icon" onclick="appNavigate('dashboard')" aria-label="Back">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <div><h1>Profile</h1></div>
    </div>
    <div class="card">
      <div class="player-list-row" style="margin-bottom:16px">
        <div class="player-avatar" style="width:48px;height:48px;font-size:20px">${(currentUser.displayName||'?')[0].toUpperCase()}</div>
        <div>
          <div style="font-weight:600">${currentUser.displayName || 'Player'}</div>
          <div style="font-size:13px;color:var(--c-text-2)">${currentUser.email}</div>
        </div>
      </div>
      <h3>Your padel rating</h3>
      <div style="display:flex;gap:8px;align-items:center">
        <input type="number" id="profile-rating" step="0.1" min="0" max="10" placeholder="e.g. 4.5" style="flex:1">
        <button class="btn btn-primary" onclick="saveRating()">Save</button>
      </div>
      <p class="field-hint" style="margin-top:8px">This will be used for seeded draws in new tournaments.</p>
    </div>
    <button class="btn btn-full btn-danger" style="margin-top:8px" onclick="appSignOut()">
      <i class="ti ti-logout" aria-hidden="true"></i> Sign out
    </button>
  `;
}

function initProfile() {
  getDoc(doc(db, 'users', currentUser.uid)).then(snap => {
    const data = snap.data();
    const input = document.getElementById('profile-rating');
    if (input && data?.rating) input.value = data.rating;
  });

  window.saveRating = async () => {
    const rating = parseFloat(document.getElementById('profile-rating').value);
    if (isNaN(rating)) return;
    await updateDoc(doc(db, 'users', currentUser.uid), { rating });
    showToast('Rating saved!');
    appNavigate('dashboard');
  };
}

// ── Toast ─────────────────────────────────────────────────────────────────

window.showToast = (msg, type = 'success') => {
  let toast = document.getElementById('app-toast');
  if (!toast) {
    toast = document.createElement('div');
    toast.id = 'app-toast';
    document.body.appendChild(toast);
  }
  toast.textContent = msg;
  toast.className = `toast toast-${type} show`;
  clearTimeout(toast._timer);
  toast._timer = setTimeout(() => toast.classList.remove('show'), 3000);
};

// ── Sign out ──────────────────────────────────────────────────────────────

window.appSignOut = async () => {
  await signOut(auth);
};

// ── Auth state ────────────────────────────────────────────────────────────

onAuthStateChanged(auth, async (user) => {
  if (user) {
    currentUser = user;
    // Check for invite code in URL
    const params = new URLSearchParams(location.search);
    const joinCode = params.get('join');
    if (joinCode) {
      history.replaceState({}, '', location.pathname);
      appNavigate('join', { code: joinCode.toUpperCase() });
    } else {
      appNavigate('dashboard');
    }
  } else {
    currentUser = null;
    appNavigate('auth');
  }
});

// ── Handle join links ─────────────────────────────────────────────────────

window.startTournament = (id) => appNavigate('tournament', { id });
