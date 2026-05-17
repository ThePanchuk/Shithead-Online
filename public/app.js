// ═══════════════════════════════════════════════════════
//  Globals
// ═══════════════════════════════════════════════════════
let mode   = null;   // 'local' | 'online'

// Local game state
let LG = null;
let selectedCards = [];
let _swapDrag = null;   // drag-and-drop state for the swap screen

// Online game state
let OG = null;
let myOnlineIndex = null;

// Settings
let useSevenRule = true;

// Hand sort mode — 'rank' (by number) or 'suit' (by suit then number)
// SUIT_ORDER is already declared globally in gameLogic.js — reuse it here.
let handSortMode = 'rank';

function sortedHand(hand) {
  const h = [...hand]; // never mutate the game-state array
  if (handSortMode === 'suit') {
    h.sort((a, b) => (SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]) || (a.value - b.value));
  } else {
    h.sort((a, b) => (a.value - b.value) || (SUIT_ORDER[a.suit] - SUIT_ORDER[b.suit]));
  }
  return h;
}

// Cached last online game state — used to re-render when sort mode changes mid-game
let _lastOnlineState = null;

// ═══════════════════════════════════════════════════════
//  Utilities
// ═══════════════════════════════════════════════════════
function isRed(card) { return card.suit === '♥' || card.suit === '♦'; }

function toast(msg, duration = 2500) {
  let el = document.getElementById('toast');
  if (!el) {
    el = document.createElement('div');
    el.id = 'toast';
    document.body.appendChild(el);
  }
  el.textContent = msg;
  el.classList.remove('hidden');
  clearTimeout(el._t);
  el._t = setTimeout(() => el.classList.add('hidden'), duration);
}

function showScreen(id) {
  document.querySelectorAll('.screen').forEach(s => s.classList.remove('active'));
  document.getElementById(id).classList.add('active');
}

// ═══════════════════════════════════════════════════════
//  Card-to-pile fly animation
// ═══════════════════════════════════════════════════════
// cards : array of card objects — a face-up ghost is created per card
// rects : array of DOMRects for start positions; last rect reused if shorter
function flyCardsToPile(cards, rects) {
  if (!cards || !cards.length || !rects || !rects.length) return;
  const pileEl = document.getElementById('pile-visual');
  if (!pileEl) return;
  const to = pileEl.getBoundingClientRect();
  if (!to.width) return;
  const tx = to.left + to.width  / 2;
  const ty = to.top  + to.height / 2;
  // Card size comes from CSS custom properties — never from the source rect,
  // so bot opponent-slot rects (which are wider than a card) don't inflate the ghost.
  const cs    = getComputedStyle(document.documentElement);
  const cardW = parseFloat(cs.getPropertyValue('--card-w'));
  const cardH = parseFloat(cs.getPropertyValue('--card-h'));
  cards.forEach((card, i) => {
    const src  = rects[Math.min(i, rects.length - 1)];
    // Centre the ghost on the source area regardless of whether it's a card or a slot
    const sx   = src.left + src.width  / 2 - cardW / 2;
    const sy   = src.top  + src.height / 2 - cardH / 2;
    const el   = makeCardEl(card);
    el.style.position      = 'fixed';
    el.style.left          = '0';
    el.style.top           = '0';
    el.style.transform     = `translate(${sx}px,${sy}px) scale(0.7)`;
    el.style.transition    = 'none';
    el.style.pointerEvents = 'none';
    el.style.zIndex        = String(1500 + i);
    document.body.appendChild(el);
    // Double-rAF: first paints initial position, second starts the move
    requestAnimationFrame(() => requestAnimationFrame(() => {
      el.style.transition = 'transform 0.42s cubic-bezier(0.2,0,0.3,1), opacity 0.1s 0.38s';
      el.style.transform  = `translate(${tx - cardW / 2}px,${ty - cardH / 2}px) scale(1.0)`;
      el.style.opacity    = '0';
      setTimeout(() => el.remove(), 560);
    }));
  });
}

// ═══════════════════════════════════════════════════════
//  Card staging  —  selected hand cards float to centre
// ═══════════════════════════════════════════════════════

function stageShow() {
  document.getElementById('card-stage-overlay').classList.add('active');
  document.getElementById('card-stage').classList.add('active');
}
function stageHide() {
  document.getElementById('card-stage-overlay').classList.remove('active');
  document.getElementById('card-stage').classList.remove('active');
}

// Add a card to the floating stage area
function stageAdd(card) {
  const stage = document.getElementById('card-stage');
  const el = makeCardEl(card);
  el.onclick = () => stageRemove(card);
  stage.appendChild(el);
  selectedCards.push(card);
  stageShow();
  // Grey-out the placeholder in the hand fan
  const handEl = document.querySelector(`#human-hand [data-id="${card.id}"]`);
  if (handEl) handEl.classList.add('staged-out');
  // Enable Play button
  document.getElementById('btn-play-selected').classList.remove('btn-action-dim');
}

// Remove a card from the stage and return it to the hand
function stageRemove(card) {
  const stage = document.getElementById('card-stage');
  const el = [...stage.querySelectorAll('.card')].find(e => e.dataset.id === card.id);
  if (el) {
    // Drive the exit with inline styles — they beat CSS class rules and the
    // hover :hover transform, so the card reliably shrinks and fades out.
    el.style.transition    = 'transform 0.18s ease-in, opacity 0.18s ease-in';
    el.style.transform     = 'scale(0.5) translateY(20px)';
    el.style.opacity       = '0';
    el.style.pointerEvents = 'none';
    setTimeout(() => el.remove(), 220);
  }
  const idx = selectedCards.findIndex(c => c.id === card.id);
  if (idx >= 0) selectedCards.splice(idx, 1);
  // Restore the hand ghost
  const handEl = document.querySelector(`#human-hand [data-id="${card.id}"]`);
  if (handEl) handEl.classList.remove('staged-out');
  if (selectedCards.length === 0) {
    stageHide();
    document.getElementById('btn-play-selected').classList.add('btn-action-dim');
  }
}

// Clear all staged cards (called on turn change, pickup, etc.)
function stageClear() {
  document.getElementById('card-stage').innerHTML = '';
  // Restore every staged-out ghost in the hand fan
  document.querySelectorAll('#human-hand .card.staged-out').forEach(el => el.classList.remove('staged-out'));
  selectedCards = [];
  stageHide();
}

// ═══════════════════════════════════════════════════════
//  Card DOM helpers
// ═══════════════════════════════════════════════════════
function makeCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (isRed(card) ? ' red' : ' black') + (opts.small ? ' card-sm' : '');
  if (opts.selected)   el.classList.add('selected');
  if (opts.unplayable) el.classList.add('unplayable');
  el.dataset.id = card.id;
  el.innerHTML = `<span class="rank-tl">${card.rank}</span>
    <span class="suit-tl">${card.suit}</span>
    <span class="center-suit">${card.suit}</span>
    <span class="rank-br">${card.rank}</span>
    <span class="suit-br">${card.suit}</span>`;
  return el;
}

function makeBackEl(opts = {}) {
  const el = document.createElement('div');
  el.className = 'card card-back' + (opts.small ? ' card-sm' : '');
  if (opts.playable) el.classList.add('facedown-playable');
  if (opts.count != null) el.innerHTML = `<span class="deck-num">${opts.count}</span>`;
  return el;
}

// Render the human's tableau (face-up cards cascading over face-down cards).
function renderHumanStacks(faceDownLen, faceUp, opt) {
  const zone = document.getElementById('human-stacks');
  if (!zone) return;
  zone.innerHTML = '';
  const num = Math.max(faceDownLen, faceUp.length);
  for (let i = 0; i < num; i++) {
    const stack = document.createElement('div');
    stack.className = 'card-stack';

    if (i < faceDownLen) {
      const playable = opt.isMyTurn && opt.phase === 'faceDown';
      const fdEl = makeBackEl({ playable });
      fdEl.classList.add('stack-facedown');
      if (playable && opt.onFaceDownClick) fdEl.onclick = () => opt.onFaceDownClick(i, fdEl);
      stack.appendChild(fdEl);
    }

    if (i < faceUp.length) {
      const card = faceUp[i];
      const canPlay = opt.isMyTurn && opt.phase === 'faceUp' &&
                      isCardPlayable(card, opt.pile, opt.sevenActive);
      const sel = selectedCards.some(c => c.id === card.id);
      const fuEl = makeCardEl(card, {
        selected: sel,
        unplayable: opt.isMyTurn && opt.phase === 'faceUp' && !canPlay
      });
      fuEl.classList.add('stack-faceup');
      if (canPlay && opt.onFaceUpClick) fuEl.onclick = () => opt.onFaceUpClick(card);
      stack.appendChild(fuEl);
    }
    zone.appendChild(stack);
  }
}

// Build a slot for one opponent.
const MAX_VISIBLE_HAND_BACKS = 5;
function buildOpponentSlot(player, isCurrentTurn, faceDownLen, faceUp, handCount) {
  const slot = document.createElement('div');
  slot.className = 'opponent-slot' +
    (isCurrentTurn ? ' is-turn' : '') +
    (player.finished ? ' finished' : '');

  const nameEl = document.createElement('div');
  nameEl.className = 'opp-name';
  nameEl.textContent = (player.name || 'Player') + (player.finished ? ' ✓' : '');
  slot.appendChild(nameEl);

  const rows = document.createElement('div');
  rows.className = 'opp-rows';

  const numStacks = Math.max(faceDownLen, faceUp.length);
  if (numStacks > 0) {
    const tabRow = document.createElement('div');
    tabRow.className = 'opp-tableau';
    for (let i = 0; i < numStacks; i++) {
      const stack = document.createElement('div');
      stack.className = 'card-stack-sm';
      if (i < faceDownLen) {
        const fd = makeBackEl({ small: true });
        fd.classList.add('stack-facedown');
        stack.appendChild(fd);
      }
      if (i < faceUp.length) {
        const fu = makeCardEl(faceUp[i], { small: true });
        fu.classList.add('stack-faceup');
        stack.appendChild(fu);
      }
      tabRow.appendChild(stack);
    }
    rows.appendChild(tabRow);
  }

  if (handCount > 0) {
    const handRow = document.createElement('div');
    handRow.className = 'opp-hand-row';
    const fan = document.createElement('div');
    fan.className = 'opp-hand-fan';
    const visible = Math.min(handCount, MAX_VISIBLE_HAND_BACKS);
    for (let i = 0; i < visible; i++) fan.appendChild(makeBackEl({ small: true }));
    handRow.appendChild(fan);
    const countEl = document.createElement('div');
    countEl.className = 'opp-hand-count';
    countEl.textContent = handCount;
    countEl.title = `${handCount} card${handCount === 1 ? '' : 's'} in hand`;
    handRow.appendChild(countEl);
    rows.appendChild(handRow);
  }

  if (rows.children.length) slot.appendChild(rows);
  return slot;
}

function renderPile(pile) {
  const zone = document.getElementById('pile-visual');
  zone.innerHTML = '';
  if (!pile || pile.length === 0) {
    const emp = document.createElement('div');
    emp.className = 'pile-empty';
    emp.textContent = 'empty';
    zone.appendChild(emp);
  } else {
    // Fan: newest card leftmost (highest z-index), older cards peek to the RIGHT
    const peek = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pile-peek')
    ) || 16;
    const show = pile.slice(-3);
    show.forEach((card, i) => {
      const el = makeCardEl(card);
      const pos = show.length - 1 - i; // 0 = newest/top
      el.style.left   = `${pos * peek}px`;
      el.style.zIndex = show.length - pos;
      zone.appendChild(el);
    });
  }
  document.getElementById('pile-count').textContent = pile ? pile.length : 0;
}

function renderBurnedPile(burnedPile) {
  const zone = document.getElementById('burned-visual');
  if (!zone) return;
  const count = (burnedPile || []).length;
  document.getElementById('burned-count').textContent = count;
  zone.innerHTML = '';
  if (count === 0) {
    const emp = document.createElement('div');
    emp.className = 'pile-empty';
    emp.textContent = '–';
    zone.appendChild(emp);
  } else {
    const back = makeBackEl({ count });
    zone.appendChild(back);
  }
}

// ═══════════════════════════════════════════════════════
//  LOCAL GAME  – state helpers
// ═══════════════════════════════════════════════════════
function localPlayerPhase(p) { return getPlayerPhase(p); }

function localDraw(playerIdx) {
  const p = LG.players[playerIdx];
  while (p.hand.length < 3 && LG.deck.length > 0) p.hand.push(LG.deck.pop());
}

function localCheckFinished(idx) {
  const p = LG.players[idx];
  if (!p.finished && p.hand.length === 0 && p.faceUp.length === 0 && p.faceDown.length === 0) {
    p.finished = true;
    p.finishOrder = LG.finishCounter++;
    return true;
  }
  return false;
}

function localCheckGameOver() {
  const active = LG.players.filter(p => !p.finished);
  if (active.length <= 1) {
    LG.phase = 'ended';
    LG.loserIndex = active.length === 1 ? LG.players.indexOf(active[0]) : null;
    return true;
  }
  return false;
}

function localAdvanceTurn(fromIdx) {
  LG.currentPlayer = advanceTurnBy(LG.players, fromIdx, 1, LG.direction);
}

function applyLocalTurnChange(playerIdx, res) {
  const p = LG.players[playerIdx];

  if (res.reverseDirection) {
    LG.direction = -LG.direction;
    toast('Direction reversed!');
  }

  if (res.extraTurn && !p.finished) return true;

  if (res.skipCount > 0) {
    const next = applySkipAdvance(LG.players, playerIdx, res.skipCount, LG.direction);
    if (next === playerIdx && p.finished) { localAdvanceTurn(playerIdx); return false; }
    if (next === playerIdx) { toast('All opponents skipped — extra turn!'); return true; }
    const numActive = LG.players.filter(q => !q.finished).length;
    const skipped = Math.min(res.skipCount, numActive - 1);
    toast(`${skipped} player${skipped > 1 ? 's' : ''} skipped!`);
    LG.currentPlayer = next;
    return false;
  }

  localAdvanceTurn(playerIdx);
  return false;
}

function localApplyPlay(playerIdx, cards) {
  const p = LG.players[playerIdx];
  const phase = localPlayerPhase(p);
  const ids = new Set(cards.map(c => c.id));

  if (phase === 'hand')        p.hand   = p.hand.filter(c => !ids.has(c.id));
  else if (phase === 'faceUp') p.faceUp = p.faceUp.filter(c => !ids.has(c.id));
  else if (phase === 'faceDown') p.faceDown = p.faceDown.filter(c => !ids.has(c.id));

  const res = resolvePlay(cards, LG.pile, LG.sevenActive);
  if (res.burned) LG.burnedPile = [...(LG.burnedPile || []), ...LG.pile, ...cards];
  LG.pile        = res.newPile;
  LG.sevenActive = useSevenRule ? res.newSevenActive : false;

  if (phase === 'hand') localDraw(playerIdx);
  localCheckFinished(playerIdx);
  return res;
}

function localPickup(playerIdx) {
  const p = LG.players[playerIdx];
  p.hand.push(...LG.pile);
  LG.pile = [];
  LG.sevenActive = false;
}

// ═══════════════════════════════════════════════════════
//  LOCAL GAME  – bot turn
// ═══════════════════════════════════════════════════════
function botTakeTurn(botIdx) {
  const p = LG.players[botIdx];
  const decision = botChoosePlay(p, LG.pile, LG.sevenActive);

  function afterBotAction() {
    localCheckGameOver();
    renderLocalGame();
    if (LG.phase === 'ended') showGameOver(); else scheduleTurn();
  }

  if (!decision || decision.action === 'pickup') {
    localPickup(botIdx);
    localAdvanceTurn(botIdx);
    afterBotAction();
    return;
  }

  // Helper: get the opponent-slot DOMRect for this bot (slots rendered in player-index order, human skipped)
  const getBotSlotRect = () => {
    const slots = document.querySelectorAll('#opponents-area .opponent-slot');
    return slots[botIdx - 1]?.getBoundingClientRect() ?? null;
  };

  if (decision.action === 'playFaceDown') {
    const card    = p.faceDown[0];
    const srcRect = getBotSlotRect();
    p.faceDown.splice(0, 1);
    if (!isCardPlayable(card, LG.pile, LG.sevenActive)) {
      p.hand.push(card, ...LG.pile);
      LG.pile = [];
      LG.sevenActive = false;
      localAdvanceTurn(botIdx);
    } else {
      if (srcRect) flyCardsToPile([card], [srcRect]);
      const res = resolvePlay([card], LG.pile, LG.sevenActive);
      if (res.burned) LG.burnedPile = [...(LG.burnedPile || []), ...LG.pile, card];
      LG.pile = res.newPile;
      LG.sevenActive = useSevenRule ? res.newSevenActive : false;
      localCheckFinished(botIdx);
      applyLocalTurnChange(botIdx, res);
    }
    afterBotAction();
    return;
  }

  if (decision.action === 'play') {
    const srcRect = getBotSlotRect();
    const res = localApplyPlay(botIdx, decision.cards);
    if (srcRect) flyCardsToPile(decision.cards, [srcRect]);
    applyLocalTurnChange(botIdx, res);
    afterBotAction();
  }
}

function scheduleTurn() {
  if (LG.phase === 'ended') { showGameOver(); return; }
  const cur = LG.players[LG.currentPlayer];
  if (cur.isBot) {
    setTimeout(() => {
      if (LG && LG.phase === 'play') botTakeTurn(LG.currentPlayer);
    }, 900 + Math.random() * 500);
  }
}

// ═══════════════════════════════════════════════════════
//  LOCAL GAME  – render
// ═══════════════════════════════════════════════════════
function renderLocalGame() {
  if (!LG) return;

  const human      = LG.players[0];
  const isMyTurn   = LG.currentPlayer === 0 && !human.finished;
  const humanPhase = localPlayerPhase(human);

  document.getElementById('game-status-bar').textContent = (() => {
    if (LG.phase === 'ended') return 'Game Over';
    const cur = LG.players[LG.currentPlayer];
    if (LG.currentPlayer === 0) return 'Your turn!';
    return `${cur.name}'s turn…`;
  })();
  document.getElementById('deck-num').textContent    = LG.deck.length;
  document.getElementById('deck-count').textContent  = LG.deck.length;
  document.getElementById('seven-warning').classList.toggle('hidden', !LG.sevenActive);
  const dirEl = document.getElementById('direction-indicator');
  if (dirEl) dirEl.textContent = LG.direction === 1 ? '↻' : '↺';

  renderPile(LG.pile);
  renderBurnedPile(LG.burnedPile);

  document.getElementById('human-tableau-label').textContent = human.name;

  renderHumanStacks(human.faceDown.length, human.faceUp, {
    isMyTurn, phase: humanPhase, pile: LG.pile, sevenActive: LG.sevenActive,
    onFaceDownClick: i => humanPlayFaceDown(i),
    onFaceUpClick:   card => toggleSelectCard(card, 'faceUp')
  });

  const handZone = document.getElementById('human-hand');
  handZone.innerHTML = '';
  const displayHand = sortedHand(human.hand);
  const handN = displayHand.length;
  const fanSpread = Math.min(44, handN * 5);
  displayHand.forEach((card, i) => {
    const isStaged = selectedCards.some(c => c.id === card.id);
    const canPlay  = isMyTurn && humanPhase === 'hand' && isCardPlayable(card, LG.pile, LG.sevenActive);
    const el = makeCardEl(card, { unplayable: isMyTurn && humanPhase === 'hand' && !canPlay && !isStaged });
    if (isStaged) {
      el.classList.add('staged-out');
    } else if (isMyTurn && humanPhase === 'hand') {
      el.onclick = () => toggleSelectCard(card, 'hand');
    }
    const angle = handN > 1 ? ((i / (handN - 1)) - 0.5) * fanSpread : 0;
    el.style.setProperty('--fan-angle', `${angle.toFixed(1)}deg`);
    el.style.zIndex = i + 1;
    handZone.appendChild(el);
  });

  const btnPlay   = document.getElementById('btn-play-selected');
  const btnPickup = document.getElementById('btn-pickup');
  const canAct = isMyTurn && (humanPhase === 'hand' || humanPhase === 'faceUp');
  btnPlay.classList.toggle('btn-action-dim', !canAct || selectedCards.length === 0);
  btnPickup.classList.toggle('btn-action-dim', !canAct || LG.pile.length === 0);

  renderOpponents(LG.players, LG.currentPlayer, false);
}

function renderOpponents(players, currentPlayerIdx, isOnline) {
  const area = document.getElementById('opponents-area');
  area.innerHTML = '';
  for (let i = isOnline ? 0 : 1; i < players.length; i++) {
    if (!isOnline && i === 0) continue;
    const p = players[i];
    const fdLen  = isOnline ? p.faceDownCount : p.faceDown.length;
    const fuArr  = p.faceUp || [];
    const hCount = isOnline ? p.handCount : p.hand.length;
    area.appendChild(buildOpponentSlot(p, i === currentPlayerIdx, fdLen, fuArr, hCount));
  }
}

function escHtml(s) {
  return s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
}

// ═══════════════════════════════════════════════════════
//  LOCAL GAME  – human interaction
// ═══════════════════════════════════════════════════════
function toggleSelectCard(card, source) {
  if (source === 'hand') {
    // Hand cards use the floating stage system
    if (selectedCards.some(c => c.id === card.id)) {
      stageRemove(card);
    } else {
      if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) stageClear();
      stageAdd(card);
    }
  } else {
    // Face-up tableau cards: classic in-place selection (they don't fly to stage)
    const idx = selectedCards.findIndex(c => c.id === card.id);
    if (idx >= 0) {
      selectedCards.splice(idx, 1);
    } else {
      if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) stageClear();
      selectedCards.push(card);
    }
    renderLocalGame();
  }
}

function humanPlayFaceDown(faceDownIdx, srcEl) {
  if (LG.currentPlayer !== 0) return;
  const p = LG.players[0];
  if (localPlayerPhase(p) !== 'faceDown') return;

  const card    = p.faceDown[faceDownIdx];
  const srcRect = srcEl ? srcEl.getBoundingClientRect() : null;
  p.faceDown.splice(faceDownIdx, 1);

  if (!isCardPlayable(card, LG.pile, LG.sevenActive)) {
    p.hand.push(card, ...LG.pile);
    LG.pile = [];
    LG.sevenActive = false;
    toast(`Flipped ${card.rank}${card.suit} — can't play! Picked up pile.`);
    localAdvanceTurn(0);
  } else {
    if (srcRect) flyCardsToPile([card], [srcRect]);
    const res = resolvePlay([card], LG.pile, LG.sevenActive);
    if (res.burned) LG.burnedPile = [...(LG.burnedPile || []), ...LG.pile, card];
    LG.pile = res.newPile;
    LG.sevenActive = useSevenRule ? res.newSevenActive : false;
    localCheckFinished(0);
    localCheckGameOver();
    if (LG.phase !== 'ended') {
      if (res.burned) toast('Pile burned — extra turn!');
      applyLocalTurnChange(0, res);
    }
  }
  stageClear();
  renderLocalGame();
  if (LG.phase === 'ended') showGameOver();
  else scheduleTurn();
}

// ═══════════════════════════════════════════════════════
//  SWAP PHASE  — drag-and-drop helpers
// ═══════════════════════════════════════════════════════

function _swapDragCleanup() {
  if (!_swapDrag) return;
  if (_swapDrag.ghost)    _swapDrag.ghost.remove();
  if (_swapDrag.sourceEl) _swapDrag.sourceEl.classList.remove('swap-drag-source');
  if (_swapDrag.targetEl) _swapDrag.targetEl.classList.remove('swap-drop-target');
  document.removeEventListener('mousemove', _swapDrag._mm);
  document.removeEventListener('mouseup',   _swapDrag._mu);
  document.removeEventListener('touchmove', _swapDrag._tm);
  document.removeEventListener('touchend',  _swapDrag._te);
  _swapDrag = null;
}

// Returns the face-up card element under (x, y), or null.
// Temporarily hides the ghost so it doesn't block elementFromPoint.
function _swapTargetAt(x, y) {
  if (_swapDrag?.ghost) _swapDrag.ghost.style.visibility = 'hidden';
  const el = document.elementFromPoint(x, y);
  if (_swapDrag?.ghost) _swapDrag.ghost.style.visibility = '';
  return el?.closest('.swap-fu-card') || null;
}

function _swapHighlight(x, y) {
  const target = _swapTargetAt(x, y);
  if (_swapDrag.targetEl && _swapDrag.targetEl !== target)
    _swapDrag.targetEl.classList.remove('swap-drop-target');
  if (target) target.classList.add('swap-drop-target');
  _swapDrag.targetEl = target;
}

// Core drag initiator — shared by local and online swap screens.
function _swapBeginDrag(sourceEl, handIdx, clientX, clientY, onSwap) {
  if (_swapDrag) return;
  const rect  = sourceEl.getBoundingClientRect();
  const ghost = sourceEl.cloneNode(true);
  ghost.classList.add('swap-drag-ghost');
  // Inline position:fixed beats any class-level position:relative on .card
  ghost.style.position = 'fixed';
  ghost.style.left     = '0';
  ghost.style.top      = '0';
  ghost.style.width    = rect.width  + 'px';
  ghost.style.height   = rect.height + 'px';
  ghost.style.transition = 'none';
  // Position via transform so GPU handles movement (no layout reflow)
  const _setPos = (x, y) => {
    ghost.style.transform = `translate(${x - rect.width / 2}px, ${y - rect.height / 2}px) rotate(5deg) scale(1.07)`;
  };
  _setPos(clientX, clientY);   // place at cursor before appending → no flash
  document.body.appendChild(ghost);
  sourceEl.classList.add('swap-drag-source');
  _swapDrag = { handIdx, ghost, sourceEl, targetEl: null,
                _mm: null, _mu: null, _tm: null, _te: null };

  const move = (x, y) => {
    _setPos(x, y);
    _swapHighlight(x, y);
  };
  const drop = (x, y) => {
    const target = _swapTargetAt(x, y);
    const hi     = _swapDrag.handIdx;
    _swapDragCleanup();
    if (target) onSwap(hi, parseInt(target.dataset.fuIdx));
    // no target → ghost removed, card snaps back silently
  };

  _swapDrag._mm = e => move(e.clientX, e.clientY);
  _swapDrag._mu = e => drop(e.clientX, e.clientY);
  _swapDrag._tm = e => { e.preventDefault(); const t = e.touches[0]; move(t.clientX, t.clientY); };
  _swapDrag._te = e => { const t = e.changedTouches[0]; drop(t.clientX, t.clientY); };

  document.addEventListener('mousemove', _swapDrag._mm);
  document.addEventListener('mouseup',   _swapDrag._mu);
  document.addEventListener('touchmove', _swapDrag._tm, { passive: false });
  document.addEventListener('touchend',  _swapDrag._te);
}

// ═══════════════════════════════════════════════════════
//  SWAP PHASE  (local)
// ═══════════════════════════════════════════════════════
function renderSwap(hand, faceUp) {
  const fuZone = document.getElementById('swap-faceup');
  const hZone  = document.getElementById('swap-hand');
  fuZone.innerHTML = '';
  hZone.innerHTML  = '';

  faceUp.forEach((card, i) => {
    const el = makeCardEl(card);
    el.classList.add('swap-fu-card');
    el.dataset.fuIdx = i;
    fuZone.appendChild(el);
  });

  hand.forEach((card, i) => {
    const el = makeCardEl(card);
    const startDrag = (cx, cy) => _swapBeginDrag(el, i, cx, cy, (hi, fi) => {
      const tmp = hand[hi]; hand[hi] = faceUp[fi]; faceUp[fi] = tmp;
      renderSwap(hand, faceUp);
    });
    el.addEventListener('mousedown',  e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    el.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    hZone.appendChild(el);
  });
}

function startLocalSwap() {
  const human = LG.players[0];
  for (let i = 1; i < LG.players.length; i++) {
    const bot = LG.players[i];
    const swapped = botSwap(bot.hand, bot.faceUp);
    bot.hand   = swapped.hand;
    bot.faceUp = swapped.faceUp;
  }
  showScreen('screen-swap');
  renderSwap(human.hand, human.faceUp);
}

// ═══════════════════════════════════════════════════════
//  START LOCAL GAME
// ═══════════════════════════════════════════════════════
function startLocalGame() {
  const name    = document.getElementById('local-name').value.trim() || 'Player';
  useSevenRule  = document.getElementById('rule-seven').checked;
  const numBots = parseInt(document.querySelector('#bot-count-btns .btn-toggle.active').dataset.n);
  const botNames = ['Bot A', 'Bot B', 'Bot C', 'Bot D'];
  const dealt = dealGame(1 + numBots);

  LG = {
    phase: 'swap', currentPlayer: 0, sevenActive: false, direction: 1,
    deck: dealt.remainingDeck, pile: [], burnedPile: [], loserIndex: null, finishCounter: 1,
    players: [
      { name, isBot: false, finished: false, finishOrder: null,
        hand: dealt.players[0].hand, faceUp: dealt.players[0].faceUp, faceDown: dealt.players[0].faceDown },
      ...dealt.players.slice(1).map((dp, i) => ({
        name: botNames[i], isBot: true, finished: false, finishOrder: null,
        hand: dp.hand, faceUp: dp.faceUp, faceDown: dp.faceDown
      }))
    ]
  };

  mode = 'local';
  startLocalSwap();
}

// ═══════════════════════════════════════════════════════
//  GAME OVER
// ═══════════════════════════════════════════════════════
function showGameOver() {
  const players  = mode === 'local' ? LG.players : (OG ? OG.players : []);
  const loserIdx = mode === 'local' ? LG.loserIndex : (OG ? OG.loserIndex : null);
  const loser    = loserIdx != null ? players[loserIdx] : null;
  const isHumanLoser = mode === 'local' ? loserIdx === 0 : loserIdx === myOnlineIndex;

  document.getElementById('gameover-emoji').textContent  = isHumanLoser ? '♣' : '♠';
  document.getElementById('gameover-title').textContent  = isHumanLoser ? 'You are the Shithead!' : 'Game Over';
  document.getElementById('gameover-result').innerHTML   = loser
    ? `<strong>${escHtml(loser.name)}</strong> is the Shithead`
    : 'No result';

  const ordered = [...players].filter(p => p.finishOrder != null)
    .sort((a, b) => a.finishOrder - b.finishOrder);
  document.getElementById('finish-order-list').innerHTML =
    ordered.map((p, i) => `${['1st','2nd','3rd'][i] || (i+1)+'th'} — ${escHtml(p.name)}`).join('<br>') +
    (loser ? `<br>Shithead — ${escHtml(loser.name)}` : '');

  showScreen('screen-gameover');
}

// ═══════════════════════════════════════════════════════
//  ONLINE MODE  – Firebase Firestore
// ═══════════════════════════════════════════════════════
let currentRoomCode  = null;
let roomUnsubscribe  = null;
let _swapShown       = false;

function fbReady() {
  if (!window.db) {
    toast('Firebase not configured — check firebase-config.js', 5000);
    return false;
  }
  return true;
}

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  return Array.from({ length: 4 }, () => chars[Math.floor(Math.random() * chars.length)]).join('');
}

function roomRef(code) { return window.db.collection('rooms').doc(code); }

function stopRoom() {
  if (roomUnsubscribe) { roomUnsubscribe(); roomUnsubscribe = null; }
  currentRoomCode = null;
  _swapShown = false;
  _swapDragCleanup();
}

// ─── Create / Join ─────────────────────────────────────

async function createRoom(name) {
  if (!fbReady()) return;
  const code = genCode();
  myOnlineIndex = 0;
  currentRoomCode = code;
  mode = 'online';
  try {
    await roomRef(code).set({
      code, phase: 'lobby', hostIdx: 0,
      players: [{ name, idx: 0, finished: false, finishOrder: null,
                  swapReady: false, hand: [], faceUp: [], faceDown: [] }],
      currentPlayerIndex: 0, direction: 1, sevenActive: false,
      pile: [], burnedPile: [], deck: [], finishCounter: 1, loserIndex: null,
      createdAt: firebase.firestore.FieldValue.serverTimestamp(),
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
    subscribeRoom(code);
  } catch(e) { toast('Could not create room: ' + e.message); }
}

async function joinRoom(code, name) {
  if (!fbReady()) return;
  try {
    const snap = await roomRef(code).get();
    if (!snap.exists) { toast('Room not found'); return; }
    const d = snap.data();
    if (d.phase !== 'lobby') { toast('Game already started'); return; }
    if (d.players.length >= 5) { toast('Room full (max 5)'); return; }
    myOnlineIndex   = d.players.length;
    currentRoomCode = code;
    mode = 'online';
    await roomRef(code).update({
      players: [...d.players, { name, idx: myOnlineIndex, finished: false, finishOrder: null,
                                swapReady: false, hand: [], faceUp: [], faceDown: [] }],
      lastActivity: firebase.firestore.FieldValue.serverTimestamp()
    });
    subscribeRoom(code);
  } catch(e) { toast('Could not join room: ' + e.message); }
}

// ─── Real-time listener ────────────────────────────────

function subscribeRoom(code) {
  if (roomUnsubscribe) roomUnsubscribe();
  roomUnsubscribe = roomRef(code).onSnapshot(snap => {
    if (!snap.exists) {
      // Room was deleted (host left, expired, etc.)
      stopRoom();
      OG = null; mode = null; myOnlineIndex = null; stageClear();
      document.getElementById('online-join-panel').classList.remove('hidden');
      document.getElementById('online-lobby-panel').classList.add('hidden');
      showScreen('screen-online');
      toast('Room was closed', 3000);
      return;
    }
    const s = snap.data();
    OG = toRenderState(s);
    onRoomUpdate(s);
  }, err => toast('Connection error: ' + err.message, 4000));
}

function toRenderState(s) {
  const me = (s.players || [])[myOnlineIndex] || {};
  return {
    ...s,
    myIndex:      myOnlineIndex,
    hand:         me.hand   || [],
    faceDownCount: (me.faceDown || []).length,
    deckCount:    (s.deck   || []).length,
    players: (s.players || []).map(p => ({
      ...p,
      handCount:     (p.hand     || []).length,
      faceDownCount: (p.faceDown || []).length,
      faceUp:         p.faceUp   || []
    }))
  };
}

function onRoomUpdate(s) {
  if (s.phase === 'lobby') {
    document.getElementById('room-code-display').textContent = s.code;
    document.getElementById('online-join-panel').classList.add('hidden');
    document.getElementById('online-lobby-panel').classList.remove('hidden');
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = s.players.map((p, i) =>
      `<div class="lobby-player${i === 0 ? ' host' : ''}">${escHtml(p.name)}</div>`
    ).join('');
    document.getElementById('lobby-status').textContent =
      `${s.players.length}/5 — ${s.players.length < 2 ? 'Waiting for players…' : 'Ready to start!'}`;
    const btnStart = document.getElementById('btn-start-online');
    btnStart.classList.toggle('hidden', myOnlineIndex !== 0);
    if (myOnlineIndex === 0) btnStart.disabled = s.players.length < 2;

  } else if (s.phase === 'swap') {
    if (!_swapShown) {
      _swapShown = true;
      const me = s.players[myOnlineIndex];
      if (!OG) OG = {};
      OG._swapHand   = [...(me.hand   || [])];
      OG._swapFaceUp = [...(me.faceUp || [])];
      showScreen('screen-swap');
      document.getElementById('btn-swap-ready').disabled = false;
      document.getElementById('swap-status').textContent = '';
      renderOnlineSwap();
    }
    const readyCount = s.players.filter(p => p.swapReady).length;
    const statusEl = document.getElementById('swap-status');
    if (statusEl && readyCount > 0 && document.getElementById('btn-swap-ready').disabled) {
      statusEl.textContent = `${readyCount}/${s.players.length} ready…`;
    }

  } else if (s.phase === 'play' || s.phase === 'ended') {
    if (!document.getElementById('screen-game').classList.contains('active')) showScreen('screen-game');
    renderOnlineGame(OG);
    if (s.phase === 'ended') setTimeout(showGameOver, 800);
  }
}

// ─── Start game ────────────────────────────────────────

async function startOnlineGame() {
  if (!fbReady()) return;
  try {
    const snap = await roomRef(currentRoomCode).get();
    const d    = snap.data();
    if ((d.players || []).length < 2) { toast('Need at least 2 players'); return; }
    const dealt = dealGame(d.players.length);
    await roomRef(currentRoomCode).update({
      phase: 'swap', deck: dealt.remainingDeck,
      pile: [], burnedPile: [], sevenActive: false, direction: 1, finishCounter: 1, loserIndex: null,
      lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
      players: d.players.map((p, i) => ({
        ...p, swapReady: false, finished: false, finishOrder: null,
        hand:     dealt.players[i].hand,
        faceUp:   dealt.players[i].faceUp,
        faceDown: dealt.players[i].faceDown
      }))
    });
  } catch(e) { toast('Could not start game: ' + e.message); }
}

// ─── Swap ready ────────────────────────────────────────

async function submitSwap() {
  document.getElementById('btn-swap-ready').disabled = true;
  document.getElementById('swap-status').textContent = 'Waiting for others…';
  try {
    await window.db.runTransaction(async t => {
      const snap    = await t.get(roomRef(currentRoomCode));
      const s       = snap.data();
      const players = s.players.map(p => ({ ...p }));
      players[myOnlineIndex] = {
        ...players[myOnlineIndex],
        hand:      OG._swapHand   || players[myOnlineIndex].hand,
        faceUp:    OG._swapFaceUp || players[myOnlineIndex].faceUp,
        swapReady: true
      };
      const allReady   = players.every(p => p.swapReady);
      const firstPlayer = allReady ? findFirstPlayer(players) : s.currentPlayerIndex;
      t.update(roomRef(currentRoomCode), {
        players,
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        ...(allReady ? { phase: 'play', currentPlayerIndex: firstPlayer } : {})
      });
    });
  } catch(e) {
    toast('Error: ' + e.message);
    document.getElementById('btn-swap-ready').disabled = false;
  }
}

// ─── Turn helpers ──────────────────────────────────────

function onlineNextIdx(players, fromIdx, res, direction) {
  const dir = res.reverseDirection ? -direction : direction;
  if (res.extraTurn && !players[fromIdx].finished) return { idx: fromIdx, dir };
  if (res.skipCount > 0) return { idx: applySkipAdvance(players, fromIdx, res.skipCount, dir), dir };
  return { idx: advanceTurnBy(players, fromIdx, 1, dir), dir };
}

// ─── Play cards ────────────────────────────────────────

async function fbPlayCards(cards) {
  try {
    await window.db.runTransaction(async t => {
      const snap = await t.get(roomRef(currentRoomCode));
      const s    = snap.data();
      if (s.currentPlayerIndex !== myOnlineIndex) return;
      const players = s.players.map(p => ({
        ...p, hand: [...p.hand], faceUp: [...p.faceUp], faceDown: [...p.faceDown]
      }));
      const me    = players[myOnlineIndex];
      const phase = getPlayerPhase(me);
      const ids   = new Set(cards.map(c => c.id));
      if (!isCardPlayable(cards[0], s.pile, s.sevenActive)) return;
      if (phase === 'hand')        me.hand   = me.hand.filter(c => !ids.has(c.id));
      else if (phase === 'faceUp') me.faceUp = me.faceUp.filter(c => !ids.has(c.id));
      const res  = resolvePlay(cards, s.pile, s.sevenActive);
      const burnedPile = [...(s.burnedPile || [])];
      if (res.burned) burnedPile.push(...(s.pile || []), ...cards);
      const deck = [...(s.deck || [])];
      if (phase === 'hand') while (me.hand.length < 3 && deck.length) me.hand.push(deck.pop());
      let finishCounter = s.finishCounter || 1;
      if (!me.finished && !me.hand.length && !me.faceUp.length && !me.faceDown.length) {
        me.finished = true; me.finishOrder = finishCounter++;
      }
      const { idx, dir } = onlineNextIdx(players, myOnlineIndex, res, s.direction || 1);
      const active = players.filter(p => !p.finished);
      t.update(roomRef(currentRoomCode), {
        players, pile: res.newPile, burnedPile, sevenActive: res.newSevenActive, deck,
        direction: dir, currentPlayerIndex: idx, finishCounter,
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        phase:      active.length <= 1 ? 'ended' : s.phase,
        loserIndex: active.length === 1 ? players.indexOf(active[0]) : s.loserIndex
      });
    });
  } catch(e) { toast('Move failed: ' + e.message); }
  // stageClear already called before fbPlayCards; ensure clean state
  stageClear();
}

async function fbPickup() {
  try {
    await window.db.runTransaction(async t => {
      const snap = await t.get(roomRef(currentRoomCode));
      const s    = snap.data();
      if (s.currentPlayerIndex !== myOnlineIndex) return;
      const players = s.players.map(p => ({ ...p, hand: [...p.hand] }));
      players[myOnlineIndex].hand = [...players[myOnlineIndex].hand, ...(s.pile || [])];
      const idx = advanceTurnBy(players, myOnlineIndex, 1, s.direction || 1);
      t.update(roomRef(currentRoomCode), {
        players, pile: [], sevenActive: false, currentPlayerIndex: idx,
        lastActivity: firebase.firestore.FieldValue.serverTimestamp()
      });
    });
  } catch(e) { toast('Pick up failed: ' + e.message); }
  stageClear();
}

async function fbPlayFaceDown(index, srcEl) {
  const srcRect = srcEl ? srcEl.getBoundingClientRect() : null;
  try {
    await window.db.runTransaction(async t => {
      const snap = await t.get(roomRef(currentRoomCode));
      const s    = snap.data();
      if (s.currentPlayerIndex !== myOnlineIndex) return;
      const players = s.players.map(p => ({
        ...p, hand: [...p.hand], faceUp: [...p.faceUp], faceDown: [...p.faceDown]
      }));
      const me   = players[myOnlineIndex];
      const card = me.faceDown.splice(index, 1)[0];
      // Animate the card flying to the pile (we know the card now)
      if (srcRect && isCardPlayable(card, s.pile || [], s.sevenActive)) {
        flyCardsToPile([card], [srcRect]);
      }
      let pile = s.pile || [], sevenActive = s.sevenActive, dir = s.direction || 1, idx;
      let res = { reverseDirection: false, extraTurn: false, skipCount: 0, newSevenActive: false };
      const burnedPile = [...(s.burnedPile || [])];
      if (!isCardPlayable(card, pile, sevenActive)) {
        me.hand = [...me.hand, card, ...pile];
        pile = []; sevenActive = false;
        idx  = advanceTurnBy(players, myOnlineIndex, 1, dir);
      } else {
        res  = resolvePlay([card], pile, sevenActive);
        if (res.burned) burnedPile.push(...pile, card);
        pile = res.newPile; sevenActive = res.newSevenActive;
        const next = onlineNextIdx(players, myOnlineIndex, res, dir);
        idx = next.idx; dir = next.dir;
      }
      let finishCounter = s.finishCounter || 1;
      if (!me.finished && !me.hand.length && !me.faceUp.length && !me.faceDown.length) {
        me.finished = true; me.finishOrder = finishCounter++;
      }
      const active = players.filter(p => !p.finished);
      t.update(roomRef(currentRoomCode), {
        players, pile, burnedPile, sevenActive, direction: dir, currentPlayerIndex: idx, finishCounter,
        lastActivity: firebase.firestore.FieldValue.serverTimestamp(),
        phase:      active.length <= 1 ? 'ended' : s.phase,
        loserIndex: active.length === 1 ? players.indexOf(active[0]) : s.loserIndex
      });
    });
  } catch(e) { toast('Move failed: ' + e.message); }
}

// ─── Online swap rendering ─────────────────────────────

function renderOnlineSwap() {
  const fuZone = document.getElementById('swap-faceup');
  const hZone  = document.getElementById('swap-hand');
  fuZone.innerHTML = '';
  hZone.innerHTML  = '';

  (OG._swapFaceUp || []).forEach((card, i) => {
    const el = makeCardEl(card);
    el.classList.add('swap-fu-card');
    el.dataset.fuIdx = i;
    fuZone.appendChild(el);
  });

  (OG._swapHand || []).forEach((card, i) => {
    const el = makeCardEl(card);
    const startDrag = (cx, cy) => _swapBeginDrag(el, i, cx, cy, (hi, fi) => {
      const tmp = OG._swapHand[hi]; OG._swapHand[hi] = OG._swapFaceUp[fi]; OG._swapFaceUp[fi] = tmp;
      renderOnlineSwap();
    });
    el.addEventListener('mousedown',  e => { e.preventDefault(); startDrag(e.clientX, e.clientY); });
    el.addEventListener('touchstart', e => { e.preventDefault(); startDrag(e.touches[0].clientX, e.touches[0].clientY); }, { passive: false });
    hZone.appendChild(el);
  });
}

// ─── Swap ready button ─────────────────────────────────

document.getElementById('btn-swap-ready').onclick = function () {
  if (mode === 'local') {
    LG.phase = 'play';
    LG.currentPlayer = findFirstPlayer(LG.players);
    stageClear();
    showScreen('screen-game');
    renderLocalGame();
    scheduleTurn();
  } else if (mode === 'online') {
    submitSwap();
  }
};

// ─── Online game rendering ─────────────────────────────

function renderOnlineGame(state) {
  if (!state) return;
  _lastOnlineState = state;   // cache for sort-toggle re-render
  const me       = state.players[state.myIndex];
  const isMyTurn = state.currentPlayerIndex === state.myIndex;
  // If it's no longer the human's turn, clear any staged cards
  if (!isMyTurn && selectedCards.length > 0) stageClear();
  const humanPhase = me.finished ? 'done' :
    (state.hand.length > 0      ? 'hand'     :
     (me.faceUp.length > 0      ? 'faceUp'   :
      (state.faceDownCount > 0  ? 'faceDown' : 'done')));

  document.getElementById('game-status-bar').textContent = (() => {
    if (state.phase === 'ended') return 'Game Over';
    if (isMyTurn) return 'Your turn!';
    return `${escHtml(state.players[state.currentPlayerIndex].name)}'s turn…`;
  })();
  document.getElementById('deck-num').textContent   = state.deckCount;
  document.getElementById('deck-count').textContent = state.deckCount;
  document.getElementById('seven-warning').classList.toggle('hidden', !state.sevenActive);
  const dirEl = document.getElementById('direction-indicator');
  if (dirEl) dirEl.textContent = (state.direction === -1) ? '↺' : '↻';

  renderPile(state.pile);
  renderBurnedPile(state.burnedPile);

  document.getElementById('human-tableau-label').textContent = me.name;

  renderHumanStacks(state.faceDownCount, me.faceUp, {
    isMyTurn, phase: humanPhase, pile: state.pile, sevenActive: state.sevenActive,
    onFaceDownClick: (i, el) => fbPlayFaceDown(i, el),
    onFaceUpClick:   card => onlineToggleSelect(card)
  });

  const handZone = document.getElementById('human-hand');
  handZone.innerHTML = '';
  const displayHand = sortedHand(state.hand);
  const handN = displayHand.length;
  const fanSpread = Math.min(44, handN * 5);
  displayHand.forEach((card, i) => {
    const isStaged = selectedCards.some(c => c.id === card.id);
    const canPlay  = isMyTurn && humanPhase === 'hand' && isCardPlayable(card, state.pile, state.sevenActive);
    const el = makeCardEl(card, { unplayable: isMyTurn && humanPhase === 'hand' && !canPlay && !isStaged });
    if (isStaged) {
      el.classList.add('staged-out');
    } else if (isMyTurn && humanPhase === 'hand') {
      el.onclick = () => onlineToggleSelect(card);
    }
    const angle = handN > 1 ? ((i / (handN - 1)) - 0.5) * fanSpread : 0;
    el.style.setProperty('--fan-angle', `${angle.toFixed(1)}deg`);
    el.style.zIndex = i + 1;
    handZone.appendChild(el);
  });

  const canAct = isMyTurn && (humanPhase === 'hand' || humanPhase === 'faceUp');
  document.getElementById('btn-play-selected').classList.toggle('btn-action-dim', !canAct || selectedCards.length === 0);
  document.getElementById('btn-pickup').classList.toggle('btn-action-dim', !canAct || state.pile.length === 0);

  const oArea = document.getElementById('opponents-area');
  oArea.innerHTML = '';
  state.players.forEach((p, i) => {
    if (i === state.myIndex) return;
    oArea.appendChild(buildOpponentSlot(p, i === state.currentPlayerIndex, p.faceDownCount, p.faceUp, p.handCount));
  });
}

function onlineToggleSelect(card) {
  if (selectedCards.some(c => c.id === card.id)) {
    stageRemove(card);
  } else {
    if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) stageClear();
    stageAdd(card);
  }
}

// ─── Hand sort toggle ──────────────────────────────────

document.getElementById('sort-by-suit').addEventListener('change', function () {
  handSortMode = this.checked ? 'suit' : 'rank';
  if (mode === 'local'  && LG)               renderLocalGame();
  if (mode === 'online' && _lastOnlineState) renderOnlineGame(_lastOnlineState);
});

// ─── Play / Pick-up buttons ────────────────────────────

document.getElementById('btn-play-selected').onclick = function () {
  if (!selectedCards.length) return;
  const cardsToPlay = [...selectedCards];

  // Source rects: staged cards in center (hand plays) OR selected face-up stacks
  const stageEls = [...document.querySelectorAll('#card-stage .card')];
  const srcRects = stageEls.length
    ? stageEls.map(el => el.getBoundingClientRect())
    : [...document.querySelectorAll('#human-stacks .card.selected')].map(el => el.getBoundingClientRect());

  stageClear();   // clear stage + selectedCards before game state mutations

  if (mode === 'online') {
    if (srcRects.length) flyCardsToPile(cardsToPlay, srcRects);
    fbPlayCards(cardsToPlay);
  } else {
    if (!LG) return;
    const p     = LG.players[0];
    const phase = localPlayerPhase(p);
    if (LG.currentPlayer !== 0 || !['hand','faceUp'].includes(phase)) return;
    if (!isCardPlayable(cardsToPlay[0], LG.pile, LG.sevenActive)) { toast('Cannot play those cards'); return; }
    const res = localApplyPlay(0, cardsToPlay);
    if (srcRects.length) flyCardsToPile(cardsToPlay, srcRects);
    localCheckGameOver();
    if (LG.phase !== 'ended') {
      if (res.burned) toast('Pile burned — extra turn!');
      applyLocalTurnChange(0, res);
    }
    renderLocalGame();
    if (LG.phase === 'ended') showGameOver(); else scheduleTurn();
  }
};

document.getElementById('btn-pickup').onclick = function () {
  if (mode === 'online') {
    stageClear();
    fbPickup();
  } else {
    if (!LG) return;
    stageClear();
    localPickup(0);
    localAdvanceTurn(0);
    localCheckGameOver();
    renderLocalGame();
    if (LG.phase === 'ended') showGameOver(); else scheduleTurn();
  }
};

// ═══════════════════════════════════════════════════════
//  Lobby cleanup  — delete lobby rooms idle > 5 minutes
// ═══════════════════════════════════════════════════════
async function cleanupExpiredRooms() {
  if (!window.db) return;
  try {
    const cutoff = firebase.firestore.Timestamp.fromDate(
      new Date(Date.now() - 5 * 60 * 1000)
    );
    const snap = await window.db.collection('rooms')
      .where('lastActivity', '<', cutoff)
      .limit(30).get();
    if (snap.empty) return;
    const batch = window.db.batch();
    snap.forEach(doc => {
      // Only remove lobby rooms; leave games in progress alone
      if (doc.data().phase === 'lobby') batch.delete(doc.ref);
    });
    await batch.commit();
  } catch(e) { /* best-effort, silent fail */ }
}

// ═══════════════════════════════════════════════════════
//  Navigation / Menu events
// ═══════════════════════════════════════════════════════
document.getElementById('btn-vs-bots').onclick     = () => showScreen('screen-local-setup');
document.getElementById('btn-online').onclick      = () => { showScreen('screen-online'); cleanupExpiredRooms(); };
document.getElementById('btn-local-back').onclick  = () => showScreen('screen-menu');
document.getElementById('btn-online-back').onclick = () => showScreen('screen-menu');
document.getElementById('btn-local-start').onclick = () => startLocalGame();

document.querySelectorAll('#bot-count-btns .btn-toggle').forEach(btn => {
  btn.onclick = () => {
    document.querySelectorAll('#bot-count-btns .btn-toggle').forEach(b => b.classList.remove('active'));
    btn.classList.add('active');
  };
});

document.getElementById('btn-create-room').onclick = () => {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  createRoom(name);
};

document.getElementById('btn-join-room').onclick = () => {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 4) { toast('Enter a 4-character room code'); return; }
  joinRoom(code, name);
};

document.getElementById('btn-start-online').onclick = () => startOnlineGame();

document.getElementById('btn-leave-room').onclick = () => {
  const code = currentRoomCode;
  stopRoom(); // unsubscribe before deleting so our own listener doesn't react
  OG = null; mode = null; myOnlineIndex = null; stageClear();
  document.getElementById('online-join-panel').classList.remove('hidden');
  document.getElementById('online-lobby-panel').classList.add('hidden');
  showScreen('screen-menu');
  // Delete the room so it doesn't linger — notifies all other members via onSnapshot
  if (code) roomRef(code).delete().catch(() => {});
};

document.getElementById('btn-go-menu').onclick = () => {
  LG = null; OG = null; mode = null; myOnlineIndex = null; stageClear();
  stopRoom();
  showScreen('screen-menu');
};

document.getElementById('btn-go-again').onclick = () => {
  if (mode === 'local') {
    LG = null; stageClear();
    showScreen('screen-local-setup');
  } else {
    stopRoom();
    LG = null; OG = null; mode = null; myOnlineIndex = null; stageClear();
    showScreen('screen-menu');
  }
};

// Room code input: force uppercase
document.getElementById('room-code-input').addEventListener('input', function () {
  this.value = this.value.toUpperCase();
});

// ═══════════════════════════════════════════════════════
//  Pile popup  — click pile zone to inspect all cards
// ═══════════════════════════════════════════════════════
document.getElementById('pile-zone').addEventListener('click', () => {
  const pile = mode === 'local' ? LG?.pile : OG?.pile;
  if (!pile || pile.length === 0) return;
  document.getElementById('pile-modal-count').textContent = pile.length;
  const cardsEl = document.getElementById('pile-modal-cards');
  cardsEl.innerHTML = '';
  [...pile].reverse().forEach(card => {
    const el = makeCardEl(card);
    el.style.pointerEvents = 'none';
    cardsEl.appendChild(el);
  });
  document.getElementById('pile-modal').classList.remove('hidden');
});

document.getElementById('btn-close-pile').addEventListener('click', () => {
  document.getElementById('pile-modal').classList.add('hidden');
});

document.getElementById('pile-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('pile-modal').classList.add('hidden');
});

document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('pile-modal').classList.add('hidden');
});
