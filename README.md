# 国标麻将 · 网页版

一个**无需登录**、输入昵称即可游玩的网页版**国标麻将（中国标准麻将 / MCR）**。支持手机**横屏**游玩，**8 番起胡**，4 人真人对战。

- 算番算法参考 [zheng-fan/GB-Mahjong](https://github.com/zheng-fan/GB-Mahjong)（C++，81 番），完整移植为 JavaScript，并用其 100+ 测试用例验证。
- 房间 / WebSocket / 服务器权威 架构参考 [whg333/majiang-1](https://github.com/whg333/majiang-1)。

## 特性

- 🀄 **完整国标算番**：81 个番种，DFS 牌型分解 + 并查集去重，严格遵循「不相同 / 不拆移 / 套算一次」原则。
- 🚪 **免登录**：输入昵称即可进大厅、建房 / 加入、开局。
- 📱 **手机横屏**：响应式布局，CSS 绘制麻将牌（万红 / 条绿 / 饼蓝 / 字牌 / 花牌）。
- ✅ **8 番起胡**：不含花牌的番数 ≥ 8 才能和牌（标准国标规则）。
- 🎴 **完整玩法**：发牌、补花、吃 / 碰 / 明杠 / 暗杠 / 加杠、抢杠和、自摸 / 点和、海底捞月 / 妙手回春 / 杠上开花、流局。
- 💰 **MCR 计分**：自摸每家付 (番+8)；点和点炮者付 (番+8)、其余两家各付底分 8。
- 🤝 **真人对战**：必须凑满 4 人且全部准备后开局；支持断线重连与超时自动代打。

## 运行

```bash
npm install
npm start
# 浏览器打开 http://localhost:3000
```

默认端口 `3000`，可用环境变量覆盖：`PORT=8080 npm start`。

手机访问：让手机与电脑在同一局域网，访问 `http://<电脑IP>:3000`，横屏即可。

## 怎么玩

1. 输入昵称 → 进入大厅。
2. 「创建房间」或在列表中「加入」一个房间。
3. 4 人到齐后各自点「准备」，自动开局。
4. 轮到你时点击手牌打出；可吃 / 碰 / 杠 / 和（满 8 番才出现「和」按钮）。
5. 一局结束显示番种与分数，点「继续」开下一局（庄家和或流局连庄，否则轮庄）。

## 测试

```bash
npm run test       # 算番引擎(198 用例) + 状态机蒙特卡洛
npm run test:fan   # 仅算番引擎单测（移植自 GB-Mahjong 的 100+ 用例）
npm run test:game  # 500 局随机对局：牌数守恒、分数守恒、和牌/流局
npm run test:e2e   # 4 个 socket 客户端端到端对局（需先 npm start）
```

## 项目结构

```
server.js                 Express + Socket.IO 入口
src/mahjong/              算番引擎（移植自 GB-Mahjong）
  tile.js                 牌编码、花色/点数、类别位图(BigInt)
  pack.js                 牌组(顺/刻/杠/将/组合龙)
  handtiles.js            手牌、字符串解析
  fan.js                  81 番算番器、和牌判断、听牌
src/game/
  rules.js                牌墙、门风/圈风、MCR 计分、算番桥接
  Game.js                 单局状态机（出牌/认领优先级/抢杠/结算）
  rooms.js                房间与房间管理、计时器
public/                   前端（横屏响应式，中文界面）
  index.html  css/style.css  js/tiles.js  js/app.js
test/                     fan / game / e2e 测试
```

## 规则要点

- **起胡**：除花牌外番种合计 ≥ 8 番方可和牌（花牌每张 1 番，计入得分但不计入 8 番门槛）。
- **认领优先级**：和 > 碰 / 杠 > 吃；支持一炮多响（多人同时点和）。
- **吃**仅限下家；**碰 / 杠**任意家；**加杠**可被其他家抢杠和。
- 圈风默认为东风圈。

## 协议（Socket.IO）

客户端→服务器：`login` `listRooms` `createRoom` `joinRoom` `leaveRoom` `ready` `action`
服务器→客户端：`loggedIn` `lobby` `roomUpdate` `gameState`(按座位脱敏) `event` `errorMsg`

`action` 类型：`discard` `chi` `peng` `gang` `angang` `jiagang` `hu` `zimo` `pass` `next`
