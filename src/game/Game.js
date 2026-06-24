'use strict';
// 国标麻将单局状态机：发牌、补花、出牌、吃碰杠（明/暗/加）、抢杠和、认领优先级、自摸/点和、流局、计分
const T = require('./../mahjong/tile');
const { Tile } = T;
const R = require('./rules');

function countIn(arr, id) { let c = 0; for (const x of arr) if (x === id) c++; return c; }
function removeOne(arr, id) { const i = arr.indexOf(id); if (i >= 0) arr.splice(i, 1); }
function removeN(arr, id, n) { for (let k = 0; k < n; k++) removeOne(arr, id); }

class Game {
  constructor({ names, scores, dealer, quanfeng, onEvent, minFan }) {
    this.names = names || ['', '', '', ''];
    this.scores = scores || [0, 0, 0, 0]; // 与 Room 共享引用
    this.dealer = dealer;
    this.quanfeng = quanfeng || T.TILE_E;
    this.minFan = minFan || 8; // 起胡番数
    this.onEvent = onEvent || (() => {});
    this.players = [0, 1, 2, 3].map((s) => ({
      seat: s, hand: [], melds: [], flowers: [], river: [],
      menfeng: R.seatWind(s, dealer),
    }));
    this.wall = R.buildWall();
    this.current = dealer;
    this.phase = 'init';
    this.lastDraw = null;
    this.lastDiscard = null;
    this.claim = null;
    this._pendingJiagang = null;
    this.drewThisTurn = false;
    this.gangFlag = false;
    this.haidi = false;
    this.result = null;
    this.log = [];
  }

  _emit(e) { this.onEvent(e); }
  _logMsg(msg) { this.log.push(msg); if (this.log.length > 60) this.log.shift(); }
  _name(s) { return this.names[s] || `玩家${s + 1}`; }

  start() {
    // 发 13 张（先原样发牌，花牌随后统一补花）
    for (let r = 0; r < 13; r++) {
      for (let s = 0; s < 4; s++) this.players[s].hand.push(this.wall.shift());
    }
    this._replaceFlowersInitial();
    for (const p of this.players) p.hand.sort((a, b) => a - b);
    this._logMsg(`开局，庄家：${this._name(this.dealer)}（${R.WIND_NAME[this.quanfeng]}圈）`);
    this._emit({ type: 'start', dealer: this.dealer });
    this._drawAndAct(this.dealer);
  }

  _replaceFlowersInitial() {
    for (let k = 0; k < 4; k++) {
      const s = (this.dealer + k) % 4;
      const p = this.players[s];
      let i = 0;
      while (i < p.hand.length) {
        if (R.isFlower(p.hand[i])) {
          p.flowers.push(p.hand[i]);
          p.hand.splice(i, 1);
          const rep = this._drawReplacementRaw(s);
          if (rep === null) break;
        } else i++;
      }
    }
  }
  // 从牌墙尾抽一张补充（处理连续摸到花），把非花牌加入手牌；返回该非花牌或 null（墙空）
  _drawReplacementRaw(seat) {
    while (this.wall.length) {
      const t = this.wall.pop();
      if (R.isFlower(t)) { this.players[seat].flowers.push(t); continue; }
      this.players[seat].hand.push(t);
      return t;
    }
    return null;
  }

  // 摸牌（fromBack=false 正常摸，true 杠后/补花摸），自动补花；返回 {tile, drained}
  _draw(seat, fromBack) {
    let drewFromBack = fromBack;
    while (true) {
      if (this.wall.length === 0) return { tile: null, drained: true };
      const t = drewFromBack ? this.wall.pop() : this.wall.shift();
      if (R.isFlower(t)) {
        this.players[seat].flowers.push(t);
        this._logMsg(`${this._name(seat)} 补花`);
        this._emit({ type: 'flower', seat, tile: t });
        drewFromBack = true;
        continue;
      }
      this.players[seat].hand.push(t);
      return { tile: t, drained: false };
    }
  }

  _drawAndAct(seat) {
    const res = this._draw(seat, false);
    if (res.drained) return this._drawGame();
    this.current = seat;
    this.drewThisTurn = true;
    this.gangFlag = false;
    this.haidi = (this.wall.length === 0);
    this.lastDraw = { seat, tile: res.tile };
    this.phase = 'acting';
    this._emit({ type: 'draw', seat });
  }
  _drawAfterGang(seat) {
    const res = this._draw(seat, true);
    if (res.drained) return this._drawGame();
    this.current = seat;
    this.drewThisTurn = true;
    this.gangFlag = true;
    this.haidi = (this.wall.length === 0);
    this.lastDraw = { seat, tile: res.tile };
    this.phase = 'acting';
    this._emit({ type: 'draw', seat, gang: true });
  }

  _countVisible(tile) {
    let c = 0;
    for (const p of this.players) {
      for (const m of p.melds) for (const x of m.tiles) if (x === tile) c++;
      for (const x of p.river) if (x === tile) c++;
    }
    return c;
  }

  _evalHu(seat, winTile, { isZimo, isGang }) {
    const p = this.players[seat];
    let concealed;
    if (isZimo) { concealed = p.hand.slice(); removeOne(concealed, winTile); }
    else concealed = p.hand.slice();
    const visible = this._countVisible(winTile);
    const juezhang = isZimo ? (visible === 3) : (visible === 4);
    return R.evaluateWin({
      melds: p.melds, concealed, winTile, isZimo,
      quanfeng: this.quanfeng, menfeng: p.menfeng,
      juezhang, haidi: this.haidi, gang: isGang, flowers: p.flowers, minFan: this.minFan,
    });
  }

  _chiOptions(seat, tile) {
    const opts = [];
    const t = new Tile(tile);
    if (!t.IsShu()) return opts;
    const rank = t.Rank();
    const idOf = (r) => tile + (r - rank);
    const has = (id) => countIn(this.players[seat].hand, id) > 0;
    if (rank >= 3 && has(idOf(rank - 2)) && has(idOf(rank - 1))) opts.push([idOf(rank - 2), idOf(rank - 1)]);
    if (rank >= 2 && rank <= 8 && has(idOf(rank - 1)) && has(idOf(rank + 1))) opts.push([idOf(rank - 1), idOf(rank + 1)]);
    if (rank <= 7 && has(idOf(rank + 1)) && has(idOf(rank + 2))) opts.push([idOf(rank + 1), idOf(rank + 2)]);
    return opts;
  }

  // ===== 玩家动作入口 =====
  act(seat, action) {
    try {
      if (this.phase === 'acting') return this._actActing(seat, action);
      if (this.phase === 'claiming') return this._actClaiming(seat, action);
      return { error: '当前不可操作' };
    } catch (e) {
      return { error: e.message || String(e) };
    }
  }

  _actActing(seat, action) {
    if (seat !== this.current) return { error: '未轮到你' };
    const p = this.players[seat];
    switch (action.type) {
      case 'discard': {
        if (countIn(p.hand, action.tile) === 0) return { error: '没有这张牌' };
        removeOne(p.hand, action.tile);
        p.river.push(action.tile);
        this.lastDiscard = { seat, tile: action.tile };
        this.drewThisTurn = false; this.gangFlag = false;
        this._logMsg(`${this._name(seat)} 打出 ${new Tile(action.tile).UTF8()}`);
        this._emit({ type: 'discard', seat, tile: action.tile });
        this._offerClaimsForDiscard(seat, action.tile);
        return { ok: true };
      }
      case 'angang': {
        if (countIn(p.hand, action.tile) !== 4) return { error: '不能暗杠' };
        removeN(p.hand, action.tile, 4);
        p.melds.push({ type: 'angang', tiles: [action.tile, action.tile, action.tile, action.tile], from: -1, tile: action.tile });
        this._logMsg(`${this._name(seat)} 暗杠`);
        this._emit({ type: 'gang', seat, tile: action.tile, kind: 'angang' });
        this._drawAfterGang(seat);
        return { ok: true };
      }
      case 'jiagang': {
        const meld = p.melds.find((m) => m.type === 'peng' && m.tile === action.tile);
        if (!meld || countIn(p.hand, action.tile) < 1) return { error: '不能加杠' };
        this._offerJiagang(seat, action.tile);
        return { ok: true };
      }
      case 'zimo': {
        if (!this.drewThisTurn) return { error: '此时不能自摸' };
        const winTile = this.lastDraw.tile;
        const res = this._evalHu(seat, winTile, { isZimo: true, isGang: this.gangFlag });
        if (!res.ok) return { error: `不足 ${this.minFan} 番（${res.thresholdFan}番）不能和` };
        const delta = R.settle([{ seat, score: res.score }], 'zimo', null);
        this._endHand({ type: 'zimo', winners: [{ seat, winTile, ...res }], delta, from: null });
        return { ok: true };
      }
      default:
        return { error: '非法操作' };
    }
  }

  _offerClaimsForDiscard(from, tile) {
    const options = {};
    for (let s = 0; s < 4; s++) {
      if (s === from) continue;
      const opt = {};
      const hu = this._evalHu(s, tile, { isZimo: false, isGang: false });
      if (hu.ok) opt.hu = { score: hu.score, items: hu.items };
      const cnt = countIn(this.players[s].hand, tile);
      if (cnt >= 2) opt.peng = true;
      if (cnt >= 3) opt.gang = true;
      if (s === (from + 1) % 4) {
        const chis = this._chiOptions(s, tile);
        if (chis.length) opt.chi = chis;
      }
      if (opt.hu || opt.peng || opt.gang || opt.chi) options[String(s)] = opt;
    }
    if (Object.keys(options).length === 0) { this._passTurn(); return; }
    this.claim = { kind: 'discard', tile, from, options, responses: {} };
    this.phase = 'claiming';
    this._emit({ type: 'claim-offer', tile, from });
  }

  _offerJiagang(seat, tile) {
    const options = {};
    for (let s = 0; s < 4; s++) {
      if (s === seat) continue;
      const hu = this._evalHu(s, tile, { isZimo: false, isGang: true });
      if (hu.ok) options[String(s)] = { hu: { score: hu.score, items: hu.items } };
    }
    this._pendingJiagang = { seat, tile };
    if (Object.keys(options).length === 0) { this._completeJiagang(); return; }
    this.claim = { kind: 'jiagang', tile, from: seat, options, responses: {} };
    this.phase = 'claiming';
    this._logMsg(`${this._name(seat)} 加杠（可抢杠）`);
    this._emit({ type: 'jiagang-offer', tile, from: seat });
  }
  _completeJiagang() {
    const { seat, tile } = this._pendingJiagang;
    const p = this.players[seat];
    removeOne(p.hand, tile);
    const meld = p.melds.find((m) => m.type === 'peng' && m.tile === tile);
    meld.type = 'jiagang';
    meld.tiles = [tile, tile, tile, tile];
    this._pendingJiagang = null; this.claim = null;
    this._logMsg(`${this._name(seat)} 加杠`);
    this._emit({ type: 'gang', seat, tile, kind: 'jiagang' });
    this._drawAfterGang(seat);
  }

  _actClaiming(seat, action) {
    const key = String(seat);
    if (!this.claim.options[key]) {
      if (action.type === 'pass') return { ok: true }; // 无权认领者点过，忽略
      return { error: '你无可认领动作' };
    }
    this.claim.responses[key] = action;
    if (this._allResponded()) this._resolveClaims();
    return { ok: true };
  }
  _allResponded() {
    for (const s of Object.keys(this.claim.options)) if (!this.claim.responses[s]) return false;
    return true;
  }
  forceResolveClaims() {
    if (this.phase !== 'claiming' || !this.claim) return;
    for (const s of Object.keys(this.claim.options)) if (!this.claim.responses[s]) this.claim.responses[s] = { type: 'pass' };
    this._resolveClaims();
  }

  _resolveClaims() {
    const { options, responses, tile, from, kind } = this.claim;
    const huSeats = [];
    for (const s of Object.keys(options)) {
      if (responses[s] && responses[s].type === 'hu' && options[s].hu) huSeats.push(parseInt(s, 10));
    }
    if (huSeats.length) { this._doWinRon(huSeats, from, tile, kind === 'jiagang'); return; }
    if (kind === 'jiagang') { this._completeJiagang(); return; }

    let gangSeat = null, pengSeat = null, chiResp = null;
    for (const s of Object.keys(options)) {
      const a = responses[s]; if (!a) continue;
      const seat = parseInt(s, 10);
      if (a.type === 'gang' && options[s].gang) gangSeat = seat;
      else if (a.type === 'peng' && options[s].peng) pengSeat = seat;
      else if (a.type === 'chi' && options[s].chi) chiResp = { seat, tiles: a.tiles };
    }
    if (gangSeat !== null) return this._doMingGang(gangSeat, from, tile);
    if (pengSeat !== null) return this._doPeng(pengSeat, from, tile);
    if (chiResp) return this._doChi(chiResp.seat, from, tile, chiResp.tiles);
    this._passTurn();
  }

  _takeDiscardTile(from, tile) {
    // 认领时把该牌从打牌者牌河移除
    const river = this.players[from].river;
    if (river.length && river[river.length - 1] === tile) river.pop();
    else removeOne(river, tile);
  }

  _doPeng(seat, from, tile) {
    this._takeDiscardTile(from, tile);
    removeN(this.players[seat].hand, tile, 2);
    this.players[seat].melds.push({ type: 'peng', tiles: [tile, tile, tile], from, claimed: tile, tile });
    this.claim = null; this.current = seat; this.phase = 'acting';
    this.drewThisTurn = false; this.gangFlag = false; this.lastDraw = null;
    this._logMsg(`${this._name(seat)} 碰`);
    this._emit({ type: 'peng', seat, from, tile });
  }
  _doChi(seat, from, tile, pair) {
    this._takeDiscardTile(from, tile);
    removeOne(this.players[seat].hand, pair[0]);
    removeOne(this.players[seat].hand, pair[1]);
    const three = [pair[0], pair[1], tile].sort((a, b) => a - b);
    const middle = three[1];
    this.players[seat].melds.push({ type: 'chi', tiles: three, from, claimed: tile, middle });
    this.claim = null; this.current = seat; this.phase = 'acting';
    this.drewThisTurn = false; this.gangFlag = false; this.lastDraw = null;
    this._logMsg(`${this._name(seat)} 吃`);
    this._emit({ type: 'chi', seat, from, tile });
  }
  _doMingGang(seat, from, tile) {
    this._takeDiscardTile(from, tile);
    removeN(this.players[seat].hand, tile, 3);
    this.players[seat].melds.push({ type: 'gang', tiles: [tile, tile, tile, tile], from, claimed: tile, tile });
    this.claim = null;
    this._logMsg(`${this._name(seat)} 明杠`);
    this._emit({ type: 'gang', seat, from, tile, kind: 'ming' });
    this._drawAfterGang(seat);
  }

  _doWinRon(huSeats, from, tile, isGang) {
    const winners = [];
    for (const s of huSeats) {
      const res = this._evalHu(s, tile, { isZimo: false, isGang });
      if (res.ok) winners.push({ seat: s, winTile: tile, ...res });
    }
    if (winners.length === 0) {
      if (this.claim && this.claim.kind === 'jiagang') return this._completeJiagang();
      return this._passTurn();
    }
    if (isGang && this._pendingJiagang) {
      // 抢杠：把加杠牌从加杠者手里移除（被抢走）
      removeOne(this.players[this._pendingJiagang.seat].hand, tile);
      this._pendingJiagang = null;
    }
    const delta = R.settle(winners, 'ron', from);
    this._endHand({ type: 'ron', from, winners, delta, robKong: isGang });
  }

  _passTurn() {
    this.claim = null;
    if (this.wall.length === 0) return this._drawGame();
    this._drawAndAct((this.current + 1) % 4);
  }

  _drawGame() {
    this.phase = 'ended';
    this.result = { type: 'draw', delta: [0, 0, 0, 0] };
    this._logMsg('流局');
    this._emit({ type: 'end', result: this.result });
  }
  _endHand(result) {
    this.phase = 'ended';
    this.claim = null;
    this.result = result;
    for (let s = 0; s < 4; s++) this.scores[s] += result.delta[s];
    const wn = result.winners ? result.winners.map((w) => `${this._name(w.seat)}(${w.score}番)`).join('、') : '';
    if (result.type === 'zimo') this._logMsg(`${wn} 自摸和牌`);
    else this._logMsg(`${wn} 和牌${result.robKong ? '（抢杠）' : ''}，点炮：${this._name(result.from)}`);
    this._emit({ type: 'end', result });
  }

  // ===== 视图（按座位脱敏）=====
  getActions(seat) {
    if (this.phase === 'acting' && seat === this.current) {
      const p = this.players[seat];
      const angang = [];
      const seen = new Set();
      for (const t of p.hand) { if (!seen.has(t) && countIn(p.hand, t) === 4) { angang.push(t); seen.add(t); } }
      const jiagang = [];
      for (const m of p.melds) if (m.type === 'peng' && countIn(p.hand, m.tile) >= 1) jiagang.push(m.tile);
      let zimo = false;
      if (this.drewThisTurn) {
        const res = this._evalHu(seat, this.lastDraw.tile, { isZimo: true, isGang: this.gangFlag });
        zimo = res.ok;
      }
      return { type: 'acting', discard: true, angang, jiagang, zimo, drawnTile: this.lastDraw ? this.lastDraw.tile : null };
    }
    if (this.phase === 'claiming' && this.claim.options[String(seat)]) {
      const o = this.claim.options[String(seat)];
      return { type: 'claiming', tile: this.claim.tile, from: this.claim.from, kind: this.claim.kind, hu: o.hu || null, peng: !!o.peng, gang: !!o.gang, chi: o.chi || null };
    }
    return { type: 'none' };
  }

  getView(seat) {
    const players = this.players.map((p) => ({
      seat: p.seat,
      name: this._name(p.seat),
      menfeng: p.menfeng,
      menfengName: R.WIND_NAME[p.menfeng],
      isDealer: p.seat === this.dealer,
      isCurrent: p.seat === this.current,
      score: this.scores[p.seat],
      handCount: p.hand.length,
      hand: p.seat === seat ? p.hand.slice().sort((a, b) => a - b) : null,
      melds: p.melds.map((m) => ({ type: m.type, tiles: m.tiles.slice(), from: m.from, claimed: m.claimed, concealed: m.type === 'angang' })),
      flowers: p.flowers.slice(),
      river: p.river.slice(),
    }));
    return {
      phase: this.phase,
      current: this.current,
      dealer: this.dealer,
      quanfeng: this.quanfeng,
      quanfengName: R.WIND_NAME[this.quanfeng],
      minFan: this.minFan,
      wallCount: this.wall.length,
      you: seat,
      players,
      lastDiscard: this.lastDiscard,
      myDraw: (this.phase === 'acting' && seat === this.current && this.lastDraw && this.lastDraw.seat === seat) ? this.lastDraw.tile : null,
      actions: this.getActions(seat),
      pendingClaim: this.phase === 'claiming' ? { tile: this.claim.tile, from: this.claim.from, kind: this.claim.kind } : null,
      result: this.result,
      log: this.log.slice(-12),
    };
  }

  // 观战视图：以 persp 座位为下方，但隐藏所有玩家的暗牌、无任何操作
  getSpectatorView(persp = 0) {
    const v = this.getView(persp);
    v.players.forEach((p) => { p.hand = null; });
    v.myDraw = null;
    v.actions = { type: 'none' };
    v.spectator = true;
    v.you = persp;
    return v;
  }
}

module.exports = { Game };
