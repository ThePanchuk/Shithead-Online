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

## [PROCESS][2025-05] IONOS deploy — use lftp, not third-party actions
**Trigger:** Any change to `.github/workflows/deploy-ionos-webspace.yml`
**Rule:** IONOS shared hosting is SFTP-only. `wlixcc/SFTP-Deploy-Action@v1.2.4` is broken on
current GitHub runners (calls `ssh-keyscan` with an empty host argument → exit 1).
Use `lftp` directly with `StrictHostKeyChecking=no` to bypass host-key verification:
```yaml
run: |
  sudo apt-get install -y lftp
  lftp -c "
    set sftp:auto-confirm yes;
    set sftp:connect-program \"ssh -a -x -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null\";
    set net:timeout 15; set net:max-retries 3;
    open -u \"$FTP_USER\",\"$FTP_PASS\" sftp://\"$FTP_HOST\";
    mirror --reverse --no-perms --parallel=4 ./public/ /dist/shithead/;
    bye
  "
```
`sftp:connect-program` overrides the SSH binary lftp spawns, so host-key checking is disabled
at the SSH level — `sftp:auto-confirm` alone is not sufficient.
**Anti-pattern:** Using `wlixcc/SFTP-Deploy-Action`, adding an `ssh-keyscan` pre-step

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

---

## [BUG][2026-05] Duplicate `const` across shared global scripts
**Trigger:** Adding a new constant to `app.js`
**Rule:** `gameLogic.js` and `app.js` are both plain `<script>` tags — they share the same
global scope. Re-declaring a `const` (e.g. `SUIT_ORDER`, `RANKS`, `SUITS`) that already
exists in `gameLogic.js` causes a `SyntaxError` at parse time and silently breaks the
entire app on load. Always `grep` for the name before adding a `const` to `app.js`.
**Fixed:** `SUIT_ORDER` was declared in both files; removed the duplicate from `app.js`.
**Anti-pattern:** `const SUIT_ORDER = {...}` in `app.js` when it's already in `gameLogic.js`

---

## [STYLE][2026-05] Ghost card sizing in fly animations — use CSS vars, not source rect
**Trigger:** Any `flyCardsToPile`-style animation that clones/creates a card element
**Rule:** When animating a card flying from a source to the pile, never set the ghost's
`width`/`height` from `getBoundingClientRect()` of the source. The source may be a wide
container (e.g. an opponent slot). Always read card dimensions from CSS custom properties:
```js
const cs    = getComputedStyle(document.documentElement);
const cardW = parseFloat(cs.getPropertyValue('--card-w'));
const cardH = parseFloat(cs.getPropertyValue('--card-h'));
```
This also handles responsive breakpoints automatically.
**Anti-pattern:** `el.style.width = src.width + 'px'` where `src` is an opponent slot rect

---

## [STYLE][2026-05] Viewport-locked game screen — use `position:fixed` not viewport units
**Trigger:** Any change to `#screen-game.active` CSS
**Rule:** `height: 100dvh` fluctuates as mobile browser chrome (address bar) animates,
causing the game table to visibly resize mid-play. Use `position: fixed; inset: 0` instead —
it locks the element to the viewport by geometry, immune to content height and chrome changes.
Also requires `align-items: stretch` on `#screen-game.active` to override the base `.screen`
rule of `align-items: center`, otherwise flex children (like `#table`) size to content width.
**Pattern:**
```css
#screen-game.active {
  position: fixed; top: 0; right: 0; bottom: 0; left: 0; inset: 0;
  align-items: stretch;
  overflow: hidden; padding: 0;
}
```

---

## [STYLE][2026-05] Inline styles beat CSS class specificity for dynamic positioning
**Trigger:** Creating ghost/overlay elements that must have `position: fixed`
**Rule:** When cloning a `.card` element for a drag ghost or fly animation, the cloned
element inherits the `.card` CSS class which sets `position: relative`. If you add a
second class (e.g. `.swap-drag-ghost`) that sets `position: fixed`, class order determines
which wins — and `.card` can win. Always set critical layout properties (`position`, `left`,
`top`, `transform`) as **inline styles** — they always beat class-level declarations.
**Pattern:** `el.style.position = 'fixed'; el.style.left = '0'; el.style.top = '0';`
**Anti-pattern:** Relying on a CSS class to set `position: fixed` on a cloned `.card` element
