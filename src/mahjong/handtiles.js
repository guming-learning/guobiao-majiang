'use strict';
// 移植自 GB-Mahjong/mahjong/handtiles.h + handtiles.cpp
const T = require('./tile');
const { Tile } = T;
const P = require('./pack');
const { Pack } = P;

// 门风圈风
const WIND_E = T.TILE_E, WIND_S = T.TILE_S, WIND_W = T.TILE_W, WIND_N = T.TILE_N;

// 牌 -> 数量 表（用对象模拟 C++ unordered_map<int,int>，默认 0）
function newTable() {
  const t = {};
  for (let i = 0; i <= T.TILE_MAJIANG; i++) t[i] = 0;
  return t;
}

// 字符 -> 牌基础编码
const MP = new Map([
  [T.TILE_CHAR_WAN, T.TILE_1m], [T.TILE_CHAR_TIAO, T.TILE_1s], [T.TILE_CHAR_BING, T.TILE_1p],
  [T.TILE_CHAR_E, T.TILE_E], [T.TILE_CHAR_S, T.TILE_S], [T.TILE_CHAR_W, T.TILE_W], [T.TILE_CHAR_N, T.TILE_N],
  [T.TILE_CHAR_C, T.TILE_C], [T.TILE_CHAR_F, T.TILE_F], [T.TILE_CHAR_P, T.TILE_P],
  [T.TILE_CHAR_MEI, T.TILE_MEI],
]);

const HANDTILES_RE = /^(\[([1-9]{3,4}[msp]|[ESWNCFP]{3,4})(,[123567])?\]|([ESWNCFPa-h]|[1-9]+[msp]))+(\|([ESWN]{2}[01]{4})(\|([a-h]{0,8}|[0-8]))?)?$/;

class Handtiles {
  constructor() {
    this.fulu = [];        // 副露（包括暗杠）—— Pack[]
    this.lipai = [];       // 立牌 —— Tile[]
    this.huapai = [];      // 花牌 —— Tile[]
    this.fulu_table = newTable();
    this.lipai_table = newTable();
    this.huapai_table = newTable();
    this._quanfeng = WIND_E;
    this._menfeng = WIND_E;
    this._zimo = 0;
    this._juezhang = 0;
    this._haidi = 0;
    this._gang = 0;
  }

  clone() {
    const h = new Handtiles();
    h.fulu = this.fulu.map((p) => p.clone());
    h.lipai = this.lipai.map((t) => t.clone());
    h.huapai = this.huapai.map((t) => t.clone());
    h.fulu_table = Object.assign({}, this.fulu_table);
    h.lipai_table = Object.assign({}, this.lipai_table);
    h.huapai_table = Object.assign({}, this.huapai_table);
    h._quanfeng = this._quanfeng;
    h._menfeng = this._menfeng;
    h._zimo = this._zimo;
    h._juezhang = this._juezhang;
    h._haidi = this._haidi;
    h._gang = this._gang;
    return h;
  }

  FuluBitmap() {
    let bitmap = 0n;
    for (const p of this.fulu) {
      const mt = p.GetMiddleTile();
      switch (p.GetType()) {
        case P.PACK_TYPE_SHUNZI:
          bitmap |= mt.GetBitmap() | mt.Pred().GetBitmap() | mt.Succ().GetBitmap();
          break;
        case P.PACK_TYPE_KEZI:
        case P.PACK_TYPE_GANG:
        case P.PACK_TYPE_JIANG:
          bitmap |= mt.GetBitmap();
          break;
        default:
          break;
      }
    }
    return bitmap;
  }

  LipaiBitmap() {
    let bitmap = 0n;
    for (const t of this.lipai) bitmap |= t.GetBitmap();
    return bitmap;
  }

  LipaiTileCount(tile) { return this.lipai_table[tile.GetId()] || 0; }
  FuluTileCount(tile) { return this.fulu_table[tile.GetId()] || 0; }
  HandTileCount(tile) { return this.LipaiTileCount(tile) + this.FuluTileCount(tile); }
  HuapaiCount() {
    let cnt = 0;
    for (let i = T.TILE_MEI; i <= T.TILE_DONG; i++) cnt += (this.huapai_table[i] || 0);
    return cnt;
  }

  GetQuanfeng() { return this._quanfeng; }
  GetMenfeng() { return this._menfeng; }
  IsZimo() { return this._zimo; }
  IsJuezhang() { return this._juezhang; }
  IsHaidi() { return this._haidi; }
  IsGang() { return this._gang; }
  SetQuanfeng(v) { this._quanfeng = v; }
  SetMenfeng(v) { this._menfeng = v; }
  SetZimo(v) { this._zimo = v; }
  SetJuezhang(v) { this._juezhang = v; }
  SetHaidi(v) { this._haidi = v; }
  SetGang(v) { this._gang = v; }

  IsMenqing() { return this.fulu.every((p) => p.IsAnshou()); }
  IsTotallyFulu() { return this.fulu.length === 4 && this.fulu.every((p) => !p.IsAnshou()); }
  NoFulu() { return this.fulu.length === 0; }

  LastLipai() { return this.lipai[this.lipai.length - 1]; }
  GetLastLipai() { return this.lipai[this.lipai.length - 1]; }
  SetLastLipai(t) {
    const tile = (t instanceof Tile) ? t.clone() : new Tile(t);
    this.lipai_table[this.LastLipai().GetId()]--;
    this.lipai[this.lipai.length - 1] = tile;
    this.lipai_table[tile.GetId()] = (this.lipai_table[tile.GetId()] || 0) + 1;
  }

  DrawTile(tile) { this.SetLastLipai(tile); this.LastLipai().SetZimo(); }   // 抓牌（自摸牌）
  SetTile(tile) { this.SetLastLipai(tile); this.LastLipai().SetChonghu(); } // 抓牌（铳和牌）
  DiscardTile() {
    const tile = new Tile(this.GetLastLipai().GetId());
    this.SetLastLipai(new Tile(T.TILE_INVALID));
    return tile;
  }

  SortLipaiWithoutLastOne() {
    const last = this.lipai.pop();
    this.lipai.sort((a, b) => a._tile - b._tile);
    this.lipai.push(last);
  }
  SortLipaiAll() { this.lipai.sort((a, b) => a._tile - b._tile); }

  _ClearAndSetDefault() {
    this.fulu = [];
    this.lipai = [];
    this.huapai = [];
    this.fulu_table = newTable();
    this.lipai_table = newTable();
    this.huapai_table = newTable();
    this.SetQuanfeng(WIND_E);
    this.SetMenfeng(WIND_E);
    this.SetZimo(0);
    this.SetJuezhang(0);
    this.SetHaidi(0);
    this.SetGang(0);
  }

  _GenerateTable() {
    for (const p of this.fulu) {
      for (const t of p.GetAllTile()) this.fulu_table[t.GetId()]++;
    }
    for (const t of this.lipai) this.lipai_table[t.GetId()]++;
    for (const t of this.huapai) this.huapai_table[t.GetId()]++;
    for (let i = T.TILE_1m; i < T.TILE_SIZE; i++) {
      if (this.fulu_table[i] + this.lipai_table[i] > 4) return -1;
    }
    for (let i = T.TILE_MEI; i <= T.TILE_DONG; i++) {
      if (this.lipai_table[i] + this.huapai_table[i] > 1) return -1;
    }
    return 0;
  }

  // 由字符串构造手牌，返回 0 表示成功，负数为错误码
  StringToHandtiles(s_ori) {
    const s = s_ori.replace(/ /g, '');
    if (!HANDTILES_RE.test(s)) return -1; // 字符串非法
    this._ClearAndSetDefault();

    let part = 0;          // 0:副露立牌 1:和牌情况 2:花牌
    let is_fulu = 0;
    let handle_offer = 0;
    let offer = 0;
    let nums = '';         // 暂存连续序数牌的序数
    let chars = '';        // 暂存字牌
    let char_suit = 0;
    const code = (ch) => ch.charCodeAt(0);

    for (let idx = 0; idx < s.length; idx++) {
      const c = s[idx];
      if (c === '[') {
        is_fulu = 1;
      } else if (c === ']') {
        let is_chars; // 0:nums 1:chars
        let tile_code;
        if (nums.length) {
          is_chars = 0;
          tile_code = MP.get(char_suit) - 1 + (code(nums[1]) - 48);
        } else {
          is_chars = 1;
          tile_code = MP.get(chars[1]);
        }
        const tiles = is_chars ? chars : nums;
        const p = new Pack(P.PACK_TYPE_INVALID, new Tile(tile_code));
        if (tiles.length === 3) {
          if (handle_offer === 0) offer = 1;
          if (offer > 3) return -2; // 三张一组不能是加杠
          const c0 = code(tiles[0]), c1 = code(tiles[1]), c2 = code(tiles[2]);
          if (!is_chars && c1 === c0 + 1 && c1 === c2 - 1) {
            p.SetType(P.PACK_TYPE_SHUNZI);
          } else if (c1 === c0 && c1 === c2) {
            p.SetType(P.PACK_TYPE_KEZI);
          } else {
            return -3;
          }
        } else if (tiles.length === 4) {
          if (handle_offer === 0) offer = 0;
          const c0 = code(tiles[0]), c1 = code(tiles[1]), c2 = code(tiles[2]), c3 = code(tiles[3]);
          if (c1 === c0 && c1 === c2 && c1 === c3) {
            p.SetType(P.PACK_TYPE_GANG);
          } else {
            return -4;
          }
        }
        p.SetOffer(offer);
        this.fulu.push(p);
        is_fulu = 0;
        handle_offer = 0;
        if (is_chars) chars = ''; else nums = '';
        char_suit = 0;
      } else if (c === ',') {
        handle_offer = 1;
      } else if (c >= '0' && c <= '9') {
        if (part === 0) {
          if (is_fulu) {
            if (!handle_offer) nums += c; else offer = code(c) - 48;
          } else {
            nums += c;
          }
        } else if (part === 1) {
          nums += c;
        } else if (part === 2) {
          const n = code(c) - 48;
          for (let i = 0; i < n; i++) this.huapai.push(new Tile(MP.get(T.TILE_CHAR_MEI) + i));
        }
      } else if (c === 'E' || c === 'S' || c === 'W' || c === 'N' || c === 'C' || c === 'F' || c === 'P') {
        if (part === 0) {
          if (is_fulu) { chars += c; char_suit = 'z'; }
          else this.lipai.push(new Tile(MP.get(c)));
        } else if (part === 1) {
          chars += c;
        }
      } else if (c === 'm' || c === 's' || c === 'p') {
        if (is_fulu) {
          char_suit = c;
        } else {
          for (let i = 0; i < nums.length; i++) this.lipai.push(new Tile(MP.get(c) - 1 + (code(nums[i]) - 48)));
          nums = '';
        }
      } else if (c === '|') {
        part++;
      } else if (c >= 'a' && c <= 'h') {
        if (part === 0) this.lipai.push(new Tile(MP.get(T.TILE_CHAR_MEI) + (code(c) - 97)));
        else if (part === 2) this.huapai.push(new Tile(MP.get(T.TILE_CHAR_MEI) + (code(c) - 97)));
      } else {
        return -999;
      }
    }

    if (part >= 1) {
      this.SetQuanfeng(MP.get(chars[0]));
      this.SetMenfeng(MP.get(chars[1]));
      this.SetZimo(code(nums[0]) - 48);
      this.SetJuezhang(code(nums[1]) - 48);
      this.SetHaidi(code(nums[2]) - 48);
      this.SetGang(code(nums[3]) - 48);
    }

    if (this.fulu.length * 3 + this.lipai.length === 13) {
      this.lipai.push(new Tile(T.TILE_INVALID)); // 13 张则加占位牌
    } else if (this.fulu.length * 3 + this.lipai.length !== 14) {
      return -5;
    }
    if (this._GenerateTable()) return -6;

    if (this.IsZimo()) this.LastLipai().SetZimo(); else this.LastLipai().SetChonghu();

    if (this.IsGang()) {
      if (this.IsZimo()) {
        if (!this.fulu.some((p) => p.IsGang())) return -7;
      } else {
        if (this.IsHaidi() || this.HandTileCount(this.GetLastLipai()) > 1) return -7;
      }
    }
    if (this.IsJuezhang()) {
      if (this.LipaiTileCount(this.GetLastLipai()) > 1) return -7;
    }
    this.SortLipaiWithoutLastOne();
    return 0;
  }

  // 由手牌构造字符串（主要用于测试与调试）
  HandtilesToString() {
    let ret = '';
    for (const p of this.fulu) {
      const MiddleTile = p.GetMiddleTile();
      const v = p.GetAllTile();
      ret += '[';
      for (const t of v) ret += t.TileChar();
      if (MiddleTile.IsShu()) ret += MiddleTile.SuitChar();
      if (p.GetOffer()) { ret += ','; ret += String(p.GetOffer()); }
      ret += ']';
    }
    let flag_first_numbered_tile = 1;
    for (let i = 0; i < this.lipai.length; i++) {
      if (!flag_first_numbered_tile) {
        if (i + 1 + this.fulu.length * 3 === 14 || !this.lipai[i].IsShu() || this.lipai[i].Suit() !== this.lipai[i - 1].Suit()) {
          ret += this.lipai[i - 1].SuitChar();
        }
      }
      flag_first_numbered_tile = this.lipai[i].IsShu() ? 0 : 1;
      ret += this.lipai[i].TileChar();
    }
    if (!flag_first_numbered_tile) ret += this.GetLastLipai().SuitChar();
    ret += '|';
    ret += new Tile(this.GetQuanfeng()).TileChar();
    ret += new Tile(this.GetMenfeng()).TileChar();
    ret += String(this.IsZimo());
    ret += String(this.IsJuezhang());
    ret += String(this.IsHaidi());
    ret += String(this.IsGang());
    ret += '|';
    for (const t of this.huapai) ret += t.TileChar();
    return ret;
  }
}

module.exports = { WIND_E, WIND_S, WIND_W, WIND_N, Handtiles };
