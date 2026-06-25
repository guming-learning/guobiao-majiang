'use strict';
// 工作线程：在主事件循环之外运行较重的番型枚举（analyzeHand），避免阻塞牌桌动作处理。
const { parentPort } = require('worker_threads');
const { analyzeHand } = require('./advisor');

parentPort.on('message', (msg) => {
  const { reqId, hand, melds, quanfeng, menfeng } = msg || {};
  let cand = [];
  try { cand = analyzeHand({ hand, melds, quanfeng, menfeng }); } catch (e) { cand = []; }
  parentPort.postMessage({ reqId, cand });
});
