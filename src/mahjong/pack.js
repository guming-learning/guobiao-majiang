'use strict';
// 移植自 GB-Mahjong/mahjong/pack.h + pack.cpp
const T = require('./tile');
const { Tile } = T;

// 牌组类型
const PACK_TYPE_INVALID = 0;  // 无效牌组
const PACK_TYPE_SHUNZI = 1;   // 顺子
const PACK_TYPE_KEZI = 2;     // 刻子
const PACK_TYPE_GANG = 3;     // 杠
const PACK_TYPE_JIANG = 4;    // 将
const PACK_TYPE_ZUHELONG = 5; // 组合龙

// 组合龙的六种组合形式（BigInt 位图）
const B = T.BITMAP;
const ZuhelongBitmap = [
  0n, // 用来标识没有组合龙
  B(T.TILE_1m) | B(T.TILE_4m) | B(T.TILE_7m) | B(T.TILE_2s) | B(T.TILE_5s) | B(T.TILE_8s) | B(T.TILE_3p) | B(T.TILE_6p) | B(T.TILE_9p), // 147m 258s 369p
  B(T.TILE_1m) | B(T.TILE_4m) | B(T.TILE_7m) | B(T.TILE_3s) | B(T.TILE_6s) | B(T.TILE_9s) | B(T.TILE_2p) | B(T.TILE_5p) | B(T.TILE_8p), // 147m 369s 258p
  B(T.TILE_2m) | B(T.TILE_5m) | B(T.TILE_8m) | B(T.TILE_1s) | B(T.TILE_4s) | B(T.TILE_7s) | B(T.TILE_3p) | B(T.TILE_6p) | B(T.TILE_9p), // 258m 147s 369p
  B(T.TILE_2m) | B(T.TILE_5m) | B(T.TILE_8m) | B(T.TILE_3s) | B(T.TILE_6s) | B(T.TILE_9s) | B(T.TILE_1p) | B(T.TILE_4p) | B(T.TILE_7p), // 258m 369s 147p
  B(T.TILE_3m) | B(T.TILE_6m) | B(T.TILE_9m) | B(T.TILE_1s) | B(T.TILE_4s) | B(T.TILE_7s) | B(T.TILE_2p) | B(T.TILE_5p) | B(T.TILE_8p), // 369m 147s 258p
  B(T.TILE_3m) | B(T.TILE_6m) | B(T.TILE_9m) | B(T.TILE_2s) | B(T.TILE_5s) | B(T.TILE_8s) | B(T.TILE_1p) | B(T.TILE_4p) | B(T.TILE_7p), // 369m 258s 147p
];

// 牌组类：顺子、刻子、杠、将以及特殊形式（组合龙）
class Pack {
  constructor(type = PACK_TYPE_INVALID, tile = new Tile(), zuhelong_type = 0, offer = 0) {
    this._type = type;
    this._tile = (tile instanceof Tile) ? tile : new Tile(tile);
    this._zuhelong_type = zuhelong_type;
    this._offer = offer;
  }
  clone() { return new Pack(this._type, this._tile.clone(), this._zuhelong_type, this._offer); }

  IsValid() { return this._type; }
  GetType() { return this._type; }
  GetMiddleTile() { return this._tile; }
  eq(p) { return this._type === p._type && this._tile.eq(p._tile); }

  GetAllTile() {
    const ret = [];
    switch (this.GetType()) {
      case PACK_TYPE_SHUNZI:
        ret.push(this._tile.Pred());
        ret.push(this._tile.clone());
        ret.push(this._tile.Succ());
        break;
      case PACK_TYPE_GANG:
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        break;
      case PACK_TYPE_KEZI:
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        break;
      case PACK_TYPE_JIANG:
        ret.push(this._tile.clone());
        ret.push(this._tile.clone());
        break;
      case PACK_TYPE_ZUHELONG:
        for (let i = T.TILE_1m; i <= T.TILE_9s; i++) {
          if (B(i) & this.GetZuhelongBitmap()) {
            ret.push(new Tile(i));
          }
        }
        break;
      default:
        break;
    }
    return ret;
  }
  GetZuhelongType() { return this._zuhelong_type; }
  GetZuhelongBitmap() { return ZuhelongBitmap[this._zuhelong_type]; }
  GetOffer() { return this._offer; }

  IsAnshou() { return this._offer === 0 || this._offer === -1; }
  HaveLastTile() { return this._offer < 0; }
  IsShunzi() { return this._type === PACK_TYPE_SHUNZI; }
  IsKezi() { return this._type === PACK_TYPE_KEZI; }
  IsGang() { return this._type === PACK_TYPE_GANG; }
  IsKeGang() { return this.IsKezi() || this.IsGang(); }
  IsJiang() { return this._type === PACK_TYPE_JIANG; }
  IsZuhelong() { return this._type === PACK_TYPE_ZUHELONG; }

  SetOffer(offer) { this._offer = offer; }
  SetType(type) { this._type = type; }
}

module.exports = {
  PACK_TYPE_INVALID, PACK_TYPE_SHUNZI, PACK_TYPE_KEZI, PACK_TYPE_GANG, PACK_TYPE_JIANG, PACK_TYPE_ZUHELONG,
  ZuhelongBitmap, Pack,
};
