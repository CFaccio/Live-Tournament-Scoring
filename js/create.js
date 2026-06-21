import { db, auth, doc, setDoc, getDoc, updateDoc, arrayUnion, collection } from './firebase.js';
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
      <h3>Sport</h3>
      <div class="sport-grid" id="sport-grid">
        <button class="sport-btn active" onclick="selectSport('Padel')" data-sport="Padel">
          <i class="ti ti-tennis" aria-hidden="true"></i>
          <span>Padel</span>
        </button>
        <button class="sport-btn coming-soon" disabled title="Coming soon">
          <i class="ti ti-golf" aria-hidden="true"></i>
          <span>Golf</span>
          <span class="coming-badge">Soon</span>
        </button>
        <button class="sport-btn coming-soon" disabled title="Coming soon">
          <i class="ti ti-ball-bowling" aria-hidden="true"></i>
          <span>Bowls</span>
          <span class="coming-badge">Soon</span>
        </button>
      </div>
    </div>

    <div class="card">
      <h3>Tournament name</h3>
      <input type="text" id="t-name" placeholder="e.g. Summer Padel Cup 2025" maxlength="60">
    </div>

    <div class="card">
      <h3>Number of players</h3>
      <p class="field-hint">Even number between 6 and 24.</p>
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
        <div class="rule-input-wrap">
          <input type="number" id="pts-win" value="3" min="0" max="99" placeholder="3"
            class="rule-input" aria-label="Points for a win">
          <span class="rule-unit">pts</span>
        </div>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Draw</div>
          <div class="rule-sub">Points for a drawn match</div>
        </div>
        <div class="rule-input-wrap">
          <input type="number" id="pts-draw" value="1" min="0" max="99" placeholder="1"
            class="rule-input" aria-label="Points for a draw">
          <span class="rule-unit">pts</span>
        </div>
      </div>
      <div class="rule-row">
        <div class="rule-info">
          <div class="rule-label">Loss</div>
          <div class="rule-sub">Points for losing a match</div>
        </div>
        <div class="rule-input-wrap">
          <input type="number" id="pts-loss" value="0" min="0" max="99" placeholder="0"
            class="rule-input" aria-label="Points for a loss">
          <span class="rule-unit">pts</span>
        </div>
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
          <div class="rule-sub">Opponent must confirm scores</div>
        </div>
        <label class="toggle">
          <input type="checkbox" id="approval-toggle" checked>
          <span class="toggle-slider"></span>
        </label>
      </div>
      <div id="approval-note" class="rule-note">
        <i class="ti ti-info-circle" aria-hidden="true"></i>
        Scores auto-approve after 24 hours if not confirmed.
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
  // Show/hide approval note based on toggle
  const approvalToggle = document.getElementById('approval-toggle');
  const approvalNote = document.getElementById('approval-note');
  if (approvalToggle && approvalNote) {
    approvalToggle.addEventListener('change', () => {
      approvalNote.style.display = approvalToggle.checked ? 'block' : 'none';
    });
  }

  window.selectSport = (sport) => {
    document.querySelectorAll('.sport-btn').forEach(b =>
      b.classList.toggle('active', b.dataset.sport === sport)
    );
  };

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
    const approvalRequired = document.getElementById('approval-toggle')?.checked ?? true;
    const winPoints = parseInt(document.getElementById('pts-win')?.value) || 3;
    const drawPoints = parseInt(document.getElementById('pts-draw')?.value) || 1;
    const lossPoints = parseInt(document.getElementById('pts-loss')?.value) || 0;
    const errEl = document.getElementById('create-error');
    errEl.style.display = 'none';

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

      if (!user) throw new Error('not-logged-in');

      console.log('Creating tournament for user:', user.uid);

      const sport = document.querySelector('.sport-btn.active')?.dataset.sport || 'Padel';
      const format = getFormat(selectedCount);
      const inviteCode = genCode();
      const tRef = doc(collection(db, 'tournaments'));

      const tournament = {
        id: tRef.id,
        sport,
        name,
        organiserId: user.uid,
        organiserName: user.displayName || 'Organiser',
        playerCount: selectedCount,
        format,
        rules: { winPoints, drawPoints, lossPoints, bonusPoint, approvalRequired },
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

      console.log('Writing tournament doc...');
      await setDoc(tRef, tournament);
      console.log('Tournament doc written OK');

      // Add organiser as first player
      const userSnap = await getDoc(doc(db, 'users', user.uid));
      const userData = userSnap.exists() ? userSnap.data() : {};

      const playerEntry = {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        email: user.email || '',
        rating: userData.rating || 0,
        joinedAt: new Date()
      };

      console.log('Adding organiser as player...');
      await updateDoc(tRef, { players: arrayUnion(playerEntry) });
      console.log('Player added OK');

      console.log('Updating user activeTournamentId...');
      await setDoc(doc(db, 'users', user.uid), {
        uid: user.uid,
        displayName: user.displayName || 'Player',
        email: user.email || '',
        rating: 0,
        activeTournamentId: tRef.id
      }, { merge: true });
      console.log('All done — navigating to dashboard');

      appNavigate('dashboard');

    } catch(e) {
      console.error('CREATE TOURNAMENT ERROR:', e.code, e.message, e);
      errEl.style.display = 'block';
      errEl.textContent = `Error: ${e.message || e.code || 'Unknown error'}`;
      btn.disabled = false;
      btn.innerHTML = '<i class="ti ti-plus"></i> Create tournament';
    }
  };
}

function updateFormatPreview(n) {
  const el = document.getElementById('format-preview');
  if (!el) return;
  const format = getFormat(n);
  const matches = getMatchCount(format);
  const hasBye = n % 2 !== 0;
  const pairs = format.pairs;

  let desc = format.groupStage.type === 'round-robin'
    ? `${pairs} pairs · round-robin · ${matches} matches`
    : `${pairs} pairs · 2 groups · ${matches} league matches`;

  el.innerHTML = `
    <div class="format-chips">
      <span class="chip">${desc}</span>
      ${hasBye ? '<span class="chip chip-amber">1 bye pair</span>' : ''}
      <span class="chip">Top 4 → knockout</span>
    </div>
  `;
}
