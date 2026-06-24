'use strict';
// 用 Web Audio 合成音效（无需音频文件）：打牌、吃碰杠、和牌、轮到你、补花
(function () {
  let ctx = null;
  let enabled = localStorage.getItem('mj_sound') !== '0';
  const tts = ('speechSynthesis' in window) ? window.speechSynthesis : null;
  let zhVoice = null;
  function pickVoice() {
    if (!tts) return;
    const vs = tts.getVoices() || [];
    zhVoice = vs.find((v) => /zh[-_]?cn/i.test(v.lang)) || vs.find((v) => /^zh/i.test(v.lang)) ||
              vs.find((v) => /chinese|普通话|中文/i.test(v.name)) || null;
  }
  if (tts) { pickVoice(); tts.onvoiceschanged = pickVoice; }

  let warmed = false;
  function init() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (tts) {
      if (!zhVoice) pickVoice();
      if (!warmed) { try { const u = new SpeechSynthesisUtterance(' '); u.volume = 0; tts.speak(u); warmed = true; } catch (e) {} }
    }
  }

  // 中文语音播报（吃/碰/杠/胡/补花、报牌名）
  function say(text, interrupt) {
    if (!enabled || !text || !tts) return;
    try {
      if (interrupt) tts.cancel();
      const u = new SpeechSynthesisUtterance(text);
      u.lang = 'zh-CN';
      if (zhVoice) u.voice = zhVoice;
      u.rate = 1.05; u.pitch = 1; u.volume = 1;
      tts.speak(u);
    } catch (e) {}
  }

  function tone(freq, start, dur, type, gain) {
    if (!ctx) return;
    const o = ctx.createOscillator(), g = ctx.createGain();
    o.type = type || 'sine'; o.frequency.value = freq;
    o.connect(g); g.connect(ctx.destination);
    const t = ctx.currentTime + start;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(gain || 0.2, t + 0.012);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.start(t); o.stop(t + dur + 0.02);
  }

  // 木牌“啪”：短噪声脉冲 + 低频体
  function clack(start, freq, gain) {
    if (!ctx) return;
    const sr = ctx.sampleRate, len = Math.floor(sr * 0.05);
    const buf = ctx.createBuffer(1, len, sr), d = buf.getChannelData(0);
    for (let i = 0; i < len; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / len, 2.2);
    const src = ctx.createBufferSource(); src.buffer = buf;
    const bp = ctx.createBiquadFilter(); bp.type = 'bandpass'; bp.frequency.value = freq || 1100; bp.Q.value = 1.1;
    const g = ctx.createGain(); g.gain.value = gain || 0.34;
    src.connect(bp); bp.connect(g); g.connect(ctx.destination);
    src.start(ctx.currentTime + (start || 0));
    tone(170, start || 0, 0.045, 'square', 0.10);
  }

  const SFX = {
    init, say,
    isEnabled() { return enabled; },
    setEnabled(v) { enabled = !!v; localStorage.setItem('mj_sound', v ? '1' : '0'); if (v) init(); else if (tts) try { tts.cancel(); } catch (e) {} },
    discard() { if (!enabled) return; init(); clack(0, 1050, 0.34); },
    draw() { if (!enabled) return; init(); clack(0, 1500, 0.16); },
    claim() { if (!enabled) return; init(); clack(0, 1300, 0.34); clack(0.085, 1550, 0.3); },
    flower() { if (!enabled) return; init(); tone(1320, 0, 0.1, 'sine', 0.16); tone(1760, 0.08, 0.12, 'sine', 0.14); },
    turn() { if (!enabled) return; init(); tone(880, 0, 0.14, 'sine', 0.16); },
    win() { if (!enabled) return; init(); [523, 659, 784, 1047].forEach((f, i) => tone(f, i * 0.13, 0.2, 'triangle', 0.22)); },
    lose() { if (!enabled) return; init(); [392, 330, 262].forEach((f, i) => tone(f, i * 0.13, 0.2, 'sine', 0.18)); },
    draws() { if (!enabled) return; init(); tone(440, 0, 0.25, 'sine', 0.16); },
  };
  window.SFX = SFX;
})();
