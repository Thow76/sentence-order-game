// Shared helpers used by both host.js and play.js.

// Splits a plain sentence into word tiles on whitespace. Punctuation stays
// attached to the word it follows (e.g. "bus." is one tile), which matches
// how the seeded game and slide 6 are written. Sentences that don't split
// cleanly this way (contractions, etc.) should use the manual-tiles entry
// instead.
export function autoSplitTiles(sentence) {
  return sentence
    .trim()
    .split(/\s+/)
    .filter(Boolean)
    .map((text, i) => ({ id: `t${i}`, text }));
}

// Manual tile entry: tutor separates tiles with "/".
export function manualSplitTiles(raw) {
  return raw
    .split('/')
    .map(s => s.trim())
    .filter(Boolean)
    .map((text, i) => ({ id: `t${i}`, text }));
}

export function tilesToSentence(tiles) {
  return tiles.map(t => t.text).join(' ');
}

// Fisher-Yates shuffle, returns a new array of tile ids.
export function shuffleTileOrder(tiles) {
  const ids = tiles.map(t => t.id);
  if (ids.length <= 1) return ids;
  const correct = ids.join(',');
  let attempts = 0;
  let shuffled = ids;
  do {
    shuffled = [...ids];
    for (let i = shuffled.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
    }
    attempts++;
  } while (shuffled.join(',') === correct && attempts < 8);
  return shuffled;
}

export function arraysEqual(a, b) {
  if (!Array.isArray(a) || !Array.isArray(b)) return false;
  if (a.length !== b.length) return false;
  return a.every((v, i) => v === b[i]);
}

export function randomJoinCode() {
  const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789'; // no O/0/I/1 confusion
  let code = '';
  for (let i = 0; i < 5; i++) {
    code += alphabet[Math.floor(Math.random() * alphabet.length)];
  }
  return code;
}

export function randomId() {
  if (window.crypto && window.crypto.randomUUID) return window.crypto.randomUUID();
  return 'id-' + Math.random().toString(36).slice(2) + Date.now().toString(36);
}

// Given a desired name and the set of already-taken names (lowercased),
// returns a name guaranteed not to collide, suffixing " 2", " 3", ... as needed.
export function suffixName(desired, takenLower) {
  const base = desired.trim();
  const baseLower = base.toLowerCase();
  if (!takenLower.has(baseLower)) return base;
  let n = 2;
  while (takenLower.has(`${baseLower} ${n}`)) n++;
  return `${base} ${n}`;
}

export function escapeHtml(str) {
  const div = document.createElement('div');
  div.textContent = str;
  return div.innerHTML;
}
