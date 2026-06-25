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
  let amSpectator = false;
  let resultHidden = false; // 结算面板是否被收起（露出牌桌看牌）
  let lastAdvice = null;    // 番型提示列表（对局中持续保留，出牌后不消失，结束才清空）
  let adviceHidden = localStorage.getItem('mj_advice_hidden') === '1';

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
  $('create-room-btn').addEventListener('click', () => $('create-modal').classList.add('active'));
  $('cfg-cancel').addEventListener('click', () => $('create-modal').classList.remove('active'));
  $('cfg-ok').addEventListener('click', () => {
    const turnTime = parseInt($('cfg-time').value, 10);
    const minFan = parseInt($('cfg-fan').value, 10);
    amSpectator = false;
    $('create-modal').classList.remove('active');
    socket.emit('createRoom', { turnTime, minFan });
  });
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
      btn.textContent = r.inGame ? '观战' : (r.count >= 4 ? '已满' : '加入');
      btn.disabled = (r.count >= 4 && !r.inGame);
      btn.addEventListener('click', () => {
        amSpectator = false;
        if (r.inGame) socket.emit('spectate', { roomId: r.roomId });
        else socket.emit('joinRoom', { roomId: r.roomId });
      });
      card.appendChild(btn); list.appendChild(card);
    });
  }

  // ===== 房间/牌桌 =====
  $('leave-btn').addEventListener('click', () => { socket.emit('leaveRoom'); inRoom = false; amSpectator = false; lastGame = null; lastRoom = null; showScreen('lobby'); socket.emit('listRooms'); });
  $('close-room-btn').addEventListener('click', () => {
    if (window.confirm('确定关闭房间并解散所有玩家吗？')) socket.emit('closeRoom');
  });
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
  // 番型提示开关
  $('advice-btn').addEventListener('click', () => {
    adviceHidden = !adviceHidden;
    localStorage.setItem('mj_advice_hidden', adviceHidden ? '1' : '0');
    $('advice-btn').classList.toggle('off', adviceHidden);
    if (lastGame && !amSpectator) renderBoard(lastGame);
  });
  $('advice-btn').classList.toggle('off', adviceHidden);
  socket.on('advice', (d) => {
    if (!lastGame || amSpectator || !d || d.seat !== lastGame.you) return;
    lastAdvice = d.list || [];
    if (!adviceHidden) renderBoard(lastGame);
  });

  let prevMyTurn = false, prevPhase = null;
  socket.on('spectating', () => { amSpectator = true; inRoom = true; lastGame = null; lastRoom = null; showScreen('table'); renderTopbar(); updateOverlays(); });
  socket.on('roomUpdate', (rs) => {
    lastRoom = rs; inRoom = true; showScreen('table');
    renderTopbar();
    updateOverlays();
  });
  socket.on('gameState', (view) => {
    amSpectator = !!view.spectator;
    lastGame = view; inRoom = true; showScreen('table');
    if (view.phase !== 'ended') resultHidden = false; // 新一局重置收起状态
    if (view.phase === 'ended') lastAdvice = null; // 仅本局结束才清空提示（出牌/他人操作时保留不消失）
    renderBoard(view); renderTopbar(); updateOverlays();
    // 音效：轮到你 / 本局结束
    if (window.SFX) {
      const myTurn = !amSpectator && view.phase === 'acting' && view.current === view.you && view.actions && view.actions.type === 'acting';
      if (myTurn && !prevMyTurn) SFX.turn();
      prevMyTurn = myTurn;
      if (view.phase === 'ended' && prevPhase !== 'ended') {
        const r = view.result || {};
        if (r.type === 'draw') { SFX.draws(); SFX.say('liuju'); }
        else {
          const mine = r.winners && r.winners.some((w) => w.seat === view.you);
          if (amSpectator || mine) SFX.win(); else SFX.lose();
          SFX.say(r.type === 'zimo' ? 'zimo' : (r.robKong ? 'qiangganghu' : 'hu'));
        }
      }
      prevPhase = view.phase;
    }
  });
  socket.on('leftRoom', () => { inRoom = false; amSpectator = false; lastGame = null; lastRoom = null; lastAdvice = null; lastAdviceSig = null; showScreen('lobby'); socket.emit('listRooms'); });
  socket.on('roomClosed', () => { inRoom = false; amSpectator = false; lastGame = null; lastRoom = null; lastAdvice = null; lastAdviceSig = null; showScreen('lobby'); socket.emit('listRooms'); toast('房间已关闭'); });

  function mySeat() {
    if (lastGame) return lastGame.you;
    if (lastRoom) { const i = lastRoom.seats.findIndex((s) => s.playerId === myPlayerId); return i; }
    return -1;
  }

  function renderTopbar() {
    const rid = lastRoom ? lastRoom.roomId : (lastGame ? '' : '');
    $('tb-room').textContent = '房间 ' + rid;
    const isOwner = !!(lastRoom && lastRoom.owner && lastRoom.owner === myPlayerId);
    $('close-room-btn').style.display = isOwner ? '' : 'none';
    const minFan = (lastGame && lastGame.minFan) || (lastRoom && lastRoom.minFan) || 8;
    if (lastGame) {
      $('tb-round').textContent = `${lastGame.quanfengName}圈·第${(lastRoom && lastRoom.handNo) || ''}局 · ${minFan}番起`;
      $('tb-wall').textContent = `余 ${lastGame.wallCount} 张`;
      const cur = lastGame.players.find((p) => p.seat === lastGame.current);
      if (lastGame.phase === 'ended') $('tb-turn').textContent = '本局结束';
      else if (lastGame.phase === 'claiming') $('tb-turn').textContent = '等待认领';
      else $('tb-turn').textContent = cur ? `轮到：${cur.name}（${cur.menfengName}）` : '';
    } else {
      $('tb-round').textContent = `等待开局 · ${minFan}番起`;
      $('tb-wall').textContent = '';
      $('tb-turn').textContent = '';
    }
  }

  // 浮层管理
  function updateOverlays() {
    const playing = lastGame && lastGame.phase !== 'ended' && lastGame.phase !== 'init';
    const ended = lastGame && lastGame.phase === 'ended';
    const showWait = !playing && !ended && !amSpectator; // 观战者不显示准备浮层
    $('wait-overlay').classList.toggle('active', showWait);
    $('result-overlay').classList.toggle('active', !!ended && !resultHidden);
    $('float-next').classList.toggle('show', !!ended && resultHidden && !amSpectator);
    if (showWait) renderWait();
    if (ended && !resultHidden) renderResult(lastGame);
    if (ended && resultHidden) updateFloatNext();
  }

  function updateFloatNext() {
    const seat = mySeat();
    const myReady = lastRoom && seat >= 0 && lastRoom.seats[seat] ? lastRoom.seats[seat].ready : false;
    const b = $('float-next');
    b.textContent = myReady ? '等待其他玩家…' : '继续下一局';
    b.disabled = myReady;
  }
  // 点击结算面板外的空白处 -> 收起，露出牌桌看全部手牌
  $('result-overlay').addEventListener('click', (e) => {
    if (e.target === $('result-overlay')) { resultHidden = true; updateOverlays(); }
  });
  $('float-next').addEventListener('click', () => { socket.emit('ready', { ready: true }); });

  function renderWait() {
    const box = $('wait-seats'); box.innerHTML = '';
    const seats = lastRoom ? lastRoom.seats : [];
    if (lastRoom) {
      const tt = (lastRoom.turnTime == null) ? 60000 : lastRoom.turnTime;
      const timeText = tt === 0 ? '出牌不限时' : `出牌 ${Math.round(tt / 1000)} 秒`;
      const h3 = document.querySelector('#wait-overlay h3');
      if (h3) h3.textContent = `等待开局 · ${timeText} · ${lastRoom.minFan || 8} 番起`;
    }
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
    renderCenter();
    renderActions(view);
  }

  function meldEl(m) {
    const wrap = document.createElement('div'); wrap.className = 'meld';
    m.tiles.forEach((t, idx) => {
      const back = !!m.concealed; // 暗杠全部盖牌，不显示牌面
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
  // 结束后亮出的别家手牌（正面，小尺寸）
  function openHandEl(tiles) {
    const c = document.createElement('div'); c.className = 'hand-row open';
    tiles.slice().sort((a, b) => a - b).forEach((t) => c.appendChild(MJ.tileEl(t)));
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
    const nm = document.createElement('span'); nm.textContent = p.name + (!amSpectator && p.seat === lastGame.you ? '（你）' : ''); info.appendChild(nm);
    const sc = document.createElement('span'); sc.className = 'score'; sc.textContent = (p.score >= 0 ? '+' : '') + p.score; info.appendChild(sc);
    if (p.flowers && p.flowers.length) { const fl = document.createElement('span'); fl.className = 'flower-count'; fl.textContent = '🌸' + p.flowers.length; info.appendChild(fl); }
    return info;
  }

  function hideAdvice() {
    adviceHidden = true;
    localStorage.setItem('mj_advice_hidden', '1');
    $('advice-btn').classList.add('off');
    if (lastGame && !amSpectator) renderBoard(lastGame);
  }
  function adviceEl(list) {
    const box = document.createElement('div'); box.className = 'advice';
    list.forEach((it) => {
      const row = document.createElement('div'); row.className = 'advice-row';
      const lab = document.createElement('span'); lab.className = 'advice-lab';
      lab.textContent = `${it.name} ${it.score}番·差${it.dist}`;
      row.appendChild(lab);
      const tw = document.createElement('span'); tw.className = 'advice-tiles';
      (it.tiles || []).slice(0, 8).forEach((t) => tw.appendChild(MJ.tileEl(t)));
      if ((it.tiles || []).length > 8) { const m = document.createElement('span'); m.className = 'advice-more'; m.textContent = '+' + (it.tiles.length - 8); tw.appendChild(m); }
      row.appendChild(tw);
      box.appendChild(row);
    });
    const hideBtn = document.createElement('button'); hideBtn.className = 'advice-hide'; hideBtn.textContent = '隐藏提示';
    hideBtn.addEventListener('click', hideAdvice);
    box.appendChild(hideBtn);
    return box;
  }
  function infoRowEl(p) {
    const row = document.createElement('div');
    row.className = 'info-row';
    if (!amSpectator && lastGame && p.seat === lastGame.you && !adviceHidden && lastAdvice && lastAdvice.length) {
      row.appendChild(adviceEl(lastAdvice)); // 番型提示放在名字左侧
    }
    row.appendChild(pinfoEl(p));
    if (p.melds.length) row.appendChild(meldsEl(p.melds)); // 副露放在名字右侧
    return row;
  }

  function renderSeat(pos, p, view) {
    const area = document.querySelector('.seat-area.seat-' + pos);
    if (!area) return;
    const frag = document.createDocumentFragment();
    if (pos === 'bottom') {
      frag.appendChild(riverEl(p, view));               // 我的牌河（靠中央）
      if (p.hand) frag.appendChild(myHandEl(p, view));  // 手牌
      else frag.appendChild(backsEl(p.handCount));      // 观战：暗牌
      frag.appendChild(infoRowEl(p));                   // 名字+副露（手牌下方）
    } else if (pos === 'top') {
      frag.appendChild(infoRowEl(p));                   // 名字+副露
      frag.appendChild(p.hand ? openHandEl(p.hand) : backsEl(p.handCount)); // 结束后亮牌
      frag.appendChild(riverEl(p, view));
    } else {
      frag.appendChild(infoRowEl(p));                   // 名字+副露
      frag.appendChild(p.hand ? openHandEl(p.hand) : backsEl(p.handCount)); // 结束后亮牌
      frag.appendChild(riverEl(p, view));
    }
    area.appendChild(frag);
  }

  function renderCenter() {
    $('center').innerHTML = ''; // 中央留空：信息移到顶栏，出牌直接进各家牌河
  }

  function renderActions(view) {
    const bar = $('action-bar'); bar.innerHTML = ''; bar.classList.remove('show');
    const hint = $('tb-hint');
    if (amSpectator) { hint.textContent = '👁 观战中'; return; }
    const a = view.actions;
    if (!a || a.type === 'none') { hint.textContent = ''; return; } // 等待时顶栏“轮到X”已说明
    if (a.type === 'acting') {
      hint.textContent = '该你出牌';
      if (a.zimo) addBtn(bar, '自摸', 'act-hu', () => sendAction({ type: 'zimo' }));
      (a.angang || []).forEach((t) => addBtn(bar, '暗杠' + MJ.tileText(t), 'act-gang', () => sendAction({ type: 'angang', tile: t })));
      (a.jiagang || []).forEach((t) => addBtn(bar, '加杠' + MJ.tileText(t), 'act-gang', () => sendAction({ type: 'jiagang', tile: t })));
      if (bar.childElementCount) {
        addBtn(bar, '取消', 'act-pass', () => bar.classList.remove('show')); // 不杠/不自摸，直接点手牌出牌
        bar.classList.add('show');
      }
    } else if (a.type === 'claiming') {
      hint.textContent = '请选择';
      if (a.hu) addBtn(bar, a.kind === 'jiagang' ? '抢杠和' : '和', 'act-hu', () => sendAction({ type: 'hu' }));
      if (a.gang) addBtn(bar, '杠', 'act-gang', () => sendAction({ type: 'gang' }));
      if (a.peng) addBtn(bar, '碰', 'act-peng', () => sendAction({ type: 'peng' }));
      if (a.chi) a.chi.forEach((opt) => addBtn(bar, '吃 ' + opt.map(MJ.tileText).join(''), 'act-chi', () => sendAction({ type: 'chi', tiles: opt })));
      addBtn(bar, '过', 'act-pass', () => sendAction({ type: 'pass' }));
      bar.classList.add('show');
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
    if (amSpectator) {
      const note = document.createElement('div'); note.style.marginTop = '8px'; note.style.color = '#9fc1a0'; note.textContent = '👁 观战中';
      card.appendChild(note);
      return;
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
    if (e.type === 'discard') { if (window.SFX) { SFX.discard(); SFX.sayTile(e.tile); } }
    else if (e.type === 'draw') { if (window.SFX) SFX.draw(); }
    else if (e.type === 'peng') { flash('碰！'); if (window.SFX) { SFX.claim(); SFX.say('peng'); } }
    else if (e.type === 'chi') { flash('吃！'); if (window.SFX) { SFX.claim(); SFX.say('chi'); } }
    else if (e.type === 'gang') { flash(e.kind === 'angang' ? '暗杠！' : e.kind === 'jiagang' ? '加杠！' : '杠！'); if (window.SFX) { SFX.claim(); SFX.say(e.kind === 'angang' ? 'angang' : 'gang'); } }
    else if (e.type === 'flower') { flash('补花'); if (window.SFX) { SFX.flower(); SFX.say('buhua'); } }
  });

  let toastTimer = null;
  function flash(text) {
    const t = $('toast'); t.textContent = text; t.classList.add('show');
    clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('show'), 900);
  }
  function toast(text) { flash(text); }

  // 牌面大小随屏幕尺寸自动缩放：手机保持 1，PC 等大屏按比例放大（取宽高较小者，避免溢出）
  function applyTileScale() {
    const w = window.innerWidth, h = window.innerHeight;
    const scale = Math.max(1, Math.min(w / 820, h / 400, 2.5));
    document.documentElement.style.setProperty('--ui-scale', scale.toFixed(3));
  }
  window.addEventListener('resize', applyTileScale);
  window.addEventListener('orientationchange', applyTileScale);
  applyTileScale();

  // 自动登录（已有昵称时）
  if (myName) socket.emit('login', { playerId: myPlayerId, name: myName });
})();
