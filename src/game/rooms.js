'use strict';
// 房间与房间管理：座位、准备、发牌开局、计时器（认领/出牌/续局）、庄家轮换、AI 机器人
const { Game } = require('./Game');
const T = require('./../mahjong/tile');
const AI = require('./ai');
const { filterByRemaining } = require('./advisor');
const { analyzeAsync } = require('./advisorPool');

const CLAIM_TIMEOUT = 15000;  // 认领超时（自动过）
const ACT_TIMEOUT = 30000;    // 出牌超时（自动打出）
const BOT_WATCHDOG = 3000;    // 机器人硬超时(3秒)：超时未出牌/认领则强制安全处理，防止卡住
let botSeq = 1;
// 机器人思考延迟（BOT_FAST=1 时极快，便于测试）
function botDelay() { return process.env.BOT_FAST ? 10 + Math.random() * 20 : 700 + Math.random() * 600; }

let roomSeq = 1000;

class Room {
  constructor(manager) {
    this.id = String(++roomSeq);
    this.manager = manager;
    this.owner = null; // 房主 playerId
    this.seats = [null, null, null, null]; // 每座位的 playerId
    this.ready = [false, false, false, false];
    this.scores = [0, 0, 0, 0];
    this.dealer = 0;
    this.quanfeng = T.TILE_E;
    this.turnTime = 60000; // 出牌等待(毫秒)，可在建房时设置，默认 60 秒
    this.minFan = 8;       // 起胡番数，可在建房时设置(8/16/32)
    this.funMode = false;  // 娱乐场（每局随机技能）
    this.game = null;
    this.handNo = 0;
    this.timer = null;
    this.timerKind = null;
    this.botTimer = null;
    this.botWatchdog = null;
    this.spectators = []; // 观战者 playerId 列表（不占座位）
    this._advEmitSig = [null, null, null, null]; // 已推送的展示签名（过滤后），变化才推
    this._advHandSig = [null, null, null, null]; // 上次枚举对应的手牌签名（手牌变才重算枚举）
    this._advCand = [[], [], [], []];            // 缓存的备选番型（枚举结果，未按余张过滤）
  }

  isSpectator(playerId) { return this.spectators.includes(playerId); }
  addSpectator(playerId) { if (!this.isSpectator(playerId)) this.spectators.push(playerId); }
  removeSpectator(playerId) { const i = this.spectators.indexOf(playerId); if (i >= 0) this.spectators.splice(i, 1); }

  isBot(seat) { const pid = this.seats[seat]; const p = pid && this.manager.players.get(pid); return !!(p && p.isBot); }
  hasHumans() { return this.seats.some((pid) => pid && !(this.manager.players.get(pid) || {}).isBot); }
  reassignOwner() {
    // 房主仍在座且为真人则保留，否则转给第一位真人，无真人则置空
    const cur = this.owner && this.manager.players.get(this.owner);
    if (this.owner && this.seats.includes(this.owner) && cur && !cur.isBot) return;
    this.owner = null;
    for (let s = 0; s < 4; s++) {
      const pid = this.seats[s]; const pl = pid && this.manager.players.get(pid);
      if (pl && !pl.isBot) { this.owner = pid; break; }
    }
  }
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
  emitToPlayer(pid, event, data) {
    const sid = this.manager.socketIdOf(pid);
    if (sid) this.manager.io.to(sid).emit(event, data);
  }
  emitAll(event, data) {
    for (let s = 0; s < 4; s++) this.emitTo(s, event, data);
    for (const pid of this.spectators) this.emitToPlayer(pid, event, data);
  }

  roomState() {
    return {
      roomId: this.id,
      owner: this.owner,
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
      turnTime: this.turnTime,
      minFan: this.minFan,
      funMode: this.funMode,
      spectators: this.spectators.length,
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
    if (this.spectators.length) {
      const sv = this.game.getSpectatorView(this.dealer);
      for (const pid of this.spectators) this.emitToPlayer(pid, 'gameState', sv);
    }
    this._sendAdvice();
  }

  // 番型提示：每次牌桌变化（含他人/机器人操作）都重算并按需推送。
  // 重活（枚举番型）放到 worker 线程，只在自己手牌变化时触发，结果缓存；主线程永不阻塞，
  // 摸牌后可立即出牌。轻活（按场上余张过滤进张）在主线程每次都做，故他人打牌使某进张绝张时提示随之更新。
  // 枚举结果回来前继续展示上一手的提示（约 <1s），避免每回合闪烁/消失。
  _sendAdvice() {
    if (!this.game || this.game.phase === 'ended' || this.game.phase === 'init') return;
    const game = this.game;
    setImmediate(() => {
      if (this.game !== game) return; // 已进入下一局
      for (let s = 0; s < 4; s++) {
        const pid = this.seats[s];
        if (!pid || this.isBot(s)) continue;
        if (!this.manager.socketIdOf(pid)) continue;
        const p = game.players[s];
        if (!p || !p.hand) continue;
        const handSig = p.hand.join(',') + '#' + (p.melds || []).map((m) => m.type + (m.tiles || []).join('')).join(';');
        if (this._advHandSig[s] !== handSig) { // 手牌变化：异步重算枚举（不阻塞主线程）
          this._advHandSig[s] = handSig;
          const reqSig = handSig;
          analyzeAsync({
            hand: p.hand.slice(),
            melds: (p.melds || []).map((m) => ({ ...m, tiles: (m.tiles || []).slice() })),
            quanfeng: game.quanfeng,
            menfeng: p.menfeng,
          }).then((cand) => {
            if (this.game !== game) return;            // 已换局
            if (this._advHandSig[s] !== reqSig) return; // 手牌又变了，等更新的请求结果
            this._advCand[s] = cand;
            this._emitAdviceSeat(game, s);
          });
        }
        // 用当前缓存（可能是上一手的，作为占位）做轻量过滤并推送
        this._emitAdviceSeat(game, s);
      }
    });
  }

  // 轻活：按当前场上余张过滤缓存的备选番型并推送给某座位（变化才推）
  _emitAdviceSeat(game, s) {
    if (this.game !== game) return;
    const pid = this.seats[s];
    if (!pid || this.isBot(s)) return;
    const sid = this.manager.socketIdOf(pid);
    if (!sid) return;
    const p = game.players[s];
    if (!p || !p.hand) return;
    const seen = new Array(35).fill(0); // 场上已现张数（各家副露 + 各家牌河）
    for (let k = 0; k < 4; k++) {
      const q = game.players[k]; if (!q) continue;
      for (const m of (q.melds || [])) for (const t of (m.tiles || [])) if (t >= 1 && t <= 34) seen[t]++;
      for (const t of (q.river || [])) if (t >= 1 && t <= 34) seen[t]++;
    }
    const rem = new Array(35).fill(0); // 该家可摸到的余张 = 4 - 已现 - 自己手中持有
    for (let t = 1; t <= 34; t++) rem[t] = 4 - seen[t];
    for (const t of p.hand) if (t >= 1 && t <= 34) rem[t]--;
    const list = filterByRemaining(this._advCand[s] || [], rem, 3);
    const showSig = list.map((x) => x.name + x.dist + ':' + x.tiles.join(',')).join('|');
    if (this._advEmitSig[s] === showSig) return;
    this._advEmitSig[s] = showSig;
    this.manager.io.to(sid).emit('advice', { seat: s, list });
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
    this._advEmitSig = [null, null, null, null];
    this._advHandSig = [null, null, null, null];
    this._advCand = [[], [], [], []];
    this.handNo++;
    this.game = new Game({
      names: [0, 1, 2, 3].map((s) => this.playerName(s) || `玩家${s + 1}`),
      scores: this.scores,
      dealer: this.dealer,
      quanfeng: this.quanfeng,
      minFan: this.minFan,
      funMode: this.funMode,
      onEvent: (e) => this.onGameEvent(e),
    });
    this.game.start();
    this.broadcastRoom();
    this.afterChange();
  }

  nextHand() {
    // 庄家轮换：庄家和或流局连庄，否则轮换；庄家轮满一圈则圈风递进 东→南→西→北→东…
    const res = this.game ? this.game.result : null;
    if (res && res.type !== 'draw') {
      const winnerSeats = (res.winners || []).map((w) => w.seat);
      if (!winnerSeats.includes(this.dealer)) {
        this.dealer = (this.dealer + 1) % 4;
        if (this.dealer === 0) this._advanceRoundWind(); // 庄家轮回到起始座位，进入下一圈
      }
    }
    this.startHand();
  }

  _advanceRoundWind() {
    const order = [T.TILE_E, T.TILE_S, T.TILE_W, T.TILE_N];
    this.quanfeng = order[(order.indexOf(this.quanfeng) + 1) % 4];
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
    if (this.botWatchdog) { clearTimeout(this.botWatchdog); this.botWatchdog = null; }
    if (!this.game) return;
    const phase = this.game.phase;
    if (phase === 'acting') {
      const seat = this.game.current;
      if (this.isBot(seat)) {
        this.botTimer = setTimeout(() => { this.botTimer = null; this._botAct(seat); }, botDelay());
        this.botWatchdog = setTimeout(() => { this.botWatchdog = null; this._botWatchdog('acting', seat); }, BOT_WATCHDOG);
      }
    } else if (phase === 'claiming') {
      const opts = this.game.claim.options;
      const pending = Object.keys(opts).some((s) => this.isBot(parseInt(s, 10)) && !this.game.claim.responses[s]);
      if (pending) {
        this.botTimer = setTimeout(() => { this.botTimer = null; this._botClaims(); }, botDelay());
        this.botWatchdog = setTimeout(() => { this.botWatchdog = null; this._botWatchdog('claiming'); }, BOT_WATCHDOG);
      }
    } else if (phase === 'ended') {
      let changed = false;
      for (let s = 0; s < 4; s++) {
        const pid = this.seats[s];
        if (!pid || this.ready[s]) continue;
        const offline = !this.isBot(s) && this.manager.socketIdOf(pid) == null; // 掉线者不阻塞续局
        if (this.isBot(s) || offline) { this.ready[s] = true; changed = true; }
      }
      if (changed) this.maybeNext();
    }
  }
  _botAct(seat) {
    if (!this.game || this.game.phase !== 'acting' || this.game.current !== seat || !this.isBot(seat)) return;
    let r = null;
    try { r = this.game.act(seat, AI.decideActing(this.game, seat, this.game.getActions(seat))); }
    catch (e) { r = { error: String(e) }; }
    if (r && r.error) this.autoDiscard(); // AI 决策异常/被拒，回退安全出牌，避免卡住
    this.afterChange();
  }
  _botClaims() {
    if (!this.game || this.game.phase !== 'claiming') return;
    const opts = this.game.claim.options;
    for (const s of Object.keys(opts)) {
      if (this.game.phase !== 'claiming') break;
      const seat = parseInt(s, 10);
      if (!this.isBot(seat) || this.game.claim.responses[s]) continue;
      let r = null;
      try { r = this.game.act(seat, AI.decideClaim(this.game, seat, opts[s])); }
      catch (e) { r = { error: String(e) }; }
      if (r && r.error) { try { this.game.act(seat, { type: 'pass' }); } catch (e) {} } // 回退为“过”
    }
    this.afterChange();
  }
  // 机器人 3 秒硬超时：仍未出牌/认领则强制安全处理（不影响真人的认领时间）
  _botWatchdog(kind, seat) {
    if (!this.game) return;
    if (kind === 'acting') {
      if (this.game.phase === 'acting' && this.game.current === seat && this.isBot(seat)) {
        this.autoDiscard();
        this.afterChange();
      }
    } else if (kind === 'claiming') {
      if (this.game.phase === 'claiming') {
        const opts = this.game.claim.options;
        let acted = false;
        for (const s of Object.keys(opts)) {
          if (this.game.phase !== 'claiming') break;
          if (this.isBot(parseInt(s, 10)) && !this.game.claim.responses[s]) {
            try { this.game.act(parseInt(s, 10), { type: 'pass' }); acted = true; } catch (e) {}
          }
        }
        if (acted) this.afterChange();
      }
    }
  }

  destroy() {
    this.clearTimer();
    if (this.botTimer) { clearTimeout(this.botTimer); this.botTimer = null; }
    if (this.botWatchdog) { clearTimeout(this.botWatchdog); this.botWatchdog = null; }
    for (const pid of this.spectators) {
      this.emitToPlayer(pid, 'roomClosed', {});
      const p = this.manager.players.get(pid); if (p) p.roomId = null;
    }
    this.spectators = [];
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
      if (this.turnTime > 0) this.timer = setTimeout(() => { this.timer = null; this.timerKind = null; this.autoDiscard(); this.afterChange(); }, this.turnTime);
      // turnTime === 0：无限制，不设出牌超时
    }
    // 局间不再自动续局：需所有玩家点“继续下一局”确认（机器人/掉线者自动就绪）
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
    // 若该玩家原本在某房间，重连后恢复（座位玩家或观战者）
    if (p.roomId && this.rooms.has(p.roomId)) {
      const room = this.rooms.get(p.roomId);
      socket.join('room:' + room.id);
      room.broadcastRoom();
      if (room.game) {
        const seat = room.seatOf(playerId);
        if (seat >= 0) socket.emit('gameState', room.game.getView(seat));
        else if (room.isSpectator(playerId)) { socket.emit('spectating', { roomId: room.id }); socket.emit('gameState', room.game.getSpectatorView(room.dealer)); }
      }
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

  createRoom(socket, opts) {
    const playerId = this.socketToPlayer.get(socket.id);
    if (!playerId) return;
    this.leaveRoom(socket, true);
    const room = new Room(this);
    room.owner = playerId;
    const tt = parseInt(opts && opts.turnTime, 10);
    if ([0, 20, 60].includes(tt)) room.turnTime = tt * 1000; // 0 = 无限制
    const mf = parseInt(opts && opts.minFan, 10);
    if ([8, 16, 32].includes(mf)) room.minFan = mf;
    room.funMode = !!(opts && opts.funMode);
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
  spectate(socket, roomId) {
    const playerId = this.socketToPlayer.get(socket.id);
    if (!playerId) return;
    const p = this.players.get(playerId);
    const room = this.rooms.get(roomId);
    if (!room) { socket.emit('errorMsg', '房间不存在'); return; }
    // 原本在座 -> 重连回自己的座位
    if (room.seatOf(playerId) >= 0) {
      if (p.roomId && p.roomId !== room.id) this.leaveRoom(socket, true);
      p.roomId = room.id;
      socket.join('room:' + room.id);
      room.broadcastRoom();
      if (room.game) socket.emit('gameState', room.game.getView(room.seatOf(playerId)));
      this.broadcastLobby();
      return;
    }
    // 否则作为观战者加入
    this.leaveRoom(socket, true);
    room.addSpectator(playerId);
    p.roomId = room.id;
    socket.join('room:' + room.id);
    socket.emit('spectating', { roomId: room.id });
    if (room.game) socket.emit('gameState', room.game.getSpectatorView(room.dealer));
    room.broadcastRoom();
    this.broadcastLobby();
  }
  leaveRoom(socket, silent) {
    const playerId = this.socketToPlayer.get(socket.id);
    if (!playerId) return;
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (room) {
      room.removeSpectator(playerId);
      room.removePlayer(playerId);
      socket.leave('room:' + room.id);
      if (!room.inGame() && !room.hasHumans()) { room.destroy(); this.rooms.delete(room.id); }
      else { room.reassignOwner(); room.broadcastRoom(); }
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
  addBot(socket) {
    const playerId = this.socketToPlayer.get(socket.id);
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (!room) return;
    if (room.addBot() < 0) socket.emit('errorMsg', '无法添加机器人');
  }
  removeBot(socket, seat) {
    const playerId = this.socketToPlayer.get(socket.id);
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (room) room.removeBotSeat(seat);
  }
  closeRoom(socket) {
    const playerId = this.socketToPlayer.get(socket.id);
    const p = this.players.get(playerId);
    if (!p || !p.roomId) return;
    const room = this.rooms.get(p.roomId);
    if (!room) return;
    if (room.owner !== playerId) { socket.emit('errorMsg', '只有房主可以关闭房间'); return; }
    // 通知并踢出所有真人，解散房间（含机器人）
    for (let s = 0; s < 4; s++) {
      const pid = room.seats[s];
      if (!pid) continue;
      const pl = this.players.get(pid);
      if (pl && !pl.isBot) {
        pl.roomId = null;
        const sid = this.socketIdOf(pid);
        if (sid) {
          this.io.to(sid).emit('roomClosed', {});
          const sk = this.io.sockets.sockets.get(sid);
          if (sk) sk.leave('room:' + room.id);
        }
      }
    }
    room.destroy();
    this.rooms.delete(room.id);
    this.broadcastLobby();
  }
  disconnect(socket) {
    const playerId = this.socketToPlayer.get(socket.id);
    this.socketToPlayer.delete(socket.id);
    if (!playerId) return;
    const p = this.players.get(playerId);
    if (p) p.socketId = null;
    // 游戏中保留座位（自动代打），房间无真人且非游戏中则清理
    if (p && p.roomId) {
      const room = this.rooms.get(p.roomId);
      if (room) {
        if (room.isSpectator(playerId)) {
          room.removeSpectator(playerId); p.roomId = null;
          if (!room.inGame() && !room.hasHumans()) { room.destroy(); this.rooms.delete(room.id); } else room.broadcastRoom();
        } else if (!room.inGame()) {
          room.removePlayer(playerId); p.roomId = null;
          if (!room.hasHumans()) { room.destroy(); this.rooms.delete(room.id); } else { room.reassignOwner(); room.broadcastRoom(); }
        } else room.broadcastRoom();
      }
    }
    this.broadcastLobby();
  }
}

module.exports = { Room, RoomManager };
