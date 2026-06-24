'use strict';
// 验证“关闭房间”：仅房主可关闭，关闭后所有人被踢回大厅、房间从大厅消失
const { io } = require('socket.io-client');
const URL = process.env.MJ_URL || 'http://localhost:3000';
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

function mk(name) {
  const sock = io(URL, { forceNew: true, transports: ['websocket'] });
  const c = { sock, name, pid: 'cr_' + name + Math.random().toString(36).slice(2), room: null, closed: false, err: null, lobby: null };
  sock.on('connect', () => sock.emit('login', { playerId: c.pid, name }));
  sock.on('roomUpdate', (rs) => { c.room = rs; });
  sock.on('roomClosed', () => { c.closed = true; c.room = null; });
  sock.on('errorMsg', (m) => { c.err = m; });
  sock.on('lobby', (d) => { c.lobby = d; });
  return c;
}

(async () => {
  let ok = true;
  const A = mk('房主'); const B = mk('玩家B');
  await sleep(500);
  A.sock.emit('createRoom');
  await sleep(400);
  const roomId = A.room && A.room.roomId;
  const owner = A.room && A.room.owner;
  console.log('建房:', roomId, ' owner==A:', owner === A.pid);
  ok = ok && roomId && owner === A.pid;
  B.sock.emit('joinRoom', { roomId });
  await sleep(400);
  // 非房主尝试关闭 -> 应被拒绝
  B.err = null;
  B.sock.emit('closeRoom');
  await sleep(400);
  console.log('非房主关闭被拒:', B.err);
  ok = ok && /房主/.test(B.err || '') && !A.closed && !B.closed;
  // 房主关闭 -> 双方都被踢、房间消失
  A.sock.emit('closeRoom');
  await sleep(600);
  console.log('A.closed:', A.closed, ' B.closed:', B.closed);
  const stillListed = (B.lobby && B.lobby.rooms || []).some((r) => r.roomId === roomId);
  console.log('大厅仍有该房间:', stillListed);
  ok = ok && A.closed && B.closed && !stillListed;
  console.log(ok ? '关闭房间功能验证通过 ✅' : '关闭房间验证失败 ❌');
  A.sock.close(); B.sock.close();
  process.exit(ok ? 0 : 1);
})().catch((e) => { console.error(e); process.exit(1); });
