const express = require('express');
const { createServer } = require('http');
const { Server } = require('socket.io');
const path = require('path');
const {
  dealGame, resolvePlay, isCardPlayable, getPlayerPhase,
  findFirstPlayer, hasPlayableCard,
  advanceTurnBy, applySkipAdvance
} = require('./public/gameLogic.js');

const app = express();
const httpServer = createServer(app);
const io = new Server(httpServer);
const PORT = process.env.PORT || 3000;

app.use(express.static(path.join(__dirname, 'public')));

// rooms: Map<code, RoomState>
const rooms = new Map();
// socketToRoom: Map<socketId, code>
const socketToRoom = new Map();

function genCode() {
  const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
  let code;
  do { code = Array.from({length:4}, () => chars[Math.random()*chars.length|0]).join(''); }
  while (rooms.has(code));
  return code;
}

function makePlayer(socketId, name) {
  return { socketId, name, hand:[], faceUp:[], faceDown:[], finished:false, finishOrder:null };
}

function publicPlayer(p) {
  return {
    name: p.name,
    handCount: p.hand.length,
    faceUp: p.faceUp,
    faceDownCount: p.faceDown.length,
    finished: p.finished,
    finishOrder: p.finishOrder,
    socketId: p.socketId
  };
}

function sendGameState(room) {
  room.players.forEach((p, myIndex) => {
    const sock = io.sockets.sockets.get(p.socketId);
    if (!sock) return;
    sock.emit('gameState', {
      myIndex,
      hand: p.hand,
      faceUp: p.faceUp,
      faceDownCount: p.faceDown.length,
      pile: room.pile,
      deckCount: room.deck.length,
      sevenActive: room.sevenActive,
      direction: room.direction,
      currentPlayerIndex: room.currentPlayerIndex,
      phase: room.phase,
      loserIndex: room.loserIndex,
      finishOrderCounter: room.finishOrderCounter,
      players: room.players.map(publicPlayer)
    });
  });
}

function advanceTurn(room) {
  room.currentPlayerIndex = advanceTurnBy(
    room.players, room.currentPlayerIndex, 1, room.direction
  );
}

// Apply turn change after a play, given the resolvePlay() result.
// Returns true if the same player goes again (extra turn).
function applyTurnChange(room, playerIndex, res) {
  const player = room.players[playerIndex];

  // 9 reverses direction (applied before computing next index)
  if (res.reverseDirection) room.direction = -room.direction;

  // 10 / 4-of-a-kind: same player goes again (unless they finished)
  if (res.extraTurn && !player.finished) return true;

  // 8: skip N players, capped at "can't skip yourself"
  if (res.skipCount > 0) {
    const next = applySkipAdvance(
      room.players, playerIndex, res.skipCount, room.direction
    );
    // If finished player would have got an extra turn from skip, advance normally
    if (next === playerIndex && player.finished) {
      advanceTurn(room);
    } else {
      room.currentPlayerIndex = next;
    }
    return false;
  }

  // Normal advance
  advanceTurn(room);
  return false;
}

function checkFinished(room, playerIndex) {
  const p = room.players[playerIndex];
  if (!p.finished && p.hand.length === 0 && p.faceUp.length === 0 && p.faceDown.length === 0) {
    p.finished = true;
    p.finishOrder = room.finishOrderCounter++;
    return true;
  }
  return false;
}

function checkGameOver(room) {
  const active = room.players.filter(p => !p.finished);
  if (active.length <= 1) {
    room.phase = 'ended';
    if (active.length === 1) room.loserIndex = room.players.indexOf(active[0]);
    return true;
  }
  return false;
}

function drawCards(room, playerIndex) {
  const p = room.players[playerIndex];
  while (p.hand.length < 3 && room.deck.length > 0)
    p.hand.push(room.deck.pop());
}

function processAction(room, playerIndex, action) {
  if (room.phase !== 'play') return { error: 'Game not in play phase' };
  if (playerIndex !== room.currentPlayerIndex) return { error: 'Not your turn' };

  const player = room.players[playerIndex];
  const phase = getPlayerPhase(player);

  if (action.type === 'pickup') {
    if (room.pile.length === 0) return { error: 'Pile is empty' };
    player.hand.push(...room.pile);
    room.pile = [];
    room.sevenActive = false;
    advanceTurn(room);
    checkGameOver(room);
    return { ok: true };
  }

  if (action.type === 'playFaceDown') {
    if (phase !== 'faceDown') return { error: 'Wrong phase' };
    const idx = action.index;
    if (idx < 0 || idx >= player.faceDown.length) return { error: 'Invalid index' };
    const card = player.faceDown.splice(idx, 1)[0];
    if (!isCardPlayable(card, room.pile, room.sevenActive)) {
      player.hand.push(card, ...room.pile);
      room.pile = [];
      room.sevenActive = false;
      advanceTurn(room);
      checkGameOver(room);
      return { ok: true, faceDownFailed: true };
    }
    const res = resolvePlay([card], room.pile, room.sevenActive);
    room.pile = res.newPile;
    room.sevenActive = res.newSevenActive;
    checkFinished(room, playerIndex);
    if (!checkGameOver(room)) applyTurnChange(room, playerIndex, res);
    return { ok: true };
  }

  if (action.type === 'playCards') {
    const cards = action.cards;
    if (!cards || !cards.length) return { error: 'No cards' };
    const rank = cards[0].rank;
    if (!cards.every(c => c.rank === rank)) return { error: 'Cards must be same rank' };
    if (!isCardPlayable(cards[0], room.pile, room.sevenActive)) return { error: 'Card not playable' };

    // Verify player actually has these cards; use server's own objects for pile
    const source = phase === 'hand' ? player.hand : player.faceUp;
    const cardIds = new Set(cards.map(c => c.id));
    const actualCards = source.filter(c => cardIds.has(c.id));
    if (actualCards.length !== cards.length) return { error: 'You do not have those cards' };
    if (!actualCards.every(c => c.rank === rank)) return { error: 'Cards must be same rank' };

    // Remove from source
    if (phase === 'hand') {
      player.hand = player.hand.filter(c => !cardIds.has(c.id));
    } else {
      player.faceUp = player.faceUp.filter(c => !cardIds.has(c.id));
    }

    const res = resolvePlay(actualCards, room.pile, room.sevenActive);
    room.pile = res.newPile;
    room.sevenActive = res.newSevenActive;

    if (phase === 'hand') drawCards(room, playerIndex);

    checkFinished(room, playerIndex);
    if (!checkGameOver(room)) applyTurnChange(room, playerIndex, res);
    return { ok: true };
  }

  return { error: 'Unknown action' };
}

io.on('connection', socket => {
  console.log('connected:', socket.id);

  socket.on('createRoom', ({ name }) => {
    const code = genCode();
    const room = {
      code,
      hostId: socket.id,
      phase: 'lobby',
      players: [makePlayer(socket.id, name || 'Player')],
      deck: [],
      pile: [],
      sevenActive: false,
      direction: 1,
      currentPlayerIndex: 0,
      loserIndex: null,
      finishOrderCounter: 1,
      swapReady: new Set()
    };
    rooms.set(code, room);
    socketToRoom.set(socket.id, code);
    socket.join(`room_${code}`);
    socket.emit('roomCreated', { code, playerIndex: 0 });
    socket.emit('lobbyState', { code, players: room.players.map(p => ({ name: p.name, id: p.socketId })), isHost: true });
  });

  socket.on('joinRoom', ({ code, name }) => {
    const room = rooms.get(code.toUpperCase());
    if (!room) { socket.emit('error', { msg: 'Room not found' }); return; }
    if (room.phase !== 'lobby') { socket.emit('error', { msg: 'Game already started' }); return; }
    if (room.players.length >= 5) { socket.emit('error', { msg: 'Room is full' }); return; }

    room.players.push(makePlayer(socket.id, name || 'Player'));
    socketToRoom.set(socket.id, code.toUpperCase());
    socket.join(`room_${code.toUpperCase()}`);

    const lobbyData = { code: room.code, players: room.players.map(p => ({ name: p.name, id: p.socketId })), isHost: false };
    socket.emit('roomJoined', { playerIndex: room.players.length - 1 });
    io.to(`room_${room.code}`).emit('lobbyState', lobbyData);
  });

  socket.on('startGame', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.hostId !== socket.id) return;
    if (room.players.length < 2) { socket.emit('error', { msg: 'Need at least 2 players' }); return; }

    room.phase = 'swap';
    room.swapReady.clear();
    room.finishOrderCounter = 1;

    const dealt = dealGame(room.players.length);
    room.deck = dealt.remainingDeck;
    dealt.players.forEach((dp, i) => {
      room.players[i].hand = dp.hand;
      room.players[i].faceUp = dp.faceUp;
      room.players[i].faceDown = dp.faceDown;
      room.players[i].finished = false;
      room.players[i].finishOrder = null;
    });

    room.players.forEach((p, i) => {
      const sock = io.sockets.sockets.get(p.socketId);
      if (!sock) return;
      sock.emit('swapPhase', { hand: p.hand, faceUp: p.faceUp, playerIndex: i, totalPlayers: room.players.length });
    });
  });

  socket.on('readyToPlay', ({ hand, faceUp }) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room || room.phase !== 'swap') return;

    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex < 0) return;
    const player = room.players[playerIndex];

    // Validate: same 6 cards
    const origIds = new Set([...player.hand, ...player.faceUp].map(c => c.id));
    const newIds = [...hand, ...faceUp].map(c => c.id);
    if (newIds.length !== 6 || !newIds.every(id => origIds.has(id))) {
      socket.emit('error', { msg: 'Invalid swap' }); return;
    }

    player.hand = hand;
    player.faceUp = faceUp;
    room.swapReady.add(socket.id);

    io.to(`room_${code}`).emit('playerReady', { name: player.name, readyCount: room.swapReady.size, total: room.players.length });

    if (room.swapReady.size === room.players.length) {
      room.phase = 'play';
      room.pile = [];
      room.sevenActive = false;
      room.direction = 1;
      room.currentPlayerIndex = findFirstPlayer(room.players);
      sendGameState(room);
    }
  });

  socket.on('gameAction', (action) => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    const room = rooms.get(code);
    if (!room) return;
    const playerIndex = room.players.findIndex(p => p.socketId === socket.id);
    if (playerIndex < 0) return;

    const result = processAction(room, playerIndex, action);
    if (result.error) { socket.emit('error', { msg: result.error }); return; }
    sendGameState(room);
  });

  socket.on('disconnect', () => {
    const code = socketToRoom.get(socket.id);
    if (!code) return;
    socketToRoom.delete(socket.id);
    const room = rooms.get(code);
    if (!room) return;

    const idx = room.players.findIndex(p => p.socketId === socket.id);
    if (idx < 0) return;
    const name = room.players[idx].name;

    if (room.phase === 'lobby') {
      room.players.splice(idx, 1);
      if (room.players.length === 0) { rooms.delete(code); return; }
      if (room.hostId === socket.id) room.hostId = room.players[0].socketId;
      io.to(`room_${code}`).emit('lobbyState', {
        code, players: room.players.map(p => ({ name: p.name, id: p.socketId })),
        isHost: false
      });
      room.players.forEach(p => {
        const s = io.sockets.sockets.get(p.socketId);
        if (s) s.emit('lobbyState', { code, players: room.players.map(q => ({ name: q.name, id: q.socketId })), isHost: p.socketId === room.hostId });
      });
    } else if (room.phase === 'play' || room.phase === 'swap') {
      io.to(`room_${code}`).emit('playerDisconnected', { name });
      room.phase = 'ended';
      sendGameState(room);
    }
  });
});

httpServer.listen(PORT, () => console.log(`Shithead running at http://localhost:${PORT}`));
