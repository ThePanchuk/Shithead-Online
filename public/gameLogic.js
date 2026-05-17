// Shared game logic for Shithead card game

const SUITS = ['♣', '♦', '♥', '♠'];
const RANKS = ['2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K', 'A'];
const RANK_VALUES = { '3':3,'4':4,'5':5,'6':6,'7':7,'8':8,'9':9,'10':10,'J':11,'Q':12,'K':13,'A':14,'2':15 };
const SUIT_ORDER  = { '♣':0,'♦':1,'♥':2,'♠':3 };

function createDeck() {
  const deck = [];
  let id = 0;
  for (const suit of SUITS)
    for (const rank of RANKS)
      deck.push({ suit, rank, id: id++, value: RANK_VALUES[rank] });
  return deck;
}

function shuffle(arr) {
  const a = [...arr];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function dealGame(numPlayers) {
  const deck = shuffle(createDeck());
  const players = [];
  for (let i = 0; i < numPlayers; i++) {
    players.push({
      hand:     deck.splice(0, 3),
      faceUp:   deck.splice(0, 3),
      faceDown: deck.splice(0, 3)
    });
  }
  return { players, remainingDeck: deck };
}

function getTopCard(pile) {
  return pile.length > 0 ? pile[pile.length - 1] : null;
}

// The effective top is the last non-3 card.
// Because 3 mirrors whatever was played before it, the comparison rank
// for "can I play this card?" skips all 3s on top.
function getEffectiveTop(pile) {
  for (let i = pile.length - 1; i >= 0; i--) {
    if (pile[i].rank !== '3') return pile[i];
  }
  return null; // pile is empty or all 3s → treat as open
}

// ─────────────────────────────────────────────────────────
//  isCardPlayable
//  Special cards that are ALWAYS playable: 2, 3, 10
//  After a 7: next must play strictly < 7 (or 2 / 3 / 10)
//  Otherwise: must match or beat the effective top card value
// ─────────────────────────────────────────────────────────
function isCardPlayable(card, pile, sevenActive) {
  if (pile.length === 0) return true;
  if (card.rank === '2' || card.rank === '10' || card.rank === '3') return true;
  const effectiveTop = getEffectiveTop(pile);
  if (!effectiveTop || effectiveTop.rank === '2') return true; // 2 is wild
  if (sevenActive) return card.value < 7; // strictly less
  return card.value >= effectiveTop.value;
}

function hasPlayableCard(cards, pile, sevenActive) {
  return cards.some(c => isCardPlayable(c, pile, sevenActive));
}

function countTopRank(pile) {
  if (!pile.length) return 0;
  const topRank = pile[pile.length - 1].rank;
  let n = 0;
  for (let i = pile.length - 1; i >= 0 && pile[i].rank === topRank; i--) n++;
  return n;
}

// ─────────────────────────────────────────────────────────
//  resolvePlay
//  Returns:
//    newPile          — pile after this play (may be empty if burned)
//    burned           — true if pile was cleared
//    extraTurn        — true if same player goes again (10 / 4-of-a-kind)
//    newSevenActive   — whether the ≤6 restriction applies next turn
//    skipCount        — number of players to skip (from 8s)
//    reverseDirection — true if play direction should flip (from 9s)
// ─────────────────────────────────────────────────────────
function resolvePlay(cards, currentPile, sevenActive) {
  if (sevenActive === undefined) sevenActive = false;
  const newPile = [...currentPile, ...cards];
  const rank = cards[0].rank;

  // 10 → burn pile, extra turn, clear all effects
  if (rank === '10') {
    return { newPile: [], burned: true, extraTurn: true,
             newSevenActive: false, skipCount: 0, reverseDirection: false };
  }

  // Four of a kind → burn pile, extra turn
  if (countTopRank(newPile) >= 4) {
    return { newPile: [], burned: true, extraTurn: true,
             newSevenActive: false, skipCount: 0, reverseDirection: false };
  }

  // 3 → mirrors the card below; apply that card's effect
  if (rank === '3') {
    const mirrored = getEffectiveTop(currentPile); // last non-3 before this play
    // No card below, or wild 2 below → no special effect
    if (!mirrored || mirrored.rank === '2') {
      return { newPile, burned: false, extraTurn: false,
               newSevenActive: sevenActive, skipCount: 0, reverseDirection: false };
    }
    const mr = mirrored.rank;
    if (mr === '10') {
      // Mirror a 10 → burn pile, extra turn
      return { newPile: [], burned: true, extraTurn: true,
               newSevenActive: false, skipCount: 0, reverseDirection: false };
    }
    if (mr === '8') {
      // Mirror an 8 → skip 1 player
      return { newPile, burned: false, extraTurn: false,
               newSevenActive: false, skipCount: 1, reverseDirection: false };
    }
    if (mr === '9') {
      // Mirror a 9 → reverse direction
      return { newPile, burned: false, extraTurn: false,
               newSevenActive: false, skipCount: 0, reverseDirection: true };
    }
    if (mr === '7') {
      // Mirror a 7 → next player must still play < 7
      return { newPile, burned: false, extraTurn: false,
               newSevenActive: true, skipCount: 0, reverseDirection: false };
    }
    // Any other rank → no special effect; 3 acts as that value only for playability
    return { newPile, burned: false, extraTurn: false,
             newSevenActive: false, skipCount: 0, reverseDirection: false };
  }

  // 8 → skip the next N players (N = number of 8s played at once)
  if (rank === '8') {
    return { newPile, burned: false, extraTurn: false,
             newSevenActive: false, skipCount: cards.length, reverseDirection: false };
  }

  // 9 → reverse direction; only one reversal regardless of how many 9s
  if (rank === '9') {
    return { newPile, burned: false, extraTurn: false,
             newSevenActive: false, skipCount: 0, reverseDirection: true };
  }

  // 7 → next player must play strictly < 7
  return { newPile, burned: false, extraTurn: false,
           newSevenActive: rank === '7', skipCount: 0, reverseDirection: false };
}

// ─────────────────────────────────────────────────────────
//  Turn advancement helpers (shared between server & client)
// ─────────────────────────────────────────────────────────

function countActivePlayers(players) {
  return players.filter(p => !p.finished).length;
}

// Advance fromIdx by 'count' active-player positions in direction (1 or -1).
function advanceTurnBy(players, fromIdx, count, direction) {
  const n = players.length;
  let idx = fromIdx;
  let steps = 0;
  let guard = n * (count + 2); // safety limit
  while (steps < count && guard-- > 0) {
    idx = ((idx + direction) % n + n) % n;
    if (!players[idx].finished) steps++;
  }
  return idx;
}

// Compute next index after 8-skip rule.
// Rules: each 8 skips one player; "can't skip yourself" caps effective skips
// at (numActive - 1).  If all opponents would be skipped → returns fromIdx
// (caller should treat this as extra turn for current player).
function applySkipAdvance(players, fromIdx, skipCount, direction) {
  const numActive = countActivePlayers(players);
  if (numActive <= 1) return fromIdx;
  const effectiveSkips = Math.min(skipCount, numActive - 1);
  const toAdvance = effectiveSkips + 1;
  if (toAdvance >= numActive) return fromIdx; // extra turn
  return advanceTurnBy(players, fromIdx, toAdvance, direction);
}

function getPlayerPhase(player) {
  if (player.hand.length > 0)     return 'hand';
  if (player.faceUp.length > 0)   return 'faceUp';
  if (player.faceDown.length > 0) return 'faceDown';
  return 'done';
}

function findFirstPlayer(players) {
  let bestVal = 99, bestSuit = 4, bestIdx = 0;
  for (let i = 0; i < players.length; i++) {
    for (const card of players[i].hand) {
      const v = card.rank === '2' ? 16 : card.value;
      const s = SUIT_ORDER[card.suit] ?? 4;
      if (v < bestVal || (v === bestVal && s < bestSuit)) {
        bestVal = v; bestSuit = s; bestIdx = i;
      }
    }
  }
  return bestIdx;
}

// Bot swap: keep 10s and 2s in hand; put high cards face-up
function botSwap(hand, faceUp) {
  const all = [...hand, ...faceUp];
  all.sort((a, b) => {
    const score = c => c.rank === '10' ? -2 : c.rank === '2' ? -1 : c.value;
    return score(a) - score(b);
  });
  return { hand: all.slice(0, 3), faceUp: all.slice(3, 6) };
}

// ─────────────────────────────────────────────────────────
//  Bot play decision
//  Priority:
//    1. Complete 4-of-a-kind on top of pile (always best)
//    2. Use 10 to burn pile (aggressive — good clearing move)
//    3. Use 8 to skip next player (tactical)
//    4. Play lowest-value regular card
//    5. Use 2 as last resort (wild)
// ─────────────────────────────────────────────────────────
function botChoosePlay(player, pile, sevenActive) {
  const phase = getPlayerPhase(player);
  if (phase === 'done') return null;
  if (phase === 'faceDown') return { action: 'playFaceDown', index: 0 };

  const source = phase === 'hand' ? player.hand : player.faceUp;

  // Group playable cards by rank
  const byRank = {};
  for (const card of source) {
    if (isCardPlayable(card, pile, sevenActive)) {
      if (!byRank[card.rank]) byRank[card.rank] = [];
      byRank[card.rank].push(card);
    }
  }

  const playableRanks = Object.keys(byRank);
  if (!playableRanks.length) return { action: 'pickup' };

  // 1. Complete 4-of-a-kind on top of pile
  if (pile.length) {
    const topRank = getEffectiveTop(pile)?.rank;
    if (topRank && byRank[topRank] && byRank[topRank].length + countTopRank(pile) >= 4)
      return { action: 'play', cards: byRank[topRank] };
  }

  // 2. Burn pile with 10 if pile has more than 4 cards (it's getting risky)
  if (byRank['10'] && pile.length > 4)
    return { action: 'play', cards: byRank['10'] };

  // 3. Play 8 (skip next player) — always tactically good
  if (byRank['8'])
    return { action: 'play', cards: byRank['8'] };

  // 4. Play lowest regular card (excludes 2; includes 3,4,5,6,7,9,J,Q,K,A,10)
  const nonTwo = playableRanks.filter(r => r !== '2');
  if (nonTwo.length) {
    const rank = nonTwo.reduce((a, b) => RANK_VALUES[a] < RANK_VALUES[b] ? a : b);
    return { action: 'play', cards: byRank[rank] };
  }

  // 5. Last resort: wild 2
  return { action: 'play', cards: byRank['2'] };
}

if (typeof module !== 'undefined') {
  module.exports = {
    SUITS, RANKS, RANK_VALUES, SUIT_ORDER,
    createDeck, shuffle, dealGame,
    getTopCard, getEffectiveTop,
    isCardPlayable, hasPlayableCard,
    countTopRank, resolvePlay,
    countActivePlayers, advanceTurnBy, applySkipAdvance,
    getPlayerPhase, findFirstPlayer,
    botSwap, botChoosePlay
  };
}
