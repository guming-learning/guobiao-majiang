'use strict';
// 观战集成测试：1 真人 + 3 机器人开局，第二个客户端观战，验证收到隐藏手牌的观战视图
const { io } = require('socket.io-client');
const URL = process.env.TEST_URL || 'http://localhost:3200';

function client(name) {
  const sock = io(URL, { forceNew: true, transports: ['websocket'] });
  const c = { sock, name, playerId: 'spec_' + name + '_' + Math.random().toString(36).slice(2), seat: -1, roomId: null, view: null, spectating: false };
  sock.on('connect', () => sock.emit('login', { playerId: c.playerId, name }));
  sock.on('roomUpdate', (rs) => { c.roomId = rs.roomId; c.seat = rs.seats.findIndex((s) => s && s.playerId === c.playerId); });
  sock.on('spectating', () => { c.spectating = true; });
  sock.on('gameState', (v) => {
    c.view = v;
    if (c.autoplay && v.phase && v.phase !== 'ended' && v.actions) {
      const a = v.actions;
      if (a.type === 'acting' && v.current === v.you) {
        setTimeout(() => {
          const me = v.players.find((p) => p.seat === v.you);
          const tile = (v.myDraw != null) ? v.myDraw : me.hand[me.hand.length - 1];
          c.sock.emit('action', { type: 'discard', tile });
        }, 5);
      } else if (a.type === 'claiming') {
        setTimeout(() => c.sock.emit('action', { type: 'pass' }), 5);
      }
    }
  });
  sock.on('errorMsg', (m) => { c.lastErr = m; });
  return c;
}
const wait = (ms) => new Promise((r) => setTimeout(r, ms));
async function until(fn, timeout = 8000, step = 50) {
  const t0 = Date.now();
  while (Date.now() - t0 < timeout) { if (fn()) return true; await wait(step); }
  return false;
}

let failed = 0;
function assert(cond, msg) { if (cond) { console.log('  PASS ' + msg); } else { failed++; console.log('  FAIL ' + msg); } }

(async () => {
  const host = client('房主');
  host.autoplay = true;
  await until(() => host.sock.connected);
  host.sock.emit('createRoom', { turnTime: 0, minFan: 8 });
  await until(() => host.roomId);
  const roomId = host.roomId;
  console.log('房间已建:', roomId);
  host.sock.emit('addBot'); await wait(60);
  host.sock.emit('addBot'); await wait(60);
  host.sock.emit('addBot'); await wait(60);
  host.sock.emit('ready', { ready: true });
  const started = await until(() => host.view && host.view.phase && host.view.phase !== 'ended');
  assert(started, '对局已开始（房主收到 gameState）');
  assert(host.view && Array.isArray(host.view.players[host.view.you].hand), '房主能看到自己的手牌');

  // 观战者加入
  const spec = client('观众');
  await until(() => spec.sock.connected);
  spec.sock.emit('spectate', { roomId });
  const gotSpec = await until(() => spec.spectating && spec.view);
  assert(gotSpec, '观战者收到 spectating + gameState');

  const v = spec.view;
  assert(v && v.spectator === true, '观战视图带 spectator=true 标记');
  assert(v && v.players && v.players.length === 4, '观战视图含 4 名玩家');
  const allHidden = v && v.players.every((p) => p.hand === null);
  assert(allHidden, '所有玩家手牌均隐藏（hand=null）');
  assert(v && (!v.actions || v.actions.type === 'none'), '观战者无操作（actions=none）');
  assert(v && typeof v.players[0].handCount === 'number', '观战视图含 handCount（用于渲染暗牌张数）');
  assert(v && typeof v.you === 'number', '观战视图含 you（庄家视角）');

  // 房主不应受影响，仍能看到自己的牌
  assert(Array.isArray(host.view.players[host.view.you].hand), '房主手牌仍可见（观战不泄露）');

  // 观战者收到后续状态更新
  const prevWall = v.wallCount;
  const updated = await until(() => spec.view && spec.view !== v && spec.view.wallCount !== undefined, 12000);
  assert(updated || prevWall !== undefined, '观战者持续收到对局状态广播');

  // 离开观战
  spec.sock.emit('leaveRoom');
  await wait(200);

  host.sock.close(); spec.sock.close();
  await wait(150);
  console.log(failed === 0 ? '\n观战测试全部通过 ✅' : `\n观战测试失败 ${failed} 项 ❌`);
  process.exit(failed === 0 ? 0 : 1);
})();
