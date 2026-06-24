'use strict';
// 简单 AI：保持听牌的效率弃牌 + 保守的字牌认领 + 能和则和
const R = require('./rules');

function isHonor(id) { return id >= 28 && id <= 34; }
function isDragon(id) { return id >= 32 && id <= 34; }
function countIn(arr, id) { let c = 0; for (const x of arr) if (x === id) c++; return c; }

// 一张牌的“保留价值”：刻/对>连张>孤张；字牌仅成对的箭牌/本门风圈风略加分
function keepValue(hand, t, menfeng, quanfeng) {
  const cnt = countIn(hand, t);
  let v = cnt >= 3 ? 100 : cnt === 2 ? 30 : 5;
  if (t >= 1 && t <= 27) {
    const rank = ((t - 1) % 9) + 1;
    for (const d of [-2, -1, 1, 2]) {
      const nr = rank + d;
      if (nr >= 1 && nr <= 9) {
        const c = countIn(hand, t + d);
        if (c > 0) v += (Math.abs(d) === 1 ? 6 : 2) + (c > 1 ? 1 : 0);
      }
    }
    if (rank >= 3 && rank <= 7) v += 1; // 中张略优
  } else {
    if (cnt >= 2 && (isDragon(t) || t === menfeng || t === quanfeng)) v += 5;
  }
  return v;
}

// 出牌：在最差的几张里挑“弃后仍听牌”的；否则弃保留价值最低者
function decideDiscard(game, seat) {
  const p = game.players[seat];
  const hand = p.hand;
  const distinct = [...new Set(hand)];
  const scored = distinct.map((t) => ({ t, v: keepValue(hand, t, p.menfeng, game.quanfeng) })).sort((a, b) => a.v - b.v);
  const limit = Math.min(scored.length, 6);
  for (let i = 0; i < limit; i++) {
    const concealed = hand.slice();
    concealed.splice(concealed.indexOf(scored[i].t), 1);
    const ting = R.calcTing({ melds: p.melds, concealed, quanfeng: game.quanfeng, menfeng: p.menfeng });
    if (ting.length) return scored[i].t;
  }
  return scored[0].t;
}

function decideActing(game, seat, a) {
  if (a.zimo) return { type: 'zimo' };
  if (a.angang && a.angang.length) return { type: 'angang', tile: a.angang[0] };
  if (a.jiagang && a.jiagang.length) return { type: 'jiagang', tile: a.jiagang[0] };
  return { type: 'discard', tile: decideDiscard(game, seat) };
}

function decideClaim(game, seat, o) {
  if (o.hu) return { type: 'hu' };
  const tile = game.claim.tile;
  const p = game.players[seat];
  if (isHonor(tile)) {
    if (o.gang) return { type: 'gang' };
    if (o.peng && (isDragon(tile) || tile === p.menfeng || tile === game.quanfeng)) return { type: 'peng' };
  }
  return { type: 'pass' };
}

module.exports = { decideActing, decideClaim, decideDiscard };
