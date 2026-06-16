// ── Format generator ──────────────────────────────────────────────────────

export function getFormat(playerCount) {
  const pairs = Math.ceil(playerCount / 2);
  const hasBye = playerCount % 2 !== 0;

  let groupStage, knockout;

  if (pairs <= 5) {
    groupStage = { type: 'round-robin', groups: 1, pairs };
    knockout = pairs >= 4 ? { rounds: ['sf1','sf2','f3','final'] } : { rounds: ['final'] };
  } else if (pairs <= 8) {
    groupStage = { type: 'round-robin', groups: 1, pairs };
    knockout = { rounds: ['sf1','sf2','f3','final'] };
  } else {
    const g1 = Math.ceil(pairs / 2);
    const g2 = Math.floor(pairs / 2);
    groupStage = { type: 'two-groups', groups: 2, sizes: [g1, g2], pairs };
    knockout = { rounds: ['qf1','qf2','qf3','qf4','sf1','sf2','f3','final'] };
  }

  return { pairs, hasBye, groupStage, knockout };
}

export function getMatchCount(format) {
  const { groupStage } = format;
  if (groupStage.type === 'round-robin') {
    const n = groupStage.pairs;
    return (n * (n - 1)) / 2;
  } else {
    const [g1, g2] = groupStage.sizes;
    return (g1 * (g1-1)) / 2 + (g2 * (g2-1)) / 2;
  }
}

// ── Seeded pairing ────────────────────────────────────────────────────────

export function generatePairs(players) {
  const sorted = [...players].sort((a, b) => b.rating - a.rating);
  const half = Math.floor(sorted.length / 2);
  const top = sorted.slice(0, half);
  const bottom = sorted.slice(half);

  // Shuffle bottom half
  for (let i = bottom.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [bottom[i], bottom[j]] = [bottom[j], bottom[i]];
  }

  const pairs = top.map((p, i) => ({
    player1: p,
    player2: bottom[i] || null, // null = bye pair
    name: bottom[i] ? `${p.displayName} / ${bottom[i].displayName}` : `${p.displayName} (bye)`,
    avgRating: bottom[i]
      ? +((p.rating + bottom[i].rating) / 2).toFixed(1)
      : p.rating,
    isBye: !bottom[i]
  }));

  return pairs;
}

// ── Match schedule generator ──────────────────────────────────────────────

export function generateMatches(pairs, format) {
  const matches = [];
  let id = 0;

  if (format.groupStage.type === 'round-robin') {
    for (let i = 0; i < pairs.length; i++) {
      for (let j = i + 1; j < pairs.length; j++) {
        matches.push(makeLeagueMatch(id++, pairs[i], pairs[j], 'group1'));
      }
    }
  } else {
    const mid = format.groupStage.sizes[0];
    const group1 = pairs.slice(0, mid);
    const group2 = pairs.slice(mid);
    for (let i = 0; i < group1.length; i++) {
      for (let j = i + 1; j < group1.length; j++) {
        matches.push(makeLeagueMatch(id++, group1[i], group1[j], 'group1'));
      }
    }
    for (let i = 0; i < group2.length; i++) {
      for (let j = i + 1; j < group2.length; j++) {
        matches.push(makeLeagueMatch(id++, group2[i], group2[j], 'group2'));
      }
    }
  }

  return matches;
}

function makeLeagueMatch(id, pairA, pairB, group) {
  return {
    id: `match_${id}`,
    phase: 'league',
    group,
    pairAId: pairA.id,
    pairAName: pairA.name,
    pairBId: pairB.id,
    pairBName: pairB.name,
    playerIds: [
      pairA.player1.uid, pairA.player2?.uid,
      pairB.player1.uid, pairB.player2?.uid
    ].filter(Boolean),
    sets: [],
    status: 'pending', // pending | submitted | approved | disputed
    submittedBy: null,
    submittedAt: null,
    approvedAt: null,
    pointsA: 0, pointsB: 0,
    bonusA: 0, bonusB: 0,
    gamesA: 0, gamesB: 0
  };
}

// ── Score calculation ─────────────────────────────────────────────────────

export function calcMatchResult(sets) {
  let winsA = 0, winsB = 0, gA = 0, gB = 0, bonusA = 0, bonusB = 0;

  for (const s of sets) {
    if (s.a !== '' && s.b !== '' && s.a !== null && s.b !== null) {
      const a = parseInt(s.a), b = parseInt(s.b);
      if (!isNaN(a) && !isNaN(b)) {
        gA += a; gB += b;
        if (a > b) winsA++; else if (b > a) winsB++;
        if (a === 6 && b === 0) bonusA++;
        if (b === 6 && a === 0) bonusB++;
      }
    }
  }

  let pA = bonusA, pB = bonusB;
  if (winsA > winsB) pA += 3;
  else if (winsB > winsA) pB += 3;
  else { pA += 1; pB += 1; }

  return { winsA, winsB, gA, gB, bonusA, bonusB, pA, pB };
}

// ── Standings calculator ──────────────────────────────────────────────────

export function calcStandings(pairs, matches) {
  const stats = {};
  pairs.forEach(p => {
    stats[p.id] = {
      ...p,
      played: 0, won: 0, drawn: 0, lost: 0,
      points: 0, gamesWon: 0, gamesLost: 0, bonusPoints: 0
    };
  });

  matches.filter(m => m.status === 'approved' && m.phase === 'league').forEach(m => {
    const a = stats[m.pairAId], b = stats[m.pairBId];
    if (!a || !b) return;
    a.played++; b.played++;
    a.gamesWon += m.gamesA; a.gamesLost += m.gamesB;
    b.gamesWon += m.gamesB; b.gamesLost += m.gamesA;
    a.points += m.pointsA; b.points += m.pointsB;
    a.bonusPoints += m.bonusA; b.bonusPoints += m.bonusB;
    if (m.pointsA > m.pointsB) { a.won++; b.lost++; }
    else if (m.pointsB > m.pointsA) { b.won++; a.lost++; }
    else { a.drawn++; b.drawn++; }
  });

  return Object.values(stats).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    const grA = a.gamesLost === 0 ? 9999 : a.gamesWon / a.gamesLost;
    const grB = b.gamesLost === 0 ? 9999 : b.gamesWon / b.gamesLost;
    return grB - grA;
  });
}

// ── Utilities ─────────────────────────────────────────────────────────────

export function escHtml(str) {
  return String(str || '')
    .replace(/&/g,'&amp;').replace(/</g,'&lt;')
    .replace(/>/g,'&gt;').replace(/"/g,'&quot;');
}

export function timeAgo(ts) {
  if (!ts) return '';
  const sec = Math.floor((Date.now() - ts.toMillis()) / 1000);
  if (sec < 60) return 'just now';
  if (sec < 3600) return Math.floor(sec/60) + 'm ago';
  if (sec < 86400) return Math.floor(sec/3600) + 'h ago';
  return Math.floor(sec/86400) + 'd ago';
}

export function formatCountdown(ts) {
  if (!ts) return '';
  const deadline = ts.toMillis() + 24 * 60 * 60 * 1000;
  const remaining = deadline - Date.now();
  if (remaining <= 0) return 'auto-approving...';
  const h = Math.floor(remaining / 3600000);
  const m = Math.floor((remaining % 3600000) / 60000);
  return `${h}h ${m}m until auto-approve`;
}
