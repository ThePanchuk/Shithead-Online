# Technical Debt — Shithead Project

Items deferred for elegance/time reasons. Review before major refactors.

---

## [SECURITY] Firebase rules — open write without authentication
**Severity:** Medium (casual game, low risk)
**Current state:** `allow read, write: if true` for all `rooms/*` documents.
Anyone with the config can write any room. No user identity.
**Ideal fix:** Add Firebase Authentication (anonymous auth is enough) so rules can
restrict: only the room's player list can update it.
**Deferred because:** Adds significant complexity; this is a casual card game.
**Re-evaluate when:** Traffic grows or vandalism becomes an issue.

---

## [ARCH] No automated tests
**Severity:** Medium
**Current state:** All testing is manual in the browser (local game + online game).
`gameLogic.js` is pure and easily unit-testable but has no test file.
**Ideal fix:** Add Jest or Vitest for `gameLogic.js` unit tests:
- `resolvePlay` edge cases (3-mirror, 4-of-a-kind, 10-burn)
- `botChoosePlay` decision coverage
- `advanceTurnBy` / `applySkipAdvance` with finished players
**Deferred because:** Solo project, small scope. Manual testing has been sufficient.
**Re-evaluate when:** Game rules get more complex or a regression occurs.

---

## [ARCH] `node_modules/` exists in project root (server remnant)
**Severity:** Low
**Current state:** A `node_modules/` directory and `package.json` from the old Socket.io
server era still exist at the repo root. The project is now 100% client-side.
**Ideal fix:** Remove `node_modules/`, `package.json`, `package-lock.json`, and any
server files (`server.js` if present) from the root. Add `node_modules` to `.gitignore`.
**Deferred because:** Not causing harm. Cleanup is low priority.

---

## [PERF] `burnedPile` array grows unbounded during a game
**Severity:** Low
**Current state:** Every burned card is appended to `burnedPile` (and stored in Firestore
for online games). A long game could accumulate ~52 cards there.
**Ideal fix:** Cap at last 10 burned cards, or only store the count + top card.
**Deferred because:** 52 card objects is negligible. Only becomes an issue if games run
very long or if Firestore document size (1MB limit) were a concern — neither is realistic.

---

## [UX] Online: non-host leaving a lobby deletes the room for everyone
**Severity:** Low–Medium
**Current state:** When any player clicks "Leave" from a lobby, the entire room is deleted
in Firestore. The host has no way to kick a player or continue alone.
**Ideal fix:** Non-hosts should be removable from the players list without closing the room.
Requires careful index management or switching to a player-ID-keyed map instead of array.
**Deferred because:** Small game, lobbies are intentionally short-lived. Acceptable UX trade-off.

---

## [UX] Card-fly animation missing for online opponents
**Severity:** Low
**Current state:** `flyCardsToPile` fires for the local human player (local + online) and
for bots in local mode. When an online opponent plays, the pile just updates instantly —
no animation.
**Ideal fix:** In `renderOnlineGame`, compare the new pile length to the previous render's
pile length. If it grew and `state.currentPlayerIndex !== myOnlineIndex`, animate from the
current opponent's slot rect using `flyCardsToPile`.
**Deferred because:** Requires caching the previous render state and extra logic in the
Firestore subscription callback. Medium complexity for a cosmetic improvement.

---

## [UX] No reconnect handling for online games
**Severity:** Medium
**Current state:** If a player's browser refreshes or disconnects mid-game, they lose
their `myOnlineIndex` and `currentRoomCode` (stored only in JS memory). They cannot rejoin.
**Ideal fix:** Persist `{roomCode, playerIndex, playerName}` to `localStorage` on join
and restore it on page load if a matching room still exists in Firestore.
**Deferred because:** Moderate complexity. Casual game — players restart easily.
