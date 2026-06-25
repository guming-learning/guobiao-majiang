'use strict';
// 番型顾问工作线程池：把耗时的 analyzeHand 放到 worker，主线程永不被阻塞。
// 顾问只是“提示”，非关键路径——单个常驻 worker 串行处理即可；新请求不取消旧请求，
// 由调用方按手牌签名判断结果是否仍然有效（过期则丢弃）。
const path = require('path');
const { Worker } = require('worker_threads');

let worker = null;
let nextId = 1;
const pending = new Map(); // reqId -> resolve

function flushPending() {
  for (const resolve of pending.values()) { try { resolve([]); } catch (e) { /* ignore */ } }
  pending.clear();
}

function ensureWorker() {
  if (worker) return worker;
  worker = new Worker(path.join(__dirname, 'advisorWorker.js'));
  worker.on('message', (msg) => {
    const resolve = pending.get(msg.reqId);
    if (resolve) { pending.delete(msg.reqId); resolve(msg.cand || []); }
    if (pending.size === 0 && worker) worker.unref(); // 空闲时不阻止进程退出
  });
  worker.on('error', () => { worker = null; flushPending(); });
  worker.on('exit', () => { worker = null; flushPending(); });
  worker.unref();
  return worker;
}

// 返回 Promise<cand[]>；worker 异常时回退为 []，绝不抛出/阻塞。
function analyzeAsync(payload) {
  let w;
  try { w = ensureWorker(); } catch (e) { return Promise.resolve([]); }
  const reqId = nextId++;
  return new Promise((resolve) => {
    pending.set(reqId, resolve);
    w.ref(); // 有待处理任务时保持进程存活，直到结果返回
    try { w.postMessage({ reqId, ...payload }); }
    catch (e) { pending.delete(reqId); if (pending.size === 0) w.unref(); resolve([]); }
  });
}

module.exports = { analyzeAsync };
