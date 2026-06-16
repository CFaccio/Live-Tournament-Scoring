import { db, auth, doc, getDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from './firebase.js';
import { escHtml, calcStandings, timeAgo } from './tournament.js';

let unsubDashboard = null;

export function renderDashboard(user) {
  return `
    <div class="page-header">
      <div>
        <h1>Hello, ${escHtml(user.displayName?.split(' ')[0] || 'Player')}</h1>
        <p class="subtitle">Your padel tournaments</p>
      </div>
      <button class="btn btn-icon" onclick="appSignOut()" title="Sign out">
        <i class="ti ti-logout" aria-hidden="true"></i>
      </button>
    </div>

    <div id="dashboard-content">
      <div class="loading-state">
        <i class="ti ti-loader-2 spin" aria-hidden="true"></i>
        <p>Loading...</p>
      </div>
    </div>
  `;
}

export function initDashboard(user, navigate) {
  if (unsubDashboard) unsubDashboard();

  const userRef = doc(db, 'users', user.uid);

  unsubDashboard = onSnapshot(userRef, async (userSnap) => {
    const userData = userSnap.data();
    const content = document.getElementById('dashboard-content');
    if (!content) return;

    if (!userData?.activeTournamentId) {
      content.innerHTML = renderNoTournament();
      return;
    }

    const tRef = doc(db, 'tournaments', userData.activeTournamentId);
    const tSnap = await getDoc(tRef);
    if (!tSnap.exists()) {
      await updateDoc(userRef, { activeTournamentId: null });
      return;
    }

    const t = { id: tSnap.id, ...tSnap.data() };
    content.innerHTML = renderTournamentCard(t, user);
  });

  // Set up global nav handlers
  window.goCreateTournament = () => navigate('create');
  window.goJoinTournament = () => navigate('join');
  window.goTournament = (id) => navigate('tournament', { id });
}

function renderNoTournament() {
  return `
    <div class="empty-hero">
      <i class="ti ti-tournament" aria-hidden="true"></i>
      <h2>No active tournament</h2>
      <p>Create a new tournament or join one with an invite link.</p>
    </div>
    <button class="btn btn-primary btn-full" onclick="goCreateTournament()">
      <i class="ti ti-plus" aria-hidden="true"></i> Create tournament
    </button>
    <button class="btn btn-full" style="margin-top:8px" onclick="goJoinTournament()">
      <i class="ti ti-link" aria-hidden="true"></i> Join with invite code
    </button>
  `;
}

function renderTournamentCard(t, user) {
  const isOrganiser = t.organiserId === user.uid;
  const phase = t.phase === 'league' ? 'League stage' : t.phase === 'knockout' ? 'Knockout stage' : 'Waiting for players';
  const joined = t.players?.length || 0;
  const needed = t.playerCount;
  const ready = joined >= needed;

  return `
    <div class="tournament-hero card" onclick="goTournament('${t.id}')">
      <div class="th-top">
        <div>
          <div class="th-name">${escHtml(t.name)}</div>
          <div class="th-phase">
            <span class="badge ${t.phase === 'waiting' ? 'badge-amber' : 'badge-green'}">${phase}</span>
          </div>
        </div>
        <i class="ti ti-chevron-right th-arrow" aria-hidden="true"></i>
      </div>
      <div class="th-stats">
        <div class="th-stat">
          <div class="th-stat-val">${joined}/${needed}</div>
          <div class="th-stat-lbl">Players</div>
        </div>
        <div class="th-stat">
          <div class="th-stat-val">${t.matchesPlayed || 0}</div>
          <div class="th-stat-lbl">Matches played</div>
        </div>
        <div class="th-stat">
          <div class="th-stat-val">${t.pendingApprovals || 0}</div>
          <div class="th-stat-lbl">Awaiting approval</div>
        </div>
      </div>
      ${isOrganiser && !ready ? `
        <div class="invite-row">
          <span style="font-size:13px;color:var(--c-text-2)">Invite code:</span>
          <code class="invite-code">${t.inviteCode}</code>
          <button class="btn btn-sm" onclick="event.stopPropagation();copyInvite('${t.inviteCode}')">
            <i class="ti ti-copy" aria-hidden="true"></i>
          </button>
        </div>
      ` : ''}
    </div>

    ${isOrganiser && !ready ? `
      <div class="alert alert-amber" style="margin-top:8px">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        Waiting for ${needed - joined} more player${needed - joined !== 1 ? 's' : ''} to join before the draw can be made.
      </div>
      ${joined >= 6 && joined % 2 === 0 ? `
        <button class="btn btn-primary btn-full" style="margin-top:8px" onclick="startTournament('${t.id}')">
          <i class="ti ti-arrows-shuffle" aria-hidden="true"></i> Generate draw & start (${joined} players)
        </button>
      ` : ''}
    ` : ''}
  `;
}

window.copyInvite = (code) => {
  const url = `${location.origin}${location.pathname}?join=${code}`;
  navigator.clipboard.writeText(url).then(() => {
    showToast('Invite link copied!');
  });
};

export function cleanupDashboard() {
  if (unsubDashboard) { unsubDashboard(); unsubDashboard = null; }
}
