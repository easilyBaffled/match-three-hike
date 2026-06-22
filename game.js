'use strict';

// ---------- data ----------
const POS = {
  QB: { name: 'QB', full: 'Quarterback', color: '#7b5cff', skill: 4 },
  RB: { name: 'RB', full: 'Running Back', color: '#2fd45e', skill: 5 },
  WR: { name: 'WR', full: 'Wide Receiver', color: '#21c7ff', skill: 5 },
  SL: { name: 'SL', full: 'Slot Back', color: '#ff5db1', skill: 3 },
  TE: { name: 'TE', full: 'Tight End', color: '#ff8a2b', skill: 3 },
  OL: { name: 'OL', full: 'O-Line', color: '#ffd23f', skill: 4 },
  FB: { name: 'FB', full: 'Fullback', color: '#ff4d4d', skill: 2 },
};

// Each offensive position is covered by one defender. Blank-gem odds for
// that position come from the skill gap between the two.
const DEFENSE = {
  QB: { name: 'DL', full: 'Pass Rush', skill: 4 },
  RB: { name: 'LB', full: 'Linebacker', skill: 4 },
  WR: { name: 'CB', full: 'Cornerback', skill: 5 },
  SL: { name: 'NB', full: 'Nickel Back', skill: 3 },
  TE: { name: 'S', full: 'Safety', skill: 3 },
  OL: { name: 'DL', full: 'Defensive Line', skill: 4 },
  FB: { name: 'LB', full: 'Linebacker', skill: 3 },
};

// Depth chart per position: index 0 is the default starter (skill matches
// POS[k].skill). Each slot behind it loses 1 skill point (floor 1) and
// builds up its own stamina independent of whoever else is active.
const ROSTER_NAMES = {
  QB: ['Derek Sloan', 'Marcus Tate'],
  RB: ['Jalen Ortiz', 'Cole Barrett', 'Trey Higgins'],
  WR: ['Devon Marsh', 'Reggie Vance', 'Tariq Lewis'],
  SL: ['Eli Sanderson', 'Brody Kim'],
  TE: ['Owen Castillo', 'Pete Donovan'],
  OL: ['Gus Whitfield', 'Ray Holloman'],
  FB: ['Hank Delgado', 'Cliff Norris'],
};
const ROSTER = {};
Object.keys(POS).forEach((k) => {
  ROSTER[k] = ROSTER_NAMES[k].map((name, i) => ({ name, skill: Math.max(1, POS[k].skill - i) }));
});

const PLAYS = [
  { id: 'iso', name: 'POWER ISO', type: 'RUN', desc: 'Pound it up the gut behind the fullback.', personnel: ['OL', 'RB', 'FB', 'TE', 'QB'], prom: { RB: 3, OL: 2.4, FB: 1.6, TE: 1.2, QB: .7 }, base: [2, 7], big: [12, 22], explosive: .18, pass: false },
  { id: 'slant', name: 'QUICK SLANT', type: 'PASS', desc: 'Rhythm throw to the receiver crossing the middle.', personnel: ['QB', 'WR', 'SL', 'TE', 'OL'], prom: { WR: 3, QB: 2, SL: 1.6, TE: 1, OL: 1.2 }, base: [4, 9], big: [14, 30], explosive: .28, pass: true },
  { id: 'bomb', name: 'DEEP BOMB', type: 'PASS', desc: 'Heave it deep — boom or bust.', personnel: ['QB', 'WR', 'SL', 'OL', 'TE'], prom: { WR: 3.2, QB: 2.2, OL: 1.4, SL: 1.4, TE: .7 }, base: [0, 11], big: [26, 55], explosive: .44, pass: true },
  { id: 'screen', name: 'RB SCREEN', type: 'PASS', desc: 'Dump to the back, let the line lead.', personnel: ['QB', 'RB', 'OL', 'WR', 'TE'], prom: { RB: 3, OL: 2.2, QB: 1.4, WR: 1, TE: 1 }, base: [3, 10], big: [16, 34], explosive: .3, pass: true },
  { id: 'sweep', name: 'OUTSIDE SWEEP', type: 'RUN', desc: 'Bounce it outside and turn upfield.', personnel: ['RB', 'OL', 'WR', 'TE', 'QB'], prom: { RB: 3, OL: 2, WR: 1.4, TE: 1.2, QB: .7 }, base: [1, 9], big: [14, 28], explosive: .24, pass: false },
  { id: 'pa', name: 'PLAY ACTION', type: 'PASS', desc: 'Fake the run, hit the tight end downfield.', personnel: ['QB', 'TE', 'WR', 'RB', 'OL'], prom: { QB: 2.6, TE: 2.4, WR: 1.8, RB: 1, OL: 1.2 }, base: [3, 11], big: [18, 40], explosive: .34, pass: true },
];

const ROWS = 7, COLS = 7, FILL = 5, MOVES = 6;
const SAVE_KEY = 'gridironGems:save';

// The uncolored gem: spawns alongside the play's personnel, swaps and
// matches exactly like any other color, but belongs to no position — clearing
// it never fills a meter. Pure board clutter that costs you moves.
const NEUTRAL = 'N', NEUTRAL_CHANCE = 0.25;
const NEUTRAL_GEM = { name: '◆', full: 'Neutral', color: '#8a93a6' };

const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const clamp = (lo, hi, v) => Math.max(lo, Math.min(hi, v));
const ordinal = (n) => ['', '1ST', '2ND', '3RD', '4TH'][n] || (n + 'TH');

let _id = 1;
const nid = () => 'g' + (_id++);

function playById(id) { return PLAYS.find((p) => p.id === id); }

// ---------- state ----------
// Every roster slot starts active on the starter (index 0) at full stamina.
function freshRoster() {
  const r = {};
  Object.keys(ROSTER).forEach((k) => { r[k] = { active: 0, stamina: ROSTER[k].map(() => 100) }; });
  return r;
}

function freshState() {
  return {
    phase: 'title', score: 0, oppScore: 0, drive: 1,
    ballOn: 25, down: 1, toGo: 10, playId: null,
    grid: [], meters: {}, movesLeft: MOVES, selected: null, busy: false,
    result: null, shownYards: 0,
    momentum: 0, forcedExplosive: false,
    possession: 'you',
    oppBallOn: 0, oppDown: 1, oppToGo: 10, oppLog: [],
    showMatchup: false, showRoster: false,
    roster: freshRoster(),
  };
}

let state = freshState();
let hasSave = false;

function loadSave() {
  try {
    const raw = localStorage.getItem(SAVE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    // Saves from before the roster/stamina system existed won't have this key.
    if (!parsed.roster) parsed.roster = freshRoster();
    return parsed;
  } catch (e) { return null; }
}

function saveGame() {
  try { localStorage.setItem(SAVE_KEY, JSON.stringify(state)); } catch (e) { /* storage unavailable */ }
}

function clearSave() {
  try { localStorage.removeItem(SAVE_KEY); } catch (e) { /* noop */ }
}

function setState(patch) {
  Object.assign(state, patch);
  if (state.phase !== 'title') saveGame();
  render();
}

function currentPlay() { return playById(state.playId); }

// ---------- roster / stamina ----------
function activeRosterEntry(k) { return ROSTER[k][state.roster[k].active]; }
function activeSkill(k) { return activeRosterEntry(k).skill; }
function activeStamina(k) { return state.roster[k].stamina[state.roster[k].active]; }
// Exhausted gems are 60% less frequent at 0 stamina, never fully suppressed.
function staminaFactor(k) { return 0.4 + 0.6 * (activeStamina(k) / 100); }

// Called once per snap. The carrier's active slot pays for the touch; every
// other position's benched slots recover, since only benching restores
// stamina. Active slots that didn't carry the play neither gain nor lose.
function tickRoster(carrierKey) {
  Object.keys(state.roster).forEach((k) => {
    const r = state.roster[k];
    r.stamina = r.stamina.map((s, i) => {
      if (k === carrierKey && i === r.active) return clamp(0, 100, s - 25);
      if (i !== r.active) return clamp(0, 100, s + 25);
      return s;
    });
  });
}

function swapRoster(posKey, idx) {
  if (state.roster[posKey].active === idx) return;
  state.roster[posKey].active = idx;
  setState({});
}

// ---------- match-three engine ----------
function weights() {
  const pl = currentPlay(), w = {};
  pl.personnel.forEach((k) => {
    const b = pl.prom[k] || 1, s = activeSkill(k);
    w[k] = b * (0.7 + s / 10) * staminaFactor(k);
  });
  return w;
}

// Odds that a gem of this offensive color spawns "blank" (uncatchable),
// driven purely by the skill gap against the defender who covers it.
function blankChanceFor(k) {
  return clamp(0.04, 0.4, 0.06 + (DEFENSE[k].skill - activeSkill(k)) * 0.07);
}

function blankChances() {
  const out = {};
  currentPlay().personnel.forEach((k) => { out[k] = blankChanceFor(k); });
  return out;
}

// Static gem-contribution share for the matchup screen: skill plus the
// current play's promotion multiplier (falls back to 1 with no play picked).
function offenseShare() {
  const cp = currentPlay(), keys = cp ? cp.personnel : Object.keys(POS), prom = cp ? cp.prom : {};
  const w = {};
  keys.forEach((k) => { w[k] = (prom[k] || 1) * (0.7 + activeSkill(k) / 10); });
  const total = keys.reduce((s, k) => s + w[k], 0);
  return keys.map((k) => ({ key: k, pct: Math.round((w[k] / total) * 100) }));
}

function defenseImpact() {
  const cp = currentPlay(), keys = cp ? cp.personnel : Object.keys(POS);
  return keys.map((k) => ({ key: k, def: DEFENSE[k], blankPct: Math.round(blankChanceFor(k) * 100) }));
}

// Whoever filled their meter the most gets the ball; ties favor the more
// prominent position in the play, then personnel order. The O-line blocks,
// it never carries, so it's excluded from the snap regardless of its meter.
function leadPlayer() {
  const cp = currentPlay();
  if (!cp) return null;
  let best = null;
  cp.personnel.forEach((k) => {
    if (k === 'OL') return;
    const m = state.meters[k] || 0, prom = cp.prom[k] || 1;
    if (!best || m > best.m || (m === best.m && prom > best.prom)) best = { k, m, prom };
  });
  return best ? best.k : null;
}

function pick(w, keys) {
  let t = 0; for (const k of keys) t += w[k];
  let x = Math.random() * t;
  for (const k of keys) { x -= w[k]; if (x <= 0) return k; }
  return keys[keys.length - 1];
}

// Rolls the neutral gem's flat chance before falling back to the weighted
// personnel pick — neutral dilutes the board independent of any position's
// weight, rather than being one more color in the weighted pool.
function pickColor(w, keys) {
  if (Math.random() < NEUTRAL_CHANCE) return NEUTRAL;
  return pick(w, keys);
}

// Neutral gems belong to no defender, so they can never be locked blank.
function rollBlank(col, bc) {
  return col !== NEUTRAL && Math.random() < bc[col];
}

function buildGrid() {
  const keys = currentPlay().personnel, w = weights(), bc = blankChances(), g = [];
  for (let r = 0; r < ROWS; r++) {
    g.push([]);
    for (let c = 0; c < COLS; c++) {
      let col, t = 0;
      do {
        col = pickColor(w, keys); t++;
      } while (t < 25 && (
        (c >= 2 && g[r][c - 1].color === col && g[r][c - 2].color === col) ||
        (r >= 2 && g[r - 1][c].color === col && g[r - 2][c].color === col)
      ));
      g[r].push({ id: nid(), color: col, spawn: false, blank: rollBlank(col, bc) });
    }
  }
  return g;
}

// Collects every straight run of 3+ same-color, non-blank gems, by
// orientation, as its own entry (no merging) — shape/size is what later
// decides whether a run becomes an ordinary clear or a special piece.
function findRuns(grid) {
  const R = grid.length, C = grid[0].length, runs = [];
  for (let r = 0; r < R; r++) {
    let cells = [[r, 0]];
    for (let c = 1; c <= C; c++) {
      const a = c < C ? grid[r][c] : null, b = grid[r][c - 1];
      if (a && b && a.color === b.color && !a.blank && !b.blank) cells.push([r, c]);
      else { if (cells.length >= 3) runs.push({ orientation: 'row', color: b.color, cells }); cells = [[r, c]]; }
    }
  }
  for (let c = 0; c < C; c++) {
    let cells = [[0, c]];
    for (let r = 1; r <= R; r++) {
      const a = r < R ? grid[r][c] : null, b = grid[r - 1][c];
      if (a && b && a.color === b.color && !a.blank && !b.blank) cells.push([r, c]);
      else { if (cells.length >= 3) runs.push({ orientation: 'col', color: b.color, cells }); cells = [[r, c]]; }
    }
  }
  return runs;
}

function cellKey(r, c) { return r + ',' + c; }

// Picks which cell of a run becomes a special piece's anchor: the swap
// destination if it's part of the run (reads as "this is the piece I made"),
// otherwise the run's middle cell.
function pickAnchor(cells, anchorHint) {
  if (anchorHint) {
    const hit = cells.find(([r, c]) => r === anchorHint.r && c === anchorHint.c);
    if (hit) return hit;
  }
  return cells[Math.floor(cells.length / 2)];
}

// Classifies the runs found this pass into the cells that simply clear and
// the cells that become special pieces instead (ladder: 4-straight → line
// clearer, two 3-runs crossing → bomb, 6+-straight → color bomb). Returns
// null if nothing matched.
function findMatches(grid, anchorHint) {
  const runs = findRuns(grid);
  if (!runs.length) return null;

  const matched = new Set();
  runs.forEach((run) => run.cells.forEach(([r, c]) => matched.add(cellKey(r, c))));

  const specials = new Map();
  const usedAnchors = new Set();
  const rowRuns = runs.filter((r) => r.orientation === 'row');
  const colRuns = runs.filter((r) => r.orientation === 'col');
  const pairedRuns = new Set();

  // L/T-of-5: a 3-run crossing a perpendicular 3-run of the same color.
  rowRuns.forEach((rr) => {
    if (rr.cells.length !== 3) return;
    colRuns.forEach((cr) => {
      if (cr.cells.length !== 3 || cr.color !== rr.color) return;
      const shared = rr.cells.find(([r, c]) => cr.cells.some(([r2, c2]) => r2 === r && c2 === c));
      if (!shared) return;
      const key = cellKey(shared[0], shared[1]);
      if (usedAnchors.has(key)) return;
      specials.set(key, { type: 'bomb', color: rr.color });
      usedAnchors.add(key);
      pairedRuns.add(rr); pairedRuns.add(cr);
    });
  });

  // 6+ straight run, any orientation → color bomb (checked before line
  // clearer so a long run doesn't get downgraded).
  runs.forEach((run) => {
    if (run.cells.length < 6) return;
    const [r, c] = pickAnchor(run.cells, anchorHint);
    const key = cellKey(r, c);
    if (usedAnchors.has(key)) return;
    specials.set(key, { type: 'colorbomb', color: run.color });
    usedAnchors.add(key);
  });

  // 4-or-5 straight run not already consumed by an L/T pairing → line clearer.
  runs.forEach((run) => {
    if (run.cells.length < 4 || run.cells.length >= 6 || pairedRuns.has(run)) return;
    const [r, c] = pickAnchor(run.cells, anchorHint);
    const key = cellKey(r, c);
    if (usedAnchors.has(key)) return;
    specials.set(key, { type: run.orientation === 'row' ? 'lineH' : 'lineV', color: run.color });
    usedAnchors.add(key);
  });

  return { matched, specials };
}

function gravity(grid) {
  const w = weights(), keys = currentPlay().personnel, bc = blankChances(), R = grid.length, C = grid[0].length;
  const g = grid.map((r) => r.slice());
  for (let c = 0; c < C; c++) {
    const st = [];
    for (let r = R - 1; r >= 0; r--) if (g[r][c]) st.push(g[r][c]);
    let i = 0;
    for (let r = R - 1; r >= 0; r--) {
      if (i < st.length) { const gem = st[i++]; gem.spawn = false; g[r][c] = gem; }
      else { const col = pickColor(w, keys); g[r][c] = { id: nid(), color: col, spawn: true, blank: rollBlank(col, bc) }; }
    }
  }
  return g;
}

// ---------- outcome / drive model (shared by you & the defense) ----------
function computeResult(play, F, olMeter, forceExplosive) {
  if (forceExplosive) {
    const y = play.big[0] + Math.floor(Math.random() * (play.big[1] - play.big[0] + 1));
    return { yards: y, label: play.pass ? 'Caught in stride — gone!' : 'Breaks free downfield!', type: 'BIG' };
  }
  const stuffP = clamp(0.04, 0.32, 0.30 - F / 360 - (olMeter || 0) / 100 * 0.12);
  if (Math.random() < stuffP) {
    if (play.pass) {
      if (Math.random() < 0.3) return { yards: -(3 + Math.floor(Math.random() * 6)), label: 'Sack in the backfield', type: 'SACK' };
      return { yards: 0, label: 'Pass falls incomplete', type: 'INC' };
    }
    const y = -(Math.floor(Math.random() * 3));
    return { yards: y, label: y < 0 ? 'Tackled for a loss' : 'Stuffed at the line', type: 'STUFF' };
  }
  const bigP = (F / 100) * play.explosive + 0.02;
  if (Math.random() < bigP) {
    const y = play.big[0] + Math.floor(Math.random() * (play.big[1] - play.big[0] + 1));
    return { yards: y, label: play.pass ? 'Caught in stride — gone!' : 'Breaks free downfield!', type: 'BIG' };
  }
  const t = F / 100;
  let y = Math.round(play.base[0] + (play.base[1] - play.base[0]) * t + (Math.random() * 4 - 2));
  y = Math.max(play.pass ? 0 : -1, y);
  return { yards: y, label: play.pass ? 'Completed for a pickup' : 'Picks up tough yards', type: 'GAIN' };
}

// side: 'you' drives toward ballOn=100, 'opp' drives toward ballOn=0
function applyDrive(side, ballOn, down, toGo, yards) {
  const dir = side === 'you' ? 1 : -1;
  const nb = clamp(0, 100, ballOn + dir * yards);
  const reachedGoal = side === 'you' ? nb >= 100 : nb <= 0;
  if (reachedGoal) return { ballOn: side === 'you' ? 100 : 0, down: 1, toGo: 10, td: true, firstDown: false, turnover: false };
  const distToGoal = side === 'you' ? 100 - nb : nb;
  const tg = toGo - yards;
  if (tg <= 0) return { ballOn: nb, down: 1, toGo: Math.min(10, distToGoal), td: false, firstDown: true, turnover: false };
  const nd = down + 1;
  if (nd > 4) return { ballOn: nb, down: nd, toGo: tg, td: false, firstDown: false, turnover: true };
  return { ballOn: nb, down: nd, toGo: tg, td: false, firstDown: false, turnover: false };
}

// ---------- your turn ----------
function start() { setState({ phase: 'playcall' }); }

function pickPlay(id) { setState({ playId: id }); }

function hike() {
  if (!state.playId) return;
  _id = 1;
  const grid = buildGrid(), meters = {};
  currentPlay().personnel.forEach((k) => { meters[k] = 0; });
  setState({ phase: 'board', grid, meters, movesLeft: MOVES, selected: null, busy: false, result: null });
}

function onCellTap(r, c) {
  if (state.busy || state.phase !== 'board') return;
  const cell = state.grid[r] && state.grid[r][c];
  if (cell && cell.blank) return;
  const s = state.selected;
  if (!s) { setState({ selected: { r, c } }); return; }
  if (s.r === r && s.c === c) { setState({ selected: null }); return; }
  if (Math.abs(s.r - r) + Math.abs(s.c - c) === 1) trySwap(s, { r, c });
  else setState({ selected: { r, c } });
}

// Swipe a gem directly into a neighbor in the dragged direction, skipping
// the tap-to-select step.
function onCellSwipe(r, c, dx, dy) {
  if (state.busy || state.phase !== 'board') return;
  const cell = state.grid[r] && state.grid[r][c];
  if (cell && cell.blank) return;
  const r2 = r + (Math.abs(dy) > Math.abs(dx) ? Math.sign(dy) : 0);
  const c2 = c + (Math.abs(dy) > Math.abs(dx) ? 0 : Math.sign(dx));
  if (r2 < 0 || r2 >= state.grid.length || c2 < 0 || c2 >= state.grid[0].length) return;
  const target = state.grid[r2][c2];
  if (target && target.blank) return;
  if (state.selected) setState({ selected: null });
  trySwap({ r, c }, { r: r2, c: c2 });
}

async function trySwap(a, b) {
  const grid = state.grid, g = grid.map((row) => row.map((x) => (x ? { ...x } : null)));
  const t = g[a.r][a.c]; g[a.r][a.c] = g[b.r][b.c]; g[b.r][b.c] = t;
  // post-swap: the gem that was at `a` now sits at `b`, and vice versa.
  const atB = g[b.r][b.c], atA = g[a.r][a.c];
  // Swapping a special piece always activates it — combining two specials
  // in one swap is out of scope, so the moved-from piece (atB) wins ties.
  const activated = atB.special ? { gem: atB, pos: b, targetColor: atA.color }
    : atA.special ? { gem: atA, pos: a, targetColor: atB.color }
      : null;
  setState({ grid: g, selected: null, busy: true });
  await sleep(450);
  if (activated) {
    setState({ movesLeft: state.movesLeft - 1 });
    await activateSpecial(g, activated.gem, activated.pos, activated.targetColor);
    return;
  }
  if (!findMatches(g, b)) {
    const g2 = g.map((row) => row.map((x) => (x ? { ...x } : null)));
    const t2 = g2[a.r][a.c]; g2[a.r][a.c] = g2[b.r][b.c]; g2[b.r][b.c] = t2;
    setState({ grid: g2 });
    await sleep(450);
    setState({ busy: false });
    return;
  }
  setState({ movesLeft: state.movesLeft - 1 });
  await resolveCascade(g, state.meters, 1, b);
}

// A special piece activating is a swap-triggered effect, not a match — it
// dumps its targeted cells through the same fill-and-clear path so meters
// still see it as a clear, then hands off to resolveCascade so any matches
// the gravity settle produces (including new specials) keep chaining.
// If the blast reaches another special piece, that piece detonates too —
// its own cells fold into the blast, and so on transitively — rather than
// the second piece just disappearing like a plain gem.
function addBlastCells(cells, grid, special, r, c, color) {
  const R = grid.length, C = grid[0].length;
  cells.add(cellKey(r, c));
  if (special === 'lineH') { for (let cc = 0; cc < C; cc++) cells.add(cellKey(r, cc)); }
  else if (special === 'lineV') { for (let rr = 0; rr < R; rr++) cells.add(cellKey(rr, c)); }
  else if (special === 'bomb') {
    for (let dr = -1; dr <= 1; dr++) for (let dc = -1; dc <= 1; dc++) {
      const rr = r + dr, cc = c + dc;
      if (rr >= 0 && rr < R && cc >= 0 && cc < C) cells.add(cellKey(rr, cc));
    }
  } else if (special === 'colorbomb') {
    for (let rr = 0; rr < R; rr++) for (let cc = 0; cc < C; cc++) {
      if (grid[rr][cc] && grid[rr][cc].color === color) cells.add(cellKey(rr, cc));
    }
  }
}

// Walks a chain of detonations starting from one special piece, expanding
// `cells` with the blast of any other special piece it catches along the
// way. A chained colorbomb has no swap partner to target, so it clears its
// own stored color instead.
function chainSpecialBlasts(grid, special, pos, targetColor) {
  const cells = new Set();
  const queued = new Set([cellKey(pos.r, pos.c)]);
  const queue = [{ special, r: pos.r, c: pos.c, color: targetColor }];
  while (queue.length) {
    const cur = queue.shift();
    addBlastCells(cells, grid, cur.special, cur.r, cur.c, cur.color);
    cells.forEach((key) => {
      if (queued.has(key)) return;
      queued.add(key);
      const [r, c] = key.split(',').map(Number);
      const x = grid[r][c];
      if (x && x.special) queue.push({ special: x.special, r, c, color: x.color });
    });
  }
  return cells;
}

async function activateSpecial(grid, gem, pos, targetColor) {
  const cells = chainSpecialBlasts(grid, gem.special, pos, targetColor);
  const g2 = grid.map((row) => row.map((x) => (x ? { ...x } : null)));
  const nm = { ...state.meters };
  cells.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const x = g2[r][c];
    if (x) {
      x.clearing = true;
      if (x.color !== NEUTRAL) { nm[x.color] = Math.min(100, (nm[x.color] || 0) + FILL); x.flyTo = x.color; }
    }
  });
  setState({ grid: g2, meters: nm });
  await sleep(440);
  const g3 = grid.map((row) => row.map((x) => (x ? { ...x } : null)));
  cells.forEach((key) => { const [r, c] = key.split(',').map(Number); g3[r][c] = null; });
  const g4 = gravity(g3);
  setState({ grid: g4 });
  await sleep(450);
  await resolveCascade(g4, nm, 1);
}

async function resolveCascade(grid, meters, combo, anchorHint) {
  const m = findMatches(grid, anchorHint);
  if (!m) { setState({ grid, meters, busy: false }); afterMove(); return; }
  const R = grid.length, C = grid[0].length;
  const g2 = grid.map((row) => row.map((x) => (x ? { ...x } : null)));
  const nm = { ...meters };
  const blanksToClear = [];
  m.matched.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const becoming = m.specials.get(key);
    const x = g2[r][c];
    if (becoming) {
      // Converts into a special piece instead of clearing — it still
      // represents its position's color, just doesn't fill that meter yet.
      if (x) { x.special = becoming.type; x.color = becoming.color; }
      return;
    }
    if (x) {
      x.clearing = true;
      if (x.color !== NEUTRAL) { nm[x.color] = Math.min(100, (nm[x.color] || 0) + FILL * combo); x.flyTo = x.color; }
    }
    [[r - 1, c], [r + 1, c], [r, c - 1], [r, c + 1]].forEach(([nr, nc]) => {
      if (nr < 0 || nc < 0 || nr >= R || nc >= C) return;
      const nkey = nr + ',' + nc;
      if (m.matched.has(nkey)) return;
      const ng = g2[nr][nc];
      if (ng && ng.blank && !ng.clearing) { ng.clearing = true; blanksToClear.push([nr, nc]); }
    });
  });
  setState({ grid: g2, meters: nm });
  await sleep(440);
  const g3 = grid.map((row) => row.map((x) => (x ? { ...x } : null)));
  m.matched.forEach((key) => {
    const [r, c] = key.split(',').map(Number);
    const becoming = m.specials.get(key);
    if (becoming) { g3[r][c] = { ...g3[r][c], special: becoming.type, color: becoming.color }; return; }
    g3[r][c] = null;
  });
  blanksToClear.forEach(([r, c]) => { g3[r][c] = null; });
  const g4 = gravity(g3);
  setState({ grid: g4 });
  await sleep(450);
  await resolveCascade(g4, nm, Math.min(3, combo + 0.5));
}

function afterMove() {
  if (state.movesLeft <= 0 && state.phase === 'board') setTimeout(() => snap(), 450);
}

function snap() {
  if (state.phase !== 'board') return;
  const play = currentPlay(), f = leadPlayer(), F = state.meters[f] || 0;
  tickRoster(f);
  const res = computeResult(play, F, state.meters.OL || 0, state.forcedExplosive);
  const app = applyDrive('you', state.ballOn, state.down, state.toGo, res.yards);
  const headline = app.td ? 'TOUCHDOWN!' : app.turnover ? 'TURNOVER ON DOWNS' : app.firstDown ? 'FIRST DOWN!' : ordinal(app.down) + ' & ' + (app.toGo <= 0 ? 'GOAL' : app.toGo);
  const score = app.td ? state.score + 7 : state.score;
  let momentum = state.momentum;
  if (res.type === 'BIG') momentum = Math.min(100, momentum + 25);
  if (app.firstDown) momentum = Math.min(100, momentum + 15);
  if (app.td || app.turnover) momentum = 0;
  setState({
    phase: 'result', ballOn: app.ballOn, down: app.down, toGo: app.toGo, score, shownYards: 0,
    momentum, forcedExplosive: false,
    result: { label: res.label, type: res.type, headline, td: app.td, turnover: app.turnover, yards: res.yards, meterPct: Math.round(F), featured: f },
  });
  animateYards(res.yards);
}

// Cash in a full momentum meter before the next snap — forces that play's
// outcome roll straight to the explosive tier. Drive-level, player's choice.
function cashMomentum() {
  if (state.momentum < 100 || state.phase !== 'playcall') return;
  setState({ momentum: 0, forcedExplosive: true });
}

let _yt = null;
function animateYards(t) {
  clearInterval(_yt);
  if (t === 0) { setState({ shownYards: 0 }); return; }
  let cur = 0; const step = t > 0 ? 1 : -1;
  _yt = setInterval(() => {
    cur += step; setState({ shownYards: cur });
    if (cur === t) clearInterval(_yt);
  }, 50);
}

function continueAfterResult() {
  const r = state.result;
  if (r.td) {
    // kickoff to the defense, ball at their own 25 (absolute ballOn = 75)
    startOppDrive(75);
  } else if (r.turnover) {
    startOppDrive(state.ballOn);
  } else {
    setState({ phase: 'playcall', playId: null, result: null });
  }
}

// ---------- defense / opponent drive ----------
function startOppDrive(spotAbsolute) {
  setState({
    phase: 'oppdrive', possession: 'opp', result: null,
    oppBallOn: spotAbsolute, oppDown: 1, oppToGo: Math.min(10, spotAbsolute), oppLog: [],
  });
  setTimeout(runOppPlay, 700);
}

async function runOppPlay() {
  if (state.phase !== 'oppdrive') return;
  const distToGoal = state.oppBallOn;
  const goingForIt = !(state.oppDown === 4 && state.oppToGo > 2 && distToGoal > 50);

  if (!goingForIt) {
    const puntDistance = 35 + Math.floor(Math.random() * 11);
    const newBallOn = clamp(10, 90, state.oppBallOn - puntDistance);
    const log = [...state.oppLog, `4TH & ${state.oppToGo} — OPP PUNTS`];
    setState({ oppLog: log });
    await sleep(900);
    setState({
      phase: 'playcall', possession: 'you', playId: null,
      ballOn: newBallOn, down: 1, toGo: Math.min(10, 100 - newBallOn), drive: state.drive + 1,
    });
    return;
  }

  const play = PLAYS[Math.floor(Math.random() * PLAYS.length)];
  const F = 30 + Math.random() * 60;
  const olMeter = 20 + Math.random() * 60;
  const res = computeResult(play, F, olMeter);
  const app = applyDrive('opp', state.oppBallOn, state.oppDown, state.oppToGo, res.yards);

  const signed = (res.yards > 0 ? '+' : '') + res.yards;
  let logLine = `${play.name}: ${signed} yd — ${res.label}`;
  const log = [...state.oppLog, logLine];
  setState({ oppLog: log });
  await sleep(850);

  if (app.td) {
    setState({ oppLog: [...log, 'OPPONENT TOUCHDOWN!'], oppScore: state.oppScore + 7 });
    await sleep(1100);
    setState({ phase: 'playcall', possession: 'you', playId: null, ballOn: 25, down: 1, toGo: 10, drive: state.drive + 1 });
    return;
  }
  if (app.turnover) {
    setState({ oppLog: [...log, 'TURNOVER ON DOWNS'] });
    await sleep(1000);
    setState({ phase: 'playcall', possession: 'you', playId: null, ballOn: app.ballOn, down: 1, toGo: Math.min(10, 100 - app.ballOn), drive: state.drive + 1 });
    return;
  }
  setState({ oppBallOn: app.ballOn, oppDown: app.down, oppToGo: app.toGo });
  setTimeout(runOppPlay, 600);
}

// ---------- save / resume ----------
function newGame() {
  clearSave();
  _id = 1;
  state = freshState();
  setState({ phase: 'playcall' });
}

function resumeGame() {
  const saved = loadSave();
  if (!saved) { newGame(); return; }
  state = saved;
  if (state.momentum == null) state.momentum = 0;
  if (state.forcedExplosive == null) state.forcedExplosive = false;
  // never resume mid-animation or mid-opponent-drive cleanly — drop back to a stable screen
  if (state.busy) state.busy = false;
  if (state.phase === 'oppdrive') {
    state.phase = 'playcall'; state.possession = 'you'; state.playId = null;
  }
  state.showMatchup = false;
  render();
}

// ---------- render helpers ----------
function esc(s) { return String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;'); }
function styleStr(o) {
  return Object.entries(o).map(([k, v]) => `${k.replace(/[A-Z]/g, (m) => '-' + m.toLowerCase())}:${v}`).join(';');
}

// A gem's color is either a personnel position or the neutral filler — this
// is the one place that distinction collapses back into "what does it look
// like and what's its label."
function gemVisual(color) { return color === NEUTRAL ? NEUTRAL_GEM : POS[color]; }

function renderTitle() {
  const gemColors = ['#7b5cff', '#2fd45e', '#21c7ff', '#ffd23f'];
  const gems = gemColors.map((c) => `<div style="width:38px;height:38px;background:${c};border:3px solid rgba(0,0,0,.5);border-radius:8px;box-shadow:inset 3px 3px 0 rgba(255,255,255,.45),inset -4px -4px 0 rgba(0,0,0,.3);"></div>`).join('');
  const continueBtn = hasSave
    ? `<div data-action="resumeGame" style="margin-top:6px;font-family:'Press Start 2P',monospace;font-size:13px;color:#13210f;background:#ffd23f;border:3px solid #04060e;border-radius:8px;padding:13px 20px;box-shadow:0 5px 0 #b58a0c;cursor:pointer;letter-spacing:1px;">CONTINUE</div>
       <div data-action="newGame" style="margin-top:10px;font-size:18px;color:#8fb4ff;cursor:pointer;text-decoration:underline;">Start a new game</div>`
    : `<div data-action="newGame" style="margin-top:18px;font-family:'Press Start 2P',monospace;font-size:13px;color:#fff;animation:blink 1.1s steps(1) infinite;cursor:pointer;">PRESS START</div>`;
  return `
    <div data-screen-label="Title" data-action="${hasSave ? '' : 'newGame'}" style="position:absolute;inset:0;display:flex;flex-direction:column;align-items:center;justify-content:center;gap:26px;cursor:pointer;background:radial-gradient(circle at 50% 32%,#16285a 0%,#0a1020 70%);padding:30px;">
      <div style="display:flex;gap:9px;animation:floaty 3s ease-in-out infinite;">${gems}</div>
      <div style="text-align:center;">
        <div class="pixel" style="font-size:34px;line-height:1.18;color:#ffd23f;text-shadow:4px 4px 0 #b1471a,7px 7px 0 rgba(0,0,0,.45);letter-spacing:1px;">GRIDIRON<br>GEMS</div>
      </div>
      <div style="font-size:24px;color:#8fb4ff;letter-spacing:3px;text-transform:uppercase;">Match-3 Football RPG</div>
      ${continueBtn}
      <div style="position:absolute;bottom:24px;font-size:18px;color:#5870a8;letter-spacing:1px;">${hasSave ? 'SAVED GAME FOUND' : 'TAP ANYWHERE TO BEGIN'}</div>
    </div>`;
}

function fieldBar(S) {
  const fdPct = Math.min(100, S.ballOn + S.toGo);
  const fdLine = styleStr({ position: 'absolute', top: '-2px', bottom: '-2px', left: fdPct + '%', width: '3px', background: '#ffd23f', boxShadow: '0 0 6px #ffd23f', transition: 'left .5s', zIndex: 3 });
  const ballMark = styleStr({ position: 'absolute', top: '50%', left: S.ballOn + '%', transform: 'translate(-50%,-50%)', width: '15px', height: '10px', background: '#c47b40', border: '2px solid #f2ddc6', borderRadius: '50%', transition: 'left .6s cubic-bezier(.3,.7,.3,1)', zIndex: 4 });
  return `<div style="position:relative;height:32px;border:3px solid #04060e;border-radius:6px;overflow:hidden;background:#16341f;box-shadow:inset 0 0 0 2px #1f4a2c;">
    <div style="position:absolute;inset:0;background:repeating-linear-gradient(90deg,transparent 0 9.9%,rgba(255,255,255,.13) 9.9% calc(9.9% + 2px));"></div>
    <div style="position:absolute;top:0;right:0;bottom:0;width:8%;background:rgba(47,212,94,.32);border-left:2px solid #2fd45e;"></div>
    <div style="${fdLine}"></div>
    <div style="${ballMark}"></div>
  </div>`;
}

// Drive-level momentum meter HUD — visually distinct from the per-position
// meter rows (fire accent, its own panel) so it doesn't read as an 8th
// position. `withCash` shows the cash-in button when full (play-call only);
// the board screen instead shows an "armed" badge once spent.
function momentumBar(S, withCash) {
  const pct = Math.round(S.momentum);
  const full = pct >= 100;
  const fillStyle = styleStr({ height: '100%', width: pct + '%', background: 'linear-gradient(90deg,#ff8a2b,#ff4d4d)', boxShadow: full ? '0 0 10px #ff8a2b' : 'none', transition: 'width .3s' });
  const cashBtn = (withCash && full)
    ? `<div data-action="cashMomentum" style="margin-top:7px;text-align:center;font-family:'Press Start 2P',monospace;font-size:11px;color:#13210f;background:linear-gradient(90deg,#ff8a2b,#ffd23f);border:3px solid #04060e;border-radius:7px;padding:9px;cursor:pointer;letter-spacing:1px;box-shadow:0 4px 0 #b1471a;animation:floaty 1.6s ease-in-out infinite;">🔥 CASH IN MOMENTUM</div>`
    : '';
  const armedBadge = S.forcedExplosive
    ? `<div class="pixel" style="margin-top:6px;text-align:center;font-size:9px;color:#ff8a2b;letter-spacing:1px;">🔥 EXPLOSIVE LOCKED IN FOR THIS PLAY</div>`
    : '';
  return `<div style="padding:9px 11px;border-radius:8px;border:3px solid ${full ? '#ff8a2b' : '#3a2c1f'};background:#160f0c;margin-top:8px;">
    <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:5px;">
      <div class="pixel" style="font-size:9px;color:#ff8a2b;letter-spacing:1px;">⚡ MOMENTUM</div>
      <div class="pixel" style="font-size:10px;color:${full ? '#ffd23f' : '#a87a55'};">${pct}%</div>
    </div>
    <div style="position:relative;height:12px;border:2px solid #04060e;border-radius:4px;overflow:hidden;background:#0c1226;">
      <div style="${fillStyle}"></div>
    </div>
    ${cashBtn}${armedBadge}
  </div>`;
}

function renderPlaycall() {
  const S = state, cp = currentPlay();
  const spot = S.ballOn > 50 ? ('OPP ' + (100 - S.ballOn)) : ('OWN ' + S.ballOn);
  const downDist = ordinal(S.down) + ' & ' + (S.toGo <= 0 ? 'GOAL' : S.toGo);

  const playCards = PLAYS.map((p) => {
    const sel = S.playId === p.id, isRun = p.type === 'RUN';
    const cardStyle = styleStr({ padding: '11px 12px', borderRadius: '9px', cursor: 'pointer', border: '3px solid ' + (sel ? '#ffd23f' : '#27365c'), background: sel ? '#1b2748' : '#121a32', boxShadow: sel ? '0 0 0 3px rgba(255,210,63,.25),4px 4px 0 rgba(0,0,0,.45)' : '3px 3px 0 rgba(0,0,0,.4)', transform: sel ? 'translateY(-2px)' : 'none', transition: 'all .12s' });
    const badgeStyle = styleStr({ fontFamily: "'Press Start 2P',monospace", fontSize: '8px', padding: '4px 6px', borderRadius: '4px', color: '#0a0e1f', background: isRun ? '#2fd45e' : '#21c7ff' });
    const chips = p.personnel.map((k) => `<div style="width:26px;height:22px;display:flex;align-items:center;justify-content:center;font-family:'Press Start 2P',monospace;font-size:8px;color:#fff;background:${POS[k].color};border:2px solid rgba(0,0,0,.4);border-radius:4px;text-shadow:1px 1px 0 rgba(0,0,0,.5);">${POS[k].name}</div>`).join('');
    return `<div data-action="pickPlay" data-id="${p.id}" style="${cardStyle}">
      <div style="display:flex;align-items:center;justify-content:space-between;gap:8px;">
        <div class="pixel" style="font-size:11px;color:#fff;">${p.name}</div>
        <div style="${badgeStyle}">${p.type}</div>
      </div>
      <div style="font-size:18px;color:#9fb3dd;line-height:1.15;margin-top:4px;">${p.desc}</div>
      <div style="display:flex;gap:5px;margin-top:10px;">${chips}</div>
    </div>`;
  }).join('');

  let personnelSection = '';
  if (cp) {
    const chips2 = cp.personnel.map((k) => {
      const prom = cp.prom[k] || 1;
      const isOL = k === 'OL';
      const tag = isOL ? 'BLOCKS' : prom >= 2.5 ? 'PRIMARY' : prom >= 1.4 ? 'SUPPORT' : 'DECOY';
      const chipStyle = styleStr({ display: 'flex', alignItems: 'center', gap: '10px', padding: '9px 11px', borderRadius: '9px', border: '3px solid #27365c', background: '#121a32' });
      const swatchStyle = styleStr({ width: '40px', height: '40px', flex: '0 0 40px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: '11px', color: '#fff', background: POS[k].color, border: '3px solid rgba(0,0,0,.45)', borderRadius: '7px', textShadow: '1px 1px 0 rgba(0,0,0,.5)', boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.4),inset -3px -3px 0 rgba(0,0,0,.3)' });
      const tagStyle = styleStr({ fontFamily: "'Press Start 2P',monospace", fontSize: '7px', padding: '4px 6px', borderRadius: '4px', color: isOL ? '#13210f' : '#8fb4ff', background: isOL ? '#ffd23f' : '#1c2848' });
      const stars = '★'.repeat(activeSkill(k)) + '☆'.repeat(5 - activeSkill(k));
      const stamina = activeStamina(k);
      const staminaColor = stamina >= 60 ? '#2fd45e' : stamina >= 25 ? '#ffd23f' : '#ff4d4d';
      const staminaBarOuter = styleStr({ width: '100%', height: '5px', borderRadius: '3px', background: '#04060e', overflow: 'hidden', marginTop: '5px' });
      const staminaBarInner = styleStr({ width: stamina + '%', height: '100%', background: staminaColor });
      return `<div style="${chipStyle}">
        <div style="${swatchStyle}">${POS[k].name}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:20px;color:#fff;line-height:1;">${POS[k].full}</div>
          <div style="font-size:13px;color:#9fb3dd;margin-top:1px;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(activeRosterEntry(k).name)}</div>
          <div style="font-size:15px;color:#ffd23f;letter-spacing:1px;margin-top:2px;">${stars}</div>
          <div style="${staminaBarOuter}"><div style="${staminaBarInner}"></div></div>
        </div>
        <div style="${tagStyle}">${tag}</div>
      </div>`;
    }).join('');
    personnelSection = `
      <div class="pixel" style="font-size:10px;color:#ffd23f;margin:18px 0 4px;">2 ▸ ON THE FIELD</div>
      <div style="font-size:17px;color:#7f97cf;margin-bottom:10px;">Whoever you match the most fills their meter fastest — and gets the ball at the snap. The O-line just blocks; it's never the one carrying.</div>
      <div style="display:flex;flex-direction:column;gap:8px;">${chips2}</div>`;
  }

  const canHike = !!cp;
  const hikeLabel = canHike ? '▸ HIKE THE BALL' : 'PICK A PLAY';
  const hikeBtnStyle = styleStr({ textAlign: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: '13px', padding: '14px', borderRadius: '9px', border: '3px solid #04060e', letterSpacing: '1px', cursor: canHike ? 'pointer' : 'not-allowed', color: canHike ? '#13210f' : '#5870a8', background: canHike ? '#ffd23f' : '#141d36', boxShadow: canHike ? '0 5px 0 #b58a0c' : 'none' });

  return `<div data-screen-label="Play Call" class="screen">
    <div style="display:flex;align-items:center;justify-content:space-between;padding:12px 14px 8px;border-bottom:3px solid #04060e;background:#0b1228;">
      <div class="pixel" style="font-size:10px;color:#6f86c4;">DRIVE ${S.drive}</div>
      <div style="display:flex;align-items:center;gap:6px;">
        <div data-action="openMatchup" style="font-family:'Press Start 2P',monospace;font-size:9px;color:#13210f;background:#21c7ff;border:2px solid #04060e;border-radius:6px;padding:6px 9px;cursor:pointer;letter-spacing:.5px;">📋 MATCHUP</div>
        <div data-action="openRoster" style="font-family:'Press Start 2P',monospace;font-size:9px;color:#0a0e1f;background:#2fd45e;border:2px solid #04060e;border-radius:6px;padding:6px 9px;cursor:pointer;letter-spacing:.5px;">🏈 ROSTER</div>
      </div>
      <div class="pixel" style="font-size:10px;color:#ffd23f;">YOU ${S.score} &nbsp;·&nbsp; OPP ${S.oppScore}</div>
    </div>
    <div style="padding:12px 14px 10px;background:#0b1228;border-bottom:3px solid #04060e;">
      ${fieldBar(S)}
      <div style="display:flex;align-items:center;justify-content:center;gap:10px;margin-top:8px;">
        <div class="pixel" style="font-size:13px;color:#fff;">${downDist}</div>
        <div style="font-size:19px;color:#7f97cf;letter-spacing:1px;">BALL ON ${spot}</div>
      </div>
      ${momentumBar(S, true)}
    </div>
    <div style="flex:1;min-height:0;overflow-y:auto;padding:12px 14px 120px;">
      <div class="pixel" style="font-size:10px;color:#ffd23f;margin:2px 0 10px;">1 ▸ CHOOSE YOUR PLAY</div>
      <div style="display:flex;flex-direction:column;gap:9px;">${playCards}</div>
      ${personnelSection}
    </div>
    <div style="position:absolute;left:0;right:0;bottom:0;padding:14px;background:linear-gradient(transparent,#0a0e1f 26%);">
      <div data-action="${canHike ? 'hike' : ''}" style="${hikeBtnStyle}">${hikeLabel}</div>
    </div>
    ${S.showMatchup ? renderMatchupModal() : ''}
    ${S.showRoster ? renderRosterModal() : ''}
  </div>`;
}

const MODAL_CLOSE_BTN_STYLE = styleStr({ position: 'absolute', top: '10px', right: '10px', width: '30px', height: '30px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: '14px', color: '#13210f', background: '#ffd23f', border: '3px solid #04060e', borderRadius: '8px', boxShadow: '0 3px 0 #b58a0c', cursor: 'pointer', zIndex: '5' });

function renderRosterModal() {
  const sections = Object.keys(POS).map((k) => {
    const p = POS[k];
    const rows = ROSTER[k].map((entry, i) => {
      const active = state.roster[k].active === i;
      const stamina = state.roster[k].stamina[i];
      const stars = '★'.repeat(entry.skill) + '☆'.repeat(5 - entry.skill);
      const barColor = stamina >= 60 ? '#2fd45e' : stamina >= 25 ? '#ffd23f' : '#ff4d4d';
      const rowStyle = styleStr({ display: 'flex', alignItems: 'center', gap: '9px', padding: '8px 9px', borderRadius: '7px', border: '2px solid ' + (active ? '#ffd23f' : '#27365c'), background: active ? '#1b2748' : '#121a32', marginTop: '6px', cursor: 'pointer' });
      const barOuter = styleStr({ flex: '1', height: '8px', borderRadius: '4px', background: '#04060e', overflow: 'hidden' });
      const barInner = styleStr({ width: stamina + '%', height: '100%', background: barColor });
      return `<div data-action="swapRoster" data-pos="${k}" data-idx="${i}" style="${rowStyle}">
        <div style="flex:0 0 16px;text-align:center;font-family:'Press Start 2P',monospace;font-size:9px;color:${active ? '#ffd23f' : '#5870a8'};">${active ? '▶' : ''}</div>
        <div style="flex:1;min-width:0;">
          <div style="font-size:15px;color:#fff;white-space:nowrap;overflow:hidden;text-overflow:ellipsis;">${esc(entry.name)}</div>
          <div style="font-size:12px;color:#ffd23f;letter-spacing:1px;">${stars}</div>
        </div>
        <div style="flex:0 0 70px;">
          <div style="${barOuter}"><div style="${barInner}"></div></div>
          <div style="font-size:10px;color:#7f97cf;text-align:right;margin-top:2px;">${Math.round(stamina)}</div>
        </div>
      </div>`;
    }).join('');
    const swatchStyle = styleStr({ width: '28px', height: '28px', flex: '0 0 28px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: '8px', color: '#fff', background: p.color, border: '2px solid rgba(0,0,0,.45)', borderRadius: '6px', textShadow: '1px 1px 0 rgba(0,0,0,.5)' });
    return `<div style="margin-bottom:14px;">
      <div style="display:flex;align-items:center;gap:8px;">
        <div style="${swatchStyle}">${p.name}</div>
        <div style="font-size:17px;color:#fff;">${p.full}</div>
      </div>
      ${rows}
    </div>`;
  }).join('');

  return `<div data-screen-label="Roster" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,8,18,.86);padding:20px;z-index:20;">
    <div style="position:relative;display:flex;flex-direction:column;width:100%;max-width:340px;max-height:86%;border-radius:14px;border:4px solid #2fd45e;background:#0b1228;box-shadow:0 0 0 4px #04060e,0 14px 40px rgba(0,0,0,.6);animation:popIn .3s ease-out;">
      <div data-action="closeRoster" style="${MODAL_CLOSE_BTN_STYLE}">✕</div>
      <div style="min-height:0;overflow-y:auto;padding:18px 16px;">
        <div class="pixel" style="font-size:14px;color:#2fd45e;margin-bottom:4px;padding-right:34px;">ROSTER</div>
        <div style="font-size:16px;color:#7f97cf;margin-bottom:10px;">Tap a player to swap them in. Benched players recover stamina; active players don't.</div>
        ${sections}
      </div>
    </div>
  </div>`;
}

function renderMatchupModal() {
  const cp = currentPlay();
  const offense = offenseShare(), defense = defenseImpact();
  const rows = offense.map((o) => {
    const d = defense.find((x) => x.key === o.key), p = POS[o.key], df = d.def;
    const offStars = '★'.repeat(activeSkill(o.key)) + '☆'.repeat(5 - activeSkill(o.key));
    const defStars = '★'.repeat(df.skill) + '☆'.repeat(5 - df.skill);
    const rowStyle = styleStr({ padding: '10px 11px', borderRadius: '8px', border: '3px solid #27365c', background: '#121a32', marginBottom: '8px' });
    const swatchStyle = styleStr({ width: '32px', height: '32px', flex: '0 0 32px', display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: "'Press Start 2P',monospace", fontSize: '9px', color: '#fff', background: p.color, border: '2px solid rgba(0,0,0,.45)', borderRadius: '6px', textShadow: '1px 1px 0 rgba(0,0,0,.5)' });
    return `<div style="${rowStyle}">
      <div style="display:flex;align-items:center;gap:9px;">
        <div style="${swatchStyle}">${p.name}</div>
        <div style="flex:1;">
          <div style="font-size:18px;color:#fff;">${p.full}</div>
          <div style="font-size:14px;color:#ffd23f;letter-spacing:1px;">${offStars}</div>
        </div>
        <div class="pixel" style="font-size:12px;color:#2fd45e;">${o.pct}% GEMS</div>
      </div>
      <div style="display:flex;align-items:center;gap:9px;margin-top:7px;padding-top:7px;border-top:1px dashed #27365c;">
        <div style="font-size:15px;color:#7f97cf;">vs ${df.full} (${df.name})</div>
        <div style="font-size:14px;color:#ff8a2b;letter-spacing:1px;">${defStars}</div>
        <div style="flex:1;"></div>
        <div class="pixel" style="font-size:12px;color:#ff4d4d;">${d.blankPct}% BLANK</div>
      </div>
    </div>`;
  }).join('');

  return `<div data-screen-label="Matchup" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,8,18,.86);padding:20px;z-index:20;">
    <div style="position:relative;display:flex;flex-direction:column;width:100%;max-width:340px;max-height:86%;border-radius:14px;border:4px solid #21c7ff;background:#0b1228;box-shadow:0 0 0 4px #04060e,0 14px 40px rgba(0,0,0,.6);animation:popIn .3s ease-out;">
      <div data-action="closeMatchup" style="${MODAL_CLOSE_BTN_STYLE}">✕</div>
      <div style="min-height:0;overflow-y:auto;padding:18px 16px;">
        <div class="pixel" style="font-size:14px;color:#21c7ff;margin-bottom:4px;padding-right:34px;">MATCHUP REPORT</div>
        <div style="font-size:16px;color:#7f97cf;margin-bottom:14px;">${cp ? cp.name + ' personnel' : 'Pick a play to scout its personnel'}</div>
        ${rows}
        <div style="font-size:13px;color:#5870a8;margin:10px 0 4px;line-height:1.4;">Gem % is each player's static share of the board, from skill and how the chosen play features them. Blank % is how often the defender they're matched against locks one of their gems.</div>
      </div>
    </div>
  </div>`;
}

function gemOuterStyleObj(r, c, sel, blank) {
  return { position: 'absolute', width: 'var(--cell)', height: 'var(--cell)', transform: `translate(calc(var(--cell) * ${c}), calc(var(--cell) * ${r}))`, transition: 'transform .44s cubic-bezier(.2,.8,.3,1)', padding: '4px', zIndex: sel ? 6 : 1, cursor: blank ? 'not-allowed' : 'pointer', touchAction: 'none' };
}

const SPECIAL_ICON = { lineH: '↔', lineV: '↕', bomb: '\u{1F4A3}', colorbomb: '★' };

// Specials get a distinctly chunkier, "charged" look (thicker glowing
// border, a slow ambient pulse) at the same pace as the rest of the board's
// motion — no faster animation tier, just a different idle state.
function gemInnerStyleObj(color, sel, anim, blank, special) {
  let bg = color;
  if (blank) bg = `repeating-linear-gradient(45deg, ${color}55 0 6px, #10182f 6px 12px)`;
  else if (special === 'colorbomb') bg = 'conic-gradient(from 0deg, #ff4d4d, #ffd23f, #2fd45e, #21c7ff, #7b5cff, #ff4d4d)';
  else if (special === 'bomb') bg = `radial-gradient(circle at 50% 40%, ${color}, #10182f 130%)`;
  else if (special === 'lineH') bg = `linear-gradient(90deg, ${color} 0 30%, #fff8 30% 36%, ${color} 36% 64%, #fff8 64% 70%, ${color} 70%)`;
  else if (special === 'lineV') bg = `linear-gradient(180deg, ${color} 0 30%, #fff8 30% 36%, ${color} 36% 64%, #fff8 64% 70%, ${color} 70%)`;
  const border = special ? '4px solid #ffd23f' : '3px solid rgba(0,0,0,.5)';
  const specialAnim = special && anim === 'none' ? 'specialPulse 1.8s ease-in-out infinite' : anim;
  return { width: '100%', height: '100%', background: bg, border, borderRadius: '8px', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#fff', fontFamily: "'Press Start 2P',monospace", fontSize: special ? 'clamp(11px, calc(var(--cell) * .34), 17px)' : 'clamp(8px, calc(var(--cell) * .22), 11px)', textShadow: '1px 1px 0 rgba(0,0,0,.55)', opacity: blank ? .75 : 1, boxShadow: (sel ? '0 0 0 3px #fff,' : '') + 'inset 3px 3px 0 rgba(255,255,255,.45),inset -4px -4px 0 rgba(0,0,0,.32)', transform: sel ? 'scale(1.05)' : 'scale(1)', transition: 'transform .1s', animation: specialAnim };
}

// Every meter's border stays tinted in its position's color (matching that
// position's gems on the board) so the gem-to-meter link reads at a glance;
// the leading position's meter additionally thickens and glows to mark who's
// currently favored to carry the ball.
function rosterOuterStyleObj(color, sel) {
  return {
    position: 'relative', width: '100%', height: '34px', borderRadius: '4px', overflow: 'hidden',
    background: '#10182f', display: 'flex', alignItems: 'flex-end',
    border: (sel ? '3px solid ' : '2px solid ') + color,
    '--glow-color': color,
    animation: sel ? 'leaderGlow 1.4s ease-in-out infinite' : 'none',
  };
}

function renderBoard() {
  const S = state, cp = currentPlay();
  const spot = S.ballOn > 50 ? ('OPP ' + (100 - S.ballOn)) : ('OWN ' + S.ballOn);
  const downDist = ordinal(S.down) + ' & ' + (S.toGo <= 0 ? 'GOAL' : S.toGo);
  const boardW = 'calc(var(--cell) * ' + COLS + ')';

  const gems = [];
  for (let r = 0; r < S.grid.length; r++) {
    for (let c = 0; c < (S.grid[r] || []).length; c++) {
      const g = S.grid[r][c];
      if (!g) continue;
      const p = gemVisual(g.color), sel = S.selected && S.selected.r === r && S.selected.c === c;
      const outerStyle = styleStr(gemOuterStyleObj(r, c, sel, g.blank));
      const anim = g.clearing ? 'popOut .44s forwards' : 'none';
      const innerStyle = styleStr(gemInnerStyleObj(p.color, sel, anim, g.blank, g.special));
      const label = g.blank ? '🔒' : g.special ? SPECIAL_ICON[g.special] : g.color === NEUTRAL ? p.name : '';
      gems.push(`<div data-action="cellTap" data-gem-id="${g.id}" data-r="${r}" data-c="${c}" style="${outerStyle}"><div style="${innerStyle}">${label}</div></div>`);
    }
  }
  const boardStyle = styleStr({ position: 'relative', width: 'calc(var(--cell) * ' + COLS + ')', height: 'calc(var(--cell) * ' + ROWS + ')' });

  const fk = leadPlayer();

  const roster = (cp ? cp.personnel : []).map((k) => {
    const sel = fk === k, h = Math.round(S.meters[k] || 0);
    const outerStyle = styleStr(rosterOuterStyleObj(POS[k].color, sel));
    return `<div style="flex:1;display:flex;flex-direction:column;align-items:center;gap:4px;">
      <div id="meterBox-${k}" style="${outerStyle}">
        <div id="rosterBar-${k}" style="width:100%;height:${h}%;background:${POS[k].color};transition:height .18s;"></div>
      </div>
      <div id="rosterLabel-${k}" class="pixel" style="font-size:8px;color:${sel ? '#ffd23f' : '#6f86c4'};">${k}</div>
    </div>`;
  }).join('');

  const movesColor = S.movesLeft <= 2 ? '#ff4d4d' : '#ffd23f';

  return `<div data-screen-label="Board" class="screen">
    <div style="padding:9px 14px 8px;background:#0b1228;border-bottom:3px solid #04060e;flex:0 0 auto;">
      <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:6px;">
        <div class="pixel" style="font-size:10px;color:#fff;">${downDist}</div>
        <div class="pixel" style="font-size:10px;color:#ffd23f;">YOU ${S.score} · OPP ${S.oppScore}</div>
      </div>
      ${fieldBar(S)}
      <div style="text-align:center;margin-top:5px;font-size:16px;color:#7f97cf;letter-spacing:1px;white-space:nowrap;">BALL ON ${spot}</div>
      ${momentumBar(S, false)}
    </div>
    <div id="boardArea" style="flex:1;min-height:0;overflow:hidden;display:flex;flex-direction:column;align-items:center;justify-content:center;padding:10px 8px;background:radial-gradient(circle at 50% 40%,#0e1a14,#0a0e1f 75%);">
      <div id="boardMetaRow" style="display:flex;align-items:center;justify-content:space-between;width:${boardW};margin-bottom:8px;flex:0 0 auto;">
        <div style="font-size:17px;color:#7f97cf;letter-spacing:1px;white-space:nowrap;">PLAY: <span style="color:#fff;">${cp ? cp.name : ''}</span></div>
        <div id="movesLabel" class="pixel" style="font-size:10px;color:${movesColor};">MOVES ${S.movesLeft}</div>
      </div>
      <div id="boardCard" style="position:relative;border:4px solid #04060e;border-radius:10px;background:#16341f;box-shadow:inset 0 0 0 3px #1f4a2c,0 8px 0 rgba(0,0,0,.4);padding:5px;flex:0 0 auto;">
        <div style="position:absolute;inset:5px;border-radius:6px;background:repeating-linear-gradient(0deg,transparent 0 13.9%,rgba(255,255,255,.07) 13.9% calc(13.9% + 2px)),repeating-linear-gradient(90deg,transparent 0 13.9%,rgba(255,255,255,.07) 13.9% calc(13.9% + 2px));pointer-events:none;"></div>
        <div id="gemLayer" style="${boardStyle}">${gems.join('')}</div>
      </div>
    </div>
    <div style="padding:10px 14px 14px;background:#0b1228;border-top:3px solid #04060e;flex:0 0 auto;">
      <div style="display:flex;gap:7px;align-items:flex-end;">${roster}</div>
      <div data-action="snap" style="margin-top:12px;text-align:center;font-family:'Press Start 2P',monospace;font-size:15px;color:#13210f;background:#ffd23f;border:3px solid #04060e;border-radius:8px;padding:13px;box-shadow:0 5px 0 #b58a0c,0 8px 12px rgba(0,0,0,.4);cursor:pointer;letter-spacing:1px;">🏈 HIKE!</div>
    </div>
  </div>`;
}

function renderResult() {
  const S = state, R = S.result, fp = POS[R.featured];
  const acc = R.td ? '#2fd45e' : (R.turnover ? '#ff4d4d' : '#ffd23f');
  const sign = S.shownYards < 0 ? '-' : '+';
  const continueLabel = R.td ? 'KICKOFF ▸' : (R.turnover ? 'OPP BALL ▸' : 'NEXT PLAY ▸');
  return `<div data-screen-label="Result" style="position:absolute;inset:0;display:flex;align-items:center;justify-content:center;background:rgba(5,8,18,.82);padding:24px;">
    <div style="width:100%;max-width:320px;text-align:center;padding:24px 22px;border-radius:14px;border:4px solid ${acc};background:#0b1228;box-shadow:0 0 0 4px #04060e,0 14px 40px rgba(0,0,0,.6);animation:popIn .3s ease-out;">
      <div class="pixel" style="font-size:18px;color:${acc};text-shadow:3px 3px 0 rgba(0,0,0,.4);line-height:1.3;">${R.headline}</div>
      <div style="font-size:23px;color:#cdddff;letter-spacing:1px;margin-top:2px;">${R.label}</div>
      <div class="pixel" style="margin:18px 0 6px;font-size:46px;line-height:1;color:${acc};text-shadow:4px 4px 0 rgba(0,0,0,.4);">${sign}${Math.abs(S.shownYards)}</div>
      <div class="pixel" style="font-size:13px;color:#7f97cf;">YARDS</div>
      <div style="margin-top:20px;padding:12px;border:3px solid #1f2c4e;border-radius:8px;background:#0c1226;">
        <div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:7px;">
          <div style="display:flex;align-items:center;gap:7px;">
            <div style="width:28px;height:28px;display:flex;align-items:center;justify-content:center;font-family:'Press Start 2P',monospace;font-size:9px;color:#fff;background:${fp.color};border:2px solid rgba(0,0,0,.45);border-radius:5px;">${fp.name}</div>
            <div style="font-size:19px;color:#fff;">${fp.full}</div>
          </div>
          <div class="pixel" style="font-size:11px;color:#ffd23f;">${R.meterPct}%</div>
        </div>
        <div style="position:relative;height:13px;border:2px solid #04060e;border-radius:4px;overflow:hidden;background:#10182f;">
          <div style="height:100%;width:${R.meterPct}%;background:${fp.color};"></div>
        </div>
      </div>
      <div data-action="continue" style="margin-top:20px;font-family:'Press Start 2P',monospace;font-size:13px;color:#13210f;background:#ffd23f;border:3px solid #04060e;border-radius:8px;padding:13px;box-shadow:0 5px 0 #b58a0c;cursor:pointer;letter-spacing:1px;">${continueLabel}</div>
    </div>
  </div>`;
}

function renderOppDrive() {
  const S = state;
  const spot = S.oppBallOn > 50 ? ('OPP ' + S.oppBallOn) : ('OWN ' + (100 - S.oppBallOn));
  const lines = S.oppLog.map((l) => `<div style="font-size:18px;color:#cdddff;padding:6px 0;border-bottom:1px solid #1f2c4e;">${esc(l)}</div>`).join('');
  return `<div data-screen-label="Defense" style="position:absolute;inset:0;display:flex;flex-direction:column;background:#0a0e1f;">
    <div style="padding:12px 14px;background:#0b1228;border-bottom:3px solid #04060e;text-align:center;">
      <div class="pixel" style="font-size:13px;color:#ff8a2b;">⛨ OPPONENT'S DRIVE</div>
      <div style="font-size:17px;color:#7f97cf;margin-top:4px;">BALL ON ${spot} · ${ordinal(S.oppDown)} &amp; ${S.oppToGo <= 0 ? 'GOAL' : S.oppToGo}</div>
    </div>
    <div style="flex:1;min-height:0;overflow-y:auto;padding:14px;">${lines}</div>
  </div>`;
}

let lastPhase = null;
const gemEls = new Map();

function render() {
  const app = document.getElementById('app');
  const stayingOnBoard = state.phase === 'board' && lastPhase === 'board' && document.getElementById('gemLayer');
  if (stayingOnBoard) {
    updateBoardScreen();
    lastPhase = state.phase;
    return;
  }
  let html;
  if (state.phase === 'title') html = renderTitle();
  else if (state.phase === 'playcall') html = renderPlaycall();
  else if (state.phase === 'board') html = renderBoard();
  else if (state.phase === 'result') html = renderResult();
  else if (state.phase === 'oppdrive') html = renderOppDrive();
  else html = '';
  app.innerHTML = html;
  if (state.phase === 'board') {
    gemEls.clear();
    app.querySelectorAll('[data-gem-id]').forEach((el) => {
      gemEls.set(el.dataset.gemId, { outer: el, inner: el.firstElementChild });
    });
    // Sits as a sibling of .screen (not inside #boardArea, which clips
    // overflow) so cleared gems can fly past the board edge to a meter.
    const fx = document.createElement('div');
    fx.id = 'fxLayer';
    fx.style.cssText = 'position:absolute;inset:0;pointer-events:none;z-index:55;overflow:visible;';
    app.appendChild(fx);
    fitBoard();
  }
  lastPhase = state.phase;
}

// Updates the board screen's dynamic bits (meters, moves, gems) by mutating
// existing DOM nodes in place, so CSS transitions on gem `transform` can
// actually animate between old and new positions instead of snapping.
function updateBoardScreen() {
  const S = state;
  const movesEl = document.getElementById('movesLabel');
  if (movesEl) {
    movesEl.textContent = 'MOVES ' + S.movesLeft;
    movesEl.style.color = S.movesLeft <= 2 ? '#ff4d4d' : '#ffd23f';
  }
  const fk = leadPlayer();
  const cp = currentPlay();
  (cp ? cp.personnel : []).forEach((k) => {
    const sel = fk === k;
    const bar = document.getElementById('rosterBar-' + k);
    if (bar) bar.style.height = Math.round(S.meters[k] || 0) + '%';
    const label = document.getElementById('rosterLabel-' + k);
    if (label) label.style.color = sel ? '#ffd23f' : '#6f86c4';
    const outer = document.getElementById('meterBox-' + k);
    if (outer) outer.setAttribute('style', styleStr(rosterOuterStyleObj(POS[k].color, sel)));
  });
  syncGems(S.grid);
}

function syncGems(grid) {
  const layer = document.getElementById('gemLayer');
  if (!layer) return;
  const S = state, seen = new Set();
  for (let r = 0; r < grid.length; r++) {
    for (let c = 0; c < (grid[r] || []).length; c++) {
      const g = grid[r][c];
      if (!g) continue;
      seen.add(g.id);
      const p = gemVisual(g.color), sel = S.selected && S.selected.r === r && S.selected.c === c;
      const anim = g.clearing ? 'popOut .44s forwards' : 'none';
      const label = g.blank ? '🔒' : g.special ? SPECIAL_ICON[g.special] : g.color === NEUTRAL ? p.name : '';
      let entry = gemEls.get(g.id);
      if (!entry) {
        const outer = document.createElement('div');
        outer.dataset.action = 'cellTap';
        outer.dataset.gemId = g.id;
        const inner = document.createElement('div');
        outer.appendChild(inner);
        layer.appendChild(outer);
        entry = { outer, inner };
        gemEls.set(g.id, entry);
        if (g.spawn) {
          // Place new gems above the board, fully formed, before the transform
          // transition below animates them falling in — avoids a visible fade-in.
          entry.outer.setAttribute('style', styleStr({ ...gemOuterStyleObj(r, c, sel, g.blank), transition: 'none', transform: `translate(calc(var(--cell) * ${c}), calc(var(--cell) * ${r - 1}))` }));
          entry.inner.setAttribute('style', styleStr(gemInnerStyleObj(p.color, sel, 'none', g.blank, g.special)));
          entry.inner.textContent = label;
          void entry.outer.offsetHeight;
        }
      }
      // A clear that fills a meter flies there instead of just popping —
      // the gem becomes the meter's fill rather than disappearing in place.
      if (g.clearing && g.flyTo && !entry.flying) {
        entry.flying = true;
        spawnFlyingGem(g.flyTo, label, entry.inner.getBoundingClientRect());
        entry.outer.dataset.r = r;
        entry.outer.dataset.c = c;
        entry.outer.style.display = 'none';
        continue;
      }
      entry.outer.dataset.r = r;
      entry.outer.dataset.c = c;
      entry.outer.setAttribute('style', styleStr(gemOuterStyleObj(r, c, sel, g.blank)));
      entry.inner.setAttribute('style', styleStr(gemInnerStyleObj(p.color, sel, anim, g.blank, g.special)));
      entry.inner.textContent = label;
    }
  }
  gemEls.forEach((entry, id) => {
    if (!seen.has(id)) {
      entry.outer.remove();
      gemEls.delete(id);
    }
  });
}

// Clones the clearing gem into the top-level fx overlay (so it isn't
// clipped by #boardArea) and animates it hopping up off the board, then
// flying into its color's meter box while shrinking and fading away.
function spawnFlyingGem(color, label, rect) {
  const fxLayer = document.getElementById('fxLayer');
  const target = document.getElementById('meterBox-' + color);
  if (!fxLayer || !target) return;
  const fxRect = fxLayer.getBoundingClientRect();
  const tRect = target.getBoundingClientRect();
  const size = Math.min(rect.width, rect.height) * 0.82;
  const startLeft = rect.left - fxRect.left + (rect.width - size) / 2;
  const startTop = rect.top - fxRect.top + (rect.height - size) / 2;
  const endLeft = tRect.left - fxRect.left + tRect.width / 2 - size / 2;
  const endTop = tRect.top - fxRect.top + tRect.height / 2 - size / 2;
  const swatch = (POS[color] || {}).color || color;

  const clone = document.createElement('div');
  clone.textContent = label;
  clone.style.cssText = styleStr({
    position: 'absolute', left: startLeft + 'px', top: startTop + 'px',
    width: size + 'px', height: size + 'px', display: 'flex', alignItems: 'center', justifyContent: 'center',
    background: swatch, color: '#fff', fontFamily: "'Press Start 2P',monospace",
    fontSize: 'clamp(8px, ' + Math.round(size * 0.32) + 'px, 14px)',
    border: '3px solid rgba(0,0,0,.5)', borderRadius: '8px',
    boxShadow: 'inset 2px 2px 0 rgba(255,255,255,.45),inset -3px -3px 0 rgba(0,0,0,.3),0 0 10px ' + swatch,
    textShadow: '1px 1px 0 rgba(0,0,0,.55)', opacity: '1', transform: 'scale(1) translateY(0)',
    transition: 'transform .16s ease-out', zIndex: '5',
  });
  fxLayer.appendChild(clone);

  // Stage 1: a quick hop up off the board. Stage 2: float into the meter,
  // shrinking and fading as it arrives, like it's draining into the fill.
  requestAnimationFrame(() => { clone.style.transform = 'scale(1.15) translateY(-14px)'; });
  setTimeout(() => {
    clone.style.transition = 'left .32s cubic-bezier(.35,.4,.25,1), top .32s cubic-bezier(.35,.4,.25,1), transform .32s ease-in, opacity .26s ease-in .08s';
    clone.style.left = endLeft + 'px';
    clone.style.top = endTop + 'px';
    clone.style.transform = 'scale(.25) translateY(0)';
    clone.style.opacity = '0';
  }, 130);
  setTimeout(() => clone.remove(), 470);
}

// Measures the actual space available for the gem grid (after layout)
// and sizes --cell to fit it exactly, so the board never needs to scroll.
function fitBoard() {
  const area = document.getElementById('boardArea');
  const metaRow = document.getElementById('boardMetaRow');
  const card = document.getElementById('boardCard');
  if (!area || !card) return;
  const areaRect = area.getBoundingClientRect();
  const cardRect = card.getBoundingClientRect();
  const metaH = metaRow ? metaRow.getBoundingClientRect().height + 8 : 0;
  const horizChrome = (cardRect.width - card.clientWidth) || 8;
  const vertChrome = (cardRect.height - card.clientHeight) || 8;
  const availW = areaRect.width - horizChrome - 10; // small safety margin
  const availH = areaRect.height - metaH - vertChrome - 10;
  let cell = Math.floor(Math.min(availW, availH) / COLS);
  cell = Math.max(20, Math.min(54, cell));
  document.documentElement.style.setProperty('--cell', cell + 'px');
}

let _fitTimer = null;
window.addEventListener('resize', () => {
  clearTimeout(_fitTimer);
  _fitTimer = setTimeout(() => { if (state.phase === 'board') fitBoard(); }, 80);
});

// ---------- input delegation ----------
document.addEventListener('DOMContentLoaded', () => {
  const saved = loadSave();
  hasSave = !!(saved && saved.phase && saved.phase !== 'title');
  render();

  document.getElementById('app').addEventListener('click', (e) => {
    const el = e.target.closest('[data-action]');
    if (!el) return;
    const action = el.dataset.action;
    if (!action) return;
    switch (action) {
      case 'newGame': newGame(); break;
      case 'resumeGame': resumeGame(); break;
      case 'start': start(); break;
      case 'pickPlay': pickPlay(el.dataset.id); break;
      case 'hike': hike(); break;
      case 'snap': snap(); break;
      case 'continue': continueAfterResult(); break;
      case 'cashMomentum': cashMomentum(); break;
      case 'openMatchup': setState({ showMatchup: true }); break;
      case 'closeMatchup': setState({ showMatchup: false }); break;
      case 'openRoster': setState({ showRoster: true }); break;
      case 'closeRoster': setState({ showRoster: false }); break;
      case 'swapRoster': swapRoster(el.dataset.pos, Number(el.dataset.idx)); break;
      default: break;
    }
  });

  // Gems get their own pointer handling (mouse + touch) so a drag in any
  // direction swipes the swap, while a near-stationary press still taps.
  const SWIPE_PX = 16;
  let drag = null;
  const app = document.getElementById('app');
  app.addEventListener('pointerdown', (e) => {
    const el = e.target.closest('[data-gem-id]');
    if (!el) return;
    drag = { id: e.pointerId, r: Number(el.dataset.r), c: Number(el.dataset.c), x: e.clientX, y: e.clientY, el };
    el.setPointerCapture(e.pointerId);
  });
  app.addEventListener('pointerup', (e) => {
    if (!drag || drag.id !== e.pointerId) return;
    const dx = e.clientX - drag.x, dy = e.clientY - drag.y;
    if (Math.hypot(dx, dy) < SWIPE_PX) onCellTap(drag.r, drag.c);
    else onCellSwipe(drag.r, drag.c, dx, dy);
    drag = null;
  });
  app.addEventListener('pointercancel', () => { drag = null; });
});
