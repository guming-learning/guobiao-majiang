#!/usr/bin/env python
# 预生成所有中文语音片段（牌名 + 吃碰杠胡补花等），使用微软 Edge 神经语音。
# 运行：python tools/gen_voice.py   输出到 public/audio/*.mp3
import asyncio
import os
import edge_tts

VOICE = "zh-CN-XiaoxiaoNeural"  # 清晰女声
OUT = os.path.join(os.path.dirname(__file__), "..", "public", "audio")
os.makedirs(OUT, exist_ok=True)

NUM = ["", "一", "二", "三", "四", "五", "六", "七", "八", "九"]
clips = {}
for i in range(1, 10):
    clips[f"tile_{i}"] = NUM[i] + "万"
    clips[f"tile_{9 + i}"] = NUM[i] + "条"
    clips[f"tile_{18 + i}"] = NUM[i] + "饼"
for k, t in {28: "东风", 29: "南风", 30: "西风", 31: "北风", 32: "红中", 33: "发财", 34: "白板"}.items():
    clips[f"tile_{k}"] = t
for k, t in {"peng": "碰", "chi": "吃", "gang": "杠", "angang": "暗杠",
             "hu": "胡", "zimo": "自摸", "qiangganghu": "抢杠胡",
             "buhua": "补花", "liuju": "流局"}.items():
    clips[k] = t


async def gen():
    for key, text in clips.items():
        path = os.path.join(OUT, key + ".mp3")
        await edge_tts.Communicate(text, VOICE).save(path)
        print(key, os.path.getsize(path), "bytes")


asyncio.run(gen())
print("done:", len(clips), "clips ->", os.path.abspath(OUT))
