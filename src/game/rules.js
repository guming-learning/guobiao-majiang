'use strict';
// 国标麻将游戏规则：牌墙、门风/圈风、MCR 计分，以及把实时牌局状态接入算番引擎
const T = require('./../mahjong/tile');
const { Tile } = T;
const P = require('./../mahjong/pack');
const { Pack } = P;
const { Handtiles } = require('./../mahjong/handtiles');
const { Fan } = require('./../mahjong/fan');

const SEAT_WINDS = [T.TILE_E, T.TILE_S, T.TILE_W, T.TILE_N]; // 东南西北
const WIND_NAME = { [T.TILE_E]: '东', [T.TILE_S]: '南', [T.TILE_W]: '西', [T.TILE_N]: '北' };

// 构建并洗牌：144 张（万条饼各 1-9×4，风 4 种×4，箭 3 种×4，花 8 张各 1）
function buildWall() {
  const wall = [];
  for (let suitBase of [T.TILE_1m, T.TILE_1s, T.TILE_1p]) {
    for (let r = 0; r < 9; r++) for (let k = 0; k < 4; k++) wall.push(suitBase + r);
  }
  for (let z of [T.TILE_E, T.TILE_S, T.TILE_W, T.TILE_N, T.TILE_C, T.TILE_F, T.TILE_P]) {
    for (let k = 0; k < 4; k++) wall.push(z);
  }
  for (let h = T.TILE_MEI; h <= T.TILE_DONG; h++) wall.push(h); // 花牌各 1
  shuffle(wall);
  return wall;
}

function shuffle(a) {
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

function isFlower(id) { return id >= T.TILE_MEI && id <= T.TILE_DONG; }

// 门风：庄家为东，逆位依次为南西北
function seatWind(seat, dealer) { return SEAT_WINDS[(seat - dealer + 4) % 4]; }

// 把一个副露（游戏格式）转换为算番用的 Pack
function meldToPack(meld) {
  switch (meld.type) {
    case 'chi': return new Pack(P.PACK_TYPE_SHUNZI, new Tile(meld.middle), 0, 1);
    case 'peng': return new Pack(P.PACK_TYPE_KEZI, new Tile(meld.tile), 0, 1);
    case 'gang': // 明杠
    case 'jiagang': return new Pack(P.PACK_TYPE_GANG, new Tile(meld.tile), 0, 1);
    case 'angang': return new Pack(P.PACK_TYPE_GANG, new Tile(meld.tile), 0, 0);
    default: return null;
  }
}

// 直接构造 Handtiles（不走字符串解析），返回 null 表示张数非法
function buildHandtiles({ melds, concealed, winTile, isZimo, quanfeng, menfeng, juezhang, haidi, gang, flowers }) {
  const ht = new Handtiles();
  ht._ClearAndSetDefault();
  ht.fulu = melds.map(meldToPack);
  ht.lipai = concealed.map((id) => new Tile(id));
  ht.lipai.push(new Tile(winTile));
  ht.huapai = (flowers || []).map((id) => new Tile(id));
  ht.SetQuanfeng(quanfeng);
  ht.SetMenfeng(menfeng);
  ht.SetZimo(isZimo ? 1 : 0);
  ht.SetJuezhang(juezhang ? 1 : 0);
  ht.SetHaidi(haidi ? 1 : 0);
  ht.SetGang(gang ? 1 : 0);
  if (ht.fulu.length * 3 + ht.lipai.length !== 14) return null;
  if (ht._GenerateTable()) return null;
  if (ht.IsZimo()) ht.LastLipai().SetZimo(); else ht.LastLipai().SetChonghu();
  ht.SortLipaiWithoutLastOne();
  return ht;
}

// 评估和牌：返回 { ok(>=起胡番数), thresholdFan, score(含花), total, items, huapai }
function evaluateWin(opts) {
  const minFan = opts.minFan || 8;
  const ht = buildHandtiles(opts);
  if (!ht) return { ok: false, thresholdFan: 0, score: 0, total: 0, items: [], huapai: 0 };
  const fan = new Fan();
  fan.CountFan(ht);
  const r = fan.getResult();
  return {
    ok: r.thresholdFan >= minFan,
    thresholdFan: r.thresholdFan,
    score: r.thresholdFan + r.huapaiCount, // 用于计分的番数（含花牌）
    total: r.total,
    items: r.items,
    huapai: r.huapaiCount,
  };
}

// MCR 计分：返回每个座位的分数增减数组（长度 4）
// winners: [{seat, score}]（一炮多响支持多个），winType: 'zimo'|'ron'，loser: 点炮者座位或 null
function settle(winners, winType, loser) {
  const delta = [0, 0, 0, 0];
  if (winType === 'zimo') {
    const w = winners[0];
    for (let s = 0; s < 4; s++) {
      if (s === w.seat) continue;
      const pay = w.score + 8;
      delta[s] -= pay;
      delta[w.seat] += pay;
    }
  } else { // ron（可多个赢家，均由点炮者按各自番数支付，其余两家各付底分 8）
    for (const w of winners) {
      // 点炮者付 (番+8)
      delta[loser] -= (w.score + 8);
      delta[w.seat] += (w.score + 8);
      // 其余两家各付底分 8
      for (let s = 0; s < 4; s++) {
        if (s === w.seat || s === loser) continue;
        delta[s] -= 8;
        delta[w.seat] += 8;
      }
    }
  }
  return delta;
}

// 构造 13 张听牌判定用的手牌（最后一张为占位牌，供 CalcTing 替换）
function buildTingHand({ melds, concealed, quanfeng, menfeng }) {
  const ht = new Handtiles();
  ht._ClearAndSetDefault();
  ht.fulu = melds.map(meldToPack);
  ht.lipai = concealed.map((id) => new Tile(id));
  ht.lipai.push(new Tile(T.TILE_INVALID));
  ht.SetQuanfeng(quanfeng);
  ht.SetMenfeng(menfeng);
  if (ht.fulu.length * 3 + ht.lipai.length !== 14) return null;
  if (ht._GenerateTable()) return null;
  ht.SortLipaiWithoutLastOne();
  return ht;
}

// 计算听牌（仅判断和牌“型”，不含 8 番门槛）；返回可和的牌 id 数组
function calcTing(opts) {
  const ht = buildTingHand(opts);
  if (!ht) return [];
  return new Fan().CalcTing(ht).map((t) => t.GetId());
}

module.exports = {
  SEAT_WINDS, WIND_NAME, buildWall, shuffle, isFlower, seatWind,
  meldToPack, buildHandtiles, evaluateWin, settle, calcTing,
};
