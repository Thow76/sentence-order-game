import { db } from './firebase-init.js';
import {
  collection, doc, addDoc, setDoc, updateDoc, deleteDoc, getDoc, getDocs,
  onSnapshot, query, orderBy, serverTimestamp, Timestamp, writeBatch,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import {
  autoSplitTiles, manualSplitTiles, tilesToSentence, shuffleTileOrder,
  arraysEqual, randomJoinCode, escapeHtml,
} from './shared.js';
import { qrcode } from './qrcode.js';

// ---------- DOM refs ----------
const viewLibrary = document.getElementById('view-library');
const viewEditor = document.getElementById('view-editor');
const viewSession = document.getElementById('view-session');
const gameListEl = document.getElementById('game-list');
const editorTitle = document.getElementById('editor-title');
const gameNameInput = document.getElementById('game-name-input');
const sentenceRowsEl = document.getElementById('sentence-rows');
const toastEl = document.getElementById('toast');

// ---------- toast ----------
let toastTimer = null;
function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

// ---------- view switching ----------
function showView(name) {
  viewLibrary.classList.toggle('hidden', name !== 'library');
  viewEditor.classList.toggle('hidden', name !== 'editor');
  viewSession.classList.toggle('hidden', name !== 'session');
}

// =========================================================
// LIBRARY
// =========================================================
let gamesCache = [];

function subscribeLibrary() {
  const q = query(collection(db, 'games'), orderBy('createdAt', 'desc'));
  onSnapshot(q, (snap) => {
    gamesCache = snap.docs.map(d => ({ id: d.id, ...d.data() }));
    renderLibrary();
  }, (err) => {
    console.error(err);
    gameListEl.innerHTML = `<p class="muted">Could not load games: ${escapeHtml(err.message)}</p>`;
  });
}

function renderLibrary() {
  if (gamesCache.length === 0) {
    gameListEl.innerHTML = '<div class="empty-state">No saved games yet. Click "New game" to create your first sentence set.</div>';
    return;
  }
  gameListEl.innerHTML = gamesCache.map(g => `
    <div class="card game-card" data-id="${g.id}">
      <div class="game-card__info">
        <h3>${escapeHtml(g.name || 'Untitled game')}</h3>
        <span class="muted">${(g.sentences || []).length} sentence${(g.sentences || []).length === 1 ? '' : 's'}</span>
      </div>
      <div class="row">
        <button class="btn-play">Play</button>
        <button class="secondary btn-edit">Edit</button>
        <button class="danger btn-delete">Delete</button>
      </div>
    </div>
  `).join('');

  gameListEl.querySelectorAll('.game-card').forEach(cardEl => {
    const id = cardEl.dataset.id;
    cardEl.querySelector('.btn-play').addEventListener('click', () => startSession(id));
    cardEl.querySelector('.btn-edit').addEventListener('click', () => openEditor(id));
    cardEl.querySelector('.btn-delete').addEventListener('click', () => deleteGame(id));
  });
}

async function deleteGame(id) {
  const game = gamesCache.find(g => g.id === id);
  if (!confirm(`Delete "${game ? game.name : 'this game'}"? This cannot be undone.`)) return;
  await deleteDoc(doc(db, 'games', id));
  toast('Game deleted.');
}

// =========================================================
// EDITOR
// =========================================================
let editingGameId = null;
let rowState = []; // [{ mode: 'auto'|'manual', text: string }]

document.getElementById('btn-new-game').addEventListener('click', () => openEditor(null));
document.getElementById('btn-cancel-editor').addEventListener('click', () => showView('library'));
document.getElementById('btn-add-sentence').addEventListener('click', () => {
  rowState.push({ mode: 'auto', text: '' });
  renderRows();
});
document.getElementById('btn-save-game').addEventListener('click', saveGame);

async function openEditor(gameId) {
  editingGameId = gameId;
  if (gameId) {
    const snap = await getDoc(doc(db, 'games', gameId));
    if (!snap.exists()) { toast('Game not found.'); return; }
    const data = snap.data();
    editorTitle.textContent = `Edit: ${data.name}`;
    gameNameInput.value = data.name || '';
    rowState = (data.sentences || []).map(s => ({
      mode: 'manual',
      text: (s.tiles || []).map(t => t.text).join(' / '),
    }));
  } else {
    editorTitle.textContent = 'New game';
    gameNameInput.value = '';
    rowState = [{ mode: 'auto', text: '' }];
  }
  renderRows();
  showView('editor');
}

function renderRows() {
  sentenceRowsEl.innerHTML = rowState.map((row, i) => {
    const tiles = row.mode === 'auto' ? autoSplitTiles(row.text) : manualSplitTiles(row.text);
    const preview = tiles.map(t => `<span class="tile-chip">${escapeHtml(t.text)}</span>`).join('') || '<span class="muted">Type a sentence to preview tiles…</span>';
    return `
      <div class="sentence-row" data-i="${i}">
        <div class="sentence-row__head">
          <strong>Sentence ${i + 1}</strong>
          <div class="row">
            <button type="button" class="ghost mode-btn" data-mode="auto" style="${row.mode === 'auto' ? 'text-decoration:underline;' : ''}">Auto-split</button>
            <button type="button" class="ghost mode-btn" data-mode="manual" style="${row.mode === 'manual' ? 'text-decoration:underline;' : ''}">Manual tiles</button>
            <button type="button" class="ghost btn-remove-row">Remove</button>
          </div>
        </div>
        <input type="text" class="row-text-input" value="${escapeHtml(row.text)}"
          placeholder="${row.mode === 'auto' ? 'Type the full sentence, e.g. I take the bus.' : "Type tiles separated by / , e.g. I / don't / like / that."}">
        <div class="tile-preview">${preview}</div>
      </div>
    `;
  }).join('');

  sentenceRowsEl.querySelectorAll('.sentence-row').forEach(rowEl => {
    const i = Number(rowEl.dataset.i);
    rowEl.querySelector('.row-text-input').addEventListener('input', (e) => {
      rowState[i].text = e.target.value;
      // Re-render just the preview without losing focus: cheap full re-render
      // is fine here since row counts are tiny, but we avoid it to keep focus.
      const tiles = rowState[i].mode === 'auto' ? autoSplitTiles(rowState[i].text) : manualSplitTiles(rowState[i].text);
      const preview = tiles.map(t => `<span class="tile-chip">${escapeHtml(t.text)}</span>`).join('') || '<span class="muted">Type a sentence to preview tiles…</span>';
      rowEl.querySelector('.tile-preview').innerHTML = preview;
    });
    rowEl.querySelectorAll('.mode-btn').forEach(btn => {
      btn.addEventListener('click', () => {
        rowState[i].mode = btn.dataset.mode;
        renderRows();
      });
    });
    rowEl.querySelector('.btn-remove-row').addEventListener('click', () => {
      rowState.splice(i, 1);
      if (rowState.length === 0) rowState.push({ mode: 'auto', text: '' });
      renderRows();
    });
  });
}

async function saveGame() {
  const name = gameNameInput.value.trim();
  if (!name) { toast('Please name this game.'); return; }

  const sentences = [];
  for (const row of rowState) {
    const tiles = row.mode === 'auto' ? autoSplitTiles(row.text) : manualSplitTiles(row.text);
    if (tiles.length === 0) continue;
    sentences.push({ correct: tilesToSentence(tiles), tiles });
  }
  if (sentences.length === 0) { toast('Add at least one sentence.'); return; }

  if (editingGameId) {
    await updateDoc(doc(db, 'games', editingGameId), { name, sentences });
    toast('Game updated.');
  } else {
    await addDoc(collection(db, 'games'), { name, sentences, createdAt: serverTimestamp() });
    toast('Game saved.');
  }
  showView('library');
}

// =========================================================
// SESSION
// =========================================================
let currentSessionId = null;
let currentGame = null; // full game doc {id, name, sentences}
let unsubs = [];
let playersMap = new Map(); // playerId -> {name, joinedAt}
let submissionsMap = new Map(); // playerId -> {order, name}
let currentRound = -1;
let currentPhase = 'lobby';

const sessionGameName = document.getElementById('session-game-name');
const roundIndicator = document.getElementById('round-indicator');
const submitCountEl = document.getElementById('submit-count');
const rosterEl = document.getElementById('roster');
const rosterEmptyEl = document.getElementById('roster-empty');
const rosterCountEl = document.getElementById('roster-count');
const btnStartRound = document.getElementById('btn-start-round');
const btnReveal = document.getElementById('btn-reveal');
const btnNextRound = document.getElementById('btn-next-round');
const btnEndSession = document.getElementById('btn-end-session');
const revealPanel = document.getElementById('reveal-panel');
const revealRoundNum = document.getElementById('reveal-round-num');
const revealCorrect = document.getElementById('reveal-correct');
const revealTally = document.getElementById('reveal-tally');
const revealList = document.getElementById('reveal-list');
const joinCodeDisplay = document.getElementById('join-code-display');

async function startSession(gameId) {
  const gameSnap = await getDoc(doc(db, 'games', gameId));
  if (!gameSnap.exists()) { toast('Game not found.'); return; }
  const game = { id: gameSnap.id, ...gameSnap.data() };
  if (!game.sentences || game.sentences.length === 0) {
    toast('This game has no sentences yet — edit it first.');
    return;
  }

  const expireAt = Timestamp.fromDate(new Date(Date.now() + 24 * 60 * 60 * 1000));
  const sessionRef = await addDoc(collection(db, 'sessions'), {
    gameId: game.id,
    gameName: game.name,
    currentRound: -1,
    phase: 'lobby',
    joinCode: randomJoinCode(),
    createdAt: serverTimestamp(),
    expireAt,
  });

  history.pushState({}, '', `host.html?session=${sessionRef.id}`);
  enterSessionView(sessionRef.id, game);
}

function teardownSessionListeners() {
  unsubs.forEach(u => u());
  unsubs = [];
}

async function enterSessionView(sessionId, gameHint) {
  teardownSessionListeners();
  currentSessionId = sessionId;
  playersMap = new Map();
  submissionsMap = new Map();
  revealPanel.classList.add('hidden');
  showView('session');

  currentGame = gameHint || null;
  if (!currentGame) {
    const sessSnap = await getDoc(doc(db, 'sessions', sessionId));
    if (!sessSnap.exists()) { toast('That session no longer exists.'); backToLibrary(); return; }
    const gameSnap = await getDoc(doc(db, 'games', sessSnap.data().gameId));
    if (!gameSnap.exists()) { toast('The game behind this session was deleted.'); backToLibrary(); return; }
    currentGame = { id: gameSnap.id, ...gameSnap.data() };
  }
  sessionGameName.textContent = currentGame.name;

  // QR code — encodes play.html with this session id, resolved relative to
  // wherever host.html itself is served from (works under any Pages base path).
  const joinUrl = new URL(`play.html?session=${sessionId}`, window.location.href).toString();
  const qrImg = document.getElementById('qr-image');
  const qr = qrcode(0, 'M'); // 0 = auto-pick the smallest QR version that fits
  qr.addData(joinUrl);
  qr.make();
  qrImg.src = qr.createDataURL(6, 8);
  qrImg.alt = `QR code to join — ${joinUrl}`;

  currentRound = -1;
  currentPhase = 'lobby';
  let unsubSubmissions = null;

  const sessionUnsub = onSnapshot(doc(db, 'sessions', sessionId), (snap) => {
    if (!snap.exists()) {
      toast('Session ended.');
      backToLibrary();
      return;
    }
    const data = snap.data();
    currentRound = data.currentRound;
    currentPhase = data.phase;
    joinCodeDisplay.textContent = data.joinCode || '';

    const total = currentGame.sentences.length;
    if (currentRound < 0) {
      roundIndicator.textContent = 'Waiting to start';
    } else {
      roundIndicator.textContent = `Round ${currentRound + 1} of ${total} — ${currentPhase === 'revealed' ? 'revealed' : 'collecting'}`;
    }

    btnStartRound.classList.toggle('hidden', currentRound >= 0);
    btnReveal.classList.toggle('hidden', !(currentRound >= 0 && currentPhase === 'collecting'));
    btnNextRound.classList.toggle('hidden', !(currentRound >= 0 && currentPhase === 'revealed'));
    const isLast = currentRound >= total - 1;
    btnNextRound.disabled = isLast;
    btnNextRound.textContent = isLast ? 'No more sentences' : 'Next round';

    revealPanel.classList.toggle('hidden', currentPhase !== 'revealed');
    if (currentPhase === 'revealed' && currentRound >= 0) {
      revealRoundNum.textContent = currentRound + 1;
      revealCorrect.textContent = currentGame.sentences[currentRound].correct;
      renderReveal();
    }

    // (Re)subscribe to this round's submissions whenever the round changes.
    if (unsubSubmissions) { unsubSubmissions(); unsubSubmissions = null; }
    submissionsMap = new Map();
    if (currentRound >= 0) {
      const subsRef = collection(db, 'sessions', sessionId, 'rounds', String(currentRound), 'submissions');
      unsubSubmissions = onSnapshot(subsRef, (subSnap) => {
        submissionsMap = new Map(subSnap.docs.map(d => [d.id, d.data()]));
        renderRoster();
        if (currentPhase === 'revealed') renderReveal();
      });
      unsubs.push(unsubSubmissions);
    } else {
      renderRoster();
    }
  });
  unsubs.push(sessionUnsub);

  const playersUnsub = onSnapshot(
    query(collection(db, 'sessions', sessionId, 'players'), orderBy('joinedAt', 'asc')),
    (snap) => {
      playersMap = new Map(snap.docs.map(d => [d.id, d.data()]));
      renderRoster();
    }
  );
  unsubs.push(playersUnsub);
}

function renderRoster() {
  const total = playersMap.size;
  rosterCountEl.textContent = total ? `(${total})` : '';
  rosterEmptyEl.classList.toggle('hidden', total > 0);

  if (currentRound >= 0) {
    const submitted = [...playersMap.keys()].filter(id => submissionsMap.has(id)).length;
    submitCountEl.textContent = `${submitted} of ${total} submitted`;
    submitCountEl.classList.remove('hidden');
  } else {
    submitCountEl.classList.add('hidden');
  }

  rosterEl.innerHTML = [...playersMap.entries()].map(([id, p]) => {
    const submitted = submissionsMap.has(id);
    return `<div class="roster-item ${submitted ? 'is-submitted' : ''}">
      <span class="dot"></span>
      <span>${escapeHtml(p.name)}</span>
    </div>`;
  }).join('');
}

function renderReveal() {
  if (currentRound < 0) return;
  const correctTiles = currentGame.sentences[currentRound].tiles;
  const textById = new Map(correctTiles.map(t => [t.id, t.text]));
  const correctOrder = correctTiles.map(t => t.id);

  let correctCount = 0;
  const rows = [...playersMap.entries()].map(([id, p]) => {
    const sub = submissionsMap.get(id);
    if (!sub) {
      return `<div class="reveal-row"><span class="reveal-row__name">${escapeHtml(p.name)}</span><span class="reveal-row__sentence muted">No answer</span><span class="badge badge--muted">—</span></div>`;
    }
    const isCorrect = arraysEqual(sub.order, correctOrder);
    if (isCorrect) correctCount++;
    const sentenceText = sub.order.map(tid => textById.get(tid) || '?').join(' ');
    return `<div class="reveal-row ${isCorrect ? 'is-correct' : 'is-incorrect'}">
      <span class="reveal-row__name">${escapeHtml(p.name)}</span>
      <span class="reveal-row__sentence">${escapeHtml(sentenceText)}</span>
      <span class="badge ${isCorrect ? 'badge--success' : 'badge--error'}">${isCorrect ? 'Correct' : 'Incorrect'}</span>
    </div>`;
  });

  revealList.innerHTML = rows.join('') || '<p class="muted">No one has joined yet.</p>';
  revealTally.textContent = `${correctCount} of ${playersMap.size} correct`;
}

btnStartRound.addEventListener('click', async () => {
  const scrambled = shuffleTileOrder(currentGame.sentences[0].tiles);
  await Promise.all([
    setRoundDoc(0, scrambled),
    updateDoc(doc(db, 'sessions', currentSessionId), { currentRound: 0, phase: 'collecting' }),
  ]);
});

btnReveal.addEventListener('click', async () => {
  await updateDoc(doc(db, 'sessions', currentSessionId), { phase: 'revealed' });
});

btnNextRound.addEventListener('click', async () => {
  const sessSnap = await getDoc(doc(db, 'sessions', currentSessionId));
  const cur = sessSnap.data().currentRound;
  const next = cur + 1;
  if (next >= currentGame.sentences.length) return;
  const scrambled = shuffleTileOrder(currentGame.sentences[next].tiles);
  await setRoundDoc(next, scrambled);
  await updateDoc(doc(db, 'sessions', currentSessionId), { currentRound: next, phase: 'collecting' });
});

function setRoundDoc(index, tileOrder) {
  return setDoc(doc(db, 'sessions', currentSessionId, 'rounds', String(index)), {
    tileOrder,
    createdAt: serverTimestamp(),
  });
}

btnEndSession.addEventListener('click', async () => {
  if (!confirm('End this session? All roster and round data for this session will be deleted permanently.')) return;
  await endSession(currentSessionId);
  backToLibrary();
  toast('Session ended.');
});

async function endSession(sessionId) {
  const CHUNK = 400;

  async function deleteAllInBatches(refs) {
    for (let i = 0; i < refs.length; i += CHUNK) {
      const batch = writeBatch(db);
      refs.slice(i, i + CHUNK).forEach(ref => batch.delete(ref));
      await batch.commit();
    }
  }

  // players/
  const playersSnap = await getDocs(collection(db, 'sessions', sessionId, 'players'));
  await deleteAllInBatches(playersSnap.docs.map(d => d.ref));

  // rounds/{n}/submissions/ then rounds/{n} itself
  const roundsSnap = await getDocs(collection(db, 'sessions', sessionId, 'rounds'));
  for (const roundDoc of roundsSnap.docs) {
    const subsSnap = await getDocs(collection(db, 'sessions', sessionId, 'rounds', roundDoc.id, 'submissions'));
    await deleteAllInBatches(subsSnap.docs.map(d => d.ref));
    await deleteDoc(roundDoc.ref);
  }

  // session doc itself
  await deleteDoc(doc(db, 'sessions', sessionId));
}

function backToLibrary() {
  teardownSessionListeners();
  currentSessionId = null;
  currentGame = null;
  history.pushState({}, '', 'host.html');
  showView('library');
}

// =========================================================
// INIT
// =========================================================
subscribeLibrary();

const params = new URLSearchParams(window.location.search);
const sessionParam = params.get('session');
if (sessionParam) {
  getDoc(doc(db, 'sessions', sessionParam)).then(snap => {
    if (snap.exists()) {
      enterSessionView(sessionParam, null);
    } else {
      history.replaceState({}, '', 'host.html');
      showView('library');
    }
  });
} else {
  showView('library');
}
