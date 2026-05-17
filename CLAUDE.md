# Shithead — Claude Project Context

## Project
Browser-based Shithead card game. Solo project. Static front-end only — no server.
Live at: `https://thepanchuk.com/shithead/`

## Stack
- **Vanilla JS** (ES6, no framework, no bundler)
- **HTML/CSS** — single-page app, all screens in `public/index.html`
- **Firebase Firestore** (compat SDK v10.12.2) — online multiplayer backend
- **GitHub Actions → IONOS SFTP** — `git push main` auto-deploys `public/` to `dist/shithead/`

## File Map
| File | Purpose |
|------|---------|
| `public/app.js` | All UI rendering, local game loop, Firebase online logic, event handlers |
| `public/gameLogic.js` | Pure game rules — no DOM, no globals, no side effects |
| `public/style.css` | All styling; CSS custom properties for card dimensions |
| `public/index.html` | Single HTML file; all screens present at load, toggled via `.active` class |
| `public/firebase-config.js` | Firebase init; sets `window.db = firebase.firestore()` |
| `.github/workflows/deploy-ionos-webspace.yml` | SFTP deploy action |

## Critical Rules (ALWAYS)

1. **Firebase compat SDK only** — use `firebase.firestore.FieldValue.serverTimestamp()`,
   `firebase.firestore.Timestamp.fromDate()`. Never use modular SDK imports.
   `window.db` is the Firestore instance — it is set by `firebase-config.js`.

2. **All Firestore game mutations use `window.db.runTransaction()`** — never a bare
   `.update()` for game state (play, pickup, face-down flip, swap-ready). Bare `.update()`
   is only acceptable for non-concurrent writes (room creation, lobby join).

3. **CSS custom properties for card dimensions** — never hardcode px values for cards.
   Use `--card-w`, `--card-h`, `--card-r`, `--card-sm-w`, `--card-sm-h`, `--card-peek`,
   `--pile-peek`, `--fan-pop`, `--stack-shift`. They cascade through 4 breakpoints.

4. **`gameLogic.js` stays pure** — no DOM access, no `window.*`, no `LG`/`OG` references.
   All card rule functions live here. Changes affect both local AND online modes.

5. **Player array indices are immutable** — a player's `idx` is set at room join and never
   changes. `myOnlineIndex` identifies the local player for the session lifetime.

6. **`resolvePlay(cards, pile, sevenActive)`** is the single source of truth for pile
   mutations — always use its return value `{newPile, burned, extraTurn, skipCount,
   reverseDirection, newSevenActive}`. Never mutate pile directly.

7. **Every Firestore write must include `lastActivity: firebase.firestore.FieldValue.serverTimestamp()`**
   for lobby cleanup to work.

## No-Touch Zones (plan before changing)
- `gameLogic.js` — any edit ripples through local + online + bot logic simultaneously
- Firebase security rules — live-update affects all connected users immediately
- `players[]` array structure in Firestore — indices must remain stable
- The `resolvePlay` return contract — bot logic, local game, and online transactions all depend on it

## Deployment
```
git push                          # triggers GitHub Actions
# → lftp via sudo apt-get install -y lftp
# → uploads public/ to dist/shithead/ on IONOS via SFTP
# → live in ~30 seconds
```
IONOS is **SFTP-only** — no SSH shell. Deploy uses `lftp` with
`sftp:connect-program "ssh -o StrictHostKeyChecking=no -o UserKnownHostsFile=/dev/null"`.
`wlixcc/SFTP-Deploy-Action` is broken on current GitHub runners — do not use it.

## Firebase
- Project: `claude-cd59e`
- Database: `(default)` in `europe-west3`
- Firestore room document path: `rooms/{4-letter-code}`
- Room phases: `lobby` → `swap` → `play` → `ended`

## Verification Steps (no automated tests — manual only)
Before marking any change done:
- [ ] Local game: deal → swap → play round → bot turns work
- [ ] Pile burns (play a 10, play 4-of-a-kind) show in burned pile zone
- [ ] Pile fan shows top 3 cards, pile modal opens
- [ ] Online: create room → join → swap → play → pick up pile
- [ ] `git push` deploy succeeds (check GitHub Actions tab)
- [ ] No JS console errors on load

## Workflow (proportional to task size)

| Size | Example | Plan? | Verify? | Lesson? |
|------|---------|-------|---------|---------|
| Micro (<10 lines, 1 file) | CSS tweak, text change | No | Diff only | No |
| Small (1 feature/fix, <1h) | New game rule, UI adjustment | Mini | Manual test | If error |
| Medium (multi-file, cross-concern) | New game mechanic, Firebase change | Full | Full checklist | Yes |
| Large (architecture) | New auth, schema change | Full + consult | Full + peer review | Yes |

**Plan trigger:** >2 files affected OR Firebase schema change OR `gameLogic.js` touched.

## Roles
- **Executor** — routine UI fixes, CSS adjustments, new card rules (logic is clear)
- **Advisor** — Firebase architecture decisions, multiplayer edge cases, new feature design
- **Reviewer** — before any Firestore security rule change
- **Pair Programmer** — complex game state bugs (online sync issues, race conditions)
