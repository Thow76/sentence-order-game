import { db } from './firebase-init.js';
import {
  collection, doc, addDoc, setDoc, getDoc, getDocs, onSnapshot, query, where, limit,
  serverTimestamp,
} from 'https://www.gstatic.com/firebasejs/10.12.2/firebase-firestore.js';
import { suffixName, escapeHtml } from './shared.js';

// ---------- DOM refs ----------
const viewJoin = document.getElementById('view-join');
const viewWaiting = document.getElementById('view-waiting');
const viewBuild = document.getElementById('view-build');
const viewSubmitted = document.getElementById('view-submitted');
const viewEnded = document.getElementById('view-ended');

const joinCodeEntry = document.getElementById('join-code-entry');
const joinCodeInput = document.getElementById('join-code-input');
const btnJoinCode = document.getElementById('btn-join-code');

const nicknameEntry = document.getElementById('nickname-entry');
const nicknameInput = document.getElementById('nickname-input');
const btnJoinNickname = document.getElementById('btn-join-nickname');
const resumeCheck = document.getElementById('resume-check');
const resumeName = document.getElementById('resume-name');
const btnResumeYes = document.getElementById('btn-resume-yes');
const btnResumeNo = document.getElementById('btn-resume-no');

const waitingTitle = document.getElementById('waiting-title');
const waitingSubtitle = document.getElementById('waiting-subtitle');

const buildRoundBadge = document.getElementById('build-round-badge');
const buildNameBadge = document.getElementById('build-name-badge');
const tileArea = document.getElementById('tile-area');
const tilePool = document.getElementById('tile-pool');
const btnSubmit = document.getElementById('btn-submit');

const submittedSubtitle = document.getElementById('submitted-subtitle');
const submittedSentence = document.getElementById('submitted-sentence');

const toastEl = document.getElementById('toast');

function toast(msg) {
  toastEl.textContent = msg;
  toastEl.classList.remove('hidden');
  setTimeout(() => toastEl.classList.add('hidden'), 2600);
}

function showView(name) {
  viewJoin.classList.toggle('hidden', name !== 'join');
  viewWaiting.classList.toggle('hidden', name !== 'waiting');
  viewBuild.classList.toggle('hidden', name !== 'build');
  viewSubmitted.classList.toggle('hidden', name !== 'submitted');
  viewEnded.classList.toggle('hidden', name !== 'ended');
}

// ---------- state ----------
let sessionId = null;
let playerId = null;
let playerName = null;
let game = null; // {id, name, sentences}
let currentRound = -1;
let builtOrder = []; // tile ids the player has tapped, in order
let pendingNewName = null; // used while resume-check is showing

function storageKey(sid) { return `sog_player_${sid}`; }
function draftKey(sid, round) { return `sog_draft_${sid}_${round}`; }

function saveLocalPlayer(sid, pid, name) {
  try { localStorage.setItem(storageKey(sid), JSON.stringify({ playerId: pid, name })); } catch (e) { /* ignore */ }
}
function loadLocalPlayer(sid) {
  try {
    const raw = localStorage.getItem(storageKey(sid));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearLocalPlayer(sid) {
  try { localStorage.removeItem(storageKey(sid)); } catch (e) { /* ignore */ }
}
function saveDraft(sid, round, order) {
  try { localStorage.setItem(draftKey(sid, round), JSON.stringify(order)); } catch (e) { /* ignore */ }
}
function loadDraft(sid, round) {
  try {
    const raw = localStorage.getItem(draftKey(sid, round));
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function clearDraft(sid, round) {
  try { localStorage.removeItem(draftKey(sid, round)); } catch (e) { /* ignore */ }
}

// =========================================================
// STEP 1: resolve sessionId (from URL, or from typed join code)
// =========================================================
async function init() {
  const params = new URLSearchParams(window.location.search);
  const fromUrl = params.get('session');
  if (fromUrl) {
    await beginJoinFlow(fromUrl);
  } else {
    showView('join');
    joinCodeEntry.classList.remove('hidden');
    nicknameEntry.classList.add('hidden');
  }
}

btnJoinCode.addEventListener('click', async () => {
  const code = joinCodeInput.value.trim().toUpperCase();
  if (!code) { toast('Enter a join code.'); return; }
  btnJoinCode.disabled = true;
  try {
    const q = query(collection(db, 'sessions'), where('joinCode', '==', code), limit(1));
    const snap = await getDocs(q);
    if (snap.empty) { toast('No session found for that code.'); return; }
    const sid = snap.docs[0].id;
    history.replaceState({}, '', `play.html?session=${sid}`);
    await beginJoinFlow(sid);
  } finally {
    btnJoinCode.disabled = false;
  }
});

// =========================================================
// STEP 2: reconnect via localStorage, or show nickname entry
// =========================================================
async function beginJoinFlow(sid) {
  const sessSnap = await getDoc(doc(db, 'sessions', sid));
  if (!sessSnap.exists()) {
    showView('ended');
    clearLocalPlayer(sid);
    return;
  }

  sessionId = sid;

  const local = loadLocalPlayer(sid);
  if (local) {
    const pSnap = await getDoc(doc(db, 'sessions', sid, 'players', local.playerId));
    if (pSnap.exists()) {
      playerId = local.playerId;
      playerName = pSnap.data().name;
      attachAndListen();
      return;
    }
    clearLocalPlayer(sid);
  }

  showView('join');
  joinCodeEntry.classList.add('hidden');
  nicknameEntry.classList.remove('hidden');
  resumeCheck.classList.add('hidden');
}

btnJoinNickname.addEventListener('click', async () => {
  const typed = nicknameInput.value.trim();
  if (!typed) { toast('Enter your name.'); return; }
  btnJoinNickname.disabled = true;
  try {
    const playersSnap = await getDocs(collection(db, 'sessions', sessionId, 'players'));
    const existing = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
    const match = existing.find(p => (p.nameLower || p.name.toLowerCase()) === typed.toLowerCase());

    if (match) {
      pendingNewName = typed;
      resumeName.textContent = match.name;
      resumeCheck.dataset.matchId = match.id;
      resumeCheck.dataset.matchName = match.name;
      resumeCheck.classList.remove('hidden');
      return;
    }

    await createPlayerAndProceed(typed, existing);
  } finally {
    btnJoinNickname.disabled = false;
  }
});

btnResumeYes.addEventListener('click', () => {
  const id = resumeCheck.dataset.matchId;
  const name = resumeCheck.dataset.matchName;
  playerId = id;
  playerName = name;
  saveLocalPlayer(sessionId, id, name);
  attachAndListen();
});

btnResumeNo.addEventListener('click', async () => {
  const playersSnap = await getDocs(collection(db, 'sessions', sessionId, 'players'));
  const existing = playersSnap.docs.map(d => ({ id: d.id, ...d.data() }));
  await createPlayerAndProceed(pendingNewName, existing);
});

async function createPlayerAndProceed(typedName, existingPlayers) {
  const takenLower = new Set(existingPlayers.map(p => (p.nameLower || p.name.toLowerCase())));
  const finalName = suffixName(typedName, takenLower);
  const ref = await addDoc(collection(db, 'sessions', sessionId, 'players'), {
    name: finalName,
    nameLower: finalName.toLowerCase(),
    joinedAt: serverTimestamp(),
  });
  playerId = ref.id;
  playerName = finalName;
  saveLocalPlayer(sessionId, ref.id, finalName);
  attachAndListen();
}

// =========================================================
// STEP 3: listen to session + game, drive the round UI
// =========================================================
async function attachAndListen() {
  buildNameBadge.textContent = playerName;

  const sessSnap = await getDoc(doc(db, 'sessions', sessionId));
  if (!sessSnap.exists()) { showView('ended'); return; }
  const gameSnap = await getDoc(doc(db, 'games', sessSnap.data().gameId));
  if (!gameSnap.exists()) { showView('ended'); return; }
  game = { id: gameSnap.id, ...gameSnap.data() };

  onSnapshot(doc(db, 'sessions', sessionId), async (snap) => {
    if (!snap.exists()) {
      clearLocalPlayer(sessionId);
      showView('ended');
      return;
    }
    const data = snap.data();
    currentRound = data.currentRound;

    if (currentRound < 0) {
      showView('waiting');
      waitingTitle.textContent = `Hi ${playerName}!`;
      waitingSubtitle.textContent = 'Waiting for the tutor to start round 1…';
      return;
    }

    if (data.phase === 'revealed') {
      const already = await getSubmission(currentRound);
      showSubmittedView(currentRound, already, true);
      return;
    }

    // phase === 'collecting'
    const already = await getSubmission(currentRound);
    if (already) {
      showSubmittedView(currentRound, already, false);
    } else {
      showBuildView(currentRound);
    }
  });
}

async function getSubmission(round) {
  const snap = await getDoc(doc(db, 'sessions', sessionId, 'rounds', String(round), 'submissions', playerId));
  return snap.exists() ? snap.data() : null;
}

function tilesById(round) {
  return new Map(game.sentences[round].tiles.map(t => [t.id, t.text]));
}

function showSubmittedView(round, submission, revealed) {
  showView('submitted');
  submittedSubtitle.textContent = revealed
    ? 'Round revealed — check the front screen!'
    : 'Waiting for the rest of the class…';
  const textById = tilesById(round);
  const order = submission ? submission.order : [];
  submittedSentence.innerHTML = order.map(id => `<span class="tile is-placed">${escapeHtml(textById.get(id) || '?')}</span>`).join('');
}

async function showBuildView(round) {
  showView('build');
  buildRoundBadge.textContent = `Round ${round + 1}`;

  const roundSnap = await getDoc(doc(db, 'sessions', sessionId, 'rounds', String(round)));
  if (!roundSnap.exists()) {
    // Host hasn't written the round doc yet (rare race) — try again shortly.
    setTimeout(() => showBuildView(round), 400);
    return;
  }
  const tileOrder = roundSnap.data().tileOrder;
  const textById = tilesById(round);

  const draft = loadDraft(sessionId, round);
  builtOrder = (draft || []).filter(id => tileOrder.includes(id));

  renderTiles(tileOrder, textById);
}

function renderTiles(tileOrder, textById) {
  const remaining = tileOrder.filter(id => !builtOrder.includes(id));

  tileArea.innerHTML = builtOrder.length
    ? builtOrder.map(id => `<button type="button" class="tile is-placed" data-id="${id}">${escapeHtml(textById.get(id))}</button>`).join('')
    : '<span class="tile-slot-empty">Tap words below to build your sentence…</span>';

  tilePool.innerHTML = remaining.map(id => `<button type="button" class="tile" data-id="${id}">${escapeHtml(textById.get(id))}</button>`).join('');

  tileArea.querySelectorAll('.tile').forEach(btn => {
    btn.addEventListener('click', () => {
      builtOrder = builtOrder.filter(id => id !== btn.dataset.id);
      afterTileChange(tileOrder, textById);
    });
  });
  tilePool.querySelectorAll('.tile').forEach(btn => {
    btn.addEventListener('click', () => {
      builtOrder = [...builtOrder, btn.dataset.id];
      afterTileChange(tileOrder, textById);
    });
  });

  btnSubmit.disabled = builtOrder.length !== tileOrder.length;
}

function afterTileChange(tileOrder, textById) {
  saveDraft(sessionId, currentRound, builtOrder);
  renderTiles(tileOrder, textById);
}

btnSubmit.addEventListener('click', async () => {
  btnSubmit.disabled = true;
  try {
    await setDoc(doc(db, 'sessions', sessionId, 'rounds', String(currentRound), 'submissions', playerId), {
      order: builtOrder,
      name: playerName,
      submittedAt: serverTimestamp(),
    });
    clearDraft(sessionId, currentRound);
    showSubmittedView(currentRound, { order: builtOrder }, false);
  } catch (e) {
    toast('Could not submit — check your connection and try again.');
    btnSubmit.disabled = false;
  }
});

init();
