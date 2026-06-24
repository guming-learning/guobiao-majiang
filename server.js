'use strict';
const path = require('path');
const http = require('http');
const express = require('express');
const { Server } = require('socket.io');
const { RoomManager } = require('./src/game/rooms');

const app = express();
const server = http.createServer(app);
const io = new Server(server, { cors: { origin: '*' } });

app.use(express.static(path.join(__dirname, 'public')));
app.get('/health', (req, res) => res.json({ ok: true }));

const manager = new RoomManager(io);

io.on('connection', (socket) => {
  socket.on('login', (d) => { try { manager.login(socket, (d && d.playerId) || socket.id, d && d.name); } catch (e) { socket.emit('errorMsg', '登录失败'); } });
  socket.on('listRooms', () => socket.emit('lobby', manager.lobbyState()));
  socket.on('createRoom', () => manager.createRoom(socket));
  socket.on('joinRoom', (d) => manager.joinRoom(socket, d && d.roomId));
  socket.on('leaveRoom', () => manager.leaveRoom(socket, false));
  socket.on('ready', (d) => manager.setReady(socket, d && d.ready));
  socket.on('addBot', () => manager.addBot(socket));
  socket.on('removeBot', (d) => manager.removeBot(socket, d && d.seat));
  socket.on('action', (d) => manager.action(socket, d || {}));
  socket.on('disconnect', () => manager.disconnect(socket));
});

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`国标麻将服务器已启动: http://localhost:${PORT}`);
});
