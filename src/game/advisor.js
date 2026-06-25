'use strict';
// 进张顾问：对当前手牌，找出“距离最近”的若干个 >=6 番番型，及各自所缺进张。
// 思路：在当前手牌基础上，枚举“需要添加最少牌”就能凑成的胡牌型（标准型 + 七对 + 十三幺），
// 用算番引擎评估每个目标牌型的番种，按番种聚合最小距离与对应进张，取前 N 个 >=6 番番种。
const { evaluateWin } = require('./rules');

const SUITED_MAX = 27; // 1..27 为数牌（万条饼）
const MIN_FAN = 6;
const STD_BUDGET = 3;      // 标准型最多补 3 张（只看最近）
const MAX_UNIQUE = 3000;   // 唯一目标牌型上限（控时）
const LEAF_CAP = 6000;     // 标准型枚举叶子上限（防一色/对子手牌组合爆炸）
const EVAL_CAP = 150;      // 算番评估次数上限（按距离从近到远）
const SPECIAL_BUDGET = 6;  // 七对/十三幺最多补 6 张才展示

function isSeqStart(t) { return t >= 1 && t <= SUITED_MAX && ((t - 1) % 9) <= 6; }

// 把手牌 id 列表转为 1..34 的张数表（忽略花牌 35..42）
function toCounts(tiles) {
  const c = new Array(35).fill(0);
  for (const id of tiles) if (id >= 1 && id <= 34) c[id]++;
  return c;
}

// 枚举标准胡牌型（setsNeeded 个面子 + 1 对），onW(wCounts, cost)
function enumStandard(need, setsNeeded, budget, onW) {
  const w = new Array(35).fill(0);
  const st = { cost: 0, leaves: 0 };
  const canAdd = (t, n) => w[t] + n <= 4;
  const add = (t, n) => { for (let k = 0; k < n; k++) { w[t]++; if (w[t] > need[t]) st.cost++; } };
  const del = (t, n) => { for (let k = 0; k < n; k++) { if (w[t] > need[t]) st.cost--; w[t]--; } };
  function sets(anchor, rem) {
    if (st.cost > budget || st.leaves > LEAF_CAP) return;
    if (rem === 0) { onW(w, st.cost); st.leaves++; return; }
    for (let t = anchor; t <= 34; t++) {
      if (canAdd(t, 3)) { add(t, 3); sets(t, rem - 1); del(t, 3); }
      if (isSeqStart(t) && canAdd(t, 1) && canAdd(t + 1, 1) && canAdd(t + 2, 1)) {
        add(t, 1); add(t + 1, 1); add(t + 2, 1); sets(t, rem - 1); del(t + 2, 1); del(t + 1, 1); del(t, 1);
      }
    }
  }
  for (let p = 1; p <= 34; p++) {
    if (canAdd(p, 2)) { add(p, 2); sets(1, setsNeeded); del(p, 2); }
  }
}

// 七对候选（门清无副露）：取张数最多的 7 种牌作对
function qiduiCandidate(need, numMelds) {
  if (numMelds > 0) return null;
  const types = [];
  for (let t = 1; t <= 34; t++) types.push({ t, c: need[t] });
  types.sort((a, b) => b.c - a.c);
  const w = new Array(35).fill(0); let cost = 0; const needed = [];
  for (const { t, c } of types.slice(0, 7)) { w[t] = 2; const add = 2 - Math.min(c, 2); cost += add; if (add > 0) needed.push(t); }
  return { w, cost, needed };
}

// 十三幺候选（门清无副露）
function shisanyaoCandidate(need, numMelds) {
  if (numMelds > 0) return null;
  const yao = [1, 9, 10, 18, 19, 27, 28, 29, 30, 31, 32, 33, 34];
  let pairTile = yao[0], best = -1;
  for (const t of yao) if (need[t] > best) { best = need[t]; pairTile = t; }
  const w = new Array(35).fill(0); let cost = 0; const needed = [];
  for (const t of yao) w[t] = (t === pairTile) ? 2 : 1;
  for (const t of yao) { const add = Math.max(0, w[t] - need[t]); cost += add; if (add > 0) needed.push(t); }
  return { w, cost, needed };
}

// 计算某个目标牌型相对当前手牌的进张（缺的牌）
function neededTiles(w, need) {
  const out = [];
  for (let t = 1; t <= 34; t++) for (let k = 0; k < (w[t] - need[t]); k++) out.push(t);
  return out;
}

// 用算番引擎评估一个完整胡牌型 w（张数表），返回 >=6 番的番种列表 [{name,score}]
function evalHighFans(w, melds, quanfeng, menfeng) {
  const tiles = [];
  for (let t = 1; t <= 34; t++) for (let k = 0; k < w[t]; k++) tiles.push(t);
  if (!tiles.length) return [];
  const winTile = tiles[tiles.length - 1];
  const concealed = tiles.slice(0, tiles.length - 1);
  let r;
  try {
    r = evaluateWin({ melds, concealed, winTile, isZimo: false, quanfeng, menfeng, juezhang: false, haidi: false, gang: false, flowers: [], minFan: MIN_FAN });
  } catch (e) { return []; }
  if (!r || !r.items) return [];
  return r.items.filter((it) => it.score >= MIN_FAN && it.count > 0).map((it) => ({ name: it.name, score: it.score }));
}

// 主入口：返回距离最近的 topN 个 >=6 番番种 [{name, score, dist, tiles:[id...]}]
function analyzeHand({ hand, melds, quanfeng, menfeng }, topN = 3) {
  const numMelds = (melds || []).length;
  const setsNeeded = 4 - numMelds;
  if (setsNeeded < 0) return [];
  const need = toCounts(hand || []);
  const handCount = need.reduce((a, b) => a + b, 0);
  // 张数应为 3*setsNeeded+1（等张）或 +2（自己回合刚摸）
  if (handCount !== 3 * setsNeeded + 1 && handCount !== 3 * setsNeeded + 2) return [];

  const best = new Map(); // name -> { score, dist, tiles:Set }
  const consider = (fans, w, cost) => {
    if (!fans.length) return;
    const tiles = neededTiles(w, need);
    for (const f of fans) {
      const cur = best.get(f.name);
      if (!cur || cost < cur.dist) best.set(f.name, { score: f.score, dist: cost, tiles: new Set(tiles) });
      else if (cost === cur.dist) for (const t of tiles) cur.tiles.add(t);
    }
  };

  // 标准型：去重后按距离从近到远评估（限次数）
  const seen = new Map(); // 签名 -> cost
  enumStandard(need, setsNeeded, STD_BUDGET, (w, cost) => {
    const sig = w.slice(1, 35).join(',');
    const prev = seen.get(sig);
    if (prev === undefined) { if (seen.size < MAX_UNIQUE) seen.set(sig, cost); }
    else if (cost < prev) seen.set(sig, cost);
  });
  const sortedSeen = Array.from(seen.entries()).sort((a, b) => a[1] - b[1]).slice(0, EVAL_CAP);
  let lastCost = -1;
  for (const [sig, cost] of sortedSeen) {
    if (cost !== lastCost && lastCost >= 0 && best.size >= topN) break; // 完成上一距离层且番种已够，更远的不会进前三
    const w = [0, ...sig.split(',').map(Number)];
    consider(evalHighFans(w, melds, quanfeng, menfeng), w, cost);
    lastCost = cost;
  }
  // 七对 / 十三幺
  for (const cand of [qiduiCandidate(need, numMelds), shisanyaoCandidate(need, numMelds)]) {
    if (cand && cand.cost <= SPECIAL_BUDGET) consider(evalHighFans(cand.w, melds, quanfeng, menfeng), cand.w, cand.cost);
  }

  const res = [];
  for (const [name, v] of best) res.push({ name, score: v.score, dist: v.dist, tiles: Array.from(v.tiles).sort((a, b) => a - b) });
  res.sort((a, b) => (a.dist - b.dist) || (b.score - a.score) || a.tiles.length - b.tiles.length);
  return res.slice(0, topN);
}

module.exports = { analyzeHand };
