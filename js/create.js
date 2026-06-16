import { db, auth, doc, setDoc, updateDoc, collection } from './firebase.js';
import { getFormat, getMatchCount } from './tournament.js';

function genCode() {
  return Math.random().toString(36).substring(2, 8).toUpperCase();
}

export function renderCreate() {
  return `
    <div class="page-header">
      <button class="btn btn-icon" onclick="appNavigate('dashboard')" aria-label="Back">
        <i class="ti ti-arrow-left" aria-hidden="true"></i>
      </button>
      <div>
        <h1>New tournament</h1>
        <p class="subtitle">Set up your competition</p>
      </div>
    </div>

    <div class="card">
      <h3>Tournament name</h3>
      <input type="text" id="t-name" placeholder="e.g. Summer Padel Cup 2025" maxlength="60">
    </div>

    <div class="card">
      <h3>Number of players</h3>
      <p class="field-hint">Must be an even number between 6 and 24. Odd numbers get a bye pair.</p>
      <div class="player-count-grid" id="player-count-grid">
        ${[6,8,10,12,14,16,18,20,22,24].map(n => `
          <button class="count-btn ${n === 12 ? 'active' : ''}" onclick="selectPlayerCount(${n})" data-count="${n}">${n}</button>
        `).join('')}
      </div>
      <div id="format-preview" class="format-preview"></div>
    </div>

    <div class="card">
      <h3>Scoring rules</h3>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Win</div>
          <div class="rule-sub">Points for winning a match</div>
        </div>
        <div class="rule-val">3 pts</div>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Draw</div>
          <div class="rule-sub">Points for a drawn match</div>
        </div>
        <div class="rule-val">1 pt</div>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Loss</div>
          <div class="rule-sub">Points for losing a match</div>
        </div>
        <div class="rule-val">0 pts</div>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Bonus point</div>
          <div class="rule-sub">Awarded for winning any set 6-0</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="bonus-toggle" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Score approval</div>
          <div class="rule-sub">Opponent must confirm scores. Auto-approves after 24h.</div>
        </div>
        <div class="rule-val" style="color:var(--accent)">On</div>
      </div>
    </div>

    <div id="create-error" class="alert" style="display:none"></div>
    <button class="btn btn-primary btn-full" id="create-btn" onclick="createTournament()">
      <i class="ti ti-plus" aria-hidden="true"></i> Create tournament
    </button>
  `;
}

let selectedCount = 12;

export function initCreate() {
  window.selectPlayerCount = (n) => {
    selectedCount = n;
    document.querySelectorAll('.count-btn').forEach(b =>
      b.classList.toggle('active', parseInt(b.dataset.count) === n)
    );
    updateFormatPreview(n);
  };

  updateFormatPreview(selectedCount);

  window.createTournament = async () => {
    const name = document.getElementById('t-name').value.trim();
    const bonusPoint = document.getElementById('bonus-toggle').checked;
    const errEl = document.getElementById('create-error');

    if (!name) {
      errEl.style.display = 'block';
      errEl.textContent = 'Please enter a tournament name.';
      return;
    }

    const btn = document.getElementById('create-btn');
    btn.disabled = true;
    btn.innerHTML = '<i class="ti ti-loader-2 spin" aria-hidden="true"></i> Creating...';

    try {
      const user = auth.currentUser;
      const format = getFormat(selectedCount);
      const inviteCode = genCode();
      const tRef = doc(collection(db, 'tournaments'));

      const tournament = {
        id: tRef.id,
        name,
        organiserId: user.uid,
        organiserName: user.displayName,
        playerCount: selectedCount,
        format,
        rules: { winPoints: 3, drawPoints: 1, lossPoints: 0, bonusPoint },
        inviteCode,
        phase: 'waiting',
        players: [],
        pairs: [],
        matches: [],
        knockoutMatches: [],
        matchesPlayed: 0,
        pendingApprovals: 0,
        createdAt: new Date(),
        startedAt: null
      };

      await setDoc(tRef, tournament);

      // Add organiser as first player
      await joinTournamentAsUser(tRef.id, user, tournament);

      await updateDoc(doc(db, 'users', user.uid), {
        activeTournamentId: tRef.id
      });

      appNavigate('dashboard');
    } catch(e) {
      errEl.style.display = 'block';
      errEl.textContent = 'Failed to create tournament. Please try again.';
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-plus"></i> Create tournament';
    }
  };
}

async function joinTournamentAsUser(tournamentId, user, tournament) {
  const userDoc = await import('./firebase.js').then(m => m.getDoc(m.doc(m.db, 'users', user.uid)));
  const userData = userDoc.data();

  const playerEntry = {
    uid: user.uid,
    displayName: user.displayName || 'Player',
    email: user.email,
    rating: userData?.rating || 0,
    joinedAt: new Date()
  };

  const tRef = doc(db, 'tournaments', tournamentId);
  const { arrayUnion } = await import('./firebase.js');
  await updateDoc(tRef, { players: arrayUnion(playerEntry) });
}

function updateFormatPreview(n) {
  const el = document.getElementById('format-preview');
  if (!el) return;
  const format = getFormat(n);
  const matches = getMatchCount(format);
  const hasBye = n % 2 !== 0;
  const pairs = format.pairs;

  let desc = '';
  if (format.groupStage.type === 'round-robin') {
    desc = `${pairs} pairs · single round-robin · ${matches} matches`;
  } else {
    desc = `${pairs} pairs · 2 groups · ${matches} league matches`;
  }

  el.innerHTML = `
    <div class="format-chips">
      <span class="chip">${desc}</span>
      ${hasBye ? '<span class="chip chip-amber">1 bye pair</span>' : ''}
      <span class="chip">Top 4 → knockout</span>
    </div>
  `;
}
