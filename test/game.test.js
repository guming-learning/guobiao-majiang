'use strict';
// 蒙特卡洛模拟：随机合法对局，校验状态机不崩溃、牌数守恒、能产生和牌/流局
const { Game } = require('../src/game/Game');
const T = require('../src/mahjong/tile');

function totalTiles(g) {
  let n = g.wall.length;
  for (const p of g.players) {
    n += p.hand.length;
    for (const m of p.melds) n += m.tiles.length;
    n += p.flowers.length;
    n += p.river.length;
  }
  // 和牌后赢家手里多一张（点和的牌算在 river / 视为）—— 用宽松校验：>=144 不行，必须 ==144
  return n;
}

function assert(cond, msg) { if (!cond) throw new Error('断言失败: ' + msg); }

function playOne(rng) {
  const scores = [0, 0, 0, 0];
  const g = new Game({ names: ['A', 'B', 'C', 'D'], scores, dealer: Math.floor(rng() * 4), quanfeng: T.TILE_E, onEvent: () => {} });
  g.start();
  let steps = 0;
  while (g.phase !== 'ended' && steps < 2000) {
    steps++;
    // 牌数守恒
    assert(totalTiles(g) === 144, `牌数=${totalTiles(g)} step=${steps} phase=${g.phase}`);
    if (g.phase === 'acting') {
      const seat = g.current;
      const a = g.getActions(seat);
      // 手牌张数应为 14 - ... 检查 concealed + 3*melds == 14
      const p = g.players[seat];
      const inhand = p.hand.length + 3 * p.melds.length;
      assert(inhand === 14, `acting 张数=${inhand} seat=${seat}`);
      if (a.zimo && rng() < 0.9) { const r = g.act(seat, { type: 'zimo' }); assert(!r.error, '自摸:' + r.error); continue; }
      if (a.angang.length && rng() < 0.5) { const r = g.act(seat, { type: 'angang', tile: a.angang[0] }); assert(!r.error, '暗杠:' + r.error); continue; }
      if (a.jiagang.length && rng() < 0.5) { const r = g.act(seat, { type: 'jiagang', tile: a.jiagang[0] }); assert(!r.error, '加杠:' + r.error); continue; }
      const tile = p.hand[Math.floor(rng() * p.hand.length)];
      const r = g.act(seat, { type: 'discard', tile });
      assert(!r.error, '出牌:' + r.error);
    } else if (g.phase === 'claiming') {
      const keys = Object.keys(g.claim.options);
      for (const s of keys) {
        if (g.phase !== 'claiming') break;
        if (g.claim.responses[s]) continue;
        const seat = parseInt(s, 10);
        const o = g.claim.options[s];
        let action;
        if (o.hu && rng() < 0.9) action = { type: 'hu' };
        else if (o.gang && rng() < 0.4) action = { type: 'gang' };
        else if (o.peng && rng() < 0.4) action = { type: 'peng' };
        else if (o.chi && rng() < 0.4) action = { type: 'chi', tiles: o.chi[0] };
        else action = { type: 'pass' };
        const r = g.act(seat, action);
        assert(!r.error, '认领:' + r.error + ' ' + JSON.stringify(action));
      }
      // 若仍未解析（理论不会），强制
      if (g.phase === 'claiming') g.forceResolveClaims();
    }
  }
  assert(g.phase === 'ended', `未结束 steps=${steps}`);
  // 结算后分数守恒（总和为 0）
  const sum = scores.reduce((a, b) => a + b, 0);
  assert(sum === 0, `分数和=${sum} 应为0`);
  return g.result;
}

// 简单可复现 RNG
function mulberry32(a) {
  return function () {
    a |= 0; a = (a + 0x6D2B79F5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const N = 500;
let wins = 0, draws = 0, zimos = 0, rons = 0, robs = 0;
const t0 = Date.now();
for (let i = 0; i < N; i++) {
  const rng = mulberry32(12345 + i * 97);
  const res = playOne(rng);
  if (res.type === 'draw') draws++;
  else { wins++; if (res.type === 'zimo') zimos++; else { rons++; if (res.robKong) robs++; } }
}
console.log(`模拟 ${N} 局，用时 ${Date.now() - t0}ms`);
console.log(`和牌 ${wins}（自摸 ${zimos}，点和 ${rons}，其中抢杠 ${robs}），流局 ${draws}`);
console.log('全部对局通过断言 ✅');
