'use strict';
(function () {
  const socket = io();

  // 身份持久化（无需登录，仅用本地 id 维持重连）
  let myPlayerId = localStorage.getItem('mj_pid');
  if (!myPlayerId) { myPlayerId = 'p_' + Math.random().toString(36).slice(2) + Date.now().toString(36); localStorage.setItem('mj_pid', myPlayerId); }
  let myName = localStorage.getItem('mj_name') || '';

  let lastRoom = null;   // roomState
  let lastGame = null;   // gameState (per-seat view)
  let inRoom = false;

  const $ = (id) => document.getElementById(id);
  const screens = { login: $('login-screen'), lobby: $('lobby-screen'), table: $('table-screen') };
  function showScreen(name) {
    for (const k in screens) screens[k].classList.toggle('active', k === name);
  }

  // ===== 登录 =====
  $('name-input').value = myName;
  $('login-btn').addEventListener('click', doLogin);
  $('name-input').addEventListener('keydown', (e) => { if (e.key === 'Enter') doLogin(); });
  function doLogin() {
    const name = $('name-input').value.trim();
    if (!name) { toast('请输入昵称'); return; }
    if (window.SFX) SFX.init(); // 用户手势内激活音频
    myName = name; localStorage.setItem('mj_name', name);
    socket.emit('login', { playerId: myPlayerId, name });
  }
  socket.on('connect', () => { if (myName) socket.emit('login', { playerId: myPlayerId, name: myName }); });
  socket.on('loggedIn', (d) => {
    myName = d.name; $('lobby-name').textContent = d.name;
    if (!inRoom) { showScreen('lobby'); socket.emit('listRooms'); }
  });
  socket.on('errorMsg', (m) => toast(m));

  // ===== 大厅 =====
  $('create-room-btn').addEventListener('click', () => socket.emit('createRoom'));
  $('refresh-btn').addEventListener('click', () => socket.emit('listRooms'));
  socket.on('lobby', renderLobby);
  function renderLobby(d) {
    $('lobby-name').textContent = myName;
    const list = $('room-list'); list.innerHTML = '';
    if (!d.rooms.length) { list.innerHTML = '<div class="empty-hint">暂无房间，点击「创建房间」开一桌吧</div>'; return; }
    d.rooms.forEach((r) => {
      const card = document.createElement('div'); card.className = 'room-card';
      const names = r.names.filter(Boolean).join('、') || '空';
      card.innerHTML = `<div><div>房间 ${r.roomId}</div><div class="room-names">${names}</div></div>
        <div style="text-align:right"><div class="room-meta">${r.count}/4 ${r.inGame ? '· 游戏中' : ''}</div></div>`;
      const btn = document.createElement('button'); btn.className = 'btn btn-small btn-primary';
      btn.textContent = r.inGame ? '观战/重连' : (r.count >= 4 ? '已满' : '加入');
      btn.disabled = (r.count >= 4 && !r.inGame);
      btn.addEventListener('click', () => socket.emit('joinRoom', { roomId: r.roomId }));
      card.appendChild(btn); list.appendChild(card);
    });
  }

  // ===== 房间/牌桌 =====
  $('leave-btn').addEventListener('click', () => { socket.emit('leaveRoom'); inRoom = false; lastGame = null; lastRoom = null; showScreen('lobby'); socket.emit('listRooms'); });
  $('ready-btn').addEventListener('click', () => {
    const seat = mySeat(); if (seat < 0) return;
    const cur = lastRoom && lastRoom.seats[seat] ? lastRoom.seats[seat].ready : false;
    socket.emit('ready', { ready: !cur });
  });
  $('add-bot-btn').addEventListener('click', () => socket.emit('addBot'));
  $('sound-btn').addEventListener('click', () => {
    const on = !(window.SFX && SFX.isEnabled());
    if (window.SFX) SFX.setEnabled(on);
    $('sound-btn').textContent = on ? '🔊' : '🔇';
  });
  if (window.SFX) $('sound-btn').textContent = SFX.isEnabled() ? '🔊' : '🔇';

  let prevMyTurn = false, prevPhase = null;
  socket.on('roomUpdate', (rs) => {
    lastRoom = rs; inRoom = true; showScreen('table');
    renderTopbar();
    updateOverlays();
  });
  socket.on('gameState', (view) => {
    lastGame = view; inRoom = true; showScreen('table');
    renderBoard(view); renderTopbar(); updateOverlays();
    // 音效：轮到你 / 本局结束
    if (window.SFX) {
      const myTurn = view.phase === 'acting' && view.current === view.you && view.actions && view.actions.type === 'acting';
      if (myTurn && !prevMyTurn) SFX.turn();
      prevMyTurn = myTurn;
      if (view.phase === 'ended' && prevPhase !== 'ended') {
        const r = view.result || {};
        if (r.type === 'draw') { SFX.draws(); SFX.say('流局'); }
        else {
          const mine = r.winners && r.winners.some((w) => w.seat === view.you);
          if (mine) SFX.win(); else SFX.lose();
          SFX.say(r.type === 'zimo' ? '自摸' : (r.robKong ? '抢杠胡' : '胡'));
        }
      }
      prevPhase = view.phase;
    }
  });
  socket.on('leftRoom', () => { inRoom = false; lastGame = null; lastRoom = null; showScreen('lobby'); socket.emit('listRooms'); });

  function mySeat() {
    if (lastGame) return lastGame.you;
    if (lastRoom) { const i = lastRoom.seats.findIndex((s) => s.playerId === myPlayerId); return i; }
    return -1;
  }

  function renderTopbar() {
    const rid = lastRoom ? lastRoom.roomId : (lastGame ? '' : '');
    $('tb-room').textContent = '房间 ' + rid;
    if (lastGame) {
      $('tb-round').textContent = `${lastGame.quanfengName}圈 · 第${(lastRoom && lastRoom.handNo) || ''}局`;
      $('tb-wall').textContent = `余 ${lastGame.wallCount} 张`;
    } else {
      $('tb-round').textContent = '等待开局';
      $('tb-wall').textContent = '';
    }
  }

  // 浮层管理
  function updateOverlays() {
    const playing = lastGame && lastGame.phase !== 'ended' && lastGame.phase !== 'init';
    const ended = lastGame && lastGame.phase === 'ended';
    $('wait-overlay').classList.toggle('active', !playing && !ended);
    $('result-overlay').classList.toggle('active', !!ended);
    if (!playing && !ended) renderWait();
    if (ended) renderResult(lastGame);
  }

  function renderWait() {
    const box = $('wait-seats'); box.innerHTML = '';
    const seats = lastRoom ? lastRoom.seats : [];
    for (let i = 0; i < 4; i++) {
      const s = seats[i] || {};
      const div = document.createElement('div');
      div.className = 'wait-seat' + (s.ready ? ' ready' : '');
      if (s.name) {
        const tag = s.isBot ? ' 🤖' : (s.playerId === myPlayerId ? '（你）' : '');
        div.innerHTML = `<div class="ws-name">${s.name}${tag}</div><div class="ws-status">${s.ready ? '✅ 已准备' : '⏳ 未准备'}</div>`;
        if (s.isBot) {
          const rm = document.createElement('button'); rm.className = 'btn btn-small bot-remove'; rm.textContent = '移除';
          rm.addEventListener('click', () => socket.emit('removeBot', { seat: i }));
          div.appendChild(rm);
        }
      } else {
        div.innerHTML = `<div class="ws-name ws-empty">空座位</div><div class="ws-status ws-empty">等待加入</div>`;
      }
      box.appendChild(div);
    }
    const seat = mySeat();
    const ready = seat >= 0 && seats[seat] ? seats[seat].ready : false;
    const btn = $('ready-btn'); btn.textContent = ready ? '取消准备' : '准备';
    btn.disabled = seat < 0;
    const full = seats.filter((x) => x && x.name).length >= 4;
    $('add-bot-btn').disabled = full;
  }

  // ===== 牌桌渲染 =====
  const POS = ['bottom', 'right', 'top', 'left'];
  function renderBoard(view) {
    document.querySelectorAll('.seat-area').forEach((a) => (a.innerHTML = ''));
    view.players.forEach((p) => {
      const rel = (p.seat - view.you + 4) % 4;
      renderSeat(POS[rel], p, view);
    });
    renderCenter(view);
    renderActions(view);
  }

  function meldEl(m) {
    const wrap = document.createElement('div'); wrap.className = 'meld';
    m.tiles.forEach((t, idx) => {
      const back = m.concealed && (idx === 0 || idx === 3); // 暗杠两端盖牌
      wrap.appendChild(MJ.tileEl(t, { back }));
    });
    return wrap;
  }
  function meldsEl(melds) {
    const c = document.createElement('div'); c.className = 'melds';
    melds.forEach((m) => c.appendChild(meldEl(m)));
    return c;
  }
  function flowersEl(flowers) {
    const c = document.createElement('div'); c.className = 'flowers';
    flowers.forEach((t) => c.appendChild(MJ.tileEl(t)));
    return c;
  }
  function riverEl(p, view) {
    const c = document.createElement('div'); c.className = 'river h';
    p.river.forEach((t) => {
      const isLast = view.lastDiscard && view.lastDiscard.seat === p.seat && t === view.lastDiscard.tile;
      c.appendChild(MJ.tileEl(t, { cls: isLast ? 'last' : null }));
    });
    return c;
  }
  function backsEl(n) {
    const c = document.createElement('div'); c.className = 'hand-row';
    for (let i = 0; i < n; i++) c.appendChild(MJ.tileEl(0, { back: true }));
    return c;
  }
  function myHandEl(p, view) {
    const c = document.createElement('div'); c.className = 'my-hand';
    const canDiscard = view.actions && view.actions.type === 'acting' && view.actions.discard;
    const hand = p.hand.slice();
    let drawn = view.myDraw;
    let drawnIdx = -1;
    if (drawn != null) { drawnIdx = hand.indexOf(drawn); if (drawnIdx >= 0) hand.splice(drawnIdx, 1); }
    hand.forEach((t) => {
      c.appendChild(MJ.tileEl(t, { onClick: canDiscard ? () => sendAction({ type: 'discard', tile: t }) : null }));
    });
    if (drawnIdx >= 0) {
      c.appendChild(MJ.tileEl(drawn, { cls: 'just-drawn', onClick: canDiscard ? () => sendAction({ type: 'discard', tile: drawn }) : null }));
    }
    return c;
  }

  function pinfoEl(p) {
    const info = document.createElement('div');
    info.className = 'pinfo' + (p.isCurrent ? ' current' : '');
    if (p.isDealer) { const b = document.createElement('span'); b.className = 'dealer-badge'; b.textContent = '庄'; info.appendChild(b); }
    const w = document.createElement('span'); w.className = 'wind'; w.textContent = p.menfengName; info.appendChild(w);
    const nm = document.createElement('span'); nm.textContent = p.name + (p.seat === lastGame.you ? '（你）' : ''); info.appendChild(nm);
    const sc = document.createElement('span'); sc.className = 'score'; sc.textContent = (p.score >= 0 ? '+' : '') + p.score; info.appendChild(sc);
    return info;
  }

  function renderSeat(pos, p, view) {
    const area = document.querySelector('.seat-area.seat-' + pos);
    if (!area) return;
    const frag = document.createDocumentFragment();
    if (pos === 'bottom') {
      frag.appendChild(riverEl(p, view));
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '8px'; row.style.alignItems = 'center'; row.style.flexWrap = 'wrap'; row.style.justifyContent = 'center';
      row.appendChild(pinfoEl(p));
      if (p.flowers.length) row.appendChild(flowersEl(p.flowers));
      if (p.melds.length) row.appendChild(meldsEl(p.melds));
      frag.appendChild(row);
      frag.appendChild(myHandEl(p, view));
    } else if (pos === 'top') {
      frag.appendChild(pinfoEl(p));
      const row = document.createElement('div'); row.style.display = 'flex'; row.style.gap = '6px'; row.style.alignItems = 'center';
      if (p.melds.length) row.appendChild(meldsEl(p.melds));
      if (p.flowers.length) row.appendChild(flowersEl(p.flowers));
      frag.appendChild(row);
      frag.appendChild(backsEl(p.handCount));
      frag.appendChild(riverEl(p, view));
    } else {
      // left / right 紧凑竖排
      frag.appendChild(pinfoEl(p));
      frag.appendChild(backsEl(p.handCount));
      if (p.melds.length) frag.appendChild(meldsEl(p.melds));
      if (p.flowers.length) frag.appendChild(flowersEl(p.flowers));
      frag.appendChild(riverEl(p, view));
    }
    area.appendChild(frag);
  }

  function renderCenter(view) {
    const c = $('center'); c.innerHTML = '';
    const ri = document.createElement('div'); ri.className = 'round-info';
    const cur = view.players.find((p) => p.seat === view.current);
    ri.innerHTML = `<div class="big">${view.quanfengName}圈</div><div class="turn-arrow">轮到：${cur ? cur.name : ''}（${cur ? cur.menfengName : ''}）</div><div class="last-discard-label">余 ${view.wallCount} 张</div>`;
    c.appendChild(ri);
    if (view.lastDiscard) {
      const ld = document.createElement('div'); ld.style.display = 'flex'; ld.style.flexDirection = 'column'; ld.style.alignItems = 'center';
      const lbl = document.createElement('div'); lbl.className = 'last-discard-label'; lbl.textContent = '最近打出'; ld.appendChild(lbl);
      const big = MJ.tileEl(view.lastDiscard.tile); big.style.setProperty('--tw', '34px'); big.style.setProperty('--th', '48px'); ld.appendChild(big);
      c.appendChild(ld);
    }
  }

  function renderActions(view) {
    const bar = $('action-bar'); bar.innerHTML = '';
    const a = view.actions;
    if (!a || a.type === 'none') {
      if (view.phase === 'claiming') bar.innerHTML = '<span class="hint-text">等待其他玩家认领…</span>';
      else if (view.phase === 'acting') { const cur = view.players.find((p) => p.seat === view.current); bar.innerHTML = `<span class="hint-text">等待 ${cur ? cur.name : ''} 出牌…</span>`; }
      return;
    }
    if (a.type === 'acting') {
      if (a.zimo) addBtn(bar, '自摸', 'act-hu', () => sendAction({ type: 'zimo' }));
      (a.angang || []).forEach((t) => addBtn(bar, '暗杠' + MJ.tileText(t), 'act-gang', () => sendAction({ type: 'angang', tile: t })));
      (a.jiagang || []).forEach((t) => addBtn(bar, '加杠' + MJ.tileText(t), 'act-gang', () => sendAction({ type: 'jiagang', tile: t })));
      const hint = document.createElement('span'); hint.className = 'hint-text'; hint.textContent = '请点击手牌出牌'; bar.appendChild(hint);
    } else if (a.type === 'claiming') {
      if (a.hu) addBtn(bar, a.kind === 'jiagang' ? '抢杠和' : '和', 'act-hu', () => sendAction({ type: 'hu' }));
      if (a.gang) addBtn(bar, '杠', 'act-gang', () => sendAction({ type: 'gang' }));
      if (a.peng) addBtn(bar, '碰', 'act-peng', () => sendAction({ type: 'peng' }));
      if (a.chi) a.chi.forEach((opt) => addBtn(bar, '吃 ' + opt.map(MJ.tileText).join(''), 'act-chi', () => sendAction({ type: 'chi', tiles: opt })));
      addBtn(bar, '过', 'act-pass', () => sendAction({ type: 'pass' }));
    }
  }
  function addBtn(bar, text, cls, fn) {
    const b = document.createElement('button'); b.className = 'btn act-btn ' + cls; b.textContent = text; b.addEventListener('click', fn); bar.appendChild(b);
  }
  function sendAction(action) { socket.emit('action', action); }

  // ===== 结算 =====
  function renderResult(view) {
    const card = $('result-card'); card.innerHTML = '';
    const r = view.result || {};
    const title = document.createElement('div'); title.className = 'result-title';
    if (r.type === 'draw') title.textContent = '🀄 流局';
    else if (r.type === 'zimo') title.textContent = '🎉 自摸和牌';
    else title.textContent = r.robKong ? '🎉 抢杠和牌' : '🎉 点炮和牌';
    card.appendChild(title);

    if (r.winners) {
      r.winners.forEach((w) => {
        const pl = view.players.find((p) => p.seat === w.seat);
        const blk = document.createElement('div'); blk.className = 'winner-block';
        const head = document.createElement('div'); head.className = 'wb-head';
        head.innerHTML = `<span>${pl ? pl.name : '玩家'} ${w.winTile != null ? '和「' + MJ.tileText(w.winTile) + '」' : ''}</span><span>${w.score} 番</span>`;
        blk.appendChild(head);
        const fl = document.createElement('div'); fl.className = 'fan-list';
        (w.items || []).forEach((it) => {
          const tag = document.createElement('span'); tag.className = 'fan-tag';
          tag.textContent = it.name + (it.count > 1 ? '×' + it.count : '') + '(' + it.score + ')';
          fl.appendChild(tag);
        });
        blk.appendChild(fl);
        if (r.type === 'ron' && r.from != null) {
          const from = view.players.find((p) => p.seat === r.from);
          const d = document.createElement('div'); d.style.fontSize = '12px'; d.style.marginTop = '6px'; d.style.color = '#9fc1a0';
          d.textContent = '点炮：' + (from ? from.name : '');
          blk.appendChild(d);
        }
        card.appendChild(blk);
      });
    }
    // 分数变化
    if (r.delta) {
      const row = document.createElement('div'); row.className = 'score-row';
      view.players.forEach((p) => {
        const d = r.delta[p.seat] || 0;
        const sc = document.createElement('div'); sc.className = 'sc';
        sc.innerHTML = `<div>${p.name}</div><div class="${d >= 0 ? 'plus' : 'minus'}">${d >= 0 ? '+' : ''}${d}</div><div style="color:#9fc1a0">总 ${p.score}</div>`;
        row.appendChild(sc);
      });
      card.appendChild(row);
    }
    const seat = mySeat();
    const myReady = lastRoom && seat >= 0 && lastRoom.seats[seat] ? lastRoom.seats[seat].ready : false;
    const btn = document.createElement('button'); btn.className = 'btn btn-primary'; btn.style.marginTop = '8px';
    btn.textContent = myReady ? '等待其他玩家…' : '继续下一局'; btn.disabled = myReady;
    btn.addEventListener('click', () => socket.emit('ready', { ready: true }));
    card.appendChild(btn);
  }

  // ===== 事件提示 =====
  socket.on('event', (e) => {
    if (e.type === 'discard') { if (window.SFX) { SFX.discard(); SFX.say(MJ.tileSpeak(e.tile)); } }
    else if (e.type === 'draw') { if (window.SFX) SFX.draw(); }
    else if (e.type === 'peng') { flash('碰！'); if (window.SFX) { SFX.claim(); SFX.say('碰'); } }
    else if (e.type === 'chi') { flash('吃！'); if (window.SFX) { SFX.claim(); SFX.say('吃'); } }
    else if (e.type === 'gang') { flash(e.kind === 'angang' ? '暗杠！' : e.kind === 'jiagang' ? '加杠！' : '杠！'); if (window.SFX) { SFX.claim(); SFX.say(e.kind === 'angang' ? '暗杠' : '杠'); } }
    else if (e.type === 'flower') { flash('补花'); if (window.SFX) { SFX.flower(); SFX.say('补花'); } }
  });

  let toastTimer = null;
  function flash(text) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 900);
  }
  function toast(text) { flash(text); }

  // 自动登录（已有昵称时）
  if (myName) socket.emit('login', { playerId: myPlayerId, name: myName });
})();
