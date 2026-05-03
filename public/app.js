// ═══════════════════════════════════════════════════════
//  Globals
// ═══════════════════════════════════════════════════════
let socket = null;
let mode   = null;   // 'local' | 'online'

// Local game state
let LG = null;       // local game object
let selectedCards = [];  // array of card objects currently selected
let swapHandIdx = -1;    // index of selected hand card in swap phase

// Online game state
let OG = null;       // last gameState received from server
let myOnlineIndex = null;

// Settings
let useSevenRule = true;

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
//  Card DOM helpers
// ═══════════════════════════════════════════════════════
function makeCardEl(card, opts = {}) {
  const el = document.createElement('div');
  el.className = 'card' + (isRed(card) ? ' red' : ' black') + (opts.small ? ' card-sm' : '');
  if (opts.selected) el.classList.add('selected');
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
// faceDownLen can be a number (online) or array length (local).
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
      if (playable && opt.onFaceDownClick) {
        fdEl.onclick = () => opt.onFaceDownClick(i);
      }
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
      if (canPlay && opt.onFaceUpClick) {
        fuEl.onclick = () => opt.onFaceUpClick(card);
      }
      stack.appendChild(fuEl);
    }
    zone.appendChild(stack);
  }
}

// Build a slot for one opponent. faceDownLen + faceUp + handCount come from
// the appropriate source (local: arrays, online: counts).
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

  // Mini cascading stacks (face-up over face-down)
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

  // Opponent hand: overlapping backs (capped visually) + count badge
  if (handCount > 0) {
    const handRow = document.createElement('div');
    handRow.className = 'opp-hand-row';

    const fan = document.createElement('div');
    fan.className = 'opp-hand-fan';
    const visible = Math.min(handCount, MAX_VISIBLE_HAND_BACKS);
    for (let i = 0; i < visible; i++) {
      fan.appendChild(makeBackEl({ small: true }));
    }
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
    // showing only their right border (right edge with rotated rank/suit).
    const peek = parseFloat(
      getComputedStyle(document.documentElement).getPropertyValue('--pile-peek')
    ) || 16;
    const show = pile.slice(-3);
    show.forEach((card, i) => {
      const el = makeCardEl(card);
      // i=0 oldest → rightmost; i=show.length-1 newest → leftmost (pos=0)
      const pos = show.length - 1 - i;   // 0 = newest/top
      el.style.left   = `${pos * peek}px`;
      el.style.zIndex = show.length - pos; // newest = highest z
      zone.appendChild(el);
    });
  }
  document.getElementById('pile-count').textContent = pile ? pile.length : 0;
}

// ═══════════════════════════════════════════════════════
//  LOCAL GAME  – state helpers
// ═══════════════════════════════════════════════════════
function localPlayerPhase(p) {
  return getPlayerPhase(p);
}

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

// Centralized turn-handling after a play. Mirrors the server's applyTurnChange.
// Returns true if the same player goes again.
function applyLocalTurnChange(playerIdx, res) {
  const p = LG.players[playerIdx];

  if (res.reverseDirection) {
    LG.direction = -LG.direction;
    toast(`🔄 Direction reversed!`);
  }

  if (res.extraTurn && !p.finished) {
    return true;
  }

  if (res.skipCount > 0) {
    const next = applySkipAdvance(LG.players, playerIdx, res.skipCount, LG.direction);
    if (next === playerIdx && p.finished) {
      // Finished player can't take an extra turn from skip — advance normally
      localAdvanceTurn(playerIdx);
      return false;
    }
    if (next === playerIdx) {
      toast('⏭️ All opponents skipped — extra turn!');
      return true;
    }
    const numActive = LG.players.filter(q => !q.finished).length;
    const skipped = Math.min(res.skipCount, numActive - 1);
    toast(`⏭️ ${skipped} player${skipped > 1 ? 's' : ''} skipped!`);
    LG.currentPlayer = next;
    return false;
  }

  localAdvanceTurn(playerIdx);
  return false;
}

// Apply a validated play to local game state.
// Returns the resolvePlay() result so caller can act on extraTurn / skips.
function localApplyPlay(playerIdx, cards) {
  const p = LG.players[playerIdx];
  const phase = localPlayerPhase(p);
  const ids = new Set(cards.map(c => c.id));

  if (phase === 'hand') {
    p.hand = p.hand.filter(c => !ids.has(c.id));
  } else if (phase === 'faceUp') {
    p.faceUp = p.faceUp.filter(c => !ids.has(c.id));
  } else if (phase === 'faceDown') {
    p.faceDown = p.faceDown.filter(c => !ids.has(c.id));
  }

  const res = resolvePlay(cards, LG.pile, LG.sevenActive);
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

  if (decision.action === 'playFaceDown') {
    const card = p.faceDown[0];
    p.faceDown.splice(0, 1);
    if (!isCardPlayable(card, LG.pile, LG.sevenActive)) {
      p.hand.push(card, ...LG.pile);
      LG.pile = [];
      LG.sevenActive = false;
      toast(`${p.name} flipped ${card.rank}${card.suit} — can't play, picks up!`);
      localAdvanceTurn(botIdx);
    } else {
      const res = resolvePlay([card], LG.pile, LG.sevenActive);
      LG.pile = res.newPile;
      LG.sevenActive = useSevenRule ? res.newSevenActive : false;
      localCheckFinished(botIdx);
      applyLocalTurnChange(botIdx, res);
    }
    afterBotAction();
    return;
  }

  if (decision.action === 'play') {
    const res = localApplyPlay(botIdx, decision.cards);
    toast(`${p.name} plays ${decision.cards.map(c => c.rank + c.suit).join(' ')}`);
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

  const human     = LG.players[0];
  const isMyTurn  = LG.currentPlayer === 0 && !human.finished;
  const humanPhase = localPlayerPhase(human);

  // Header
  document.getElementById('game-status-bar').textContent = (() => {
    if (LG.phase === 'ended') return 'Game Over';
    const cur = LG.players[LG.currentPlayer];
    if (LG.currentPlayer === 0) return '▶ Your turn!';
    return `${cur.name}'s turn…`;
  })();
  document.getElementById('deck-num').textContent = LG.deck.length;
  document.getElementById('deck-count').textContent = LG.deck.length;
  document.getElementById('seven-warning').classList.toggle('hidden', !LG.sevenActive);
  const dirEl = document.getElementById('direction-indicator');
  if (dirEl) dirEl.textContent = LG.direction === 1 ? '↻' : '↺';

  // Pile
  renderPile(LG.pile);

  // Human name tag
  const nameTag = document.getElementById('human-name');
  nameTag.textContent = human.name;
  nameTag.classList.toggle('is-turn', isMyTurn);

  // Human tableau — face-up cards cascading over face-down
  renderHumanStacks(human.faceDown.length, human.faceUp, {
    isMyTurn,
    phase: humanPhase,
    pile: LG.pile,
    sevenActive: LG.sevenActive,
    onFaceDownClick: i => humanPlayFaceDown(i),
    onFaceUpClick: card => toggleSelectCard(card, 'faceUp')
  });

  // Human hand
  const handZone = document.getElementById('human-hand');
  handZone.innerHTML = '';
  human.hand.forEach(card => {
    const canPlay = isMyTurn && humanPhase === 'hand' && isCardPlayable(card, LG.pile, LG.sevenActive);
    const sel = selectedCards.some(c => c.id === card.id);
    const el = makeCardEl(card, { selected: sel, unplayable: isMyTurn && humanPhase === 'hand' && !canPlay });
    if (isMyTurn && humanPhase === 'hand') {
      el.onclick = () => toggleSelectCard(card, 'hand');
    }
    handZone.appendChild(el);
  });

  // Action buttons
  const btnPlay   = document.getElementById('btn-play-selected');
  const btnPickup = document.getElementById('btn-pickup');
  const canShowActions = isMyTurn && (humanPhase === 'hand' || humanPhase === 'faceUp');
  btnPlay.classList.toggle('hidden', !canShowActions || selectedCards.length === 0);
  btnPickup.classList.toggle('hidden', !canShowActions || LG.pile.length === 0);

  // Opponents
  renderOpponents(LG.players, LG.currentPlayer, false /* local, not online */);
}

function renderOpponents(players, currentPlayerIdx, isOnline) {
  const area = document.getElementById('opponents-area');
  area.innerHTML = '';
  const startIdx = isOnline ? 0 : 1; // in local mode, player 0 is human shown separately
  for (let i = startIdx; i < players.length; i++) {
    if (!isOnline && i === 0) continue;
    const p = players[i];
    const fdLen = isOnline ? p.faceDownCount : p.faceDown.length;
    const fuArr = p.faceUp || [];
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
  const idx = selectedCards.findIndex(c => c.id === card.id);
  if (idx >= 0) {
    selectedCards.splice(idx, 1);
  } else {
    // Deselect if different rank
    if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) selectedCards = [];
    selectedCards.push(card);
  }
  renderLocalGame();
}

function humanPlayFaceDown(faceDownIdx) {
  if (LG.currentPlayer !== 0) return;
  const p = LG.players[0];
  if (localPlayerPhase(p) !== 'faceDown') return;

  const card = p.faceDown[faceDownIdx];
  p.faceDown.splice(faceDownIdx, 1);

  if (!isCardPlayable(card, LG.pile, LG.sevenActive)) {
    p.hand.push(card, ...LG.pile);
    LG.pile = [];
    LG.sevenActive = false;
    toast(`Flipped ${card.rank}${card.suit} — can't play! Picked up pile.`);
    localAdvanceTurn(0);
  } else {
    const res = resolvePlay([card], LG.pile, LG.sevenActive);
    LG.pile = res.newPile;
    LG.sevenActive = useSevenRule ? res.newSevenActive : false;
    localCheckFinished(0);
    localCheckGameOver();
    if (LG.phase !== 'ended') {
      if (res.burned) toast('🔥 Pile burned — extra turn!');
      applyLocalTurnChange(0, res);
    }
  }
  selectedCards = [];
  renderLocalGame();
  if (LG.phase === 'ended') showGameOver();
  else scheduleTurn();
}

document.getElementById('btn-play-selected').onclick = () => {
  if (!LG || !selectedCards.length) return;
  const p = LG.players[0];
  const phase = localPlayerPhase(p);
  if (LG.currentPlayer !== 0 || !['hand','faceUp'].includes(phase)) return;
  if (!isCardPlayable(selectedCards[0], LG.pile, LG.sevenActive)) { toast('Cannot play those cards'); return; }

  const res = localApplyPlay(0, selectedCards);
  selectedCards = [];
  localCheckGameOver();
  if (LG.phase !== 'ended') {
    if (res.burned) toast('🔥 Pile burned — extra turn!');
    applyLocalTurnChange(0, res);
  }
  renderLocalGame();
  if (LG.phase === 'ended') showGameOver();
  else scheduleTurn();
};

document.getElementById('btn-pickup').onclick = () => {
  if (LG.currentPlayer !== 0) return;
  localPickup(0);
  selectedCards = [];
  localAdvanceTurn(0);
  localCheckGameOver();
  renderLocalGame();
  if (LG.phase === 'ended') showGameOver();
  else scheduleTurn();
};

// ═══════════════════════════════════════════════════════
//  SWAP PHASE  (local)
// ═══════════════════════════════════════════════════════
function renderSwap(hand, faceUp) {
  const fuZone = document.getElementById('swap-faceup');
  const hZone  = document.getElementById('swap-hand');
  fuZone.innerHTML = '';
  hZone.innerHTML  = '';

  faceUp.forEach((card, i) => {
    const el = makeCardEl(card, { selected: false });
    el.onclick = () => {
      if (swapHandIdx < 0) { toast('Select a hand card first'); return; }
      const tmp = hand[swapHandIdx];
      hand[swapHandIdx] = card;
      faceUp[i] = tmp;
      swapHandIdx = -1;
      renderSwap(hand, faceUp);
    };
    fuZone.appendChild(el);
  });

  hand.forEach((card, i) => {
    const sel = (swapHandIdx === i);
    const el = makeCardEl(card, { selected: sel });
    el.onclick = () => {
      swapHandIdx = (swapHandIdx === i) ? -1 : i;
      renderSwap(hand, faceUp);
    };
    hZone.appendChild(el);
  });
}

function startLocalSwap() {
  const human = LG.players[0];
  swapHandIdx = -1;

  // Bots do their swap instantly
  for (let i = 1; i < LG.players.length; i++) {
    const bot = LG.players[i];
    const swapped = botSwap(bot.hand, bot.faceUp);
    bot.hand   = swapped.hand;
    bot.faceUp = swapped.faceUp;
  }

  showScreen('screen-swap');
  renderSwap(human.hand, human.faceUp);
}

document.getElementById('btn-swap-ready').onclick = () => {
  if (mode === 'local') {
    // Confirm human swap (hand/faceUp were mutated in place already)
    LG.phase = 'play';
    LG.currentPlayer = findFirstPlayer(LG.players);
    selectedCards = [];
    showScreen('screen-game');
    renderLocalGame();
    scheduleTurn();
  } else if (mode === 'online') {
    // Send final arrangement to server
    const fuZone = document.getElementById('swap-faceup');
    const hZone  = document.getElementById('swap-hand');
    const hand   = [...hZone.querySelectorAll('.card')].map(el => OG._swapHand.find(c => c.id == el.dataset.id)).filter(Boolean);
    const faceUp = [...fuZone.querySelectorAll('.card')].map(el => OG._swapFaceUp.find(c => c.id == el.dataset.id)).filter(Boolean);
    socket.emit('readyToPlay', { hand: OG._swapHand, faceUp: OG._swapFaceUp });
    document.getElementById('btn-swap-ready').disabled = true;
    document.getElementById('swap-status').textContent = 'Waiting for other players…';
  }
};

// ═══════════════════════════════════════════════════════
//  START LOCAL GAME
// ═══════════════════════════════════════════════════════
function startLocalGame() {
  const name    = document.getElementById('local-name').value.trim() || 'Player';
  useSevenRule  = document.getElementById('rule-seven').checked;
  const numBots = parseInt(document.querySelector('#bot-count-btns .btn-toggle.active').dataset.n);
  const botNames = ['🤖 Bot A','🤖 Bot B','🤖 Bot C','🤖 Bot D'];

  const dealt = dealGame(1 + numBots);

  LG = {
    phase: 'swap',
    currentPlayer: 0,
    sevenActive: false,
    direction: 1,
    deck: dealt.remainingDeck,
    pile: [],
    loserIndex: null,
    finishCounter: 1,
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
  const players = mode === 'local' ? LG.players : (OG ? OG.players : []);
  const loserIdx = mode === 'local' ? LG.loserIndex : (OG ? OG.loserIndex : null);

  const loser = loserIdx != null ? players[loserIdx] : null;
  const isHumanLoser = mode === 'local' ? loserIdx === 0 : loserIdx === myOnlineIndex;

  document.getElementById('gameover-emoji').textContent  = isHumanLoser ? '💩' : '🎉';
  document.getElementById('gameover-title').textContent  = isHumanLoser ? 'You are the Shithead!' : 'Game Over!';
  document.getElementById('gameover-result').innerHTML   = loser
    ? `<strong>${escHtml(loser.name)}</strong> is the 💩 <em>Shithead</em>`
    : 'No result';

  const ordered = [...players].filter(p => p.finishOrder != null).sort((a,b) => a.finishOrder - b.finishOrder);
  document.getElementById('finish-order-list').innerHTML =
    ordered.map((p,i) => `${['🥇','🥈','🥉'][i] || (i+1)+'.'} ${escHtml(p.name)}`).join('<br>') +
    (loser ? `<br>💩 ${escHtml(loser.name)} — Shithead` : '');

  showScreen('screen-gameover');
}

// ═══════════════════════════════════════════════════════
//  ONLINE MODE  – socket.io
// ═══════════════════════════════════════════════════════
function connectSocket() {
  if (socket && socket.connected) return;
  if (typeof io === 'undefined') {
    toast('⚠ Multiplayer server not available in this build', 5000);
    return;
  }
  socket = io({ timeout: 8000 });

  socket.on('connect_error', () => {
    toast('⚠ Cannot reach multiplayer server', 5000);
    const status = document.getElementById('lobby-status');
    if (status) status.textContent = 'Server unavailable — try again later.';
  });
  socket.on('connect', () => console.log('socket connected'));
  socket.on('error', ({ msg }) => toast('⚠ ' + msg));

  socket.on('roomCreated', ({ code, playerIndex }) => {
    myOnlineIndex = playerIndex;
    document.getElementById('room-code-display').textContent = code;
    document.getElementById('online-join-panel').classList.add('hidden');
    document.getElementById('online-lobby-panel').classList.remove('hidden');
    document.getElementById('btn-start-online').classList.remove('hidden');
  });

  socket.on('roomJoined', ({ playerIndex }) => {
    myOnlineIndex = playerIndex;
    document.getElementById('online-join-panel').classList.add('hidden');
    document.getElementById('online-lobby-panel').classList.remove('hidden');
  });

  socket.on('lobbyState', ({ code, players, isHost }) => {
    document.getElementById('room-code-display').textContent = code;
    const list = document.getElementById('lobby-player-list');
    list.innerHTML = players.map((p, i) =>
      `<div class="lobby-player${i===0?' host':''}">${escHtml(p.name)}</div>`
    ).join('');
    document.getElementById('lobby-status').textContent =
      `${players.length}/5 players — ${players.length < 2 ? 'Need at least 2 to start' : 'Ready to start!'}`;
    const btnStart = document.getElementById('btn-start-online');
    btnStart.classList.toggle('hidden', !isHost);
    if (isHost) btnStart.disabled = players.length < 2;
  });

  socket.on('playerReady', ({ name, readyCount, total }) => {
    document.getElementById('swap-status').textContent = `${readyCount}/${total} ready…`;
  });

  socket.on('swapPhase', ({ hand, faceUp, playerIndex, totalPlayers }) => {
    mode = 'online';
    myOnlineIndex = playerIndex;
    if (!OG) OG = {};
    OG._swapHand   = hand;
    OG._swapFaceUp = faceUp;
    swapHandIdx = -1;
    showScreen('screen-swap');
    document.getElementById('btn-swap-ready').disabled = false;
    document.getElementById('swap-status').textContent = '';
    // Render swap with mutable copies
    OG._swapHand   = [...hand];
    OG._swapFaceUp = [...faceUp];
    renderOnlineSwap();
  });

  socket.on('gameState', (state) => {
    OG = state;
    if (state.phase === 'play' || state.phase === 'ended') {
      if (document.getElementById('screen-swap').classList.contains('active') ||
          document.getElementById('screen-online').classList.contains('active')) {
        showScreen('screen-game');
      }
      renderOnlineGame(state);
      if (state.phase === 'ended') setTimeout(showGameOver, 800);
    }
  });

  socket.on('playerDisconnected', ({ name }) => {
    toast(`${name} disconnected — game ended`, 4000);
  });
}

// Online swap uses OG._swapHand and OG._swapFaceUp mutated in place
function renderOnlineSwap() {
  const fuZone = document.getElementById('swap-faceup');
  const hZone  = document.getElementById('swap-hand');
  fuZone.innerHTML = '';
  hZone.innerHTML  = '';

  OG._swapFaceUp.forEach((card, i) => {
    const el = makeCardEl(card);
    el.onclick = () => {
      if (swapHandIdx < 0) { toast('Select a hand card first'); return; }
      const tmp = OG._swapHand[swapHandIdx];
      OG._swapHand[swapHandIdx] = card;
      OG._swapFaceUp[i] = tmp;
      swapHandIdx = -1;
      renderOnlineSwap();
    };
    fuZone.appendChild(el);
  });

  OG._swapHand.forEach((card, i) => {
    const el = makeCardEl(card, { selected: swapHandIdx === i });
    el.onclick = () => {
      swapHandIdx = (swapHandIdx === i) ? -1 : i;
      renderOnlineSwap();
    };
    hZone.appendChild(el);
  });
}

// Override swap ready for online
document.getElementById('btn-swap-ready').onclick = function () {
  if (mode === 'local') {
    LG.phase = 'play';
    LG.currentPlayer = findFirstPlayer(LG.players);
    selectedCards = [];
    showScreen('screen-game');
    renderLocalGame();
    scheduleTurn();
  } else if (mode === 'online') {
    socket.emit('readyToPlay', { hand: OG._swapHand, faceUp: OG._swapFaceUp });
    this.disabled = true;
    document.getElementById('swap-status').textContent = 'Waiting for other players…';
  }
};

// ─── Online game rendering ───────────────────────────
function renderOnlineGame(state) {
  if (!state) return;
  const me = state.players[state.myIndex];
  const isMyTurn = state.currentPlayerIndex === state.myIndex;
  const humanPhase = me.finished ? 'done' :
    (state.hand.length > 0 ? 'hand' :
     (me.faceUp.length > 0 ? 'faceUp' :
      (state.faceDownCount > 0 ? 'faceDown' : 'done')));

  document.getElementById('game-status-bar').textContent = (() => {
    if (state.phase === 'ended') return 'Game Over';
    if (isMyTurn) return '▶ Your turn!';
    return `${escHtml(state.players[state.currentPlayerIndex].name)}'s turn…`;
  })();
  document.getElementById('deck-num').textContent  = state.deckCount;
  document.getElementById('deck-count').textContent = state.deckCount;
  document.getElementById('seven-warning').classList.toggle('hidden', !state.sevenActive);
  const dirEl = document.getElementById('direction-indicator');
  if (dirEl) dirEl.textContent = (state.direction === -1) ? '↺' : '↻';

  renderPile(state.pile);

  // Human name
  const nameTag = document.getElementById('human-name');
  nameTag.textContent = me.name;
  nameTag.classList.toggle('is-turn', isMyTurn);

  // Human tableau — face-up cards cascading over face-down
  renderHumanStacks(state.faceDownCount, me.faceUp, {
    isMyTurn,
    phase: humanPhase,
    pile: state.pile,
    sevenActive: state.sevenActive,
    onFaceDownClick: i => socket.emit('gameAction', { type: 'playFaceDown', index: i }),
    onFaceUpClick: card => onlineToggleSelect(card)
  });

  // Hand
  const handZone = document.getElementById('human-hand');
  handZone.innerHTML = '';
  state.hand.forEach(card => {
    const canPlay = isMyTurn && humanPhase === 'hand' && isCardPlayable(card, state.pile, state.sevenActive);
    const sel = selectedCards.some(c => c.id === card.id);
    const el = makeCardEl(card, { selected: sel, unplayable: isMyTurn && humanPhase === 'hand' && !canPlay });
    if (isMyTurn && humanPhase === 'hand') {
      el.onclick = () => onlineToggleSelect(card);
    }
    handZone.appendChild(el);
  });

  // Action buttons
  const canAct = isMyTurn && (humanPhase === 'hand' || humanPhase === 'faceUp');
  document.getElementById('btn-play-selected').classList.toggle('hidden', !canAct || selectedCards.length === 0);
  document.getElementById('btn-pickup').classList.toggle('hidden', !canAct || state.pile.length === 0);

  // Opponents (exclude self)
  const oArea = document.getElementById('opponents-area');
  oArea.innerHTML = '';
  state.players.forEach((p, i) => {
    if (i === state.myIndex) return;
    oArea.appendChild(buildOpponentSlot(
      p, i === state.currentPlayerIndex,
      p.faceDownCount, p.faceUp, p.handCount
    ));
  });
}

function onlineToggleSelect(card) {
  const idx = selectedCards.findIndex(c => c.id === card.id);
  if (idx >= 0) {
    selectedCards.splice(idx, 1);
  } else {
    if (selectedCards.length > 0 && selectedCards[0].rank !== card.rank) selectedCards = [];
    selectedCards.push(card);
  }
  renderOnlineGame(OG);
}

// Online play / pickup buttons
document.getElementById('btn-play-selected').onclick = function () {
  if (mode === 'online') {
    if (!selectedCards.length) return;
    socket.emit('gameAction', { type: 'playCards', cards: selectedCards });
    selectedCards = [];
  } else {
    // local – handled separately via the earlier onclick assignment above
    // (but btn-play-selected can be reassigned; let's handle both here)
    if (!LG || !selectedCards.length) return;
    const p = LG.players[0];
    const phase = localPlayerPhase(p);
    if (LG.currentPlayer !== 0 || !['hand','faceUp'].includes(phase)) return;
    if (!isCardPlayable(selectedCards[0], LG.pile, LG.sevenActive)) { toast('Cannot play those cards'); return; }
    const res = localApplyPlay(0, selectedCards);
    selectedCards = [];
    localCheckGameOver();
    if (LG.phase !== 'ended') {
      if (res.burned) toast('🔥 Pile burned — extra turn!');
      applyLocalTurnChange(0, res);
    }
    renderLocalGame();
    if (LG.phase === 'ended') showGameOver();
    else scheduleTurn();
  }
};

document.getElementById('btn-pickup').onclick = function () {
  if (mode === 'online') {
    socket.emit('gameAction', { type: 'pickup' });
    selectedCards = [];
  } else {
    if (!LG) return;
    localPickup(0);
    selectedCards = [];
    localAdvanceTurn(0);
    localCheckGameOver();
    renderLocalGame();
    if (LG.phase === 'ended') showGameOver();
    else scheduleTurn();
  }
};

// ═══════════════════════════════════════════════════════
//  Navigation / Menu events
// ═══════════════════════════════════════════════════════
document.getElementById('btn-vs-bots').onclick  = () => showScreen('screen-local-setup');
document.getElementById('btn-online').onclick   = () => { connectSocket(); showScreen('screen-online'); };
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
  socket.emit('createRoom', { name });
};

document.getElementById('btn-join-room').onclick = () => {
  const name = document.getElementById('online-name').value.trim() || 'Player';
  const code = document.getElementById('room-code-input').value.trim().toUpperCase();
  if (code.length !== 4) { toast('Enter a 4-character room code'); return; }
  socket.emit('joinRoom', { code, name });
};

document.getElementById('btn-start-online').onclick = () => socket.emit('startGame');

document.getElementById('btn-leave-room').onclick = () => {
  if (socket) socket.disconnect();
  socket = null;
  document.getElementById('online-join-panel').classList.remove('hidden');
  document.getElementById('online-lobby-panel').classList.add('hidden');
  showScreen('screen-menu');
};

document.getElementById('btn-go-menu').onclick = () => {
  LG = null; OG = null; selectedCards = []; mode = null;
  if (socket) { socket.disconnect(); socket = null; }
  showScreen('screen-menu');
};

document.getElementById('btn-go-again').onclick = () => {
  if (mode === 'local') {
    LG = null; selectedCards = [];
    showScreen('screen-local-setup');
  } else {
    LG = null; OG = null; selectedCards = []; mode = null;
    if (socket) { socket.disconnect(); socket = null; }
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
  // Show newest first (top of pile first)
  [...pile].reverse().forEach(card => {
    const el = makeCardEl(card);
    el.style.pointerEvents = 'none'; // non-interactive inside popup
    cardsEl.appendChild(el);
  });
  document.getElementById('pile-modal').classList.remove('hidden');
});

document.getElementById('btn-close-pile').addEventListener('click', () => {
  document.getElementById('pile-modal').classList.add('hidden');
});

// Close on backdrop click or Escape key
document.getElementById('pile-modal').addEventListener('click', e => {
  if (e.target === e.currentTarget) document.getElementById('pile-modal').classList.add('hidden');
});
document.addEventListener('keydown', e => {
  if (e.key === 'Escape') document.getElementById('pile-modal').classList.add('hidden');
});
