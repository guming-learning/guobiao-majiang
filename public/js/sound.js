'use strict';
// 音效：Web Audio 合成的提示音 + 预录中文语音片段（public/audio/*.mp3，无需系统语音包）
(function () {
  let ctx = null;
  let enabled = localStorage.getItem('mj_sound') !== '0';

  // ===== 预录语音片段 =====
  const VOICE_KEYS = [];
  for (let i = 1; i <= 34; i++) VOICE_KEYS.push('tile_' + i); // 1-27 万条饼，28-34 风/箭
  ['peng', 'chi', 'gang', 'angang', 'hu', 'zimo', 'qiangganghu', 'buhua', 'liuju'].forEach((k) => VOICE_KEYS.push(k));
  const rawClips = {};  // key -> ArrayBuffer
  const clips = {};     // key -> AudioBuffer
  let fetchedClips = false, voiceGain = null, curVoiceSrc = null;

  function fetchClips() {
    if (fetchedClips) return; fetchedClips = true;
    VOICE_KEYS.forEach((k) => {
      fetch('audio/' + k + '.mp3').then((r) => r.arrayBuffer()).then((buf) => { rawClips[k] = buf; decodeClip(k); }).catch(() => {});
    });
  }
  function decodeClip(k) {
    if (!ctx || !rawClips[k] || clips[k]) return;
    try { ctx.decodeAudioData(rawClips[k].slice(0), (b) => { clips[k] = b; }, () => {}); } catch (e) {}
  }
  function decodeAll() { VOICE_KEYS.forEach(decodeClip); }

  function playVoice(key) {
    if (!enabled) return;
    init();
    const b = clips[key];
    if (!ctx || !b) return; // 片段尚未解码（仅极早期可能发生）
    try {
      if (curVoiceSrc) { try { curVoiceSrc.stop(); } catch (e) {} curVoiceSrc = null; }
      if (!voiceGain) { voiceGain = ctx.createGain(); voiceGain.gain.value = 1; voiceGain.connect(ctx.destination); }
      const src = ctx.createBufferSource();
      src.buffer = b; src.connect(voiceGain); src.start(0);
      curVoiceSrc = src;
      src.onended = () => { if (curVoiceSrc === src) curVoiceSrc = null; };
    } catch (e) {}
  }
  fetchClips();

  function init() {
    if (!ctx) { try { ctx = new (window.AudioContext || window.webkitAudioContext)(); } catch (e) { ctx = null; } }
    if (ctx && ctx.state === 'suspended') ctx.resume();
    if (ctx) decodeAll();
  }

  // ===== Web Audio 合成提示音 =====
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
    init,
    say(key) { playVoice(key); },               // 动作/状态语音：peng/chi/gang/angang/hu/zimo/qiangganghu/buhua/liuju
    sayTile(id) { playVoice('tile_' + id); },    // 报牌名
    isEnabled() { return enabled; },
    setEnabled(v) { enabled = !!v; localStorage.setItem('mj_sound', v ? '1' : '0'); if (v) init(); else if (curVoiceSrc) { try { curVoiceSrc.stop(); } catch (e) {} curVoiceSrc = null; } },
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

  // 切到后台/失焦再回来后，浏览器会挂起音频上下文——重新聚焦或下次触摸时恢复
  function resumeAudio() { try { if (ctx && ctx.state === 'suspended') ctx.resume(); } catch (e) {} }
  document.addEventListener('visibilitychange', () => { if (!document.hidden) resumeAudio(); });
  window.addEventListener('focus', resumeAudio);
  window.addEventListener('pageshow', resumeAudio);
  ['pointerdown', 'touchstart', 'keydown'].forEach((ev) => document.addEventListener(ev, resumeAudio, { passive: true }));
})();
