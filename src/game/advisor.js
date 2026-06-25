'use strict';
// 进张顾问：对当前手牌，找出“距离最近”的若干个 >=6 番番型，及各自所缺进张。
// 思路：在当前手牌基础上，枚举“需要添加最少牌”就能凑成的胡牌型（标准型 + 七对 + 十三幺），
// 用算番引擎评估每个目标牌型的番种，按番种聚合最小距离与对应进张，取前 N 个 >=6 番番种。
const { evaluateWin } = require('./rules');

const SUITED_MAX = 27; // 1..27 为数牌（万条饼）
const MIN_FAN = 6;
const MAX_BUDGET = 6;      // 标准型/七对/十三幺统一最多补 6 张（逐层加深，找够即停）
const CAND_N = 6;          // 至少找出这么多备选番型（供按余张过滤后仍能凑够展示数）
const LEAF_CAP = 200000;   // 单层枚举叶子安全上限（极端手牌防卡死）
const EVAL_TOTAL = 600;    // 算番评估总次数上限
const MAX_SEEN = 60000;    // 去重表大小上限

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
  // 对子优先用手上多的牌（让低成本胡型尽早枚举到）
  const pairOrder = [];
  for (let p = 1; p <= 34; p++) pairOrder.push(p);
  pairOrder.sort((a, b) => need[b] - need[a]);
  for (const p of pairOrder) {
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

  // 标准型 + 七对/十三幺：逐层加深（距离从近到远），找够 topN 个番种即停。
  // 组织度高的手牌（一色/对子）在低距离即命中、提前停止，开销小；
  // 散牌则会向更远搜索，从而给出多个备选番型。
  const seen = new Map(); // 签名 -> cost
  const special = [qiduiCandidate(need, numMelds), shisanyaoCandidate(need, numMelds)].filter(Boolean);
  let evalCount = 0;
  for (let budget = 1; budget <= MAX_BUDGET && best.size < CAND_N && evalCount < EVAL_TOTAL; budget++) {
    const layer = [];
    enumStandard(need, setsNeeded, budget, (w, cost) => {
      if (cost !== budget) return; // 只取本层新增（更近的已在前面层处理完）
      const sig = w.slice(1, 35).join(',');
      if (seen.has(sig)) return;
      if (seen.size < MAX_SEEN) seen.set(sig, cost);
      layer.push(w.slice());
    });
    for (const cand of special) if (cand.cost === budget) layer.push(cand.w);
    for (const w of layer) {
      consider(evalHighFans(w, melds, quanfeng, menfeng), w, budget);
      if (++evalCount >= EVAL_TOTAL) break;
    }
  }

  const res = [];
  for (const [name, v] of best) res.push({ name, score: v.score, dist: v.dist, tiles: Array.from(v.tiles).sort((a, b) => a - b) });
  res.sort((a, b) => (a.dist - b.dist) || (b.score - a.score) || a.tiles.length - b.tiles.length);
  return res.slice(0, 8); // 返回较多备选，调用方按余张过滤后再取前 N 个
}

// 按“场上余张”过滤进张：进张已绝（remaining<=0）的牌剔除；某番型全部进张已绝则去掉该番型。
// 取前 topN 个。remaining[t]：该牌还能摸到的张数 = 4 - 已现张数。
function filterByRemaining(list, remaining, topN = 3) {
  const out = [];
  for (const it of (list || [])) {
    const tiles = (it.tiles || []).filter((t) => !remaining || remaining[t] == null || remaining[t] >= 1);
    if (!tiles.length) continue;
    out.push({ name: it.name, score: it.score, dist: it.dist, tiles });
    if (out.length >= topN) break;
  }
  return out;
}

module.exports = { analyzeHand, filterByRemaining };
