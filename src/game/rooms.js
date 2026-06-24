'use strict';
// 房间与房间管理：座位、准备、发牌开局、计时器（认领/出牌/续局）、庄家轮换、AI 机器人
const { Game } = require('./Game');
const T = require('./../mahjong/tile');
const AI = require('./ai');

const CLAIM_TIMEOUT = 15000;  // 认领超时（自动过）
const ACT_TIMEOUT = 30000;    // 出牌超时（自动打出）
const NEXT_TIMEOUT = 15000;   // 局间续局超时（自动开下一局）
let botSeq = 1;

let roomSeq = 1000;

class Room {
  constructor(manager) {
    this.id = String(++roomSeq);
    this.manager = manager;
    this.seats = [null, null, null, null]; // 每座位的 playerId
    this.ready = [false, false, false, false];
    this.scores = [0, 0, 0, 0];
    this.dealer = 0;
    this.quanfeng = T.TILE_E;
    this.game = null;
    this.handNo = 0;
    this.timer = null;
    this.timerKind = null;
    this.botTimer = null;
  }

  isBot(seat) { const pid = this.seats[seat]; const p = pid && this.manager.players.get(pid); return !!(p && p.isBot); }
  hasHumans() { return this.seats.some((pid) => pid && !(this.manager.players.get(pid) || {}).isBot); }
  isFull() { return this.seats.every((s) => s !== null); }
  isEmpty() { return this.seats.every((s) => s === null); }
  seatOf(playerId) { return this.seats.indexOf(playerId); }
  occupiedCount() { return this.seats.filter((s) => s !== null).length; }
  inGame() { return this.game && this.game.phase !== 'ended' && this.game.phase !== 'init'; }

  playerName(seat) {
    const pid = this.seats[seat];
    if (!pid) return null;
    const p = this.manager.players.get(pid);
    return p ? p.name : null;
  }

  addPlayer(playerId) {
    if (this.seatOf(playerId) >= 0) return this.seatOf(playerId);
    const seat = this.seats.indexOf(null);
    if (seat < 0) return -1;
    this.seats[seat] = playerId;
    this.ready[seat] = false;
    return seat;
  }
  removePlayer(playerId) {
    const seat = this.seatOf(playerId);
    if (seat < 0) return;
    // 游戏进行中不真正移除座位（保留以便重连/自动代打），仅在未开局时清座
    if (!this.game || this.game.phase === 'ended' || this.game.phase === 'init') {
      this.seats[seat] = null;
      this.ready[seat] = false;
    }
  }

  setReady(playerId, val) {
    const seat = this.seatOf(playerId);
    if (seat < 0) return;
    this.ready[seat] = !!val;
  }

  // ===== 通信 =====
  emitTo(seat, event, data) {
    const pid = this.seats[seat];
    if (!pid) return;
    const sid = this.manager.socketIdOf(pid);
    if (sid) this.manager.io.to(sid).emit(event, data);
  }
  emitAll(event, data) {
    for (let s = 0; s < 4; s++) this.emitTo(s, event, data);
  }

  roomState() {
    return {
      roomId: this.id,
      seats: this.seats.map((pid, i) => ({
        seat: i,
        name: this.playerName(i),
        playerId: pid,
        ready: this.ready[i],
        score: this.scores[i],
        isBot: this.isBot(i),
      })),
      scores: this.scores.slice(),
      dealer: this.dealer,
      handNo: this.handNo,
      inGame: this.inGame(),
      phase: this.game ? this.game.phase : 'waiting',
    };
  }

  broadcastRoom() { this.emitAll('roomUpdate', this.roomState()); this.manager.broadcastLobby(); }

  broadcastGame() {
    if (!this.game) return;
    for (let s = 0; s < 4; s++) {
      if (this.seats[s]) this.emitTo(s, 'gameState', this.game.getView(s));
    }
  }

  onGameEvent(e) { this.emitAll('event', e); }

  // ===== 开局/续局 =====
  maybeStart() {
    if (this.inGame()) return;
    if (!this.isFull()) return;
    if (!this.ready.every((r) => r)) return;
    this.startHand();
  }

  startHand() {
    this.ready = [false, false, false, false];
    this.handNo++;
    this.game = new Game({
      names: [0, 1, 2, 3].map((s) => this.playerName(s) || `玩家${s + 1}`),
      scores: this.scores,
      dealer: this.dealer,
      quanfeng: this.quanfeng,
      onEvent: (e) => this.onGameEvent(e),
    });
    this.game.start();
    this.broadcastRoom();
    this.afterChange();
  }

  nextHand() {
    // 庄家轮换：庄家和或流局连庄，否则轮换
    const res = this.game ? this.game.result : null;
    if (res && res.type !== 'draw') {
      const winnerSeats = (res.winners || []).map((w) => w.seat);
      if (!winnerSeats.includes(this.dealer)) this.dealer = (this.dealer + 1) % 4;
    }
    this.startHand();
  }

  // ===== 动作 =====
  handleAction(playerId, action) {
    if (!this.game) return { error: '游戏未开始' };
    const seat = this.seatOf(playerId);
    if (seat < 0) return { error: '不在房间' };
    if (this.game.phase === 'ended') {
      if (action.type === 'next') { this.setReady(playerId, true); this.maybeNext(); return { ok: true }; }
      return { error: '本局已结束' };
    }
    const r = this.game.act(seat, action);
    this.afterChange();
    return r;
  }

  maybeNext() {
    // 局间：全部点“继续”则立即开下一局
    if (this.game && this.game.phase === 'ended' && this.isFull() && this.ready.every((r) => r)) {
      this.clearTimer();
      this.nextHand();
    } else {
      this.broadcastRoom();
    }
  }

  afterChange() {
    this.broadcastGame();
    this.reconcileTimer();
    this.scheduleBots();
    if (this.game && this.game.phase === 'ended') this.broadcastRoom();
  }

  // ===== AI 机器人 =====
  addBot() {
    if (this.inGame()) return -1;
    const seat = this.seats.indexOf(null);
    if (seat < 0) return -1;
    const pid = 'bot_' + this.id + '_' + (botSeq++);
    this.manager.players.set(pid, { playerId: pid, name: '机器人' + (seat + 1), socketId: null, roomId: this.id, isBot: true });
    this.seats[seat] = pid;
    this.ready[seat] = true;
    this.broadcastRoom();
    this.maybeStart();
    return seat;
  }
  removeBotSeat(seat) {
    if (this.inGame()) return;
    if (!this.isBot(seat)) return;
    const pid = this.seats[seat];
    this.manager.players.delete(pid);
    this.seats[seat] = null;
    this.ready[seat] = false;
    this.broadcastRoom();
  }
  scheduleBots() {
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    if (!this.game) return;
    const phase = this.game.phase;
    if (phase === 'acting') {
      const seat = this.game.current;
      if (this.isBot(seat)) this.botTimer = setTimeout(() => { this.botTimer = null; this._botAct(seat); }, 700 + Math.random() * 500);
    } else if (phase === 'claiming') {
      const opts = this.game.claim.options;
      const pending = Object.keys(opts).some((s) => this.isBot(parseInt(s, 10)) && !this.game.claim.responses[s]);
      if (pending) this.botTimer = setTimeout(() => { this.botTimer = null; this._botClaims(); }, 600 + Math.random() * 400);
    } else if (phase === 'ended') {
      let changed = false;
      for (let s = 0; s < 4; s++) if (this.isBot(s) && this.seats[s] && !this.ready[s]) { this.ready[s] = true; changed = true; }
      if (changed) this.maybeNext();
    }
  }
  _botAct(seat) {
    if (!this.game || this.game.phase !== 'acting' || this.game.current !== seat || !this.isBot(seat)) return;
    try { this.game.act(seat, AI.decideActing(this.game, seat, this.game.getActions(seat))); } catch (e) {}
    this.afterChange();
  }
  _botClaims() {
    if (!this.game || this.game.phase !== 'claiming') return;
    const opts = this.game.claim.options;
    for (const s of Object.keys(opts)) {
      if (this.game.phase !== 'claiming') break;
      const seat = parseInt(s, 10);
      if (!this.isBot(seat) || this.game.claim.responses[s]) continue;
      try { this.game.act(seat, AI.decideClaim(this.game, seat, opts[s])); } catch (e) {}
    }
    this.afterChange();
  }

  destroy() {
    this.clearTimer();
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    for (let s = 0; s < 4; s++) if (this.isBot(s)) this.manager.players.delete(this.seats[s]);
    this.seats = [null, null, null, null];
  }

  // ===== 计时器 =====
  clearTimer() { if (this.timer) { clearTimeout(this.timer); this.timer = null; this.timerKind = null; } }
  reconcileTimer() {
    const phase = this.game ? this.game.phase : null;
    if (phase === this.timerKind && this.timer) return; // 同阶段计时器已在跑
    this.clearTimer();
    if (phase === 'claiming') {
      this.timerKind = 'claiming';
      this.timer = setTimeout(() => { this.timer = null; this.timerKind = null; try { this.game.forceResolveClaims(); } catch (e) {} this.afterChange(); }, CLAIM_TIMEOUT);
    } else if (phase === 'acting') {
      this.timerKind = 'acting';
      this.timer = setTimeout(() => { this.timer = null; this.timerKind = null; this.autoDiscard(); this.afterChange(); }, ACT_TIMEOUT);
    } else if (phase === 'ended') {
      this.timerKind = 'ended';
      this.timer = setTimeout(() => { this.timer = null; this.timerKind = null; if (this.isFull()) this.nextHand(); }, NEXT_TIMEOUT);
    }
  }
  autoDiscard() {
    if (!this.game || this.game.phase !== 'acting') return;
    const seat = this.game.current;
    const a = this.game.getActions(seat);
    const p = this.game.players[seat];
    let tile = a.drawnTile;
    if (tile == null || p.hand.indexOf(tile) < 0) tile = p.hand[p.hand.length - 1];
    if (tile != null) this.game.act(seat, { type: 'discard', tile });
  }
}

class RoomManager {
  constructor(io) {
    this.io = io;
    this.rooms = new Map();           // roomId -> Room
    this.players = new Map();         // playerId -> {playerId, name, socketId, roomId}
    this.socketToPlayer = new Map();  // socketId -> playerId
  }

  socketIdOf(playerId) { const p = this.players.get(playerId); return p ? p.socketId : null; }

  login(socket, playerId, name) {
    name = (name || '').toString().trim().slice(0, 12) || '玩家';
    let p = this.players.get(playerId);
    if (!p) { p = { playerId, name, socketId: socket.id, roomId: null }; this.players.set(playerId, p); }
    else { p.name = name; p.socketId = socket.id; }
    this.socketToPlayer.set(socket.id, playerId);
    socket.emit('loggedIn', { playerId, name });
    // 若该玩家原本在某房间，重连后恢复
    if (p.roomId && this.rooms.has(p.roomId)) {
      const room = this.rooms.get(p.roomId);
      socket.join('room:' + room.id);
      room.broadcastRoom();
      if (room.game) socket.emit('gameState', room.game.getView(room.seatOf(playerId)));
    }
    this.broadcastLobby();
  }

  lobbyState() {
    const rooms = [];
    for (const room of this.rooms.values()) {
      rooms.push({ roomId: room.id, count: room.occupiedCount(), inGame: room.inGame(), names: room.seats.map((s, i) => room.playerName(i)) });
    }
    return { rooms };
  }
  broadcastLobby() { this.io.emit('lobby', this.lobbyState()); }

  createRoom(socket) {
    const playerId = this.socketToPlayer.get(socket.id);
    if (!playerId) return;
    this.leaveRoom(socket, true);
    const room = new Room(this);
    this.rooms.set(room.id, room);
    this._join(socket, room);
  }
  joinRoom(socket, roomId) {
    const room = this.rooms.get(roomId);
    if (!room) { socket.emit('errorMsg', '房间不存在'); return; }
    if (room.isFull() && room.seatOf(this.socketToPlayer.get(socket.id)) < 0) { socket.emit('errorMsg', '房间已满'); return; }
    this.leaveRoom(socket, true);
    this._join(socket, room);
  }
  _join(socket, room) {
    const playerId = this.socketToPlayer.get(socket.id);
    const seat = room.addPlayer(playerId);
    if (seat < 0) { socket.emit('errorMsg', '房间已满'); return; }
    this.players.get(playerId).roomId = room.id;
    socket.join('room:' + room.id);
    room.broadcastRoom();
    if (room.game && room.game.phase !== 'ended') socket.emit('gameState', room.game.getView(seat));
    this.broadcastLobby();
  }
  leaveRoom(socket, silent) {
    const playerId = this.socketToPlayer.get(socket.id);
    if (!playerId) return;
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (room) {
      room.removePlayer(playerId);
      socket.leave('room:' + room.id);
      if (room.isEmpty() && !room.inGame()) { room.clearTimer(); this.rooms.delete(room.id); }
      else room.broadcastRoom();
    }
    p.roomId = null;
    if (!silent) socket.emit('leftRoom', {});
    this.broadcastLobby();
  }
  setReady(socket, val) {
    const playerId = this.socketToPlayer.get(socket.id);
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (!room) return;
    if (room.game && room.game.phase === 'ended') { room.setReady(playerId, val); room.maybeNext(); return; }
    room.setReady(playerId, val);
    room.broadcastRoom();
    room.maybeStart();
  }
  action(socket, action) {
    const playerId = this.socketToPlayer.get(socket.id);
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (!room) return;
    const r = room.handleAction(playerId, action);
    if (r && r.error) socket.emit('errorMsg', r.error);
  }
  disconnect(socket) {
    const playerId = this.socketToPlayer.get(socket.id);
    this.socketToPlayer.delete(socket.id);
    if (!playerId) return;
    const p = this.players.get(playerId);
    if (p) p.socketId = null;
    // 游戏中保留座位（自动代打），房间无人且非游戏中则清理
    if (p && p.roomId) {
      const room = this.rooms.get(p.roomId);
      if (room) {
        if (!room.inGame()) { room.removePlayer(playerId); if (room.isEmpty()) { room.clearTimer(); this.rooms.delete(room.id); } else room.broadcastRoom(); p.roomId = null; }
        else room.broadcastRoom();
      }
    }
    this.broadcastLobby();
  }
}

module.exports = { Room, RoomManager };
