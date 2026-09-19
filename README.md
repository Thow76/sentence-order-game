# Sentence Builder — Live Round Tool

A whole-class practice tool for building a sentence, word by word, on
learners' own phones — reviewed together as a group. No scoring, no
leaderboard: it's a discussion aid, not a competition.

- **Tutor**: open [`host.html`](./host.html) — keep this link private, it is
  never shared with learners.
- **Learners**: scan the QR code the tutor shows, or open
  [`play.html`](./play.html) and type the join code.

## How it works

1. On `host.html`, pick (or create) a saved sentence set — a "game" — and hit
   **Play**. This starts a session with a QR code and a 5-letter join code.
2. Learners join on their own phones with a nickname.
3. Tutor taps **Start round** — every phone shows the same scrambled word
   tiles. Learners tap words in order to build the sentence, then **Submit**.
4. Tutor watches the live roster fill in, then taps **Reveal** to show every
   learner's answer next to their name, auto-tallied against the correct
   sentence, for group discussion.
5. **Next round** moves everyone on to the next sentence in the set, with no
   rejoining needed. **End session** clears all of that session's roster and
   round data — saved games are unaffected and persist indefinitely.

## Architecture

Static HTML/CSS/JS, no build step. Firebase Firestore provides realtime sync
(no polling) between every learner's phone and the host screen. See
`firestore.rules` for the (deliberately open, no-PIN) security rules and
`assets/` for the frontend code.

## Reconnecting

If a learner's phone reloads or drops signal, rejoining with the same
nickname on the same device reattaches them automatically (via
`localStorage`). On a different device, or if storage was cleared, typing the
same nickname offers a "is this you?" prompt to resume instead of creating a
duplicate learner.
