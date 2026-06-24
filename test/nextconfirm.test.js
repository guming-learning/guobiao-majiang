'use strict';
// 验证：一局结束后不自动续局，必须有人点“继续”确认；机器人/掉线者自动就绪不阻塞
const { io } = require('socket.io-client');
const URL = process.env.TEST_URL || 'http://localhost:3400';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function client(name) {
  const sock = io(URL, { forceNew: true, transports: ['websocket'] });
  const c = { sock, name, playerId: 'nc_' + name + '_' + Math.random().toString(36).slice(2), seat: -1, roomId: null, view: null, autoplay: false };
  sock.on('connect', () => sock.emit('login', { playerId: c.playerId, name }));
  sock.on('roomUpdate', (rs) => { c.roomId = rs.roomId; c.seat = rs.seats.findIndex((s) => s && s.playerId === c.playerId); c.room = rs; });
  sock.on('gameState', (v) => {
    c.view = v;
    if (c.autoplay && v.phase && v.phase !== 'ended' && v.actions) {
      const a = v.actions;
      if (a.type === 'acting' && v.current === v.you) {
        setTimeout(() => { const me = v.players.find((p) => p.seat === v.you); const t = (v.myDraw != null) ? v.myDraw : me.hand[me.hand.length - 1]; c.sock.emit('action', { type: 'discard', tile: t }); }, 5);
      } else if (a.type === 'claiming') { setTimeout(() => c.sock.emit('action', { type: 'pass' }), 5); }
    }
  });
  return c;
}
const until = async (fn, t = 15000, step = 50) => { const t0 = Date.now(); while (Date.now() - t0 < t) { if (fn()) return true; await sleep(step); } return false; };

let failed = 0;
const assert = (c, m) => { console.log((c ? '  PASS ' : '  FAIL ') + m); if (!c) failed++; };

(async () => {
  const host = client('房主'); host.autoplay = true;
  await until(() => host.sock.connected);
  host.sock.emit('createRoom', { turnTime: 0, minFan: 8 });
  await until(() => host.roomId);
  host.sock.emit('addBot'); await sleep(60);
  host.sock.emit('addBot'); await sleep(60);
  host.sock.emit('addBot'); await sleep(60);
  host.sock.emit('ready', { ready: true });
  await until(() => host.view && host.view.phase && host.view.phase !== 'ended');
  // 打到本局结束
  const ended = await until(() => host.view && host.view.phase === 'ended', 40000);
  assert(ended, '本局已结束');
  const handNo1 = host.room ? host.room.handNo : null;

  // 不点“继续”，等待 17 秒（超过旧的 15 秒自动续局阈值），应仍停在结束态
  console.log('  ...等待 17 秒验证不自动续局...');
  await sleep(17000);
  assert(host.view && host.view.phase === 'ended', '17 秒后仍停在本局结束（未自动续局）');
  assert(host.room && host.room.handNo === handNo1, '局数未变化（未开新局）');

  // 点“继续” -> 机器人已自动就绪，应立即开下一局
  host.sock.emit('ready', { ready: true });
  const advanced = await until(() => host.view && host.view.phase !== 'ended', 8000);
  assert(advanced, '点继续后开下一局');
  assert(host.room && host.room.handNo === handNo1 + 1, '局数 +1');

  host.sock.close();
  await sleep(150);
  console.log(failed === 0 ? '\n确认续局测试通过 ✅' : `\n失败 ${failed} 项 ❌`);
  process.exit(failed === 0 ? 0 : 1);
})();
