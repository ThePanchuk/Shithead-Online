# Lessons Learned — Shithead Project

## [ARCH][2025-05] Firebase compat SDK — not modular
**Trigger:** Any Firebase-related code
**Rule:** This project uses the Firebase compat SDK (loaded via CDN script tags).
Always use `firebase.firestore.FieldValue.serverTimestamp()` and `window.db.collection(...)`.
Never import `{ initializeApp }` from `"firebase/app"` or use modular SDK patterns.
**Anti-pattern:** `import { getFirestore } from 'firebase/firestore'`
**Why:** Compat SDK loads globally via CDN; modular requires a bundler. This project has no bundler.

---

## [ARCH][2025-05] Named Firestore databases not supported in compat SDK
**Trigger:** Choosing which Firebase project/database to use
**Rule:** Firebase compat SDK (`firebase.firestore()`) always connects to the `(default)` database.
Named databases (e.g. `ai-studio-*`) are a modular-SDK-only feature.
Use a project with a `(default)` database — current project: `claude-cd59e`.
**Anti-pattern:** Trying to pass a database ID to `firebase.firestore()`

---

## [PROCESS][2025-05] IONOS deploy is SFTP-only — no SSH shell
**Trigger:** Any change to `.github/workflows/deploy-ionos-webspace.yml`
**Rule:** IONOS shared hosting has no SSH shell access (returns "Shell access denied").
Use `wlixcc/SFTP-Deploy-Action@v1.2.4` with `sftp_only: true`. Do NOT add `appleboy/ssh-action`
steps for mkdir — the SFTP action creates missing directories automatically.
**Anti-pattern:** Adding a pre-deploy SSH step to create remote directories

---

## [BUG][2025-05] Firestore transactions for all game state mutations
**Trigger:** Any play, pickup, face-down flip, or swap-ready action in online mode
**Rule:** ALL game state mutations (fbPlayCards, fbPickup, fbPlayFaceDown, submitSwap) MUST
use `window.db.runTransaction()`. Using a bare `.update()` creates race conditions when two
players act simultaneously (the second write overwrites the first without seeing it).
**Anti-pattern:** `roomRef(code).update({ pile: newPile, ... })` for game actions
**OK for:** Room creation, lobby join (sequential, non-concurrent)

---

## [ARCH][2025-05] Player array indices are immutable after room join
**Trigger:** Any code that modifies the `players` array in a Firestore room
**Rule:** A player's position in the `players[]` array is their permanent identity for the
session. `myOnlineIndex` is set at join time and never changes. Never splice, reorder,
or reassign indices. If a player leaves a lobby, delete the whole room — don't compact the array.
**Anti-pattern:** `players.splice(leavingPlayerIdx, 1)` — breaks all other players' indices

---

## [ARCH][2025-05] resolvePlay is the single source of truth for pile changes
**Trigger:** Any code that modifies `LG.pile` or the Firestore `pile` field
**Rule:** Always call `resolvePlay(cards, currentPile, sevenActive)` and use its return value.
Never mutate the pile directly. The burned pile (`burnedPile`) must be updated BEFORE
assigning `LG.pile = res.newPile` — save the old pile first.
**Pattern:**
```js
const res = resolvePlay(cards, LG.pile, sevenActive);
if (res.burned) LG.burnedPile = [...LG.burnedPile, ...LG.pile, ...cards];
LG.pile = res.newPile;
```
**Anti-pattern:** `LG.pile.push(...cards)` without going through resolvePlay

---

## [STYLE][2025-05] CSS card dimensions — always use custom properties
**Trigger:** Any CSS or inline style that sizes or positions cards
**Rule:** Never hardcode px values for card dimensions. Use:
`--card-w`, `--card-h`, `--card-r`, `--card-sm-w`, `--card-sm-h`,
`--card-peek`, `--pile-peek`, `--fan-pop`, `--stack-shift`
They are defined in `:root` and overridden in 4 media query breakpoints.
Hardcoded values break responsive layout at non-desktop sizes.
