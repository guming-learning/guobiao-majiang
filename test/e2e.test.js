'use strict';
// 端到端：4 个 socket 客户端 连入实时服务器，建房/加入/准备/对局，验证整条链路
const { io } = require('socket.io-client');
const URL = 'http://localhost:3000';

function makeClient(name) {
  const sock = io(URL, { forceNew: true, transports: ['websocket'] });
  const c = { sock, name, playerId: 'e2e_' + name + '_' + Math.random().toString(36).slice(2), seat: -1, roomId: null, view: null, done: false };
  sock.on('connect', () => sock.emit('login', { playerId: c.playerId, name }));
  sock.on('roomUpdate', (rs) => { c.roomId = rs.roomId; c.seat = rs.seats.findIndex((s) => s.playerId === c.playerId); });
  sock.on('gameState', (v) => { c.view = v; onState(c, v); });
  sock.on('errorMsg', (m) => { /* console.log(name, 'ERR', m); */ });
  return c;
}

let handsEnded = 0;
let stats = { zimo: 0, ron: 0, draw: 0 };
const clients = [];

function onState(c, v) {
  if (v.phase === 'ended') {
    if (c.seat === v.you && !v._counted) {
      v._counted = true;
    }
    // 仅由 0 号座位统计一次
    if (v.you === 0) {
      const t = v.result && v.result.type;
      if (t === 'zimo') stats.zimo++; else if (t === 'ron') stats.ron++; else stats.draw++;
      handsEnded++;
      console.log(`第 ${handsEnded} 局结束: ${t}${v.result && v.result.winners ? '（' + v.result.winners.map((w) => w.score + '番').join(',') + '）' : ''}`);
    }
    return;
  }
  const a = v.actions;
  if (!a) return;
  if (a.type === 'acting' && v.current === v.you) {
    setTimeout(() => {
      if (a.zimo) { c.sock.emit('action', { type: 'zimo' }); return; }
      const me = v.players.find((p) => p.seat === v.you);
      const hand = me.hand;
      const tile = (v.myDraw != null) ? v.myDraw : hand[hand.length - 1];
      c.sock.emit('action', { type: 'discard', tile });
    }, 5);
  } else if (a.type === 'claiming') {
    setTimeout(() => {
      if (a.hu) c.sock.emit('action', { type: 'hu' });
      else if (a.peng && Math.random() < 0.3) c.sock.emit('action', { type: 'peng' });
      else if (a.chi && Math.random() < 0.3) c.sock.emit('action', { type: 'chi', tiles: a.chi[0] });
      else c.sock.emit('action', { type: 'pass' });
    }, 5);
  }
}

async function main() {
  for (const n of ['甲', '乙', '丙', '丁']) clients.push(makeClient(n));
  await sleep(600);
  // 甲 建房
  clients[0].sock.emit('createRoom');
  await sleep(400);
  const roomId = clients[0].roomId;
  if (!roomId) { console.error('建房失败'); process.exit(1); }
  console.log('房间已创建:', roomId);
  for (let i = 1; i < 4; i++) { clients[i].sock.emit('joinRoom', { roomId }); await sleep(150); }
  await sleep(400);
  // 全部准备
  for (const c of clients) c.sock.emit('ready', { ready: true });
  console.log('全部准备，等待对局...');

  // 自动续局，直到打满若干局或超时
  const target = 3;
  const start = Date.now();
  // 续局：每局结束后各客户端点继续
  const cont = setInterval(() => {
    for (const c of clients) {
      if (c.view && c.view.phase === 'ended') c.sock.emit('ready', { ready: true });
    }
  }, 500);

  while (handsEnded < target && Date.now() - start < 60000) await sleep(300);
  clearInterval(cont);

  console.log(`\n完成 ${handsEnded} 局，自摸 ${stats.zimo}，点和 ${stats.ron}，流局 ${stats.draw}`);
  console.log(handsEnded >= 1 ? '端到端链路验证通过 ✅' : '未能完成任何对局 ❌');
  for (const c of clients) c.sock.close();
  process.exit(handsEnded >= 1 ? 0 : 1);
}
function sleep(ms) { return new Promise((r) => setTimeout(r, ms)); }
main();
