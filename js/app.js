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
      render(renderJoin());
      initJoin();
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

function renderJoin() {
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
        style="text-transform:uppercase;letter-spacing:0.1em;font-size:20px;text-align:center">
    </div>
    <div id="join-error" class="alert" style="display:none"></div>
    <button class="btn btn-primary btn-full" onclick="doJoin()">
      <i class="ti ti-login" aria-hidden="true"></i> Join tournament
    </button>
  `;
}

function initJoin() {
  const input = document.getElementById('join-code');
  if (input) {
    input.addEventListener('input', () => {
      input.value = input.value.toUpperCase().replace(/[^A-Z0-9]/g,'');
    });
  }

  window.doJoin = async () => {
    const code = document.getElementById('join-code').value.trim().toUpperCase();
    const errEl = document.getElementById('join-error');
    if (code.length !== 6) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please enter a 6-character invite code.';
      return;
    }
    try {
      const { collection, query, where, getDocs } = await import('./firebase.js');
      const q = query(collection(db, 'tournaments'), where('inviteCode', '==', code));
      // Use a one-time get for join
      const { getDocs: gd } = await import('https://www.gstatic.com/firebasejs/10.7.1/firebase-firestore.js');
      const snap = await gd(q);

      if (snap.empty) {
        errEl.style.display = 'block';
        errEl.textContent = 'No tournament found with that code.';
        return;
      }

      const tDoc = snap.docs[0];
      const t = tDoc.data();

      if (t.players?.some(p => p.uid === currentUser.uid)) {
        await updateDoc(doc(db, 'users', currentUser.uid), { activeTournamentId: tDoc.id });
        appNavigate('tournament', { id: tDoc.id });
        return;
      }

      if ((t.players?.length || 0) >= t.playerCount) {
        errEl.style.display = 'block';
        errEl.textContent = 'This tournament is already full.';
        return;
      }

      const userSnap = await getDoc(doc(db, 'users', currentUser.uid));
      const userData = userSnap.data();

      const { arrayUnion } = await import('./firebase.js');
      await updateDoc(doc(db, 'tournaments', tDoc.id), {
        players: arrayUnion({
          uid: currentUser.uid,
          displayName: currentUser.displayName || 'Player',
          email: currentUser.email,
          rating: userData?.rating || 0,
          joinedAt: new Date()
        })
      });

      await updateDoc(doc(db, 'users', currentUser.uid), { activeTournamentId: tDoc.id });
      appNavigate('tournament', { id: tDoc.id });
    } catch(e) {
      errEl.style.display = 'block';
      errEl.textContent = 'Failed to join. Please try again.';
    }
  };
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
      appNavigate('join');
      setTimeout(() => {
        const input = document.getElementById('join-code');
        if (input) { input.value = joinCode.toUpperCase(); }
      }, 100);
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
