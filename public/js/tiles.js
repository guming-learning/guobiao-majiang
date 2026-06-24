'use strict';
// 客户端麻将牌渲染（与服务器 tile 编码一致：1-9万,10-18条,19-27饼,28-31东南西北,32-34中发白,35-42花）
(function () {
  const ZI = { 28: ['东', 'feng'], 29: ['南', 'feng'], 30: ['西', 'feng'], 31: ['北', 'feng'], 32: ['中', 'zhong'], 33: ['发', 'fa'], 34: ['白', 'bai'] };
  const HUA = { 35: '梅', 36: '兰', 37: '竹', 38: '菊', 39: '春', 40: '夏', 41: '秋', 42: '冬' };

  function tileInfo(id) {
    if (id >= 1 && id <= 9) return { rank: id, suit: '万', cls: 'wan' };
    if (id >= 10 && id <= 18) return { rank: id - 9, suit: '条', cls: 'tiao' };
    if (id >= 19 && id <= 27) return { rank: id - 18, suit: '饼', cls: 'bing' };
    if (ZI[id]) return { word: ZI[id][0], cls: ZI[id][1] };
    if (HUA[id]) return { word: HUA[id], cls: 'hua' };
    return { word: '?', cls: 'back' };
  }

  // 生成一张牌的 DOM 元素
  function tileEl(id, opts = {}) {
    const el = document.createElement('div');
    el.className = 'tile';
    if (opts.back) { el.classList.add('back'); return el; }
    const info = tileInfo(id);
    el.classList.add(info.cls);
    const img = document.createElement('img');
    img.className = 'face';
    img.src = 'tiles/' + id + '.png';
    img.alt = tileText(id);
    img.draggable = false;
    el.appendChild(img);
    if (opts.cls) el.classList.add(...[].concat(opts.cls));
    if (opts.onClick) { el.classList.add('selectable'); el.addEventListener('click', opts.onClick); }
    return el;
  }

  function tileText(id) {
    const info = tileInfo(id);
    return info.word !== undefined ? info.word : (info.rank + info.suit);
  }

  // 中文语音读法（用于报牌）
  const NUMC = ['', '一', '二', '三', '四', '五', '六', '七', '八', '九'];
  const ZI_SPEAK = { 28: '东风', 29: '南风', 30: '西风', 31: '北风', 32: '红中', 33: '发财', 34: '白板' };
  const HUA_SPEAK = { 35: '梅', 36: '兰', 37: '竹', 38: '菊', 39: '春', 40: '夏', 41: '秋', 42: '冬' };
  function tileSpeak(id) {
    if (id >= 1 && id <= 9) return NUMC[id] + '万';
    if (id >= 10 && id <= 18) return NUMC[id - 9] + '条';
    if (id >= 19 && id <= 27) return NUMC[id - 18] + '饼';
    if (ZI_SPEAK[id]) return ZI_SPEAK[id];
    if (HUA_SPEAK[id]) return HUA_SPEAK[id];
    return '';
  }

  window.MJ = { tileEl, tileText, tileInfo, tileSpeak };
})();
