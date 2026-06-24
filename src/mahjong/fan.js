'use strict';
// 移植自 GB-Mahjong/mahjong/fan.h + fan.cpp —— 国标麻将算番器（81 番）
const T = require('./tile');
const { Tile } = T;
const P = require('./pack');
const { Pack, ZuhelongBitmap } = P;
const { Handtiles } = require('./handtiles');

// ===== 番种编号（与 C++ enum 顺序严格一致）=====
const FAN_INVALID = 0;
// 88
const FAN_DASIXI = 1, FAN_DASANYUAN = 2, FAN_LVYISE = 3, FAN_JIULIANBAODENG = 4, FAN_SIGANG = 5, FAN_LIANQIDUI = 6, FAN_SHISANYAO = 7;
// 64
const FAN_QINGYAOJIU = 8, FAN_XIAOSIXI = 9, FAN_XIAOSANYUAN = 10, FAN_ZIYISE = 11, FAN_SIANKE = 12, FAN_YISESHUANGLONGHUI = 13;
// 48
const FAN_YISESITONGSHUN = 14, FAN_YISESIJIEGAO = 15;
// 32
const FAN_YISESIBUGAO = 16, FAN_SANGANG = 17, FAN_HUNYAOJIU = 18;
// 24
const FAN_QIDUI = 19, FAN_QIXINGBUKAO = 20, FAN_QUANSHUANGKE = 21, FAN_QINGYISE = 22, FAN_YISESANTONGSHUN = 23, FAN_YISESANJIEGAO = 24, FAN_QUANDA = 25, FAN_QUANZHONG = 26, FAN_QUANXIAO = 27;
// 16
const FAN_QINGLONG = 28, FAN_SANSESHUANGLONGHUI = 29, FAN_YISESANBUGAO = 30, FAN_QUANDAIWU = 31, FAN_SANTONGKE = 32, FAN_SANANKE = 33;
// 12
const FAN_QUANBUKAO = 34, FAN_ZUHELONG = 35, FAN_DAYUWU = 36, FAN_XIAOYUWU = 37, FAN_SANFENGKE = 38;
// 8
const FAN_HUALONG = 39, FAN_TUIBUDAO = 40, FAN_SANSESANTONGSHUN = 41, FAN_SANSESANJIEGAO = 42, FAN_WUFANHU = 43, FAN_MIAOSHOUHUICHUN = 44, FAN_HAIDILAOYUE = 45, FAN_GANGSHANGKAIHUA = 46, FAN_QIANGGANGHU = 47;
// 6
const FAN_PENGPENGHU = 48, FAN_HUNYISE = 49, FAN_SANSESANBUGAO = 50, FAN_WUMENQI = 51, FAN_QUANQIUREN = 52, FAN_SHUANGANGANG = 53, FAN_SHUANGJIANKE = 54;
// 4
const FAN_QUANDAIYAO = 55, FAN_BUQIUREN = 56, FAN_SHUANGMINGGANG = 57, FAN_HUJUEZHANG = 58;
// 2
const FAN_JIANKE = 59, FAN_QUANFENGKE = 60, FAN_MENFENGKE = 61, FAN_MENQIANQING = 62, FAN_PINGHU = 63, FAN_SIGUIYI = 64, FAN_SHUANGTONGKE = 65, FAN_SHUANGANKE = 66, FAN_ANGANG = 67, FAN_DUANYAO = 68;
// 1
const FAN_YIBANGAO = 69, FAN_XIXIANGFENG = 70, FAN_LIANLIU = 71, FAN_LAOSHAOFU = 72, FAN_YAOJIUKE = 73, FAN_MINGGANG = 74, FAN_QUEYIMEN = 75, FAN_WUZI = 76, FAN_BIANZHANG = 77, FAN_KANZHANG = 78, FAN_DANDIAOJIANG = 79, FAN_ZIMO = 80, FAN_HUAPAI = 81;
// 5
const FAN_MINGANGANG = 82;
const FAN_SIZE = 83;

const FAN_SCORE = [
  0,
  88, 88, 88, 88, 88, 88, 88,
  64, 64, 64, 64, 64, 64,
  48, 48,
  32, 32, 32,
  24, 24, 24, 24, 24, 24, 24, 24, 24,
  16, 16, 16, 16, 16, 16,
  12, 12, 12, 12, 12,
  8, 8, 8, 8, 8, 8, 8, 8, 8,
  6, 6, 6, 6, 6, 6, 6,
  4, 4, 4, 4,
  2, 2, 2, 2, 2, 2, 2, 2, 2, 2,
  1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1, 1,
  5];

const FAN_NAME = [
  "无效番种",
  "大四喜", "大三元", "绿一色", "九莲宝灯", "四杠", "连七对", "十三幺",
  "清幺九", "小四喜", "小三元", "字一色", "四暗刻", "一色双龙会",
  "一色四同顺", "一色四节高",
  "一色四步高", "三杠", "混幺九",
  "七对", "七星不靠", "全双刻", "清一色", "一色三同顺", "一色三节高", "全大", "全中", "全小",
  "清龙", "三色双龙会", "一色三步高", "全带五", "三同刻", "三暗刻",
  "全不靠", "组合龙", "大于五", "小于五", "三风刻",
  "花龙", "推不倒", "三色三同顺", "三色三节高", "无番和", "妙手回春", "海底捞月", "杠上开花", "抢杠和",
  "碰碰和", "混一色", "三色三步高", "五门齐", "全求人", "双暗杠", "双箭刻",
  "全带幺", "不求人", "双明杠", "和绝张",
  "箭刻", "圈风刻", "门风刻", "门前清", "平和", "四归一", "双同刻", "双暗刻", "暗杠", "断幺",
  "一般高", "喜相逢", "连六", "老少副", "幺九刻", "明杠", "缺一门", "无字", "边张", "坎张", "单钓将", "自摸", "花牌",
  "明暗杠"];

// 工具函数
function arraysEqual(a, b) {
  if (a.length !== b.length) return false;
  for (let i = 0; i < a.length; i++) if (a[i] !== b[i]) return false;
  return true;
}
function findIndexPack(packs, pred) {
  for (let i = 0; i < packs.length; i++) if (pred(packs[i])) return i;
  return packs.length;
}

class Fan {
  constructor() {
    this.fan_table = new Array(FAN_SIZE);
    this.excluded_fan_table = new Array(FAN_SIZE);
    this.fan_table_res = new Array(FAN_SIZE);
    for (let i = 0; i < FAN_SIZE; i++) {
      this.fan_table[i] = [];
      this.excluded_fan_table[i] = [];
      this.fan_table_res[i] = [];
    }
    this.fan_packs = [];
    this.tot_fan = 0;
    this.fan_packs_res = [];
    this.tot_fan_res = 0;
    this._cf_ting = []; // 缓存当前 CountFan 的听牌结果（用于边张/坎张/单钓）
  }

  // ===== 和牌判断 =====
  JudgeHu(ht) {
    return !!(this._JudgeCompleteSpecialHu(ht) || this._JudgeQidui(ht) || this._JudgeBasicHu(ht) || this._JudgeZuhelongBasicHu(ht));
  }
  JudgeHuTile(ht, t) {
    ht.SetTile(t);
    const ret = this.JudgeHu(ht);
    ht.SetTile(new Tile(T.TILE_INVALID));
    return ret;
  }
  CalcTing(const_ht, include_exhausted_tile = false) {
    const ht = const_ht.clone();
    const ting = [];
    for (let i = 1; i < T.TILE_SIZE; i++) {
      ht.SetTile(new Tile(i));
      if (this.JudgeHu(ht) && (include_exhausted_tile || ht.HandTileCount(new Tile(i)) !== 5)) {
        ting.push(new Tile(i));
      }
    }
    ht.SetTile(new Tile(T.TILE_INVALID));
    return ting;
  }

  // ===== 内部表操作 =====
  _AddFan(f, v) { this.fan_table[f].push(v); }
  _ExcludeFan(f, v) { this.excluded_fan_table[f].push(v); }
  _HasFan(f) { return this.fan_table[f].length > 0; }
  _HasExcludedFan(f) { return this.excluded_fan_table[f].length > 0; }

  _GetMaxFan() {
    this._FanTableExclude();
    this._FanTableCount();
    if (this.tot_fan > this.tot_fan_res) {
      this.tot_fan_res = this.tot_fan;
      for (let i = 1; i < FAN_SIZE; i++) this.fan_table_res[i] = this.fan_table[i].slice();
      this.fan_packs_res = this.fan_packs.slice();
    }
    this._ClearTable();
  }
  _FanTableExclude() {
    for (let i = 1; i < FAN_SIZE; i++) {
      if (this.fan_table[i].length && this.excluded_fan_table[i].length) {
        const v = [];
        const vis = new Array(this.excluded_fan_table[i].length).fill(0);
        const res = new Array(this.fan_table[i].length).fill(0);
        for (let j = 0; j < this.excluded_fan_table[i].length; j++) {
          if (!vis[j]) {
            for (let k = 0; k < this.fan_table[i].length; k++) {
              if (!res[k] && arraysEqual(this.fan_table[i][k], this.excluded_fan_table[i][j])) { res[k] = 1; break; }
            }
            vis[j] = 1;
          }
        }
        for (let k = 0; k < this.fan_table[i].length; k++) if (res[k] === 0) v.push(this.fan_table[i][k]);
        this.fan_table[i] = v;
      }
    }
  }
  _FanTableCount() {
    let cnt = 0;
    for (let i = 1; i < FAN_SIZE; i++) cnt += this.fan_table[i].length * FAN_SCORE[i];
    if (cnt === 0) { this._AddFan(FAN_WUFANHU, []); cnt = FAN_SCORE[FAN_WUFANHU]; }
    this.tot_fan = cnt;
  }
  _ClearTable() {
    for (let i = 1; i < FAN_SIZE; i++) { this.fan_table[i] = []; this.excluded_fan_table[i] = []; }
  }
  _ClearResult() { this.tot_fan_res = 0; }
  _Clear() { this._ClearTable(); this._ClearResult(); }

  // ===== 算番入口 =====
  CountFan(ht) {
    this._Clear();
    // 重置最高番结果，便于 Fan 实例复用
    for (let i = 1; i < FAN_SIZE; i++) this.fan_table_res[i] = [];
    this.fan_packs_res = [];
    this.fan_packs = [];

    // 计算并缓存听牌（基本和型用），仅依赖固定的前 13 张
    this._cf_ting = this.CalcTing(ht, true);

    let f = this._JudgeCompleteSpecialHu(ht);
    let flag_quanbukao = 0;
    if (f) { // 十三幺、全不靠、七星不靠
      flag_quanbukao = 1;
      this._AddFan(f, []);
      this._CountWinModeFan(ht, [], new Pack(), []);
      const zuhelong_type = this._JudgeZuhelong(ht.LipaiBitmap());
      if (zuhelong_type) {
        this.fan_packs.push(new Pack(P.PACK_TYPE_ZUHELONG, new Tile(), zuhelong_type));
        this._AddFan(FAN_ZUHELONG, [0]);
      }
      this._ExcludeFan(FAN_BUQIUREN, []);
      this._ExcludeFan(FAN_MENQIANQING, []);
      if (ht.IsZimo()) {
        this.fan_table[FAN_ZIMO] = [];
        this.excluded_fan_table[FAN_ZIMO] = [];
        this.fan_table[FAN_ZIMO].push([]);
      }
      this._GetMaxFan();
    }
    f = this._JudgeQidui(ht);
    if (f) { // 七对、连七对
      this._AddFan(f, []);
      this._CountOverallAttrFan(ht, [], new Pack());
      this._CountWinModeFan(ht, [], new Pack(), []);
      this._ExcludeFan(FAN_BUQIUREN, []);
      this._ExcludeFan(FAN_MENQIANQING, []);
      if (f === FAN_LIANQIDUI) {
        this._ExcludeFan(FAN_QINGYISE, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      if (ht.IsZimo()) {
        this.fan_table[FAN_ZIMO] = [];
        this.excluded_fan_table[FAN_ZIMO] = [];
        this.fan_table[FAN_ZIMO].push([]);
      }
      this._GetMaxFan();
    }

    let sorted_lipai = [];
    const zuhelong_type = this._JudgeZuhelong(ht.LipaiBitmap());
    const zuhelong_bitmap = ZuhelongBitmap[zuhelong_type];
    if (zuhelong_bitmap) {
      let bitmap_temp = zuhelong_bitmap;
      for (let i = 0; i < ht.lipai.length; i++) {
        if (ht.lipai[i].GetBitmap() & bitmap_temp) {
          bitmap_temp ^= ht.lipai[i].GetBitmap();
        } else {
          sorted_lipai.push(ht.lipai[i]);
        }
      }
    } else {
      sorted_lipai = ht.lipai.slice();
    }
    sorted_lipai.sort((a, b) => a._tile - b._tile);
    let packs = ht.fulu.slice();
    if (zuhelong_bitmap && !flag_quanbukao) {
      this._Dfs(ht, sorted_lipai, 1 - ht.fulu.length, 1, packs, 1, new Pack(P.PACK_TYPE_ZUHELONG, new Tile(), zuhelong_type));
      if (this.tot_fan_res === FAN_SCORE[FAN_WUFANHU] && this.fan_table_res[FAN_WUFANHU].length === 1) {
        this.fan_table_res[FAN_WUFANHU] = [];
        this.tot_fan_res = 0;
      }
      this.fan_packs_res.push(new Pack(P.PACK_TYPE_ZUHELONG, new Tile(), zuhelong_type));
      this.fan_table_res[FAN_ZUHELONG].push([this.fan_packs_res.length - 1]);
      this.tot_fan_res += FAN_SCORE[FAN_ZUHELONG];
    } else {
      this._Dfs(ht, sorted_lipai, 4 - ht.fulu.length, 1, packs, 1);
    }
    // 花牌
    const cnt_hua = ht.HuapaiCount();
    for (let i = 0; i < cnt_hua; i++) this.fan_table_res[FAN_HUAPAI].push([]);
    this.tot_fan_res += cnt_hua;
  }

  _ExcludeYaojiuke(packs) {
    for (let i = 0; i < packs.length; i++) {
      const rank = packs[i].GetMiddleTile().Rank();
      const is_zi = packs[i].GetMiddleTile().IsZi();
      if (packs[i].IsKeGang() && (rank === T.RANK_1 || rank === T.RANK_9 || is_zi)) {
        this._ExcludeFan(FAN_YAOJIUKE, [i]);
      }
    }
  }

  _CountOverallAttrFan(ht, packs, zuhelong_pack) {
    const bitmap = (ht.LipaiBitmap() | ht.FuluBitmap());
    if (zuhelong_pack.GetZuhelongType() === 0) {
      // 绿一色
      if ((bitmap & T.TILE_TYPE_BITMAP_LV) === bitmap) {
        this._AddFan(FAN_LVYISE, []);
        this._ExcludeFan(FAN_HUNYISE, []);
      }
      // 九莲宝灯
      if (ht.NoFulu()) {
        const tile_table = Object.assign({}, ht.lipai_table);
        tile_table[ht.GetLastLipai().GetId()]--;
        const st = tile_table[T.TILE_1m] ? T.TILE_1m : (tile_table[T.TILE_1s] ? T.TILE_1s : T.TILE_1p);
        let flag = 1;
        for (let i = 2; i <= 8; i++) {
          if (tile_table[st - 1 + i] !== 1) { flag = 0; break; }
        }
        if (tile_table[st] !== 3 || tile_table[st + 8] !== 3) flag = 0;
        tile_table[ht.GetLastLipai().GetId()]++;
        if (flag) {
          this._AddFan(FAN_JIULIANBAODENG, []);
          this._ExcludeFan(FAN_QINGYISE, []);
          this._ExcludeFan(FAN_BUQIUREN, []);
          this._ExcludeFan(FAN_MENQIANQING, []);
          this._ExcludeFan(FAN_WUZI, []);
          this._ExcludeFan(FAN_YAOJIUKE, [findIndexPack(packs, (p) => p.IsKezi() && p.GetMiddleTile().IsYaojiu())]);
        }
      }
      // 清幺九
      if ((bitmap & (T.TILE_TYPE_BITMAP_YAOJIU & (~T.TILE_TYPE_BITMAP_ZI))) === bitmap) {
        this._AddFan(FAN_QINGYAOJIU, []);
        this._ExcludeFan(FAN_PENGPENGHU, []);
        this._ExcludeFan(FAN_QUANDAIYAO, []);
        this._ExcludeFan(FAN_WUZI, []);
        for (let i = 0; i < packs.length; i++) {
          for (let j = i + 1; j < packs.length; j++) {
            if (packs[i].IsKeGang() && packs[j].IsKeGang() && packs[i].GetMiddleTile().Rank() === packs[j].GetMiddleTile().Rank()) {
              this._ExcludeFan(FAN_SHUANGTONGKE, [i, j]);
            }
          }
        }
        this._ExcludeYaojiuke(packs);
      }
      // 字一色
      if ((bitmap & T.TILE_TYPE_BITMAP_ZI) === bitmap) {
        this._AddFan(FAN_ZIYISE, []);
        this._ExcludeFan(FAN_PENGPENGHU, []);
        this._ExcludeFan(FAN_QUANDAIYAO, []);
        this._ExcludeYaojiuke(packs);
      }
      // 混幺九
      if ((bitmap & T.TILE_TYPE_BITMAP_YAOJIU & (~T.TILE_TYPE_BITMAP_ZI)) && (bitmap & T.TILE_TYPE_BITMAP_ZI) && (bitmap & T.TILE_TYPE_BITMAP_YAOJIU) === bitmap) {
        this._AddFan(FAN_HUNYAOJIU, []);
        this._ExcludeFan(FAN_PENGPENGHU, []);
        this._ExcludeFan(FAN_QUANDAIYAO, []);
        this._ExcludeYaojiuke(packs);
      }
      // 全双刻
      if (packs.length === 5) {
        let flag = 1;
        for (const p of packs) {
          if (!((p.IsKeGang() || p.IsJiang()) && p.GetMiddleTile().IsShu() && p.GetMiddleTile().Rank() % 2 === 0)) { flag = 0; break; }
        }
        if (flag) {
          this._AddFan(FAN_QUANSHUANGKE, []);
          this._ExcludeFan(FAN_PENGPENGHU, []);
          this._ExcludeFan(FAN_DUANYAO, []);
          this._ExcludeFan(FAN_WUZI, []);
        }
      }
      // 清一色
      if ((bitmap & T.TILE_TYPE_BITMAP_WAN) === bitmap || (bitmap & T.TILE_TYPE_BITMAP_TIAO) === bitmap || (bitmap & T.TILE_TYPE_BITMAP_BING) === bitmap) {
        this._AddFan(FAN_QINGYISE, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 全大
      if ((bitmap & T.TILE_TYPE_BITMAP_QUANDA) === bitmap) {
        this._AddFan(FAN_QUANDA, []);
        this._ExcludeFan(FAN_DAYUWU, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 全中
      if ((bitmap & T.TILE_TYPE_BITMAP_QUANZHONG) === bitmap) {
        this._AddFan(FAN_QUANZHONG, []);
        this._ExcludeFan(FAN_DUANYAO, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 全小
      if ((bitmap & T.TILE_TYPE_BITMAP_QUANXIAO) === bitmap) {
        this._AddFan(FAN_QUANXIAO, []);
        this._ExcludeFan(FAN_XIAOYUWU, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 全带五
      if (packs.length === 5) {
        let flag = 1;
        for (const p of packs) {
          const rank = p.GetMiddleTile().Rank();
          if (!((p.IsShunzi() && (T.RANK_4 <= rank && rank <= T.RANK_6)) || ((p.IsKeGang() || p.IsJiang()) && rank === T.RANK_5))) { flag = 0; break; }
        }
        if (flag) {
          this._AddFan(FAN_QUANDAIWU, []);
          this._ExcludeFan(FAN_DUANYAO, []);
          this._ExcludeFan(FAN_WUZI, []);
        }
      }
      // 大于五
      if ((bitmap & T.TILE_TYPE_BITMAP_DAYUWU) === bitmap) {
        this._AddFan(FAN_DAYUWU, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 小于五
      if ((bitmap & T.TILE_TYPE_BITMAP_XIAOYUWU) === bitmap) {
        this._AddFan(FAN_XIAOYUWU, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 推不倒
      if ((bitmap & T.TILE_TYPE_BITMAP_TUIBUDAO) === bitmap) {
        this._AddFan(FAN_TUIBUDAO, []);
        this._ExcludeFan(FAN_QUEYIMEN, []);
      }
      // 碰碰和
      if (packs.length === 5 && packs.every((p) => p.IsKeGang() || p.IsJiang())) {
        this._AddFan(FAN_PENGPENGHU, []);
      }
      // 混一色
      {
        const bitmap_nozi = (bitmap & (~T.TILE_TYPE_BITMAP_ZI));
        if ((bitmap & T.TILE_TYPE_BITMAP_ZI) && (bitmap & T.TILE_TYPE_BITMAP_SHU) && ((bitmap_nozi & T.TILE_TYPE_BITMAP_WAN) === bitmap_nozi || (bitmap_nozi & T.TILE_TYPE_BITMAP_TIAO) === bitmap_nozi || (bitmap_nozi & T.TILE_TYPE_BITMAP_BING) === bitmap_nozi)) {
          this._AddFan(FAN_HUNYISE, []);
        }
      }
      // 全带幺
      if (packs.length === 5) {
        let flag = 1;
        for (const p of packs) {
          const rank = p.GetMiddleTile().Rank();
          const is_yaojiu = p.GetMiddleTile().IsYaojiu();
          if (!((p.IsShunzi() && (rank === T.RANK_2 || rank === T.RANK_8)) || ((p.IsKeGang() || p.IsJiang()) && is_yaojiu))) { flag = 0; break; }
        }
        if (flag) this._AddFan(FAN_QUANDAIYAO, []);
      }
      // 断幺
      if ((bitmap & (~T.TILE_TYPE_BITMAP_YAOJIU)) === bitmap) {
        this._AddFan(FAN_DUANYAO, []);
        this._ExcludeFan(FAN_WUZI, []);
      }
      // 缺一门
      if (((bitmap & T.TILE_TYPE_BITMAP_WAN) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_TIAO) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_BING) !== 0n ? 1 : 0) === 2) {
        this._AddFan(FAN_QUEYIMEN, []);
      }
    }
    // 组合龙也可计的整体属性类
    // 五门齐
    if (((bitmap & T.TILE_TYPE_BITMAP_WAN) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_TIAO) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_BING) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_FENG) !== 0n ? 1 : 0) + ((bitmap & T.TILE_TYPE_BITMAP_JIAN) !== 0n ? 1 : 0) === 5) {
      this._AddFan(FAN_WUMENQI, []);
    }
    // 平和
    if (packs.length !== 7 && packs.length && packs.every((p) => p.IsShunzi() || (p.IsJiang() && p.GetMiddleTile().IsShu()))) {
      this._AddFan(FAN_PINGHU, []);
      this._ExcludeFan(FAN_WUZI, []);
    }
    // 四归一
    for (let i = T.TILE_1m; i < T.TILE_SIZE; i++) {
      let flag = 0;
      for (const p of packs) {
        if (p.IsGang() && p.GetMiddleTile().eq(i)) { flag = 1; break; }
      }
      if (flag) continue;
      if (ht.HandTileCount(new Tile(i)) === 4) this._AddFan(FAN_SIGUIYI, []);
    }
    // 无字
    if ((bitmap & (~T.TILE_TYPE_BITMAP_ZI)) === bitmap) this._AddFan(FAN_WUZI, []);
  }

  _CountKeGangFan(ht, packs) {
    const angang = [], minggang = [], anke = [];
    for (let i = 0; i < packs.length; i++) {
      if (packs[i].IsGang()) {
        if (packs[i].IsAnshou()) angang.push(i); else minggang.push(i);
      } else if (packs[i].IsKezi() && packs[i].IsAnshou()) {
        anke.push(i);
      }
    }
    switch (angang.length * 100 + minggang.length * 10 + anke.length) {
      case 400:
        this._AddFan(FAN_SIGANG, angang); this._AddFan(FAN_SIANKE, angang); break;
      case 310:
        this._AddFan(FAN_SIGANG, [angang[0], angang[1], angang[2], minggang[0]]); this._AddFan(FAN_SANANKE, angang); break;
      case 220:
        this._AddFan(FAN_SIGANG, [angang[0], angang[1], minggang[0], minggang[1]]); this._AddFan(FAN_SHUANGANKE, angang); break;
      case 130:
        this._AddFan(FAN_SIGANG, [angang[0], minggang[0], minggang[1], minggang[2]]); break;
      case 301:
        this._AddFan(FAN_SANGANG, angang); this._AddFan(FAN_SIANKE, [angang[0], angang[1], angang[2], anke[0]]); break;
      case 300:
        this._AddFan(FAN_SANGANG, angang); this._AddFan(FAN_SANANKE, angang); break;
      case 211:
        this._AddFan(FAN_SANGANG, [angang[0], angang[1], minggang[0]]); this._AddFan(FAN_SANANKE, [angang[0], angang[1], anke[0]]); break;
      case 210:
        this._AddFan(FAN_SANGANG, [angang[0], angang[1], minggang[0]]); this._AddFan(FAN_SHUANGANKE, [angang[0], angang[1]]); break;
      case 121:
        this._AddFan(FAN_SANGANG, [angang[0], minggang[0], minggang[1]]); this._AddFan(FAN_SHUANGANKE, [angang[0], anke[0]]); break;
      case 120:
        this._AddFan(FAN_SANGANG, [angang[0], minggang[0], minggang[1]]); break;
      case 202:
        this._AddFan(FAN_SHUANGANGANG, angang); this._AddFan(FAN_SIANKE, [angang[0], angang[1], anke[0], anke[1]]); break;
      case 201:
        this._AddFan(FAN_SHUANGANGANG, angang); this._AddFan(FAN_SANANKE, [angang[0], angang[1], anke[0]]); break;
      case 112:
        this._AddFan(FAN_MINGANGANG, [angang[0], minggang[0]]); this._AddFan(FAN_SANANKE, [angang[0], anke[0], anke[1]]); break;
      case 111:
        this._AddFan(FAN_MINGANGANG, [angang[0], minggang[0]]); this._AddFan(FAN_SHUANGANKE, [angang[0], anke[0]]); break;
      case 22:
        this._AddFan(FAN_SHUANGMINGGANG, minggang); this._AddFan(FAN_SHUANGANKE, anke); break;
      case 103:
        this._AddFan(FAN_ANGANG, angang); this._AddFan(FAN_SIANKE, [angang[0], anke[0], anke[1], anke[2]]); break;
      case 102:
        this._AddFan(FAN_ANGANG, angang); this._AddFan(FAN_SANANKE, [angang[0], anke[0], anke[1]]); break;
      case 101:
        this._AddFan(FAN_ANGANG, angang); this._AddFan(FAN_SHUANGANKE, [angang[0], anke[0]]); break;
      case 13:
        this._AddFan(FAN_MINGGANG, minggang); this._AddFan(FAN_SANANKE, anke); break;
      case 12:
        this._AddFan(FAN_MINGGANG, minggang); this._AddFan(FAN_SHUANGANKE, anke); break;
      default: {
        const cnt_angang = angang.length, cnt_minggang = minggang.length, cnt_anke = anke.length;
        if (cnt_minggang === 4) this._AddFan(FAN_SIGANG, minggang);
        else if (cnt_anke === 4) this._AddFan(FAN_SIANKE, anke);
        else if (cnt_minggang === 3) this._AddFan(FAN_SANGANG, minggang);
        else if (cnt_anke === 3) this._AddFan(FAN_SANANKE, anke);
        else if (cnt_angang === 2) this._AddFan(FAN_SHUANGANGANG, angang);
        else if (cnt_minggang === 2) this._AddFan(FAN_SHUANGMINGGANG, minggang);
        else if (cnt_anke === 2) this._AddFan(FAN_SHUANGANKE, anke);
        else if (cnt_minggang === 1 && cnt_angang === 1) this._AddFan(FAN_MINGANGANG, [angang[0], minggang[0]]);
        else if (cnt_angang === 1) this._AddFan(FAN_ANGANG, angang);
        else if (cnt_minggang === 1) this._AddFan(FAN_MINGGANG, minggang);
        break;
      }
    }
    if (this._HasFan(FAN_SIGANG)) {
      this._ExcludeFan(FAN_PENGPENGHU, []);
      for (let i = 0; i < packs.length; i++) {
        if (packs[i].IsJiang()) { this._ExcludeFan(FAN_DANDIAOJIANG, [i]); break; }
      }
    }
    if (this._HasFan(FAN_SHUANGANGANG)) {
      this._ExcludeFan(FAN_SHUANGANKE, this.fan_table[FAN_SHUANGANGANG][0]);
    }
    if (this._HasFan(FAN_SIANKE)) {
      this._ExcludeFan(FAN_PENGPENGHU, []);
      this._ExcludeFan(FAN_BUQIUREN, []);
      this._ExcludeFan(FAN_MENQIANQING, []);
    }
  }

  _CountAssociatedCombinationFan(ht, packs) {
    const e = []; // [ [fan, v], ... ]
    const _StoreFan = (f, v) => e.push([f, v]);
    const shunzi_id = [], kegang_id = [], jiang_id = [];
    for (let i = 0; i < packs.length; i++) {
      if (packs[i].IsShunzi()) shunzi_id.push(i);
      else if (packs[i].IsKeGang()) kegang_id.push(i);
      else if (packs[i].IsJiang()) jiang_id.push(i);
    }
    // 大四喜、小四喜、三风刻
    {
      const feng_kegang = [], feng_jiang = [];
      for (let i = 0; i < packs.length; i++) {
        if (packs[i].GetMiddleTile().IsFeng()) {
          if (packs[i].IsKeGang()) feng_kegang.push(i); else feng_jiang.push(i);
        }
      }
      if (feng_kegang.length === 4) _StoreFan(FAN_DASIXI, feng_kegang);
      if (feng_kegang.length === 3 && feng_jiang.length === 1) _StoreFan(FAN_XIAOSIXI, [feng_kegang[0], feng_kegang[1], feng_kegang[2], feng_jiang[0]]);
      if (feng_kegang.length === 3) _StoreFan(FAN_SANFENGKE, [feng_kegang[0], feng_kegang[1], feng_kegang[2]]);
    }
    // 大三元、小三元、双箭刻
    {
      const jian_kegang = [], jian_jiang = [];
      for (let i = 0; i < packs.length; i++) {
        if (packs[i].GetMiddleTile().IsJian()) {
          if (packs[i].IsKeGang()) jian_kegang.push(i); else jian_jiang.push(i);
        }
      }
      if (jian_kegang.length === 3) _StoreFan(FAN_DASANYUAN, jian_kegang);
      if (jian_kegang.length === 2 && jian_jiang.length === 1) _StoreFan(FAN_XIAOSANYUAN, [jian_kegang[0], jian_kegang[1], jian_jiang[0]]);
      if (jian_kegang.length === 2) _StoreFan(FAN_SHUANGJIANKE, [jian_kegang[0], jian_kegang[1]]);
    }
    // 一色双龙会、三色双龙会
    {
      const shunzi_123 = [], shunzi_789 = [];
      for (let i = 0; i < shunzi_id.length; i++) {
        const rank = packs[shunzi_id[i]].GetMiddleTile().Rank();
        if (rank === T.RANK_2) shunzi_123.push(shunzi_id[i]);
        else if (rank === T.RANK_8) shunzi_789.push(shunzi_id[i]);
      }
      if (shunzi_123.length === 2 && shunzi_789.length === 2 && packs[jiang_id[0]].GetMiddleTile().Rank() === 5) {
        const s1231 = packs[shunzi_123[0]].GetMiddleTile().Suit();
        const s1232 = packs[shunzi_123[1]].GetMiddleTile().Suit();
        const s7891 = packs[shunzi_789[0]].GetMiddleTile().Suit();
        const s7892 = packs[shunzi_789[1]].GetMiddleTile().Suit();
        const sjiang = packs[jiang_id[0]].GetMiddleTile().Suit();
        if (s1231 === s1232 && s1231 === s7891 && s1231 === s7892 && s1231 === sjiang) {
          _StoreFan(FAN_YISESHUANGLONGHUI, [shunzi_123[0], shunzi_123[1], shunzi_789[0], shunzi_789[1], jiang_id[0]]);
        } else if (((s1231 === s7891 && s1232 === s7892) || (s1231 === s7892 && s1232 === s7891)) && s1231 !== s1232 && s1231 !== sjiang && s1232 !== sjiang) {
          _StoreFan(FAN_SANSESHUANGLONGHUI, [shunzi_123[0], shunzi_123[1], shunzi_789[0], shunzi_789[1], jiang_id[0]]);
        }
      }
    }
    // 一色四同顺、一色三同顺、一般高
    for (let i = 0; i < shunzi_id.length; i++) {
      for (let j = i + 1; j < shunzi_id.length; j++) {
        if (packs[shunzi_id[i]].eq(packs[shunzi_id[j]])) _StoreFan(FAN_YIBANGAO, [shunzi_id[i], shunzi_id[j]]);
        else continue;
        for (let k = j + 1; k < shunzi_id.length; k++) {
          if (packs[shunzi_id[j]].eq(packs[shunzi_id[k]])) _StoreFan(FAN_YISESANTONGSHUN, [shunzi_id[i], shunzi_id[j], shunzi_id[k]]);
          else continue;
          for (let l = k + 1; l < shunzi_id.length; l++) {
            if (packs[shunzi_id[k]].eq(packs[shunzi_id[l]])) _StoreFan(FAN_YISESITONGSHUN, [shunzi_id[i], shunzi_id[j], shunzi_id[k], shunzi_id[l]]);
          }
        }
      }
    }
    // 一色四节高、一色三节高、三色三节高
    {
      const kegang_temp = [];
      for (let i = 0; i < kegang_id.length; i++) {
        if (packs[kegang_id[i]].GetMiddleTile().IsShu()) kegang_temp.push([packs[kegang_id[i]].GetMiddleTile().Rank(), kegang_id[i]]);
      }
      kegang_temp.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      const sk = kegang_temp.map((pr) => pr[1]);
      const GetRank = (x) => packs[sk[x]].GetMiddleTile().Rank();
      const GetSuit = (x) => packs[sk[x]].GetMiddleTile().Suit();
      for (let i = 0; i < sk.length; i++) {
        for (let j = i + 1; j < sk.length; j++) {
          if (GetRank(i) !== GetRank(j) - 1) continue;
          for (let k = j + 1; k < sk.length; k++) {
            if (GetRank(j) !== GetRank(k) - 1) continue;
            if (GetSuit(i) !== GetSuit(j) && GetSuit(i) !== GetSuit(k) && GetSuit(j) !== GetSuit(k)) {
              _StoreFan(FAN_SANSESANJIEGAO, [sk[i], sk[j], sk[k]]);
            } else if (GetSuit(i) === GetSuit(j) && GetSuit(i) === GetSuit(k)) {
              _StoreFan(FAN_YISESANJIEGAO, [sk[i], sk[j], sk[k]]);
            } else continue;
            for (let l = k + 1; l < sk.length; l++) {
              if (GetSuit(i) === GetSuit(j) && GetSuit(i) === GetSuit(k) && GetSuit(i) === GetSuit(l)) {
                _StoreFan(FAN_YISESIJIEGAO, [sk[i], sk[j], sk[k], sk[l]]);
              }
            }
          }
        }
      }
    }
    // 一色四步高、一色三步高、三色三步高
    {
      const shunzi_temp = [];
      for (let i = 0; i < shunzi_id.length; i++) shunzi_temp.push([packs[shunzi_id[i]].GetMiddleTile().Rank(), shunzi_id[i]]);
      shunzi_temp.sort((a, b) => (a[0] - b[0]) || (a[1] - b[1]));
      const ss = shunzi_temp.map((pr) => pr[1]);
      const GetRank = (x) => packs[ss[x]].GetMiddleTile().Rank();
      const GetSuit = (x) => packs[ss[x]].GetMiddleTile().Suit();
      for (let i = 0; i < ss.length; i++) {
        for (let j = i + 1; j < ss.length; j++) {
          const step_1 = GetRank(j) - GetRank(i);
          if ((step_1 !== 1 && step_1 !== 2) || GetSuit(i) !== GetSuit(j)) continue;
          for (let k = j + 1; k < ss.length; k++) {
            const step_2 = GetRank(k) - GetRank(j);
            if ((step_2 !== 1 && step_2 !== 2) || GetSuit(j) !== GetSuit(k)) continue;
            if (step_1 === step_2) _StoreFan(FAN_YISESANBUGAO, [ss[i], ss[j], ss[k]]);
            for (let l = k + 1; l < ss.length; l++) {
              const step_3 = GetRank(l) - GetRank(k);
              if ((step_3 !== 1 && step_3 !== 2) || GetSuit(k) !== GetSuit(l)) continue;
              if (step_1 === step_2 && step_1 === step_3) _StoreFan(FAN_YISESIBUGAO, [ss[i], ss[j], ss[k], ss[l]]);
            }
          }
        }
      }
      for (let i = 0; i < ss.length; i++) {
        for (let j = i + 1; j < ss.length; j++) {
          if (GetRank(j) - GetRank(i) !== 1 || GetSuit(i) === GetSuit(j)) continue;
          for (let k = j + 1; k < ss.length; k++) {
            if (GetRank(k) - GetRank(j) !== 1 || GetSuit(i) === GetSuit(k) || GetSuit(j) === GetSuit(k)) continue;
            _StoreFan(FAN_SANSESANBUGAO, [ss[i], ss[j], ss[k]]);
          }
        }
      }
    }
    // 清龙、花龙
    {
      const rank = [];
      for (let i = 0; i <= 9; i++) rank.push([]);
      for (let i = 0; i < shunzi_id.length; i++) rank[packs[shunzi_id[i]].GetMiddleTile().Rank()].push(shunzi_id[i]);
      if (rank[2].length >= 1 && rank[5].length >= 1 && rank[8].length >= 1) {
        for (let i = 0; i < rank[2].length; i++) {
          for (let j = 0; j < rank[5].length; j++) {
            for (let k = 0; k < rank[8].length; k++) {
              const suit_1 = packs[rank[2][i]].GetMiddleTile().Suit();
              const suit_2 = packs[rank[5][j]].GetMiddleTile().Suit();
              const suit_3 = packs[rank[8][k]].GetMiddleTile().Suit();
              if (suit_1 === suit_2 && suit_1 === suit_3) _StoreFan(FAN_QINGLONG, [rank[2][i], rank[5][j], rank[8][k]]);
              if (suit_1 !== suit_2 && suit_1 !== suit_3 && suit_2 !== suit_3) _StoreFan(FAN_HUALONG, [rank[2][i], rank[5][j], rank[8][k]]);
            }
          }
        }
      }
    }
    // 三同刻、双同刻
    {
      const GetRank = (x) => packs[kegang_id[x]].GetMiddleTile().Rank();
      for (let i = 0; i < kegang_id.length; i++) {
        for (let j = i + 1; j < kegang_id.length; j++) {
          if (packs[kegang_id[i]].GetMiddleTile().IsShu() && GetRank(i) === GetRank(j)) _StoreFan(FAN_SHUANGTONGKE, [kegang_id[i], kegang_id[j]]);
          else continue;
          for (let k = j + 1; k < kegang_id.length; k++) {
            if (GetRank(j) === GetRank(k)) _StoreFan(FAN_SANTONGKE, [kegang_id[i], kegang_id[j], kegang_id[k]]);
            else continue;
          }
        }
      }
    }
    // 三色三同顺
    {
      const GetRank = (x) => packs[shunzi_id[x]].GetMiddleTile().Rank();
      const GetSuit = (x) => packs[shunzi_id[x]].GetMiddleTile().Suit();
      for (let i = 0; i < shunzi_id.length; i++) {
        for (let j = i + 1; j < shunzi_id.length; j++) {
          if (GetRank(i) !== GetRank(j) || GetSuit(i) === GetSuit(j)) continue;
          for (let k = j + 1; k < shunzi_id.length; k++) {
            if (GetRank(j) === GetRank(k) && GetSuit(i) !== GetSuit(k) && GetSuit(j) !== GetSuit(k)) _StoreFan(FAN_SANSESANTONGSHUN, [shunzi_id[i], shunzi_id[j], shunzi_id[k]]);
          }
        }
      }
    }
    // 喜相逢、连六、老少副
    {
      const GetRank = (x) => packs[shunzi_id[x]].GetMiddleTile().Rank();
      const GetSuit = (x) => packs[shunzi_id[x]].GetMiddleTile().Suit();
      for (let i = 0; i < shunzi_id.length; i++) {
        for (let j = i + 1; j < shunzi_id.length; j++) {
          if (GetSuit(i) !== GetSuit(j)) {
            if (GetRank(i) === GetRank(j)) _StoreFan(FAN_XIXIANGFENG, [shunzi_id[i], shunzi_id[j]]);
          } else {
            if (GetRank(i) === GetRank(j) + 3 || GetRank(i) === GetRank(j) - 3) _StoreFan(FAN_LIANLIU, [shunzi_id[i], shunzi_id[j]]);
            else if (GetRank(i) === GetRank(j) + 6 || GetRank(i) === GetRank(j) - 6) _StoreFan(FAN_LAOSHAOFU, [shunzi_id[i], shunzi_id[j]]);
          }
        }
      }
    }

    // 并查集 + BFS 选出不重复且番数最大的组合
    function makeStatus() {
      return { f: [0, 1, 2, 3, 4], eid: [], fan_cnt: 0 };
    }
    function st_find(s, x) {
      while (s.f[x] !== x) { s.f[x] = s.f[s.f[x]]; x = s.f[x]; }
      return x;
    }
    function st_uni2(s, a, b) {
      a = st_find(s, a); b = st_find(s, b);
      if (a === b) return;
      if (a < b) s.f[b] = a; else s.f[a] = b;
    }
    function st_try(s, id) {
      const v = e[id][1];
      for (let i = 0; i < v.length; i++) {
        for (let j = i + 1; j < v.length; j++) {
          if (st_find(s, v[i]) === st_find(s, v[j])) return false;
        }
      }
      for (let i = 1; i < v.length; i++) st_uni2(s, v[i], v[i - 1]);
      s.eid.push(id);
      s.fan_cnt += FAN_SCORE[e[id][0]];
      return true;
    }
    function st_hash(s) {
      let ret = 0;
      for (let i = 0; i < 5; i++) { ret *= 5; ret += st_find(s, i); }
      return ret;
    }
    function st_clone(s) { return { f: s.f.slice(), eid: s.eid.slice(), fan_cnt: s.fan_cnt }; }

    const mp = new Map();
    let fan_cnt = 0;
    let mx = makeStatus();
    const q = [makeStatus()];
    while (q.length) {
      const s_front = q.shift();
      for (let i = 0; i < e.length; i++) {
        const s = st_clone(s_front);
        if (st_try(s, i) && s.fan_cnt > (mp.get(st_hash(s)) || 0)) {
          q.push(s);
          mp.set(st_hash(s), s.fan_cnt);
          if (s.fan_cnt > fan_cnt) { fan_cnt = s.fan_cnt; mx = s; }
        }
      }
    }
    for (const id of mx.eid) {
      this._AddFan(e[id][0], e[id][1]);
      switch (e[id][0]) {
        case FAN_DASIXI:
          this._ExcludeFan(FAN_PENGPENGHU, []);
          for (const i of e[id][1]) {
            if (packs[i].GetMiddleTile().IsFeng()) { this._ExcludeFan(FAN_QUANFENGKE, [i]); this._ExcludeFan(FAN_MENFENGKE, [i]); this._ExcludeFan(FAN_YAOJIUKE, [i]); }
          }
          break;
        case FAN_DASANYUAN:
        case FAN_XIAOSANYUAN:
        case FAN_SHUANGJIANKE:
          for (const i of e[id][1]) {
            if (packs[i].GetMiddleTile().IsJian()) { this._ExcludeFan(FAN_JIANKE, [i]); this._ExcludeFan(FAN_YAOJIUKE, [i]); }
          }
          break;
        case FAN_XIAOSIXI:
        case FAN_SANFENGKE:
          for (const i of e[id][1]) {
            if (packs[i].GetMiddleTile().IsFeng()) this._ExcludeFan(FAN_YAOJIUKE, [i]);
          }
          break;
        case FAN_YISESHUANGLONGHUI:
          this._ExcludeFan(FAN_QINGYISE, []); this._ExcludeFan(FAN_PINGHU, []); this._ExcludeFan(FAN_WUZI, []); break;
        case FAN_YISESITONGSHUN:
          this._ExcludeFan(FAN_SIGUIYI, []); this._ExcludeFan(FAN_SIGUIYI, []); this._ExcludeFan(FAN_SIGUIYI, []); break;
        case FAN_YISESIJIEGAO:
          this._ExcludeFan(FAN_PENGPENGHU, []); break;
        case FAN_SANSESHUANGLONGHUI:
          this._ExcludeFan(FAN_PINGHU, []); break;
        default:
          break;
      }
    }
  }

  _CountSinglePackFan(ht, packs) {
    for (let i = 0; i < packs.length; i++) {
      const p = packs[i];
      if (p.IsKeGang()) {
        if (p.GetMiddleTile().IsJian()) { this._AddFan(FAN_JIANKE, [i]); this._ExcludeFan(FAN_YAOJIUKE, [i]); }
        if (p.GetMiddleTile().eq(ht.GetQuanfeng())) { this._AddFan(FAN_QUANFENGKE, [i]); this._ExcludeFan(FAN_YAOJIUKE, [i]); }
        if (p.GetMiddleTile().eq(ht.GetMenfeng())) { this._AddFan(FAN_MENFENGKE, [i]); this._ExcludeFan(FAN_YAOJIUKE, [i]); }
        if (p.GetMiddleTile().IsYaojiu()) { this._AddFan(FAN_YAOJIUKE, [i]); }
      }
    }
  }

  _CountWinModeFan(ht, packs, zuhelong_pack, ting) {
    // 妙手回春
    if (ht.IsHaidi() && ht.IsZimo()) { this._AddFan(FAN_MIAOSHOUHUICHUN, []); this._ExcludeFan(FAN_ZIMO, []); }
    // 海底捞月
    if (ht.IsHaidi() && !ht.IsZimo()) { this._AddFan(FAN_HAIDILAOYUE, []); }
    // 杠上开花
    if (ht.IsGang() && ht.IsZimo()) { this._AddFan(FAN_GANGSHANGKAIHUA, []); this._ExcludeFan(FAN_ZIMO, []); }
    // 抢杠和
    if (ht.IsGang() && !ht.IsZimo()) { this._AddFan(FAN_QIANGGANGHU, []); this._ExcludeFan(FAN_HUJUEZHANG, []); }
    // 全求人
    if (ht.IsTotallyFulu() && !ht.IsZimo()) {
      this._AddFan(FAN_QUANQIUREN, []);
      this._ExcludeFan(FAN_DANDIAOJIANG, [findIndexPack(packs, (p) => p.IsJiang())]);
    }
    // 不求人
    if (ht.IsMenqing() && ht.IsZimo()) {
      this._AddFan(FAN_BUQIUREN, []); this._ExcludeFan(FAN_MENQIANQING, []); this._ExcludeFan(FAN_ZIMO, []);
    }
    // 和绝张
    if (ht.IsJuezhang()) {
      this._AddFan(FAN_HUJUEZHANG, []);
      this._ExcludeFan(FAN_DANDIAOJIANG, [findIndexPack(packs, (p) => p.IsJiang())]);
    }
    // 门前清
    if (ht.IsMenqing()) this._AddFan(FAN_MENQIANQING, []);
    // 边张、坎张、单钓将
    if (ting.length === 1 && (zuhelong_pack.GetZuhelongBitmap() & ht.GetLastLipai().GetBitmap()) === 0n) {
      for (let i = 0; i < packs.length; i++) {
        const p = packs[i];
        const t = p.GetMiddleTile();
        if (p.HaveLastTile()) {
          if (p.IsJiang()) {
            this._AddFan(FAN_DANDIAOJIANG, [i]);
          } else if (p.IsShunzi()) {
            if ((t.Rank() === T.RANK_2 && ht.GetLastLipai().Rank() === T.RANK_3) || (t.Rank() === T.RANK_8 && ht.GetLastLipai().Rank() === T.RANK_7)) {
              this._AddFan(FAN_BIANZHANG, [i]);
            } else if (t.Rank() === ht.GetLastLipai().Rank()) {
              this._AddFan(FAN_KANZHANG, [i]);
            }
          }
          break;
        }
      }
    }
    // 自摸
    if (ht.IsZimo()) {
      this._AddFan(FAN_ZIMO, []);
      if ((this._HasFan(FAN_JIULIANBAODENG) || this._HasFan(FAN_SIANKE)) && !this._HasFan(FAN_MIAOSHOUHUICHUN) && !this._HasFan(FAN_GANGSHANGKAIHUA)) {
        this.excluded_fan_table[FAN_ZIMO] = [];
      }
    }
  }

  // ===== 和型判断 =====
  _JudgeCompleteSpecialHu(ht) {
    if (!ht.NoFulu()) return FAN_INVALID;
    const bitmap = ht.LipaiBitmap();
    const cnt = this._BitCount(bitmap);
    if ((bitmap & T.TILE_TYPE_BITMAP_YAOJIU) === bitmap && cnt === 13) return FAN_SHISANYAO;
    if (this._JudgePartOfZuhelong(bitmap) && ((bitmap & T.TILE_TYPE_BITMAP_MEANINGFUL) === bitmap) && cnt === 14) {
      if ((bitmap & T.TILE_TYPE_BITMAP_ZI) === T.TILE_TYPE_BITMAP_ZI) return FAN_QIXINGBUKAO;
      return FAN_QUANBUKAO;
    }
    return FAN_INVALID;
  }
  _JudgeQidui(ht) {
    if (!ht.NoFulu()) return FAN_INVALID;
    const sorted_lipai = ht.lipai.slice().sort((a, b) => a._tile - b._tile);
    const packs = [];
    const ret = this._Dfs(ht, sorted_lipai, 0, 7, packs, 0);
    if (ret) {
      let flag = 1;
      for (let i = 1; i < packs.length; i++) {
        if (!(packs[i - 1].GetMiddleTile().Succ().eq(packs[i].GetMiddleTile()) && packs[i - 1].GetMiddleTile().Suit() === packs[i].GetMiddleTile().Suit())) { flag = 0; break; }
      }
      return flag === 0 ? FAN_QIDUI : FAN_LIANQIDUI;
    }
    return FAN_INVALID;
  }
  _JudgeBasicHu(ht) {
    const sorted_lipai = ht.lipai.slice().sort((a, b) => a._tile - b._tile);
    const packs = ht.fulu.slice();
    return this._Dfs(ht, sorted_lipai, 4 - ht.fulu.length, 1, packs, 0);
  }
  _JudgeZuhelongBasicHu(ht) {
    const sorted_lipai = [];
    const zuhelong_bitmap = ZuhelongBitmap[this._JudgeZuhelong(ht.LipaiBitmap())];
    if (zuhelong_bitmap) {
      let bitmap_temp = zuhelong_bitmap;
      for (let i = 0; i < ht.lipai.length; i++) {
        if (ht.lipai[i].GetBitmap() & bitmap_temp) bitmap_temp ^= ht.lipai[i].GetBitmap();
        else sorted_lipai.push(ht.lipai[i]);
      }
      sorted_lipai.sort((a, b) => a._tile - b._tile);
      const packs = ht.fulu.slice();
      return this._Dfs(ht, sorted_lipai, 1 - ht.fulu.length, 1, packs, 0);
    }
    return 0;
  }

  // ===== DFS =====
  _Dfs(ht, sorted_lipai, mianzi_cnt, duizi_cnt, packs, flag_count_fan, zuhelong_pack = new Pack()) {
    const st = new Set();
    const vis = new Array(14).fill(0);
    return this._Dfs_recursive(ht, sorted_lipai, mianzi_cnt, duizi_cnt, vis, packs, flag_count_fan, zuhelong_pack, st);
  }
  _Dfs_recursive(ht, sorted_lipai, mianzi_cnt, duizi_cnt, vis, packs, flag_count_fan, zuhelong_pack, st) {
    let ret = 0;
    if (mianzi_cnt === 0 && duizi_cnt === 0) {
      if (flag_count_fan) {
        this._CountBasicFan(ht, packs, zuhelong_pack);
        this.fan_packs = packs.slice();
        this._GetMaxFan();
      }
      return 1;
    }
    let start_pos = -1;
    const n = sorted_lipai.length;
    for (let i = 0; i < n; i++) { if (vis[i] === 0) { start_pos = i; break; } }
    if (start_pos === -1) return 0;
    for (let i = start_pos + 1; i < n; i++) {
      if (vis[i]) continue;
      if (!this._Judge2SameOrAdjacent(sorted_lipai[start_pos], sorted_lipai[i])) break;
      if (duizi_cnt && this._Judge2MakePack(sorted_lipai[start_pos], sorted_lipai[i])) {
        vis[start_pos] = vis[i] = 1;
        const offer = -(sorted_lipai[start_pos].GetDrawflag() + sorted_lipai[i].GetDrawflag());
        packs.push(new Pack(P.PACK_TYPE_JIANG, sorted_lipai[i], 0, offer));
        const hashcode = this._PacksHashcode(ht, packs);
        if (!st.has(hashcode)) {
          st.add(hashcode);
          ret |= this._Dfs_recursive(ht, sorted_lipai, mianzi_cnt, duizi_cnt - 1, vis, packs, flag_count_fan, zuhelong_pack, st);
          if (flag_count_fan === 0 && ret) return 1;
        }
        packs.pop();
        vis[start_pos] = vis[i] = 0;
      }
      if (mianzi_cnt) {
        for (let j = i + 1; j < n; j++) {
          if (vis[j]) continue;
          if (!this._Judge2SameOrAdjacent(sorted_lipai[i], sorted_lipai[j])) break;
          const type = this._Judge3MakePack(sorted_lipai[start_pos], sorted_lipai[i], sorted_lipai[j]);
          if (type) {
            vis[start_pos] = vis[i] = vis[j] = 1;
            const offer = -(sorted_lipai[start_pos].GetDrawflag() + sorted_lipai[i].GetDrawflag() + sorted_lipai[j].GetDrawflag());
            packs.push(new Pack(type, sorted_lipai[i], 0, offer));
            const hashcode = this._PacksHashcode(ht, packs);
            if (!st.has(hashcode)) {
              st.add(hashcode);
              ret |= this._Dfs_recursive(ht, sorted_lipai, mianzi_cnt - 1, duizi_cnt, vis, packs, flag_count_fan, zuhelong_pack, st);
              if (flag_count_fan === 0 && ret) return 1;
            }
            packs.pop();
            vis[start_pos] = vis[i] = vis[j] = 0;
          }
        }
      }
    }
    return ret;
  }
  _CountBasicFan(ht, packs, zuhelong_pack) {
    this._CountOverallAttrFan(ht, packs, zuhelong_pack);
    this._CountKeGangFan(ht, packs);
    this._CountAssociatedCombinationFan(ht, packs);
    this._CountSinglePackFan(ht, packs);
    this._CountWinModeFan(ht, packs, zuhelong_pack, this._cf_ting);
  }
  _PacksHashcode(ht, packs) {
    let h = 0n;
    for (let i = ht.fulu.length; i < packs.length; i++) {
      const p = packs[i];
      let v = (h << 7n) | BigInt(p.GetMiddleTile().GetId());
      v = (v << 3n) | BigInt(p.GetType());
      v = (v << 1n) | BigInt(p.HaveLastTile() ? 1 : 0);
      h = v;
    }
    return h;
  }
  _Judge2SameOrAdjacent(a, b) {
    if (a.IsShu() && a.Suit() === b.Suit()) return a.eq(b.Pred()) || a.eq(b);
    else if (a.IsZi()) return a.eq(b);
    return 0;
  }
  _Judge3MakePack(a, b, c) {
    if (a.IsShu() && b.Suit() === a.Suit() && b.Suit() === c.Suit() && b.eq(a.Succ()) && b.eq(c.Pred())) return P.PACK_TYPE_SHUNZI;
    else if (b.eq(a) && b.eq(c)) return P.PACK_TYPE_KEZI;
    return 0;
  }
  _Judge2MakePack(a, b) {
    if (b.eq(a)) return P.PACK_TYPE_JIANG;
    return 0;
  }
  _JudgeZuhelong(bitmap) {
    for (let i = 1; i <= 6; i++) if ((ZuhelongBitmap[i] & bitmap) === ZuhelongBitmap[i]) return i;
    return 0;
  }
  _JudgePartOfZuhelong(bitmap) {
    bitmap &= T.TILE_TYPE_BITMAP_SHU;
    for (let i = 1; i <= 6; i++) if ((ZuhelongBitmap[i] | bitmap) === ZuhelongBitmap[i]) return 1;
    return 0;
  }
  _BitCount(n) {
    let c = 0;
    while (n) { n &= (n - 1n); c++; }
    return c;
  }

  // ===== 便捷结果（供游戏逻辑/前端使用）=====
  // 返回 { total, items:[{fan,name,score,count}], thresholdFan, huapaiCount }
  getResult() {
    const items = [];
    let huapaiCount = 0;
    let thresholdFan = 0;
    for (let i = 1; i < FAN_SIZE; i++) {
      const cnt = this.fan_table_res[i].length;
      if (!cnt) continue;
      if (i === FAN_HUAPAI) { huapaiCount = cnt; }
      items.push({ fan: i, name: FAN_NAME[i], score: FAN_SCORE[i], count: cnt });
      if (i !== FAN_HUAPAI && i !== FAN_WUFANHU) thresholdFan += FAN_SCORE[i] * cnt;
    }
    return { total: this.tot_fan_res, items, thresholdFan, huapaiCount };
  }
}

const FAN = {
  FAN_INVALID, FAN_DASIXI, FAN_DASANYUAN, FAN_LVYISE, FAN_JIULIANBAODENG, FAN_SIGANG, FAN_LIANQIDUI, FAN_SHISANYAO,
  FAN_QINGYAOJIU, FAN_XIAOSIXI, FAN_XIAOSANYUAN, FAN_ZIYISE, FAN_SIANKE, FAN_YISESHUANGLONGHUI,
  FAN_YISESITONGSHUN, FAN_YISESIJIEGAO, FAN_YISESIBUGAO, FAN_SANGANG, FAN_HUNYAOJIU,
  FAN_QIDUI, FAN_QIXINGBUKAO, FAN_QUANSHUANGKE, FAN_QINGYISE, FAN_YISESANTONGSHUN, FAN_YISESANJIEGAO, FAN_QUANDA, FAN_QUANZHONG, FAN_QUANXIAO,
  FAN_QINGLONG, FAN_SANSESHUANGLONGHUI, FAN_YISESANBUGAO, FAN_QUANDAIWU, FAN_SANTONGKE, FAN_SANANKE,
  FAN_QUANBUKAO, FAN_ZUHELONG, FAN_DAYUWU, FAN_XIAOYUWU, FAN_SANFENGKE,
  FAN_HUALONG, FAN_TUIBUDAO, FAN_SANSESANTONGSHUN, FAN_SANSESANJIEGAO, FAN_WUFANHU, FAN_MIAOSHOUHUICHUN, FAN_HAIDILAOYUE, FAN_GANGSHANGKAIHUA, FAN_QIANGGANGHU,
  FAN_PENGPENGHU, FAN_HUNYISE, FAN_SANSESANBUGAO, FAN_WUMENQI, FAN_QUANQIUREN, FAN_SHUANGANGANG, FAN_SHUANGJIANKE,
  FAN_QUANDAIYAO, FAN_BUQIUREN, FAN_SHUANGMINGGANG, FAN_HUJUEZHANG,
  FAN_JIANKE, FAN_QUANFENGKE, FAN_MENFENGKE, FAN_MENQIANQING, FAN_PINGHU, FAN_SIGUIYI, FAN_SHUANGTONGKE, FAN_SHUANGANKE, FAN_ANGANG, FAN_DUANYAO,
  FAN_YIBANGAO, FAN_XIXIANGFENG, FAN_LIANLIU, FAN_LAOSHAOFU, FAN_YAOJIUKE, FAN_MINGGANG, FAN_QUEYIMEN, FAN_WUZI, FAN_BIANZHANG, FAN_KANZHANG, FAN_DANDIAOJIANG, FAN_ZIMO, FAN_HUAPAI,
  FAN_MINGANGANG, FAN_SIZE,
};

module.exports = { Fan, FAN, FAN_SCORE, FAN_NAME, FAN_SIZE };
