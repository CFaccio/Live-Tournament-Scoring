import { db, auth, doc, updateDoc, onSnapshot, serverTimestamp, Timestamp } from './firebase.js';
import { calcStandings, calcMatchResult, escHtml, timeAgo, formatCountdown, generatePairs, generateMatches } from './tournament.js';

let unsubTournament = null;
let currentTournament = null;
let currentUser = null;

export function renderTournament() {
  return `
    <div class="page-header">
      <button class="btn btn-icon" onclick="appNavigate('dashboard')" aria-label="Back">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <div style="flex:1;min-width:0">
        <h1 id="t-title" class="truncate">Tournament</h1>
        <p class="subtitle" id="t-phase">Loading...</p>
      </div>
      <div id="t-pending-badge" style="display:none">
        <span class="badge badge-danger" id="pending-count">0</span>
      </div>
    </div>

    <div class="tab-bar">
      <button class="tab active" onclick="tSwitchTab('matches')">Matches</button>
      <button class="tab" onclick="tSwitchTab('standings')">Standings</button>
      <button class="tab" onclick="tSwitchTab('bracket')">Bracket</button>
      <button class="tab" onclick="tSwitchTab('players')">Players</button>
    </div>

    <div id="tab-matches"><div class="loading-state"><i class="ti ti-loader-2 spin"></i><p>Loading...</p></div></div>
    <div id="tab-standings" style="display:none"></div>
    <div id="tab-bracket" style="display:none"></div>
    <div id="tab-players" style="display:none"></div>
  `;
}

export function initTournament(user, tournamentId) {
  currentUser = user;
  if (unsubTournament) unsubTournament();

  const tRef = doc(db, 'tournaments', tournamentId);

  unsubTournament = onSnapshot(tRef, (snap) => {
    if (!snap.exists()) { appNavigate('dashboard'); return; }
    currentTournament = { id: snap.id, ...snap.data() };
    refreshTournamentUI();
    checkAutoApprovals(tRef);
  });

  window.tSwitchTab = (tab) => {
    document.querySelectorAll('.tab').forEach((t, i) =>
      t.classList.toggle('active', ['matches','standings','bracket','players'][i] === tab)
    );
    ['matches','standings','bracket','players'].forEach(t => {
      const el = document.getElementById('tab-' + t);
      if (el) el.style.display = t === tab ? 'block' : 'none';
    });
    if (tab === 'standings') renderStandingsTab();
    if (tab === 'bracket') renderBracketTab();
    if (tab === 'players') renderPlayersTab();
  };
}

function refreshTournamentUI() {
  const t = currentTournament;
  const titleEl = document.getElementById('t-title');
  const phaseEl = document.getElementById('t-phase');
  if (titleEl) titleEl.textContent = t.name;
  if (phaseEl) phaseEl.textContent = phaseLabel(t.phase);

  // Pending approvals badge
  const myPending = (t.matches || []).filter(m =>
    m.status === 'submitted' &&
    m.playerIds?.includes(currentUser.uid) &&
    m.submittedBy !== currentUser.uid
  ).length;

  const badgeWrap = document.getElementById('t-pending-badge');
  const badgeCount = document.getElementById('pending-count');
  if (badgeWrap && badgeCount) {
    badgeWrap.style.display = myPending > 0 ? 'block' : 'none';
    badgeCount.textContent = myPending;
  }

  renderMatchesTab();
}

// ── MATCHES TAB ───────────────────────────────────────────────────────────

function renderMatchesTab() {
  const t = currentTournament;
  const el = document.getElementById('tab-matches');
  if (!el) return;

  if (t.phase === 'waiting') {
    el.innerHTML = renderWaitingState(t);
    return;
  }

  const matches = t.matches || [];
  const myMatches = matches.filter(m => m.playerIds?.includes(currentUser.uid));
  const otherMatches = matches.filter(m => !m.playerIds?.includes(currentUser.uid));

  const done = matches.filter(m => m.status === 'approved').length;
  const total = matches.filter(m => m.phase === 'league').length;
  const pct = total > 0 ? Math.round(done/total*100) : 0;

  el.innerHTML = `
    <div class="progress-wrap">
      <div class="progress-meta">
        <span>${done} of ${total} matches played</span>
        <span>${pct}%</span>
      </div>
      <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
    </div>

    ${myMatches.length > 0 ? `
      <div class="section-label">Your matches</div>
      ${myMatches.map(m => renderMatchCard(m, true)).join('')}
    ` : ''}

    ${otherMatches.length > 0 ? `
      <div class="section-label" style="margin-top:16px">All matches</div>
      ${otherMatches.map(m => renderMatchCard(m, false)).join('')}
    ` : ''}
  `;
}

function renderWaitingState(t) {
  const isOrg = t.organiserId === currentUser.uid;
  const joined = t.players?.length || 0;
  const needed = t.playerCount;
  return `
    <div class="empty-hero">
      <i class="ti ti-users" aria-hidden="true"></i>
      <h2>Waiting for players</h2>
      <p>${joined} of ${needed} players have joined.</p>
    </div>
    ${isOrg ? `
      <div class="card">
        <h3>Invite players</h3>
        <p style="font-size:13px;color:var(--c-text-2);margin-bottom:12px">Share this link with your players:</p>
        <div class="invite-row">
          <code class="invite-code" style="flex:1;overflow:hidden;text-overflow:ellipsis">${location.origin}${location.pathname}?join=${t.inviteCode}</code>
          <button class="btn btn-sm" onclick="copyInvite('${t.inviteCode}')"><i class="ti ti-copy" aria-hidden="true"></i></button>
        </div>
      </div>
      ${joined >= 6 && joined % 2 === 0 ? `
        <button class="btn btn-primary btn-full" onclick="doStartTournament('${t.id}')">
          <i class="ti ti-arrows-shuffle" aria-hidden="true"></i> Generate draw & start (${joined} players)
        </button>
      ` : `
        <div class="alert alert-amber">Need at least 6 players (even number) to start.</div>
      `}
    ` : `<div class="alert alert-amber">The organiser will start the tournament once all players have joined.</div>`}
  `;
}

function renderMatchCard(m, isMyMatch) {
  const isPending = m.status === 'submitted' && m.playerIds?.includes(currentUser.uid) && m.submittedBy !== currentUser.uid;
  const canSubmit = isMyMatch && m.status === 'pending';
  const canApprove = isPending;

  let statusBadge = '';
  if (m.status === 'approved') statusBadge = '<span class="badge badge-green">Approved</span>';
  else if (m.status === 'submitted') statusBadge = `<span class="badge badge-amber">Awaiting approval</span>`;
  else if (m.status === 'disputed') statusBadge = '<span class="badge badge-danger">Disputed</span>';

  let resultRow = '';
  if (m.status === 'approved') {
    const wA = m.pointsA > m.pointsB, wB = m.pointsB > m.pointsA;
    let bonusHtml = '';
    if ((m.bonusA > 0 || m.bonusB > 0)) {
      const parts = [];
      if (m.bonusA > 0) parts.push(`${escHtml(m.pairAName.split('/')[0].trim())} +${m.bonusA}`);
      if (m.bonusB > 0) parts.push(`${escHtml(m.pairBName.split('/')[0].trim())} +${m.bonusB}`);
      bonusHtml = `<div class="match-bonus-info"><i class="ti ti-star" aria-hidden="true"></i>${parts.join(', ')} bonus</div>`;
    }
    resultRow = `
      <div class="match-result-row">
        <div class="match-result-score">
          <span class="badge ${wA?'badge-green':wB?'badge-gray':'badge-amber'}">${m.pointsA} pts</span>
          <span class="vs-sep">vs</span>
          <span class="badge ${wB?'badge-green':wA?'badge-gray':'badge-amber'}">${m.pointsB} pts</span>
        </div>
        ${bonusHtml}
      </div>
      <div class="set-scores-display">${(m.sets||[]).map((s,i)=>`Set ${i+1}: ${s.a}–${s.b}`).join(' · ')}</div>
    `;
  }

  if (m.status === 'submitted') {
    const r = calcMatchResult(m.sets || []);
    const wA = r.pA > r.pB, wB = r.pB > r.pA;
    resultRow = `
      <div class="match-result-row">
        <div class="match-result-score" style="opacity:0.6">
          <span class="badge ${wA?'badge-green':wB?'badge-gray':'badge-amber'}">${r.pA} pts</span>
          <span class="vs-sep">vs</span>
          <span class="badge ${wB?'badge-green':wA?'badge-gray':'badge-amber'}">${r.pB} pts</span>
        </div>
        <span style="font-size:11px;color:var(--c-text-2)">${formatCountdown(m.submittedAt)}</span>
      </div>
      <div class="set-scores-display">${(m.sets||[]).map((s,i)=>`Set ${i+1}: ${s.a}–${s.b}`).join(' · ')}</div>
    `;
  }

  return `
    <div class="match-card ${m.status === 'approved' ? 'completed' : ''} ${isPending ? 'needs-approval' : ''}">
      <div class="match-teams">
        <span class="team-name">${escHtml(m.pairAName)}</span>
        <span class="vs">vs</span>
        <span class="team-name right">${escHtml(m.pairBName)}</span>
      </div>
      <div class="match-meta">${statusBadge} ${m.group === 'group2' ? '<span class="badge badge-gray">Group B</span>' : ''}</div>
      ${resultRow}
      ${canSubmit ? `
        <div class="score-entry" id="entry-${m.id}">
          <div class="score-entry-sets">
            ${[0,1,2].map(s => `
              <div class="set-group">
                <label>Set ${s+1}</label>
                <input type="number" min="0" max="7" placeholder="–" id="set-${m.id}-${s}-a" style="width:40px">
                <span class="set-sep">–</span>
                <input type="number" min="0" max="7" placeholder="–" id="set-${m.id}-${s}-b" style="width:40px">
              </div>
            `).join('')}
          </div>
          <button class="btn btn-primary btn-sm" onclick="submitScore('${m.id}')">
            <i class="ti ti-send" aria-hidden="true"></i> Submit score
          </button>
        </div>
      ` : ''}
      ${canApprove ? `
        <div class="approval-row">
          <p style="font-size:13px;margin-bottom:8px">Check the score and confirm or dispute:</p>
          <div style="display:flex;gap:8px">
            <button class="btn btn-primary btn-sm" onclick="approveScore('${m.id}')">
              <i class="ti ti-check" aria-hidden="true"></i> Approve
            </button>
            <button class="btn btn-sm btn-danger" onclick="disputeScore('${m.id}')">
              <i class="ti ti-x" aria-hidden="true"></i> Dispute
            </button>
          </div>
        </div>
      ` : ''}
    </div>
  `;
}

// ── Score actions ─────────────────────────────────────────────────────────

window.submitScore = async (matchId) => {
  const sets = [0,1,2].map(s => ({
    a: document.getElementById(`set-${matchId}-${s}-a`)?.value ?? '',
    b: document.getElementById(`set-${matchId}-${s}-b`)?.value ?? ''
  }));

  const validSets = sets.filter(s => s.a !== '' && s.b !== '');
  if (validSets.length < 2) { showToast('Enter at least 2 set scores.', 'error'); return; }

  const result = calcMatchResult(sets.filter(s => s.a !== '' && s.b !== ''));

  const t = currentTournament;
  const matches = [...(t.matches || [])];
  const idx = matches.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  matches[idx] = {
    ...matches[idx],
    sets: sets.filter(s => s.a !== '' && s.b !== ''),
    status: 'submitted',
    submittedBy: currentUser.uid,
    submittedAt: Timestamp.now(),
    pointsA: result.pA, pointsB: result.pB,
    bonusA: result.bonusA, bonusB: result.bonusB,
    gamesA: result.gA, gamesB: result.gB
  };

  await updateDoc(doc(db, 'tournaments', t.id), {
    matches,
    pendingApprovals: matches.filter(m => m.status === 'submitted').length
  });
  showToast('Score submitted — waiting for opponent to approve.');
};

window.approveScore = async (matchId) => {
  const t = currentTournament;
  const matches = [...(t.matches || [])];
  const idx = matches.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  matches[idx] = { ...matches[idx], status: 'approved', approvedAt: Timestamp.now() };

  const approvedCount = matches.filter(m => m.status === 'approved' && m.phase === 'league').length;
  const leagueTotal = matches.filter(m => m.phase === 'league').length;

  const update = {
    matches,
    matchesPlayed: approvedCount,
    pendingApprovals: matches.filter(m => m.status === 'submitted').length
  };

  if (approvedCount === leagueTotal && t.phase === 'league') {
    update.phase = 'knockout';
    update.knockoutMatches = generateKnockoutMatches(t);
  }

  await updateDoc(doc(db, 'tournaments', t.id), update);
  showToast('Score approved!');
};

window.disputeScore = async (matchId) => {
  const t = currentTournament;
  const matches = [...(t.matches || [])];
  const idx = matches.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  matches[idx] = { ...matches[idx], status: 'disputed' };

  await updateDoc(doc(db, 'tournaments', t.id), {
    matches,
    pendingApprovals: matches.filter(m => m.status === 'submitted').length
  });
  showToast('Score disputed — the organiser has been notified.');
};

// ── Auto-approval check ───────────────────────────────────────────────────

async function checkAutoApprovals(tRef) {
  const t = currentTournament;
  if (!t?.matches) return;
  const now = Date.now();
  const TWENTY_FOUR_H = 24 * 60 * 60 * 1000;

  const matches = [...t.matches];
  let changed = false;

  matches.forEach((m, i) => {
    if (m.status === 'submitted' && m.submittedAt) {
      const submittedMs = m.submittedAt.toMillis ? m.submittedAt.toMillis() : m.submittedAt;
      if (now - submittedMs > TWENTY_FOUR_H) {
        matches[i] = { ...m, status: 'approved', approvedAt: Timestamp.now(), autoApproved: true };
        changed = true;
      }
    }
  });

  if (changed) {
    const approvedCount = matches.filter(m => m.status === 'approved' && m.phase === 'league').length;
    const leagueTotal = matches.filter(m => m.phase === 'league').length;
    const update = {
      matches,
      matchesPlayed: approvedCount,
      pendingApprovals: matches.filter(m => m.status === 'submitted').length
    };
    if (approvedCount === leagueTotal && t.phase === 'league') {
      update.phase = 'knockout';
      update.knockoutMatches = generateKnockoutMatches(t);
    }
    await updateDoc(tRef, update);
  }
}

// ── STANDINGS TAB ─────────────────────────────────────────────────────────

function renderStandingsTab() {
  const t = currentTournament;
  const el = document.getElementById('tab-standings');
  if (!el || !t) return;

  if (t.phase === 'waiting' || !t.pairs?.length) {
    el.innerHTML = '<div class="empty-hero"><i class="ti ti-lock"></i><p>Standings will appear once the tournament starts.</p></div>';
    return;
  }

  const standings = calcStandings(t.pairs, t.matches || []);

  el.innerHTML = `
    <div class="card" style="padding:12px 14px;overflow-x:auto">
      <div class="standings-header">
        <span class="sh-pos"></span>
        <span class="sh-name">Pair</span>
        <span class="sh-stat">P</span>
        <span class="sh-stat">W</span>
        <span class="sh-stat">D</span>
        <span class="sh-stat">L</span>
        <span class="sh-stat">GR</span>
        <span class="sh-stat sh-bonus">Bon</span>
        <span class="sh-stat sh-pts">Pts</span>
      </div>
      ${standings.map((p, i) => {
        const qualify = i < 4;
        const gr = p.gamesLost === 0 ? (p.gamesWon > 0 ? '∞' : '–') : (p.gamesWon/p.gamesLost).toFixed(2);
        const isMe = p.player1?.uid === currentUser.uid || p.player2?.uid === currentUser.uid;
        return `
          <div class="standing-row ${isMe ? 'is-me' : ''}">
            <span class="s-pos ${qualify ? 'qualify' : ''}">${i+1}</span>
            <div class="s-info">
              <div class="s-name">${escHtml(p.name)}</div>
              <div class="s-sub">Avg ${p.avgRating} ${qualify ? '<span class="badge badge-green" style="font-size:10px;margin-left:4px">Qualifies</span>' : ''}</div>
            </div>
            <div class="s-stats">
              <div class="s-stat"><div class="s-val">${p.played}</div></div>
              <div class="s-stat"><div class="s-val">${p.won}</div></div>
              <div class="s-stat"><div class="s-val">${p.drawn}</div></div>
              <div class="s-stat"><div class="s-val">${p.lost}</div></div>
              <div class="s-stat"><div class="s-val" style="font-size:12px">${gr}</div></div>
              <div class="s-stat"><div class="s-val s-bonus">${p.bonusPoints}</div></div>
              <div class="s-stat"><div class="s-val s-pts">${p.points}</div></div>
            </div>
          </div>
        `;
      }).join('')}
    </div>
    <p class="standings-note">
      <i class="ti ti-info-circle" aria-hidden="true"></i>
      Top 4 qualify for semi-finals. Tiebreaker: games won/lost ratio.
      <span class="bonus-label">Bon</span> = bonus points from 6-0 sets.
    </p>
  `;
}

// ── BRACKET TAB ───────────────────────────────────────────────────────────

function renderBracketTab() {
  const t = currentTournament;
  const el = document.getElementById('tab-bracket');
  if (!el || !t) return;

  if (t.phase !== 'knockout' || !t.knockoutMatches?.length) {
    el.innerHTML = '<div class="bracket-lock"><i class="ti ti-lock"></i><p>Complete all league matches to unlock the knockout stage.</p></div>';
    return;
  }

  const sfsDone = t.knockoutMatches.find(m => m.id === 'sf1')?.status === 'approved' &&
                  t.knockoutMatches.find(m => m.id === 'sf2')?.status === 'approved';

  el.innerHTML = t.knockoutMatches.map(m => {
    const isMyMatch = m.playerIds?.includes(currentUser.uid);
    const canSubmit = isMyMatch && m.status === 'pending' && m.teamA && m.teamB;
    const canApprove = isMyMatch && m.status === 'submitted' && m.submittedBy !== currentUser.uid;
    const isLate = ['f3','final'].includes(m.id);
    const show = !isLate || sfsDone;

    if (!show) return `
      <div class="bracket-card">
        <div class="bracket-label">${m.label}</div>
        <div class="bracket-tbd-row">To be determined after semi-finals</div>
      </div>`;

    const nameA = m.teamA?.name || 'TBD';
    const nameB = m.teamB?.name || 'TBD';

    return `
      <div class="bracket-card ${m.status === 'approved' ? 'completed' : ''}">
        <div class="bracket-label">${m.label}</div>
        <div class="bracket-team ${m.status==='approved'&&m.winner?.id===m.teamA?.id?'winner':m.status==='approved'?'loser':''}">
          <span>${escHtml(nameA)}</span>
          ${m.status==='approved'&&m.winner?.id===m.teamA?.id?'<i class="ti ti-crown" aria-hidden="true"></i>':''}
        </div>
        <div class="bracket-team ${m.status==='approved'&&m.winner?.id===m.teamB?.id?'winner':m.status==='approved'?'loser':''}">
          <span>${escHtml(nameB)}</span>
          ${m.status==='approved'&&m.winner?.id===m.teamB?.id?'<i class="ti ti-crown" aria-hidden="true"></i>':''}
        </div>
        ${m.status==='approved'?`<div class="set-scores-display">${(m.sets||[]).map((s,i)=>`Set ${i+1}: ${s.a}–${s.b}`).join(' · ')}</div>`:''}
        ${canSubmit ? `
          <div class="score-entry">
            <div class="score-entry-sets">
              ${[0,1,2].map(s=>`
                <div class="set-group">
                  <label>Set ${s+1}</label>
                  <input type="number" min="0" max="7" placeholder="–" id="kset-${m.id}-${s}-a" style="width:40px">
                  <span class="set-sep">–</span>
                  <input type="number" min="0" max="7" placeholder="–" id="kset-${m.id}-${s}-b" style="width:40px">
                </div>
              `).join('')}
            </div>
            <button class="btn btn-primary btn-sm" onclick="submitKnockoutScore('${m.id}')">
              <i class="ti ti-send" aria-hidden="true"></i> Submit score
            </button>
          </div>
        `:''}
        ${canApprove ? `
          <div class="approval-row">
            <div style="display:flex;gap:8px;margin-top:8px">
              <button class="btn btn-primary btn-sm" onclick="approveKnockoutScore('${m.id}')">
                <i class="ti ti-check" aria-hidden="true"></i> Approve
              </button>
              <button class="btn btn-sm btn-danger" onclick="disputeKnockoutScore('${m.id}')">
                <i class="ti ti-x" aria-hidden="true"></i> Dispute
              </button>
            </div>
          </div>
        `:''}
      </div>
    `;
  }).join('');

  const final = t.knockoutMatches.find(m => m.id === 'final');
  if (final?.status === 'approved' && final.winner) {
    el.innerHTML += `
      <div class="champion-card">
        <i class="ti ti-trophy" aria-hidden="true"></i>
        <div class="champion-label">Tournament champion</div>
        <div class="champion-name">${escHtml(final.winner.name)}</div>
      </div>`;
  }
}

window.submitKnockoutScore = async (matchId) => {
  const sets = [0,1,2].map(s => ({
    a: document.getElementById(`kset-${matchId}-${s}-a`)?.value ?? '',
    b: document.getElementById(`kset-${matchId}-${s}-b`)?.value ?? ''
  })).filter(s => s.a !== '' && s.b !== '');

  if (sets.length < 2) { showToast('Enter at least 2 set scores.', 'error'); return; }
  const result = calcMatchResult(sets);

  const t = currentTournament;
  const km = [...(t.knockoutMatches || [])];
  const idx = km.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  km[idx] = { ...km[idx], sets, status: 'submitted', submittedBy: currentUser.uid, submittedAt: Timestamp.now(),
    pointsA: result.pA, pointsB: result.pB, gamesA: result.gA, gamesB: result.gB };

  await updateDoc(doc(db, 'tournaments', t.id), { knockoutMatches: km });
  showToast('Score submitted — waiting for opponent to approve.');
};

window.approveKnockoutScore = async (matchId) => {
  const t = currentTournament;
  const km = [...(t.knockoutMatches || [])];
  const idx = km.findIndex(m => m.id === matchId);
  if (idx === -1) return;

  const m = km[idx];
  const r = calcMatchResult(m.sets || []);
  const winner = r.winsA > r.winsB ? m.teamA : m.teamB;
  const loser  = r.winsA > r.winsB ? m.teamB : m.teamA;

  km[idx] = { ...m, status: 'approved', approvedAt: Timestamp.now(), winner, loser };

  if (matchId === 'sf1') {
    const f3 = km.findIndex(x => x.id === 'f3');
    const fin = km.findIndex(x => x.id === 'final');
    if (!km[f3].teamA) km[f3] = { ...km[f3], teamA: loser, playerIds: [...(km[f3].playerIds||[]), ...(loser?.playerIds||[])] };
    if (!km[fin].teamA) km[fin] = { ...km[fin], teamA: winner, playerIds: [...(km[fin].playerIds||[]), ...(winner?.playerIds||[])] };
  }
  if (matchId === 'sf2') {
    const f3 = km.findIndex(x => x.id === 'f3');
    const fin = km.findIndex(x => x.id === 'final');
    if (!km[f3].teamB) km[f3] = { ...km[f3], teamB: loser, playerIds: [...(km[f3].playerIds||[]), ...(loser?.playerIds||[])] };
    if (!km[fin].teamB) km[fin] = { ...km[fin], teamB: winner, playerIds: [...(km[fin].playerIds||[]), ...(winner?.playerIds||[])] };
  }

  await updateDoc(doc(db, 'tournaments', t.id), { knockoutMatches: km });
  showToast('Score approved!');
};

window.disputeKnockoutScore = async (matchId) => {
  const t = currentTournament;
  const km = [...(t.knockoutMatches || [])];
  const idx = km.findIndex(m => m.id === matchId);
  if (idx === -1) return;
  km[idx] = { ...km[idx], status: 'disputed' };
  await updateDoc(doc(db, 'tournaments', t.id), { knockoutMatches: km });
  showToast('Score disputed.');
};

// ── PLAYERS TAB ───────────────────────────────────────────────────────────

function renderPlayersTab() {
  const t = currentTournament;
  const el = document.getElementById('tab-players');
  if (!el || !t) return;

  const isOrg = t.organiserId === currentUser.uid;

  el.innerHTML = `
    <div class="card">
      <div class="card-header">
        <h3>Players <span class="badge badge-gray">${t.players?.length || 0} / ${t.playerCount}</span></h3>
      </div>
      ${(t.players || []).map(p => `
        <div class="player-list-row">
          <div class="player-avatar">${(p.displayName||'?')[0].toUpperCase()}</div>
          <div class="player-list-info">
            <div class="player-list-name">${escHtml(p.displayName)} ${p.uid === currentUser.uid ? '<span class="badge badge-green" style="font-size:10px">You</span>' : ''} ${p.uid === t.organiserId ? '<span class="badge badge-gray" style="font-size:10px">Organiser</span>' : ''}</div>
            <div class="player-list-sub">Rating: ${p.rating || 'Not set'}</div>
          </div>
          ${isOrg && t.phase === 'waiting' && p.uid !== currentUser.uid ? `
            <button class="btn btn-sm" onclick="setPlayerRating('${p.uid}')">
              <i class="ti ti-edit" aria-hidden="true"></i>
            </button>
          ` : ''}
        </div>
      `).join('')}
    </div>

    ${isOrg && t.phase === 'waiting' ? `
      <div class="card">
        <h3>Invite link</h3>
        <div class="invite-row">
          <code class="invite-code" style="flex:1;font-size:12px;overflow:hidden;text-overflow:ellipsis">${location.origin}${location.pathname}?join=${t.inviteCode}</code>
          <button class="btn btn-sm" onclick="copyInvite('${t.inviteCode}')"><i class="ti ti-copy" aria-hidden="true"></i></button>
        </div>
      </div>
    ` : ''}
  `;
}

window.setPlayerRating = async (uid) => {
  const rating = parseFloat(prompt('Enter padel rating for this player (e.g. 4.5):'));
  if (isNaN(rating)) return;
  const t = currentTournament;
  const players = [...(t.players || [])];
  const idx = players.findIndex(p => p.uid === uid);
  if (idx === -1) return;
  players[idx] = { ...players[idx], rating };
  await updateDoc(doc(db, 'tournaments', t.id), { players });
  showToast('Rating updated.');
};

// ── Knockout generator ────────────────────────────────────────────────────

function generateKnockoutMatches(t) {
  const standings = calcStandings(t.pairs, t.matches || []);
  const s = standings;
  const makeKm = (id, label, teamA, teamB) => ({
    id, label,
    teamA: teamA || null, teamB: teamB || null,
    playerIds: [...(teamA?.playerIds||[]), ...(teamB?.playerIds||[])],
    sets: [], status: 'pending',
    submittedBy: null, submittedAt: null, approvedAt: null,
    winner: null, loser: null,
    pointsA: 0, pointsB: 0, gamesA: 0, gamesB: 0
  });

  // Enrich pair with playerIds
  const enrich = (pair) => {
    if (!pair) return null;
    return {
      ...pair,
      playerIds: [pair.player1?.uid, pair.player2?.uid].filter(Boolean)
    };
  };

  return [
    makeKm('sf1', 'Semi-final 1 (1st vs 4th)', enrich(s[0]), enrich(s[3])),
    makeKm('sf2', 'Semi-final 2 (2nd vs 3rd)', enrich(s[1]), enrich(s[2])),
    makeKm('f3', '3rd place playoff', null, null),
    makeKm('final', 'Final', null, null)
  ];
}

// ── Start tournament ──────────────────────────────────────────────────────

window.doStartTournament = async (tournamentId) => {
  const t = currentTournament;
  if (!t) return;

  const pairs = generatePairs(t.players).map((p, i) => ({ ...p, id: `pair_${i}` }));
  const { generateMatches, getFormat } = await import('./tournament.js');
  const format = getFormat(t.players.length);
  const matches = generateMatches(pairs, format);

  await updateDoc(doc(db, 'tournaments', tournamentId), {
    pairs,
    matches,
    format,
    phase: 'league',
    startedAt: serverTimestamp()
  });

  showToast('Tournament started! Draw has been generated.');
};

export function cleanupTournament() {
  if (unsubTournament) { unsubTournament(); unsubTournament = null; }
}
