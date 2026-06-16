import { db, auth, doc, getDoc, setDoc, collection, query, where, onSnapshot, updateDoc, serverTimestamp } from './firebase.js';
import { escHtml } from './tournament.js';

let unsubDashboard = null;

export function renderDashboard(user) {
  return `
    <div class="page-header">
      <div style="flex:1">
        <h1>Hello, ${escHtml(user.displayName?.split(' ')[0] || 'Player')}</h1>
        <p class="subtitle">Your padel tournaments</p>
      </div>
      <button class="btn btn-icon" onclick="appNavigate('profile')" title="Profile">
        <div class="player-avatar" style="width:32px;height:32px;font-size:13px">${(user.displayName||'?')[0].toUpperCase()}</div>
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
    const userData = userSnap.exists() ? userSnap.data() : {};
    const content = document.getElementById('dashboard-content');
    if (!content) return;

    const activeTournamentId = userData?.activeTournamentId;
    const tournamentHistory = userData?.tournamentHistory || [];

    let activeTournament = null;
    if (activeTournamentId) {
      const tSnap = await getDoc(doc(db, 'tournaments', activeTournamentId));
      if (tSnap.exists()) {
        activeTournament = { id: tSnap.id, ...tSnap.data() };
        // If completed, move to history automatically
        if (activeTournament.phase === 'completed') {
          await setDoc(userRef, {
            activeTournamentId: null,
            tournamentHistory: [...new Set([...tournamentHistory, activeTournamentId])]
          }, { merge: true });
          activeTournament = null;
        }
      } else {
        // Tournament deleted — clear it
        await setDoc(userRef, { activeTournamentId: null }, { merge: true });
      }
    }

    // Load history tournaments
    let historyTournaments = [];
    if (tournamentHistory.length > 0) {
      const histPromises = tournamentHistory.slice(-5).reverse().map(id =>
        getDoc(doc(db, 'tournaments', id)).then(s => s.exists() ? { id: s.id, ...s.data() } : null)
      );
      historyTournaments = (await Promise.all(histPromises)).filter(Boolean);
    }

    content.innerHTML = renderDashboardContent(activeTournament, historyTournaments, user);
  });

  window.goCreateTournament = () => navigate('create');
  window.goJoinTournament = () => navigate('join');
  window.goTournament = (id) => navigate('tournament', { id });
  window.reactivateTournament = async (id) => {
    await setDoc(doc(db, 'users', user.uid), { activeTournamentId: id }, { merge: true });
    navigate('tournament', { id });
  };
}

function renderDashboardContent(activeTournament, historyTournaments, user) {
  let html = '';

  // ── Active tournament ──
  if (activeTournament) {
    html += `<div class="section-label" style="margin-bottom:8px">Active tournament</div>`;
    html += renderTournamentCard(activeTournament, user);
  } else {
    html += `
      <div class="empty-hero">
        <i class="ti ti-tournament" aria-hidden="true"></i>
        <h2>No active tournament</h2>
        <p>Create a new tournament or join one with an invite link.</p>
      </div>
    `;
  }

  // ── Action buttons ──
  if (!activeTournament) {
    html += `
      <button class="btn btn-primary btn-full" onclick="goCreateTournament()">
        <i class="ti ti-plus" aria-hidden="true"></i> Create tournament
      </button>
      <button class="btn btn-full" style="margin-top:8px" onclick="goJoinTournament()">
        <i class="ti ti-link" aria-hidden="true"></i> Join with invite code
      </button>
    `;
  }

  // ── Tournament history ──
  if (historyTournaments.length > 0) {
    html += `<div class="section-label" style="margin-top:24px;margin-bottom:8px">Past tournaments</div>`;
    html += historyTournaments.map(t => renderHistoryCard(t)).join('');
  }

  return html;
}

function renderTournamentCard(t, user) {
  const isOrganiser = t.organiserId === user.uid;
  const phase = phaseLabel(t.phase);
  const joined = t.players?.length || 0;
  const needed = t.playerCount;
  const sport = t.sport || 'Padel';

  return `
    <div class="tournament-hero card" onclick="goTournament('${t.id}')">
      <div class="th-top">
        <div style="flex:1;min-width:0">
          <div class="th-name truncate">${escHtml(t.name)}</div>
          <div style="display:flex;gap:6px;margin-top:4px;flex-wrap:wrap">
            <span class="badge ${t.phase === 'waiting' ? 'badge-amber' : t.phase === 'completed' ? 'badge-gray' : 'badge-green'}">${phase}</span>
            <span class="badge badge-gray">${escHtml(sport)}</span>
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
          <div class="th-stat-lbl">Played</div>
        </div>
        <div class="th-stat">
          <div class="th-stat-val">${t.pendingApprovals || 0}</div>
          <div class="th-stat-lbl">Pending</div>
        </div>
      </div>
      ${isOrganiser && t.phase === 'waiting' ? `
        <div class="invite-row" style="margin-top:12px;padding-top:12px;border-top:0.5px solid var(--c-border)">
          <span style="font-size:12px;color:var(--c-text-2)">Invite code:</span>
          <code class="invite-code">${t.inviteCode}</code>
          <button class="btn btn-sm" onclick="event.stopPropagation();copyInvite('${t.inviteCode}')">
            <i class="ti ti-copy" aria-hidden="true"></i>
          </button>
        </div>
      ` : ''}
    </div>
  `;
}

function renderHistoryCard(t) {
  const sport = t.sport || 'Padel';
  const date = t.completedAt ? new Date(t.completedAt.seconds * 1000).toLocaleDateString() : 'Unknown date';
  return `
    <div class="card history-card" onclick="goTournament('${t.id}')">
      <div style="display:flex;align-items:center;justify-content:space-between">
        <div style="flex:1;min-width:0">
          <div style="font-weight:600;font-size:14px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis">${escHtml(t.name)}</div>
          <div style="font-size:12px;color:var(--c-text-2);margin-top:3px">${escHtml(sport)} · ${date}</div>
          ${t.championName ? `
            <div style="font-size:12px;color:var(--accent);margin-top:3px">
              <i class="ti ti-trophy" style="font-size:12px" aria-hidden="true"></i> ${escHtml(t.championName)}
            </div>
          ` : ''}
        </div>
        <i class="ti ti-chevron-right" style="color:var(--c-text-3);font-size:18px;flex-shrink:0" aria-hidden="true"></i>
      </div>
    </div>
  `;
}

function phaseLabel(phase) {
  if (phase === 'waiting') return 'Waiting for players';
  if (phase === 'league') return 'League stage';
  if (phase === 'knockout') return 'Knockout stage';
  if (phase === 'completed') return 'Completed';
  return 'Tournament';
}

window.copyInvite = (code) => {
  const url = `${location.origin}${location.pathname}?join=${code}`;
  navigator.clipboard.writeText(url).then(() => showToast('Invite link copied!'));
};

export function cleanupDashboard() {
  if (unsubDashboard) { unsubDashboard(); unsubDashboard = null; }
}
