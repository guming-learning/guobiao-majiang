'use strict';
// 1 个真人客户端 + 3 个机器人，验证 AI 对局链路（BOT_FAST 加速）
const { io } = require('socket.io-client');
const URL = process.env.MJ_URL || 'http://localhost:3100';

const sock = io(URL, { forceNew: true, transports: ['websocket'] });
const pid = 'human_' + Math.random().toString(36).slice(2);
let roomId = null, view = null;
let hands = 0; const stats = { zimo: 0, ron: 0, draw: 0, humanWin: 0 };

sock.on('connect', () => sock.emit('login', { playerId: pid, name: '真人' }));
sock.on('loggedIn', () => sock.emit('createRoom'));
sock.on('roomUpdate', (rs) => {
  roomId = rs.roomId;
  const filled = rs.seats.filter((s) => s.name).length;
  if (filled < 4) { sock.emit('addBot'); return; }
  // 满 4 人后准备
  const me = rs.seats.find((s) => s.playerId === pid);
  if (me && !me.ready) sock.emit('ready', { ready: true });
});
sock.on('gameState', (v) => {
  view = v;
  if (v.phase === 'ended') {
    hands++;
    const t = v.result && v.result.type;
    if (t === 'zimo') stats.zimo++; else if (t === 'ron') stats.ron++; else stats.draw++;
    if (v.result && v.result.winners && v.result.winners.some((w) => w.seat === v.you)) stats.humanWin++;
    setTimeout(() => sock.emit('ready', { ready: true }), 5);
    return;
  }
  const a = v.actions;
  if (!a) return;
  if (a.type === 'acting' && v.current === v.you) {
    setTimeout(() => {
      if (a.zimo) { sock.emit('action', { type: 'zimo' }); return; }
      const me = v.players.find((p) => p.seat === v.you);
      const tile = v.myDraw != null ? v.myDraw : me.hand[me.hand.length - 1];
      sock.emit('action', { type: 'discard', tile });
    }, 5);
  } else if (a.type === 'claiming') {
    setTimeout(() => { sock.emit('action', a.hu ? { type: 'hu' } : { type: 'pass' }); }, 5);
  }
});
sock.on('errorMsg', (m) => console.log('ERR', m));

const start = Date.now();
const target = 40;
const iv = setInterval(() => {
  if (hands >= target || Date.now() - start > 45000) {
    clearInterval(iv);
    console.log(`完成 ${hands} 局：自摸 ${stats.zimo}，点和 ${stats.ron}，流局 ${stats.draw}（真人和牌 ${stats.humanWin}）`);
    console.log(hands >= 1 ? 'AI 对局链路验证通过 ✅' : '未完成对局 ❌');
    sock.close(); process.exit(hands >= 1 ? 0 : 1);
  }
}, 300);
