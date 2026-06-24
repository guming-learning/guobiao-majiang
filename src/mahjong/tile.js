'use strict';
// 移植自 GB-Mahjong/mahjong/tile.h + tile.cpp
// 注意：C++ 用 long long(64位) 位图，JS 位运算只有 32 位，故位图一律用 BigInt。

// ===== 牌的编码 =====
const TILE_INVALID = 0;
const TILE_1m = 1, TILE_2m = 2, TILE_3m = 3, TILE_4m = 4, TILE_5m = 5, TILE_6m = 6, TILE_7m = 7, TILE_8m = 8, TILE_9m = 9;
const TILE_1s = 10, TILE_2s = 11, TILE_3s = 12, TILE_4s = 13, TILE_5s = 14, TILE_6s = 15, TILE_7s = 16, TILE_8s = 17, TILE_9s = 18;
const TILE_1p = 19, TILE_2p = 20, TILE_3p = 21, TILE_4p = 22, TILE_5p = 23, TILE_6p = 24, TILE_7p = 25, TILE_8p = 26, TILE_9p = 27;
const TILE_E = 28, TILE_S = 29, TILE_W = 30, TILE_N = 31;       // 东南西北
const TILE_C = 32, TILE_F = 33, TILE_P = 34;                     // 中发白
const TILE_MEI = 35, TILE_LAN = 36, TILE_ZHU = 37, TILE_JU = 38; // 梅兰竹菊
const TILE_CHU = 39, TILE_XIA = 40, TILE_QIU = 41, TILE_DONG = 42; // 春夏秋冬
const TILE_BAIDA = 43, TILE_MAJIANG = 44;
const TILE_SIZE = 43; // 总有效张数（右开区间，1..42）

// ===== 花色 =====
const SUIT_INVALID = 0, SUIT_WAN = 1, SUIT_TIAO = 2, SUIT_BING = 3, SUIT_HUA = 4, SUIT_FENG = 5, SUIT_JIAN = 6;

// ===== 点数 =====
const RANK_INVALID = 0;
const RANK_1 = 1, RANK_2 = 2, RANK_3 = 3, RANK_4 = 4, RANK_5 = 5, RANK_6 = 6, RANK_7 = 7, RANK_8 = 8, RANK_9 = 9;

// ===== 字符 =====
const TILE_CHAR_INVALID = ' ';
const TILE_CHAR_WAN = 'm', TILE_CHAR_TIAO = 's', TILE_CHAR_BING = 'p';
const TILE_CHAR_E = 'E', TILE_CHAR_S = 'S', TILE_CHAR_W = 'W', TILE_CHAR_N = 'N';
const TILE_CHAR_C = 'C', TILE_CHAR_F = 'F', TILE_CHAR_P = 'P';
const TILE_CHAR_MEI = 'a', TILE_CHAR_LAN = 'b', TILE_CHAR_ZHU = 'c', TILE_CHAR_JU = 'd';
const TILE_CHAR_CHU = 'e', TILE_CHAR_XIA = 'f', TILE_CHAR_QIU = 'g', TILE_CHAR_DONG = 'h';

// ===== 位图（BigInt） =====
const BITMAP = (t) => 1n << BigInt(t);

const TILE_TYPE_BITMAP_WAN = BITMAP(TILE_1m) | BITMAP(TILE_2m) | BITMAP(TILE_3m) | BITMAP(TILE_4m) | BITMAP(TILE_5m) | BITMAP(TILE_6m) | BITMAP(TILE_7m) | BITMAP(TILE_8m) | BITMAP(TILE_9m);
const TILE_TYPE_BITMAP_TIAO = BITMAP(TILE_1s) | BITMAP(TILE_2s) | BITMAP(TILE_3s) | BITMAP(TILE_4s) | BITMAP(TILE_5s) | BITMAP(TILE_6s) | BITMAP(TILE_7s) | BITMAP(TILE_8s) | BITMAP(TILE_9s);
const TILE_TYPE_BITMAP_BING = BITMAP(TILE_1p) | BITMAP(TILE_2p) | BITMAP(TILE_3p) | BITMAP(TILE_4p) | BITMAP(TILE_5p) | BITMAP(TILE_6p) | BITMAP(TILE_7p) | BITMAP(TILE_8p) | BITMAP(TILE_9p);
const TILE_TYPE_BITMAP_SHU = TILE_TYPE_BITMAP_WAN | TILE_TYPE_BITMAP_TIAO | TILE_TYPE_BITMAP_BING;
const TILE_TYPE_BITMAP_FENG = BITMAP(TILE_E) | BITMAP(TILE_S) | BITMAP(TILE_W) | BITMAP(TILE_N);
const TILE_TYPE_BITMAP_JIAN = BITMAP(TILE_C) | BITMAP(TILE_F) | BITMAP(TILE_P);
const TILE_TYPE_BITMAP_ZI = TILE_TYPE_BITMAP_FENG | TILE_TYPE_BITMAP_JIAN;
const TILE_TYPE_BITMAP_MEANINGFUL = TILE_TYPE_BITMAP_SHU | TILE_TYPE_BITMAP_ZI;
const TILE_TYPE_BITMAP_YAOJIU = TILE_TYPE_BITMAP_ZI | BITMAP(TILE_1m) | BITMAP(TILE_9m) | BITMAP(TILE_1s) | BITMAP(TILE_9s) | BITMAP(TILE_1p) | BITMAP(TILE_9p);
const TILE_TYPE_BITMAP_LV = BITMAP(TILE_2s) | BITMAP(TILE_3s) | BITMAP(TILE_4s) | BITMAP(TILE_6s) | BITMAP(TILE_8s) | BITMAP(TILE_F);
const TILE_TYPE_BITMAP_QUANDA = BITMAP(TILE_7m) | BITMAP(TILE_8m) | BITMAP(TILE_9m) | BITMAP(TILE_7s) | BITMAP(TILE_8s) | BITMAP(TILE_9s) | BITMAP(TILE_7p) | BITMAP(TILE_8p) | BITMAP(TILE_9p);
const TILE_TYPE_BITMAP_QUANZHONG = BITMAP(TILE_4m) | BITMAP(TILE_5m) | BITMAP(TILE_6m) | BITMAP(TILE_4s) | BITMAP(TILE_5s) | BITMAP(TILE_6s) | BITMAP(TILE_4p) | BITMAP(TILE_5p) | BITMAP(TILE_6p);
const TILE_TYPE_BITMAP_QUANXIAO = BITMAP(TILE_1m) | BITMAP(TILE_2m) | BITMAP(TILE_3m) | BITMAP(TILE_1s) | BITMAP(TILE_2s) | BITMAP(TILE_3s) | BITMAP(TILE_1p) | BITMAP(TILE_2p) | BITMAP(TILE_3p);
const TILE_TYPE_BITMAP_DAYUWU = TILE_TYPE_BITMAP_QUANDA | BITMAP(TILE_6m) | BITMAP(TILE_6s) | BITMAP(TILE_6p);
const TILE_TYPE_BITMAP_XIAOYUWU = TILE_TYPE_BITMAP_QUANXIAO | BITMAP(TILE_4m) | BITMAP(TILE_4s) | BITMAP(TILE_4p);
const TILE_TYPE_BITMAP_TUIBUDAO = BITMAP(TILE_2s) | BITMAP(TILE_4s) | BITMAP(TILE_5s) | BITMAP(TILE_6s) | BITMAP(TILE_8s) | BITMAP(TILE_9s) | BITMAP(TILE_1p) | BITMAP(TILE_2p) | BITMAP(TILE_3p) | BITMAP(TILE_4p) | BITMAP(TILE_5p) | BITMAP(TILE_8p) | BITMAP(TILE_9p) | BITMAP(TILE_P);

// ===== 牌 -> emoji / 花色 / 点数 / 字符 =====
const TILES_UTF8 = [
  "",
  "🀇", "🀈", "🀉", "🀊", "🀋", "🀌", "🀍", "🀎", "🀏",
  "🀐", "🀑", "🀒", "🀓", "🀔", "🀕", "🀖", "🀗", "🀘",
  "🀙", "🀚", "🀛", "🀜", "🀝", "🀞", "🀟", "🀠", "🀡",
  "🀀", "🀁", "🀂", "🀃",
  "🀄", "🀅", "🀆",
  "🀢", "🀣", "🀤", "🀥", "🀦", "🀧", "🀨", "🀩",
  "🀪", "🀫"];

const TILES_SUIT = [
  SUIT_INVALID,
  SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN, SUIT_WAN,
  SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO, SUIT_TIAO,
  SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING, SUIT_BING,
  SUIT_FENG, SUIT_FENG, SUIT_FENG, SUIT_FENG,
  SUIT_JIAN, SUIT_JIAN, SUIT_JIAN,
  SUIT_HUA, SUIT_HUA, SUIT_HUA, SUIT_HUA, SUIT_HUA, SUIT_HUA, SUIT_HUA, SUIT_HUA,
  SUIT_INVALID, SUIT_INVALID];

const TILES_RANK = [
  RANK_INVALID,
  RANK_1, RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8, RANK_9,
  RANK_1, RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8, RANK_9,
  RANK_1, RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8, RANK_9,
  RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID,
  RANK_INVALID, RANK_INVALID, RANK_INVALID,
  RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID, RANK_INVALID,
  RANK_INVALID, RANK_INVALID];

const TILES_SUIT_CHAR = [
  TILE_CHAR_INVALID,
  TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN, TILE_CHAR_WAN,
  TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO, TILE_CHAR_TIAO,
  TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING, TILE_CHAR_BING,
  TILE_CHAR_E, TILE_CHAR_S, TILE_CHAR_W, TILE_CHAR_N,
  TILE_CHAR_C, TILE_CHAR_F, TILE_CHAR_P,
  TILE_CHAR_MEI, TILE_CHAR_LAN, TILE_CHAR_ZHU, TILE_CHAR_JU, TILE_CHAR_CHU, TILE_CHAR_XIA, TILE_CHAR_QIU, TILE_CHAR_DONG,
  TILE_CHAR_INVALID, TILE_CHAR_INVALID];

// ===== 牌类 =====
// drawflag: 1=自摸牌, 2=铳和牌(仅用于暗刻判定), 0=正常抓上来的牌（仅算番时标记）
class Tile {
  constructor(t = TILE_INVALID, drawflag = 0) {
    this._tile = (t instanceof Tile) ? t._tile : t;
    this._drawflag = (t instanceof Tile) ? t._drawflag : drawflag;
  }
  clone() { return new Tile(this._tile, this._drawflag); }

  // 兼容 C++ 的 operator==（可与 Tile 或 number 比较）
  eq(other) {
    if (other instanceof Tile) return this._tile === other._tile;
    return this._tile === other;
  }

  Pred() { return new Tile(this._tile - 1); }
  Succ() { return new Tile(this._tile + 1); }
  GetTileUsingOffset(offset) { return new Tile(this._tile + offset); }

  Suit() { return TILES_SUIT[this._tile]; }
  Rank() { return TILES_RANK[this._tile]; }

  IsShu() { return (this.GetBitmap() & TILE_TYPE_BITMAP_SHU) === this.GetBitmap(); }
  IsZi() { return (this.GetBitmap() & TILE_TYPE_BITMAP_ZI) === this.GetBitmap(); }
  IsFeng() { return (this.GetBitmap() & TILE_TYPE_BITMAP_FENG) === this.GetBitmap(); }
  IsJian() { return (this.GetBitmap() & TILE_TYPE_BITMAP_JIAN) === this.GetBitmap(); }
  IsYaojiu() { return (this.GetBitmap() & TILE_TYPE_BITMAP_YAOJIU) === this.GetBitmap(); }
  IsHua() { return this.Suit() === SUIT_HUA; }

  UTF8() { return TILES_UTF8[this._tile]; }
  RankChar() { return String.fromCharCode(48 + this.Rank()); }
  SuitChar() { return TILES_SUIT_CHAR[this._tile]; }
  TileChar() { return this.IsShu() ? this.RankChar() : this.SuitChar(); }

  SetZimo() { this._drawflag = 1; }
  SetChonghu() { this._drawflag = 2; }
  ResetDrawflag() { this._drawflag = 0; }
  IsZimo() { return this._drawflag === 1; }
  IsChonghu() { return this._drawflag === 2; }

  GetId() { return this._tile; }
  GetBitmap() { return 1n << BigInt(this._tile); }
  GetDrawflag() { return this._drawflag; }
}

module.exports = {
  TILE_INVALID, TILE_1m, TILE_2m, TILE_3m, TILE_4m, TILE_5m, TILE_6m, TILE_7m, TILE_8m, TILE_9m,
  TILE_1s, TILE_2s, TILE_3s, TILE_4s, TILE_5s, TILE_6s, TILE_7s, TILE_8s, TILE_9s,
  TILE_1p, TILE_2p, TILE_3p, TILE_4p, TILE_5p, TILE_6p, TILE_7p, TILE_8p, TILE_9p,
  TILE_E, TILE_S, TILE_W, TILE_N, TILE_C, TILE_F, TILE_P,
  TILE_MEI, TILE_LAN, TILE_ZHU, TILE_JU, TILE_CHU, TILE_XIA, TILE_QIU, TILE_DONG,
  TILE_BAIDA, TILE_MAJIANG, TILE_SIZE,
  SUIT_INVALID, SUIT_WAN, SUIT_TIAO, SUIT_BING, SUIT_HUA, SUIT_FENG, SUIT_JIAN,
  RANK_INVALID, RANK_1, RANK_2, RANK_3, RANK_4, RANK_5, RANK_6, RANK_7, RANK_8, RANK_9,
  TILE_CHAR_WAN, TILE_CHAR_TIAO, TILE_CHAR_BING, TILE_CHAR_E, TILE_CHAR_S, TILE_CHAR_W, TILE_CHAR_N,
  TILE_CHAR_C, TILE_CHAR_F, TILE_CHAR_P, TILE_CHAR_MEI, TILE_CHAR_LAN, TILE_CHAR_ZHU, TILE_CHAR_JU,
  TILE_CHAR_CHU, TILE_CHAR_XIA, TILE_CHAR_QIU, TILE_CHAR_DONG,
  BITMAP,
  TILE_TYPE_BITMAP_WAN, TILE_TYPE_BITMAP_TIAO, TILE_TYPE_BITMAP_BING, TILE_TYPE_BITMAP_SHU,
  TILE_TYPE_BITMAP_FENG, TILE_TYPE_BITMAP_JIAN, TILE_TYPE_BITMAP_ZI, TILE_TYPE_BITMAP_MEANINGFUL,
  TILE_TYPE_BITMAP_YAOJIU, TILE_TYPE_BITMAP_LV, TILE_TYPE_BITMAP_QUANDA, TILE_TYPE_BITMAP_QUANZHONG,
  TILE_TYPE_BITMAP_QUANXIAO, TILE_TYPE_BITMAP_DAYUWU, TILE_TYPE_BITMAP_XIAOYUWU, TILE_TYPE_BITMAP_TUIBUDAO,
  TILES_UTF8, TILES_SUIT, TILES_RANK, TILES_SUIT_CHAR,
  Tile,
};
