/* ============================================================
 * 嘟豪 · 音频引擎  window.DHAudio
 * ------------------------------------------------------------
 * 契约见 INTERFACES.md 第 2 节（owner: audio）。
 *
 * 加载优先级：
 *   1) 构建态：window.DH_AUDIO_DATA[<音效名>] = dataURI（build.py 内联）
 *   2) 开发态：XMLHttpRequest 读取 assets/audio/<file>（http 服务下有效）
 *   3) 兜底：WebAudio 实时合成（任何情况下都有声音，且绝不抛未捕获异常）
 *
 * 兼容性：经典脚本（无 ES module / import / export），
 *         不使用 ?. ?? 与顶层 await，Android WebView 100+ / iOS Safari 可用。
 *         音效播放用 AudioBufferSourceNode；合成只用 Oscillator/Biquad/Gain/
 *         StereoPanner（不支持 StereoPanner 时自动忽略 pan）。
 *
 * 音频资产来源与授权见 assets/audio/CREDITS.json（kavex/GameSounds GPL-3.0、
 * romainsimon/uisfx MIT/CC0、ohrafaelmartins/sound-effects 雨声、eakbulut/foley 合成思路）。
 * ============================================================ */
(function (root) {
  'use strict';

  var W = root;
  if (!W) return;

  var AudioCtx = W.AudioContext || W.webkitAudioContext;

  /* ------------------------------------------------------------
   * 1. 音效定义
   *    files    : 候选音频文件（按顺序尝试：ogg 优先，iOS 用 mp3 后备）
   *    fallback : 文件缺失/解码失败时用的合成音色
   *    layer    : 有文件时额外叠加的合成层（增强质感）
   *    synth    : 纯合成音效（没有文件）
   *    gain     : 该音效的默认增益
   *    loopable : 支持 play(name,{loop:true}) 返回句柄 {stop()}
   * ------------------------------------------------------------ */
  var DEFS = {
    laser_charge: { synth: 'laserCharge', gain: 0.80 },
    laser_fire:   { files: ['laser_fire.wav'], fallback: 'laserFire', gain: 0.85 },
    reflect:      { files: ['reflect.wav'], fallback: 'reflectPing', layer: 'reflectPing', gain: 0.80 },
    reflect_fail: { files: ['reflect_fail.ogg', 'reflect_fail_ios.mp3'], fallback: 'reflectFail', gain: 0.70 },
    boss_hit:     { files: ['boss_hit.wav'], fallback: 'thump', layer: 'thump', gain: 0.85 },
    boss_death:   { files: ['boss_death.wav'], fallback: 'bossDeath', gain: 0.95 },
    ult_ready:    { files: ['ult_ready.wav'], fallback: 'ultReady', layer: 'ultReady', gain: 0.85 },
    ult_beam:     { synth: 'ultBeam', gain: 0.80, loopable: true },
    revive:       { files: ['revive.wav'], fallback: 'whiteLight', layer: 'whiteLight', gain: 0.90 },
    floor_clear:  { files: ['floor_clear.ogg', 'floor_clear_ios.mp3'], fallback: 'chimeUp', layer: 'chimeUp', gain: 0.80 },
    death:        { files: ['death.wav'], fallback: 'deathDrone', gain: 0.90 },
    ui_hover:     { files: ['ui_hover.ogg', 'ui_hover_ios.mp3'], fallback: 'uiTick', gain: 0.50 },
    ui_click:     { files: ['ui_click.ogg', 'ui_click_ios.mp3'], fallback: 'uiPress', gain: 0.60 },
    ui_back:      { files: ['ui_back.ogg', 'ui_back_ios.mp3'], fallback: 'uiBack', gain: 0.55 },
    banner:       { files: ['banner.ogg', 'banner_ios.mp3'], fallback: 'bannerFall', layer: 'drumHit', gain: 0.90 },
    credits:      { files: ['credits.ogg', 'credits_ios.mp3'], fallback: 'creditsPad', gain: 0.85 },
    stinger:      { files: ['stinger.wav'], fallback: 'stingerFall', gain: 0.80 },
    glitch:       { synth: 'glitch', gain: 0.65 },
    heartbeat:    { synth: 'heartbeat', gain: 0.85 },
    shield_hum:   { synth: 'shieldHum', gain: 0.55, loopable: true },
    sword_slash:  { synth: 'swordSlash', gain: 0.80 },
    stab:         { synth: 'stab', gain: 0.95 },
    title_fall:   { files: ['title_fall.wav'], fallback: 'titleFall', gain: 0.95 }
  };

  var NAMES = [
    'laser_charge', 'laser_fire', 'reflect', 'reflect_fail', 'boss_hit', 'boss_death',
    'ult_ready', 'ult_beam', 'revive', 'floor_clear', 'death', 'ui_hover', 'ui_click',
    'ui_back', 'banner', 'credits', 'stinger', 'glitch', 'heartbeat', 'shield_hum',
    'sword_slash', 'stab', 'title_fall'
  ];

  /* ------------------------------------------------------------
   * 2. 运行时状态
   * ------------------------------------------------------------ */
  var ctx = null;
  var master = null;          // 总音量（静音控制）
  var compressor = null;
  var unlocked = false;       // 是否已通过用户手势解锁
  var muted = false;
  var ready = false;
  var buffers = {};           // name -> AudioBuffer
  var loadState = {};         // name -> 'loading' | 'done' | 'failed'
  var pending = [];           // 未解锁时排队（最多 8 条、1.2s 内有效）
  var loadRetry = {};         // 加载失败后的重试计数
  var active = 0;             // 同时发声数量（防轰炸）
  var MAX_ACTIVE = 28;
  var noiseBuf = null;
  var basesCache = null;
  var voiceState = { hero: null, boss: null };
  var MASTER_GAIN = 0.9;

  /* ------------------------------------------------------------
   * 3. 小工具
   * ------------------------------------------------------------ */
  function clamp(v, lo, hi) { return v < lo ? lo : (v > hi ? hi : v); }
  function num(v, dft) { return (typeof v === 'number' && isFinite(v)) ? v : dft; }
  function nowMs() { return Date.now ? Date.now() : new Date().getTime(); }

  function warn(msg) {
    /* 只在控制台提示一次，不影响游戏 */
    try {
      if (typeof console !== 'undefined' && console.warn) console.warn('[DHAudio] ' + msg);
    } catch (e) { /* ignore */ }
  }

  function safeDisconnect(node) {
    try { if (node && node.disconnect) node.disconnect(); } catch (e) { /* ignore */ }
  }

  /* 定时释放节点（连接断开，便于 GC；对声音没有影响） */
  function freeLater(node, sec) {
    if (!node) return;
    var ms = Math.max(120, (sec || 1) * 1000 + 250);
    setTimeout(function () { safeDisconnect(node); }, ms);
  }

  /* ------------------------------------------------------------
   * 4. 初始化 / 解锁
   * ------------------------------------------------------------ */
  function makeNoiseBuffer() {
    try {
      var len = Math.floor(ctx.sampleRate * 2);
      var buf = ctx.createBuffer(1, len, ctx.sampleRate);
      var d = buf.getChannelData(0);
      for (var i = 0; i < len; i++) d[i] = Math.random() * 2 - 1;
      return buf;
    } catch (e) { return null; }
  }

  function handleStateChange() {
    try {
      if (!ctx) return;
      if (ctx.state === 'running') {
        unlocked = true;
        flushPending();
        if (amb.want && !amb.on) startAmbienceNow();
        if (music.want && !music.on) startBattleMusic();
      }
    } catch (e) { /* ignore */ }
  }

  function flushPending() {
    try {
      if (!pending.length) return;
      var list = pending;
      pending = [];
      var t = nowMs();
      for (var i = 0; i < list.length; i++) {
        if (t - list[i].t <= 1200) play(list[i].name, list[i].opts);
      }
    } catch (e) { /* ignore */ }
  }

  function init() {
    try {
      if (!AudioCtx) return false;
      if (!ctx) {
        ctx = new AudioCtx();
        master = ctx.createGain();
        master.gain.value = muted ? 0.0001 : MASTER_GAIN;
        if (ctx.createDynamicsCompressor) {
          compressor = ctx.createDynamicsCompressor();
          compressor.threshold.value = -10;
          compressor.knee.value = 24;
          compressor.ratio.value = 4;
          compressor.attack.value = 0.003;
          compressor.release.value = 0.25;
          master.connect(compressor);
          compressor.connect(ctx.destination);
        } else {
          master.connect(ctx.destination);
        }
        noiseBuf = makeNoiseBuffer();
        ctx.onstatechange = handleStateChange;
        // 预解码全部音频（静默失败不影响合成兜底）
        staggerLoad();
      }
      if (ctx.state === 'suspended' && ctx.resume) {
        try {
          var pr = ctx.resume();
          if (pr && typeof pr.then === 'function') {
            pr.then(function () { handleStateChange(); }, function () { /* ignore */ });
          }
        } catch (e) { /* ignore */ }
      }
      if (ctx.state === 'running') {
        unlocked = true;
        flushPending();
        if (amb.want && !amb.on) startAmbienceNow();
        if (music.want && !music.on) startBattleMusic();
      }
      ready = true;
      return true;
    } catch (e) {
      warn('init 失败：' + (e && e.message ? e.message : e));
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 5. 资源加载
   * ------------------------------------------------------------ */

  /* base64 dataURI -> ArrayBuffer */
  function dataURItoBuffer(uri) {
    var comma = uri.indexOf(',');
    if (comma < 0) return null;
    var meta = uri.substring(5, comma);
    var data = uri.substring(comma + 1);
    if (meta.indexOf('base64') < 0) return null;
    var bin = (W.atob || atob)(data);
    var len = bin.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) bytes[i] = bin.charCodeAt(i);
    return bytes.buffer;
  }

  /* 兼容 callback / Promise 两种 decodeAudioData */
  function decodeBuffer(arrayBuffer, cb) {
    if (!ctx) { cb(new Error('no ctx')); return; }
    var done = false;
    function fin(err, buf) {
      if (done) return;
      done = true;
      cb(err, buf);
    }
    try {
      var ret = ctx.decodeAudioData(
        arrayBuffer,
        function (b) { fin(null, b); },
        function (e) { fin(e || new Error('decode failed')); }
      );
      if (ret && typeof ret.then === 'function') {
        ret.then(function (b) { fin(null, b); }, function (e) { fin(e || new Error('decode failed')); });
      }
    } catch (e) {
      fin(e);
    }
  }

  /* 构建态：找 window.DH_AUDIO_DATA 里对应的 dataURI
   * build.py 约定的 key = 音效名（如 laser_fire）。
   * 同时兼容：完整文件名、去扩展名文件名、<文件名>__ios（iOS mp3 后备）。
   * 返回第一个可用的 dataURI 字符串，找不到返回 null。 */
  function dataURIFrom(obj, keys) {
    if (!obj || typeof obj !== 'object') return null;
    for (var i = 0; i < keys.length; i++) {
      var v = obj[keys[i]];
      if (typeof v === 'string' && v.length > 32) return v;
    }
    return null;
  }

  function fileKeys(file) {
    var base = file.replace(/\.[^.]+$/, '');
    return [file, base, base + '__ios', base + '__mp3'];
  }

  function findDataURI(name, file) {
    var D = W.DH_AUDIO_DATA;
    if (!D) return null;
    // 1) 音效名优先（build.py 约定），2) 具体文件，3) 可选 iOS 后备
    var uri = dataURIFrom(D, [name, name + '__ios', name + '__mp3']);
    if (uri) return uri;
    return file ? dataURIFrom(D, fileKeys(file)) : null;
  }

  function findDataURIByFile(file) {
    return dataURIFrom(W.DH_AUDIO_DATA, fileKeys(file));
  }

  /* 开发态：从脚本自身位置推导 assets/audio 路径 */
  function devBases() {
    if (basesCache) return basesCache;
    var out = [];
    try {
      var src = '';
      if (typeof document !== 'undefined') {
        if (document.currentScript && document.currentScript.src) {
          src = document.currentScript.src;
        } else if (document.getElementsByTagName) {
          var ss = document.getElementsByTagName('script');
          for (var i = 0; i < ss.length; i++) {
            if (ss[i].src && ss[i].src.indexOf('audio.js') >= 0) { src = ss[i].src; break; }
          }
        }
      }
      if (src && src.indexOf('data:') !== 0) {
        var dir = src.replace(/[?#].*$/, '').replace(/[^\/]*$/, '');
        out.push(dir + '../../assets/audio/');
      }
    } catch (e) { /* ignore */ }
    out.push('/assets/audio/');
    out.push('assets/audio/');
    out.push('../assets/audio/');
    // 去重
    var uniq = [];
    for (var j = 0; j < out.length; j++) {
      if (uniq.indexOf(out[j]) < 0) uniq.push(out[j]);
    }
    basesCache = uniq;
    return uniq;
  }

  function xhrBuffer(url, cb) {
    try {
      if (typeof XMLHttpRequest === 'undefined') { cb(new Error('no xhr')); return; }
      var xhr = new XMLHttpRequest();
      xhr.open('GET', url, true);
      xhr.responseType = 'arraybuffer';
      xhr.timeout = 8000;
      xhr.onload = function () {
        if (xhr.status >= 200 && xhr.status < 300 && xhr.response && xhr.response.byteLength) {
          cb(null, xhr.response);
        } else {
          cb(new Error('http ' + xhr.status));
        }
      };
      xhr.onerror = function () { cb(new Error('xhr error')); };
      xhr.ontimeout = function () { cb(new Error('xhr timeout')); };
      xhr.send();
    } catch (e) {
      cb(e);
    }
  }

  function tryDev(name, def, fi, bi) {
    var bases = devBases();
    if (fi >= def.files.length) {
      loadState[name] = 'failed';
      return;
    }
    var file = def.files[fi];
    // 构建态：当前候选文件可能有内联 dataURI（例如主 ogg + iOS mp3 都内联时）
    if (bi === 0) {
      var uri = (fi === 0) ? findDataURI(name, file) : findDataURIByFile(file);
      if (uri) {
        var ab0 = null;
        try { ab0 = dataURItoBuffer(uri); } catch (e0) { ab0 = null; }
        if (ab0) {
          decodeBuffer(ab0, function (err0, buf0) {
            if (!err0 && buf0) {
              buffers[name] = buf0;
              loadState[name] = 'done';
              onLoaded(name);
            } else {
              tryDev(name, def, fi + 1, 0);
            }
          });
          return;
        }
      }
    }
    if (bi >= bases.length) {
      tryDev(name, def, fi + 1, 0);
      return;
    }
    xhrBuffer(bases[bi] + file, function (err, ab) {
      if (err || !ab) {
        tryDev(name, def, fi, bi + 1);
        return;
      }
      decodeBuffer(ab, function (err2, buf) {
        if (err2 || !buf) {
          tryDev(name, def, fi, bi + 1);
        } else {
          buffers[name] = buf;
          loadState[name] = 'done';
          onLoaded(name);
        }
      });
    });
  }

  // 环境音（雨声）不属于播放音效名，单独给一个文件定义
  var AMB_DEF = { files: ['ambience_rain.ogg'] };

  function loadSound(name) {
    var def = (name === 'ambience_rain') ? AMB_DEF : DEFS[name];
    if (!def || !def.files) return;
    if (loadState[name] === 'loading' || loadState[name] === 'done') return;
    loadState[name] = 'loading';
    // tryDev 内部：构建态 dataURI（音效名/文件名 key）→ 开发态 XHR → 下一个候选文件
    tryDev(name, def, 0, 0);
  }

  function onLoaded(name) {
    try {
      if (name === 'ambience_rain') {
        if (amb.want) {
          if (!amb.on) startAmbienceNow();
          else if (amb.mode === 'synth') switchAmbienceToBuffer();
        }
      }
    } catch (e) { /* ignore */ }
  }

  /* 错峰加载：先保证常用短音效，雨声稍后 */
  function staggerLoad() {
    var list = [];
    for (var i = 0; i < NAMES.length; i++) {
      if (DEFS[NAMES[i]] && DEFS[NAMES[i]].files) list.push(NAMES[i]);
    }
    var delay = 0;
    for (var k = 0; k < list.length; k++) {
      (function (n, d) {
        setTimeout(function () { try { loadSound(n); } catch (e) { /* ignore */ } }, d);
      })(list[k], delay);
      delay += 40;
    }
    // 雨声用于主菜单，优先级高，尽早解码（不阻塞短音效）
    setTimeout(function () {
      try { loadSound('ambience_rain'); } catch (e) { /* ignore */ }
    }, 80);
  }

  /* ------------------------------------------------------------
   * 6. 合成引擎
   * ------------------------------------------------------------ */

  function outChain(p, mult) {
    var g = ctx.createGain();
    g.gain.value = (mult === undefined ? 1 : mult) * p.gain;
    if (p.pan && ctx.createStereoPanner) {
      var sp = ctx.createStereoPanner();
      sp.pan.value = clamp(p.pan, -1, 1);
      g.connect(sp);
      sp.connect(p.dest);
      freeLater(g, p.dur || 3);
    } else {
      g.connect(p.dest);
      freeLater(g, p.dur || 3);
    }
    return g;
  }

  function mkOsc(type, freq, t, stopT) {
    var o = ctx.createOscillator();
    o.type = type;
    o.frequency.setValueAtTime(freq, t);
    o.start(t);
    o.stop(stopT);
    return o;
  }

  function mkNoise(t, stopT) {
    if (!noiseBuf) return null;
    var s = ctx.createBufferSource();
    s.buffer = noiseBuf;
    s.loop = true;
    s.start(t, Math.random() * 1.2);
    s.stop(stopT);
    return s;
  }

  function mkFilter(type, freq, q) {
    var f = ctx.createBiquadFilter();
    f.type = type;
    f.frequency.value = freq;
    if (q) f.Q.value = q;
    return f;
  }

  /* 包络：0 -> peak（atk 秒）-> 保持 -> 0（dur 秒内结束） */
  function env(g, t, peak, atk, dur, rel) {
    var pk = Math.max(0.0002, peak);
    g.gain.setValueAtTime(0.0001, t);
    g.gain.exponentialRampToValueAtTime(pk, t + Math.max(0.004, atk));
    var r = Math.max(0.02, rel || 0.05);
    var hold = t + dur - r;
    if (hold > t + atk) g.gain.setValueAtTime(pk, hold);
    g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    return g;
  }

  /* 合成音色表：每个函数创建自己的节点并接到 out（outChain 返回的 gain） */
  var SYNTH = {

    /* 0.3s 渐强充能（前摇） */
    laserCharge: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(140 * R, t);
      o.frequency.exponentialRampToValueAtTime(1500 * R, t + 0.26);
      var bp = mkFilter('bandpass', 500, 5);
      bp.frequency.setValueAtTime(500, t);
      bp.frequency.exponentialRampToValueAtTime(3200, t + 0.26);
      var e = ctx.createGain();
      env(e, t, 0.55, 0.2, 0.32, 0.06);
      o.connect(bp); bp.connect(e); e.connect(out);
      o.start(t); o.stop(t + 0.34);
      // 高频嘶声让"充能"更电
      var n = mkNoise(t, t + 0.32);
      if (n) {
        var hp = mkFilter('highpass', 2200, 0.7);
        var ne = ctx.createGain();
        env(ne, t, 0.16, 0.24, 0.31, 0.05);
        n.connect(hp); hp.connect(ne); ne.connect(out);
      }
    },

    /* 激光发射（文件缺失时兜底） */
    laserFire: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = mkOsc('sawtooth', 1800 * R, t, t + 0.2);
      o.frequency.exponentialRampToValueAtTime(180 * R, t + 0.16);
      var e = ctx.createGain();
      env(e, t, 0.6, 0.004, 0.18, 0.12);
      o.connect(e); e.connect(out);
      var n = mkNoise(t, t + 0.14);
      if (n) {
        var hp = mkFilter('highpass', 1200, 0.8);
        var ne = ctx.createGain();
        env(ne, t, 0.25, 0.002, 0.12, 0.09);
        n.connect(hp); hp.connect(ne); ne.connect(out);
      }
    },

    /* 成功反弹的金属 ping（叠加在 reflect.wav 上） */
    reflectPing: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var f1 = ctx.createOscillator(); f1.type = 'sine';
      f1.frequency.setValueAtTime(1400 * R, t); f1.start(t); f1.stop(t + 0.3);
      var f2 = ctx.createOscillator(); f2.type = 'sine';
      f2.frequency.setValueAtTime(2100 * R, t); f2.start(t); f2.stop(t + 0.3);
      var e1 = ctx.createGain(); env(e1, t, 0.22, 0.003, 0.26, 0.2);
      var e2 = ctx.createGain(); env(e2, t, 0.12, 0.002, 0.18, 0.15);
      f1.connect(e1); e1.connect(out);
      f2.connect(e2); e2.connect(out);
    },

    /* 反弹失败：下行嗡鸣 */
    reflectFail: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = mkOsc('square', 320 * R, t, t + 0.34);
      o.frequency.exponentialRampToValueAtTime(90 * R, t + 0.3);
      var lp = mkFilter('lowpass', 1400, 1.2);
      var e = ctx.createGain(); env(e, t, 0.4, 0.01, 0.32, 0.15);
      o.connect(lp); lp.connect(e); e.connect(out);
    },

    /* 低频闷响（boss_hit 叠加层 / 兜底） */
    thump: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = mkOsc('sine', 130 * R, t, t + 0.26);
      o.frequency.exponentialRampToValueAtTime(44 * R, t + 0.2);
      var e = ctx.createGain(); env(e, t, 0.55, 0.004, 0.24, 0.18);
      o.connect(e); e.connect(out);
      var n = mkNoise(t, t + 0.1);
      if (n) {
        var lp = mkFilter('lowpass', 320, 0.9);
        var ne = ctx.createGain(); env(ne, t, 0.25, 0.002, 0.09, 0.07);
        n.connect(lp); lp.connect(ne); ne.connect(out);
      }
    },

    /* BOSS 死亡兜底：爆炸 + 下沉低音 */
    bossDeath: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var n = mkNoise(t, t + 0.85);
      if (n) {
        var lp = mkFilter('lowpass', 900, 0.9);
        lp.frequency.setValueAtTime(900, t);
        lp.frequency.exponentialRampToValueAtTime(90, t + 0.8);
        var ne = ctx.createGain(); env(ne, t, 0.75, 0.005, 0.82, 0.5);
        n.connect(lp); lp.connect(ne); ne.connect(out);
      }
      var o = mkOsc('sine', 90 * R, t, t + 1.0);
      o.frequency.exponentialRampToValueAtTime(28 * R, t + 0.9);
      var oe = ctx.createGain(); env(oe, t, 0.45, 0.01, 0.95, 0.6);
      o.connect(oe); oe.connect(out);
    },

    /* 大招就绪：上行琶音 + 高频微光（叠加在 ult_ready.wav 上） */
    ultReady: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        var st = t + i * 0.055;
        var o = mkOsc('triangle', notes[i] * R, st, st + 0.55);
        var e = ctx.createGain(); env(e, st, 0.2, 0.008, 0.5, 0.35);
        o.connect(e); e.connect(out);
      }
      var sh = mkOsc('sine', 2637 * R, t + 0.12, t + 0.7);
      var se = ctx.createGain(); env(se, t + 0.12, 0.08, 0.05, 0.5, 0.4);
      sh.connect(se); se.connect(out);
    },

    /* 大招光束：2s 持续感（可 loop，返回 {stop()}） */
    ultBeam: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var per = p.loop ? 120 : 2.0;
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(220 * R, t);
      o1.frequency.exponentialRampToValueAtTime(880 * R, t + 0.55);
      var o2 = ctx.createOscillator(); o2.type = 'triangle';
      o2.frequency.setValueAtTime(222 * R, t);
      o2.frequency.exponentialRampToValueAtTime(884 * R, t + 0.55);
      var lp = mkFilter('lowpass', 3600, 1.1);
      lp.frequency.setValueAtTime(1400, t);
      lp.frequency.exponentialRampToValueAtTime(5200, t + 0.5);
      var e = ctx.createGain();
      var pk = 0.42;
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(pk, t + 0.12);
      if (!p.loop) {
        e.gain.setValueAtTime(pk, t + 1.45);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
      }
      // 缓慢呼吸颤音
      var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 6.5;
      var lg = ctx.createGain(); lg.gain.value = pk * 0.18;
      lfo.connect(lg); lg.connect(e.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(e); e.connect(out);
      o1.start(t); o2.start(t); lfo.start(t);
      var stopT = t + per;
      o1.stop(stopT); o2.stop(stopT); lfo.stop(stopT);
      // 噪声光束垫
      var n = mkNoise(t, stopT);
      if (n) {
        var bp = mkFilter('bandpass', 1800, 0.7);
        var ne = ctx.createGain();
        ne.gain.setValueAtTime(0.0001, t);
        ne.gain.exponentialRampToValueAtTime(0.12, t + 0.2);
        if (!p.loop) {
          ne.gain.setValueAtTime(0.12, t + 1.5);
          ne.gain.exponentialRampToValueAtTime(0.0001, t + 2.0);
        }
        n.connect(bp); bp.connect(ne); ne.connect(out);
      }
      if (p.loop) {
        return {
          stop: function () {
            try {
              var tt = ctx.currentTime;
              e.gain.cancelScheduledValues(tt);
              e.gain.setValueAtTime(e.gain.value, tt);
              e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.6);
              o1.stop(tt + 0.7); o2.stop(tt + 0.7); lfo.stop(tt + 0.7);
              if (n) { try { n.stop(tt + 0.7); } catch (e2) { /* ignore */ } }
            } catch (e3) { /* ignore */ }
          }
        };
      }
    },

    /* 复活：白光和弦（叠加在 revive.wav 上） */
    whiteLight: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var notes = [523.25, 659.25, 783.99, 1046.5];
      for (var i = 0; i < notes.length; i++) {
        var o = mkOsc('sine', notes[i] * R * (1 + (i - 1.5) * 0.0005), t, t + 1.25);
        var e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t + i * 0.05);
        e.gain.exponentialRampToValueAtTime(0.16, t + 0.18 + i * 0.05);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.15);
        o.connect(e); e.connect(out);
      }
      var sh = mkOsc('sine', 2093 * R, t, t + 1.1);
      var se = ctx.createGain(); env(se, t, 0.07, 0.25, 1.0, 0.7);
      sh.connect(se); se.connect(out);
    },

    /* 通关/升级琶音兜底（floor_clear 叠加层） */
    chimeUp: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var notes = [783.99, 987.77, 1174.66];
      for (var i = 0; i < notes.length; i++) {
        var st = t + i * 0.08;
        var o = mkOsc('sine', notes[i] * R, st, st + 0.6);
        var e = ctx.createGain(); env(e, st, 0.18, 0.006, 0.55, 0.4);
        o.connect(e); e.connect(out);
      }
    },

    /* 死亡：下坠低频 drone */
    deathDrone: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o1 = mkOsc('sawtooth', 55 * R, t, t + 1.5);
      o1.frequency.exponentialRampToValueAtTime(30 * R, t + 1.4);
      var o2 = mkOsc('sawtooth', 56.5 * R, t, t + 1.5);
      o2.frequency.exponentialRampToValueAtTime(31 * R, t + 1.4);
      var lp = mkFilter('lowpass', 420, 1.4);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.5, t + 0.15);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 1.5);
      o1.connect(lp); o2.connect(lp); lp.connect(e); e.connect(out);
      var n = mkNoise(t, t + 1.4);
      if (n) {
        var nf = mkFilter('bandpass', 300, 0.6);
        var ne = ctx.createGain(); env(ne, t, 0.16, 0.2, 1.3, 0.8);
        n.connect(nf); nf.connect(ne); ne.connect(out);
      }
    },

    uiTick: function (p) {
      var t = p.now, out = outChain(p, 1);
      var o = mkOsc('sine', 1500 * p.rate, t, t + 0.05);
      var e = ctx.createGain(); env(e, t, 0.22, 0.002, 0.045, 0.04);
      o.connect(e); e.connect(out);
    },

    uiPress: function (p) {
      var t = p.now, out = outChain(p, 1);
      var o1 = mkOsc('sine', 920 * p.rate, t, t + 0.08);
      o1.frequency.exponentialRampToValueAtTime(700 * p.rate, t + 0.06);
      var e1 = ctx.createGain(); env(e1, t, 0.26, 0.002, 0.07, 0.05);
      o1.connect(e1); e1.connect(out);
      var o2 = mkOsc('square', 460 * p.rate, t, t + 0.06);
      var lp = mkFilter('lowpass', 1600, 0.8);
      var e2 = ctx.createGain(); env(e2, t, 0.1, 0.002, 0.05, 0.04);
      o2.connect(lp); lp.connect(e2); e2.connect(out);
    },

    uiBack: function (p) {
      var t = p.now, out = outChain(p, 1);
      var o = mkOsc('sine', 720 * p.rate, t, t + 0.09);
      o.frequency.exponentialRampToValueAtTime(480 * p.rate, t + 0.07);
      var e = ctx.createGain(); env(e, t, 0.22, 0.003, 0.085, 0.06);
      o.connect(e); e.connect(out);
    },

    /* banner 叠加鼓点 */
    drumHit: function (p) {
      var t = p.now, out = outChain(p, 1);
      var o = mkOsc('sine', 105 * p.rate, t, t + 0.3);
      o.frequency.exponentialRampToValueAtTime(45 * p.rate, t + 0.22);
      var e = ctx.createGain(); env(e, t, 0.5, 0.003, 0.28, 0.22);
      o.connect(e); e.connect(out);
      var n = mkNoise(t, t + 0.12);
      if (n) {
        var lp = mkFilter('lowpass', 500, 0.8);
        var ne = ctx.createGain(); env(ne, t, 0.2, 0.002, 0.1, 0.08);
        n.connect(lp); lp.connect(ne); ne.connect(out);
      }
    },

    /* banner 兜底：鼓 + 铜管感和弦 */
    bannerFall: function (p) {
      SYNTH.drumHit(p);
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var chords = [220, 277.18, 329.63];
      for (var i = 0; i < chords.length; i++) {
        var o = mkOsc('sawtooth', chords[i] * R, t, t + 0.65);
        var lp = mkFilter('lowpass', 900 + i * 250, 0.9);
        var e = ctx.createGain(); env(e, t + 0.06, 0.14, 0.02, 0.6, 0.45);
        o.connect(lp); lp.connect(e); e.connect(out);
      }
    },

    /* 字幕/致谢垫音兜底 */
    creditsPad: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var notes = [220, 261.63, 329.63, 392];
      for (var i = 0; i < notes.length; i++) {
        var o = mkOsc('sine', notes[i] * R, t, t + 2.0);
        var e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, t);
        e.gain.exponentialRampToValueAtTime(0.1, t + (0.2 + i * 0.04));
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.9);
        o.connect(e); e.connect(out);
      }
    },

    /* 转场 stinger 兜底 */
    stingerFall: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = mkOsc('sawtooth', 180 * R, t, t + 1.0);
      o.frequency.exponentialRampToValueAtTime(1300 * R, t + 0.8);
      var lp = mkFilter('lowpass', 2200, 1.0);
      var e = ctx.createGain(); env(e, t, 0.35, 0.15, 0.95, 0.5);
      o.connect(lp); lp.connect(e); e.connect(out);
      var n = mkNoise(t, t + 1.0);
      if (n) {
        var bp = mkFilter('bandpass', 1200, 0.8);
        var ne = ctx.createGain(); env(ne, t, 0.18, 0.4, 0.95, 0.5);
        n.connect(bp); bp.connect(ne); ne.connect(out);
      }
    },

    /* 故障 glitch：采样保持方波 + 噪声脉冲 */
    glitch: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var steps = 12;
      for (var i = 0; i < steps; i++) {
        var st = t + i * 0.028;
        var f = (200 + Math.random() * 1800) * R;
        var o = mkOsc('square', f, st, st + 0.03);
        var e = ctx.createGain();
        e.gain.setValueAtTime(0.0001, st);
        e.gain.exponentialRampToValueAtTime(0.12 + Math.random() * 0.12, st + 0.002);
        e.gain.exponentialRampToValueAtTime(0.0001, st + 0.026);
        o.connect(e); e.connect(out);
      }
      var n = mkNoise(t, t + 0.4);
      if (n) {
        var bp = mkFilter('bandpass', 2200, 2.5);
        var ne = ctx.createGain();
        ne.gain.setValueAtTime(0.0001, t);
        ne.gain.exponentialRampToValueAtTime(0.2, t + 0.01);
        ne.gain.exponentialRampToValueAtTime(0.0001, t + 0.38);
        n.connect(bp); bp.connect(ne); ne.connect(out);
      }
    },

    /* 心跳：lub-dub */
    heartbeat: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      function beat(st, peak) {
        var o = mkOsc('sine', 62 * R, st, st + 0.3);
        o.frequency.exponentialRampToValueAtTime(34 * R, st + 0.22);
        var e = ctx.createGain(); env(e, st, peak, 0.004, 0.28, 0.22);
        o.connect(e); e.connect(out);
      }
      beat(t, 0.55);
      beat(t + 0.19, 0.38);
    },

    /* 护盾低鸣（可 loop，返回 {stop()}） */
    shieldHum: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var per = p.loop ? 120 : 1.6;
      var o1 = ctx.createOscillator(); o1.type = 'sawtooth';
      o1.frequency.setValueAtTime(88 * R, t);
      var o2 = ctx.createOscillator(); o2.type = 'sawtooth';
      o2.frequency.setValueAtTime(89.3 * R, t);
      var lp = mkFilter('lowpass', 420, 1.6);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.26, t + 0.25);
      if (!p.loop) {
        e.gain.setValueAtTime(0.26, t + 1.2);
        e.gain.exponentialRampToValueAtTime(0.0001, t + 1.6);
      }
      var lfo = ctx.createOscillator(); lfo.type = 'sine'; lfo.frequency.value = 4.2;
      var lg = ctx.createGain(); lg.gain.value = 0.05;
      lfo.connect(lg); lg.connect(e.gain);
      o1.connect(lp); o2.connect(lp); lp.connect(e); e.connect(out);
      o1.start(t); o2.start(t); lfo.start(t);
      var stopT = t + per;
      o1.stop(stopT); o2.stop(stopT); lfo.stop(stopT);
      if (p.loop) {
        return {
          stop: function () {
            try {
              var tt = ctx.currentTime;
              e.gain.cancelScheduledValues(tt);
              e.gain.setValueAtTime(e.gain.value, tt);
              e.gain.exponentialRampToValueAtTime(0.0001, tt + 0.5);
              o1.stop(tt + 0.6); o2.stop(tt + 0.6); lfo.stop(tt + 0.6);
            } catch (e2) { /* ignore */ }
          }
        };
      }
    },

    /* 挥剑：带通噪声扫频 */
    swordSlash: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var n = mkNoise(t, t + 0.24);
      if (!n) return;
      var bp = mkFilter('bandpass', 3000, 1.2);
      bp.frequency.setValueAtTime(3200, t);
      bp.frequency.exponentialRampToValueAtTime(320, t + 0.18);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.5, t + 0.012);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      n.connect(bp); bp.connect(e); e.connect(out);
    },

    /* 刺入：挥剑 + 闷击 + 金属泛音 */
    stab: function (p) {
      SYNTH.swordSlash(p);
      SYNTH.thump({ now: p.now + 0.02, rate: p.rate, gain: p.gain * 1.1, pan: p.pan, dest: p.dest });
      var t = p.now + 0.05, out = outChain(p, 1);
      var o = mkOsc('sine', 2400 * p.rate, t, t + 0.7);
      var e = ctx.createGain(); env(e, t, 0.18, 0.005, 0.65, 0.5);
      o.connect(e); e.connect(out);
      var o2 = mkOsc('sine', 3550 * p.rate, t, t + 0.5);
      var e2 = ctx.createGain(); env(e2, t, 0.09, 0.004, 0.45, 0.35);
      o2.connect(e2); e2.connect(out);
    },

    /* 标题坠落（title_fall 兜底） */
    titleFall: function (p) {
      var t = p.now, R = p.rate;
      var out = outChain(p, 1);
      var o = mkOsc('sawtooth', 620 * R, t, t + 0.9);
      o.frequency.exponentialRampToValueAtTime(55 * R, t + 0.85);
      var lp = mkFilter('lowpass', 1800, 1.1);
      lp.frequency.setValueAtTime(1800, t);
      lp.frequency.exponentialRampToValueAtTime(180, t + 0.85);
      var e = ctx.createGain(); env(e, t, 0.5, 0.01, 0.88, 0.5);
      o.connect(lp); lp.connect(e); e.connect(out);
      var n = mkNoise(t, t + 0.7);
      if (n) {
        var nl = mkFilter('lowpass', 600, 0.8);
        var ne = ctx.createGain(); env(ne, t, 0.3, 0.005, 0.65, 0.5);
        n.connect(nl); nl.connect(ne); ne.connect(out);
      }
    }
  };

  /* 按名字推断未知音效的兜底音色 */
  function inferSynth(name) {
    var n = String(name).toLowerCase();
    if (n.indexOf('laser') >= 0 || n.indexOf('beam') >= 0) return 'laserFire';
    if (n.indexOf('hit') >= 0 || n.indexOf('impact') >= 0 || n.indexOf('smash') >= 0) return 'thump';
    if (n.indexOf('death') >= 0 || n.indexOf('die') >= 0 || n.indexOf('horror') >= 0) return 'deathDrone';
    if (n.indexOf('revive') >= 0 || n.indexOf('heal') >= 0) return 'whiteLight';
    if (n.indexOf('ui') >= 0 || n.indexOf('click') >= 0 || n.indexOf('hover') >= 0 ||
        n.indexOf('tap') >= 0 || n.indexOf('select') >= 0) return 'uiTick';
    if (n.indexOf('slash') >= 0 || n.indexOf('sword') >= 0) return 'swordSlash';
    if (n.indexOf('explode') >= 0 || n.indexOf('boom') >= 0) return 'bossDeath';
    return 'uiTick';
  }

  function synth(kind, p) {
    try {
      var fn = SYNTH[kind] || SYNTH.uiTick;
      return fn(p) || null;
    } catch (e) {
      return null;
    }
  }

  /* ------------------------------------------------------------
   * 7. 播放
   * ------------------------------------------------------------ */

  function playBuffer(buf, p) {
    try {
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.playbackRate.value = clamp(p.rate, 0.5, 2.0);
      var g = ctx.createGain();
      g.gain.value = p.gain;
      var chain = g;
      if (p.pan && ctx.createStereoPanner) {
        var sp = ctx.createStereoPanner();
        sp.pan.value = clamp(p.pan, -1, 1);
        g.connect(sp);
        sp.connect(master);
        freeLater(g, buf.duration / clamp(p.rate, 0.5, 2) + 0.3);
      } else {
        g.connect(master);
        freeLater(g, buf.duration / clamp(p.rate, 0.5, 2) + 0.3);
      }
      src.connect(chain);
      src.start(p.now);
      active++;
      setTimeout(function () { active = Math.max(0, active - 1); }, (buf.duration / clamp(p.rate, 0.5, 2) + 0.4) * 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  function play(name, opts) {
    try {
      if (!name || typeof name !== 'string') return false;
      if (!AudioCtx) return false;
      var o = opts || {};
      var t = nowMs();

      // 上下文还没建立 / 未解锁：排队（最多 8 条，1.2s 内有效；否则静默丢弃）
      if (!ctx || !unlocked || ctx.state !== 'running') {
        if (pending.length < 8) pending.push({ name: name, opts: o, t: t });
        try {
          if (ctx && ctx.state === 'suspended' && ctx.resume) ctx.resume();
        } catch (e) { /* ignore */ }
        return false;
      }
      if (muted) return false;
      if (active >= MAX_ACTIVE) return false;

      var def = DEFS[name];
      var p = {
        now: ctx.currentTime + 0.004,
        gain: num(o.volume, 1) * (def ? def.gain : 0.4),
        pan: num(o.pan, 0),
        rate: clamp(num(o.rate, 1), 0.5, 2.0),
        dest: master,
        loop: !!o.loop,
        dur: 2
      };

      // 未知音效名：静默合成兜底（绝不报错）
      if (!def) {
        active++;
        setTimeout(function () { active = Math.max(0, active - 1); }, 1200);
        synth(inferSynth(name), p);
        return true;
      }

      // 循环持续音（ult_beam / shield_hum）
      if (def.synth && def.loopable && o.loop) {
        p.dur = 130;   // 循环音不自动释放
        var handle = synth(def.synth, p);
        if (handle && handle.stop) return handle;
        return false;
      }

      // 纯合成音效
      if (def.synth && !def.files) {
        active++;
        setTimeout(function () { active = Math.max(0, active - 1); }, 2200);
        synth(def.synth, p);
        return true;
      }

      // 文件音效（若尚未加载或曾失败，顺手重试一次，失败则用合成兜底）
      if (def.files && !buffers[name]) {
        if (loadState[name] !== 'loading' && loadState[name] !== 'done') {
          if (!loadRetry[name] || loadRetry[name] < 2) {
            loadRetry[name] = (loadRetry[name] || 0) + 1;
            loadState[name] = 'idle';
            try { loadSound(name); } catch (e) { /* ignore */ }
          }
        }
      }
      var buf = buffers[name];
      var played = false;
      if (buf) {
        played = playBuffer(buf, p);
      }
      if (played) {
        if (def.layer) synth(def.layer, p);
        return true;
      }
      // 文件未就绪/加载失败 → 合成兜底
      active++;
      setTimeout(function () { active = Math.max(0, active - 1); }, 2200);
      synth(def.fallback || def.synth || 'uiTick', p);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 8. 对话语音 blip
   *    hero：低音短 blip（三角波 200–260Hz）
   *    boss：高音急促 blip（方波 600–780Hz）
   *    打字机每字符调用时，每 2~3 个字符才响一次；调用间隔较慢时每次都响。
   * ------------------------------------------------------------ */
  function voice(who) {
    try {
      if (!AudioCtx || !ctx || !unlocked || ctx.state !== 'running') return false;
      if (muted) return false;
      var isBoss = (who === 'boss');
      var key = isBoss ? 'boss' : 'hero';
      var st = voiceState[key];
      if (!st) {
        st = { last: -99, count: 0 };
        voiceState[key] = st;
      }
      var t = ctx.currentTime;
      var dt = t - st.last;
      // 最小间隔 45~75ms：打字机 26ms/字符时约等于“每 2~3 个字符响一次”；
      // 调用间隔较长（一句话只调一次）时每次都响；同帧连续调用时每 2 次兜底响一次。
      var gap = 0.045 + Math.random() * 0.03;
      var doPlay = false;
      if (dt >= gap) {
        doPlay = true;
        st.count = 0;
      } else {
        st.count++;
        if (st.count >= 2) {
          doPlay = true;
          st.count = 0;
        }
      }
      if (!doPlay) return false;
      st.last = t;

      // 随机音高，避免机械感
      var base = isBoss ? 660 : 250;
      var f = base * (0.88 + Math.random() * 0.26);
      var dur = isBoss ? 0.042 : 0.065;
      var out = ctx.createGain();
      out.gain.value = isBoss ? 0.16 : 0.2;
      out.connect(master);
      freeLater(out, dur + 0.4);

      var o = ctx.createOscillator();
      o.type = isBoss ? 'square' : 'triangle';
      o.frequency.setValueAtTime(f, t);
      if (isBoss) {
        o.frequency.exponentialRampToValueAtTime(f * 0.82, t + dur);
      } else {
        o.frequency.exponentialRampToValueAtTime(f * 1.04, t + dur);
      }
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(1, t + 0.008);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      var filter = mkFilter(isBoss ? 'bandpass' : 'lowpass', isBoss ? 1500 : 900, isBoss ? 1.4 : 0.7);
      o.connect(filter); filter.connect(e); e.connect(out);
      o.start(t); o.stop(t + dur + 0.02);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 9. 环境音：雨声（菜单，约 -24dB）
   * ------------------------------------------------------------ */
  var AMB_GAIN = 0.062;   // ≈ -24dBFS
  var amb = { on: false, want: false, gain: null, src: null, mode: null, synthNodes: null };

  function ambBus(peak, fadeIn) {
    var g = ctx.createGain();
    g.gain.value = 0.0001;
    g.connect(master);
    var t = ctx.currentTime;
    g.gain.setValueAtTime(0.0001, t);
    g.gain.linearRampToValueAtTime(peak, t + fadeIn);
    return g;
  }

  function startRainBuffer() {
    try {
      var buf = buffers.ambience_rain;
      if (!buf || !ctx) return false;
      var src = ctx.createBufferSource();
      src.buffer = buf;
      src.loop = true;
      var lp = mkFilter('lowpass', 6800, 0.7);
      var g = ambBus(AMB_GAIN, 1.8);
      src.connect(lp); lp.connect(g);
      src.start(0);
      amb.src = src; amb.gain = g; amb.mode = 'buffer'; amb.synthNodes = null;
      return true;
    } catch (e) {
      return false;
    }
  }

  function startRainSynth() {
    try {
      if (!noiseBuf || !ctx) return false;
      var src = ctx.createBufferSource();
      src.buffer = noiseBuf;
      src.loop = true;
      var bp = mkFilter('bandpass', 1100, 0.5);
      var hp = mkFilter('highpass', 380, 0.7);
      var g = ambBus(AMB_GAIN * 1.5, 1.6);
      src.connect(bp); bp.connect(hp); hp.connect(g);
      src.start(0, Math.random() * 1.5);
      amb.src = src; amb.gain = g; amb.mode = 'synth';
      return true;
    } catch (e) {
      return false;
    }
  }

  function startAmbienceNow() {
    if (!ctx || !unlocked) return false;
    if (amb.on) return true;
    amb.on = true;
    amb.want = true;
    // 若文件已就绪用真实雨声；否则先用合成雨声，解码完成后再无缝切换
    var ok = false;
    if (buffers.ambience_rain) ok = startRainBuffer();
    if (!ok) ok = startRainSynth();
    return ok;
  }

  function switchAmbienceToBuffer() {
    try {
      if (!amb.on || amb.mode === 'buffer') return;
      var oldGain = amb.gain;
      var oldSrc = amb.src;
      // 合成雨声淡出
      if (oldGain) {
        var t0 = ctx.currentTime;
        oldGain.gain.cancelScheduledValues(t0);
        oldGain.gain.setValueAtTime(oldGain.gain.value, t0);
        oldGain.gain.linearRampToValueAtTime(0.0001, t0 + 0.9);
      }
      setTimeout(function () {
        try { if (oldSrc && oldSrc.stop) oldSrc.stop(); } catch (e) { /* ignore */ }
        safeDisconnect(oldGain);
      }, 1000);
      startRainBuffer();
    } catch (e) { /* ignore */ }
  }

  function stopAmbienceNow(fadeSec) {
    try {
      if (!amb) return false;
      amb.want = false;
      if (!amb.on) return true;
      amb.on = false;
      var g = amb.gain, src = amb.src, nodes = amb.synthNodes;
      amb.gain = null; amb.src = null; amb.synthNodes = null; amb.mode = null;
      var t = ctx ? ctx.currentTime : 0;
      var fade = fadeSec === undefined ? 0.9 : fadeSec;
      if (g) {
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0.0001, t + fade);
        } catch (e) { /* ignore */ }
      }
      setTimeout(function () {
        try { if (src && src.stop) src.stop(); } catch (e) { /* ignore */ }
        if (nodes) for (var i = 0; i < nodes.length; i++) safeDisconnect(nodes[i]);
        safeDisconnect(g);
      }, (fade + 0.2) * 1000);
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 10. 战斗音乐（100BPM 低频脉冲循环，平滑淡入淡出）
   * ------------------------------------------------------------ */
  var STEP = 0.15;         // 100BPM 的 16 分音符
  var STEPS = 32;
  var music = { on: false, want: false, gain: null, timer: null, step: 0, next: 0 };

  function musicBass(t, freq, vol) {
    try {
      var o = ctx.createOscillator();
      o.type = 'sawtooth';
      o.frequency.setValueAtTime(freq, t);
      var lp = mkFilter('lowpass', 260, 1.6);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(vol, t + 0.014);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.2);
      o.connect(lp); lp.connect(e); e.connect(music.gain);
      o.start(t); o.stop(t + 0.24);
    } catch (e) { /* ignore */ }
  }

  function musicKick(t) {
    try {
      var o = ctx.createOscillator();
      o.type = 'sine';
      o.frequency.setValueAtTime(112, t);
      o.frequency.exponentialRampToValueAtTime(42, t + 0.13);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.42, t + 0.006);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.16);
      o.connect(e); e.connect(music.gain);
      o.start(t); o.stop(t + 0.18);
    } catch (e) { /* ignore */ }
  }

  function musicHat(t, vol) {
    try {
      var n = mkNoise(t, t + 0.06);
      if (!n) return;
      var hp = mkFilter('highpass', 7200, 0.8);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(vol, t + 0.004);
      e.gain.exponentialRampToValueAtTime(0.0001, t + 0.045);
      n.connect(hp); hp.connect(e); e.connect(music.gain);
    } catch (e) { /* ignore */ }
  }

  function musicPad(t, root, dur) {
    try {
      var lp = mkFilter('lowpass', 620, 0.9);
      var e = ctx.createGain();
      e.gain.setValueAtTime(0.0001, t);
      e.gain.exponentialRampToValueAtTime(0.055, t + 0.35);
      e.gain.exponentialRampToValueAtTime(0.0001, t + dur);
      lp.connect(e); e.connect(music.gain);
      var ratios = [1, 1.5, 2];
      for (var i = 0; i < ratios.length; i++) {
        var o = ctx.createOscillator();
        o.type = 'sawtooth';
        o.frequency.setValueAtTime(root * ratios[i] * (1 + i * 0.0015), t);
        o.connect(lp);
        o.start(t); o.stop(t + dur + 0.05);
      }
    } catch (e) { /* ignore */ }
  }

  function scheduleStep(step, t) {
    try {
      if (step % 8 === 0) musicBass(t, 55, 0.3);          // A1
      if (step % 8 === 3) musicBass(t, 41.2, 0.26);       // E1
      if (step % 4 === 2) musicBass(t, 82.41, 0.13);      // E2 弱拍
      if (step % 8 === 0 || step % 8 === 6) musicKick(t);
      if (step % 2 === 1) musicHat(t, 0.075);
      if (step === 0) musicPad(t, 110, 2.4);               // Am
      if (step === 16) musicPad(t, 87.31, 2.4);            // F
    } catch (e) { /* ignore */ }
  }

  function musicTick() {
    if (!ctx || !music.on) return;
    try {
      var horizon = ctx.currentTime + 0.18;
      var guard = 0;
      while (music.next < horizon && guard < 64) {
        scheduleStep(music.step, music.next);
        music.next += STEP;
        music.step = (music.step + 1) % STEPS;
        guard++;
      }
    } catch (e) { /* ignore */ }
  }

  function startBattleMusic() {
    try {
      if (!AudioCtx) return false;
      if (!ctx || !unlocked || ctx.state !== 'running') {
        music.want = true;
        // 如果连 ctx 都还没有，等 init 后自动开始
        return false;
      }
      if (music.on) return true;
      music.on = true;
      music.want = false;
      music.gain = ctx.createGain();
      music.gain.gain.value = 0.0001;
      music.gain.connect(master);
      var t = ctx.currentTime;
      music.gain.gain.setValueAtTime(0.0001, t);
      music.gain.gain.linearRampToValueAtTime(0.5, t + 1.2);
      music.step = 0;
      music.next = t + 0.08;
      if (music.timer) clearInterval(music.timer);
      music.timer = setInterval(musicTick, 25);
      musicTick();
      return true;
    } catch (e) {
      return false;
    }
  }

  function stopBattleMusic() {
    try {
      music.want = false;
      if (!ctx || !music.on) return true;
      music.on = false;
      if (music.timer) {
        clearInterval(music.timer);
        music.timer = null;
      }
      var g = music.gain;
      music.gain = null;
      if (g) {
        var t = ctx.currentTime;
        try {
          g.gain.cancelScheduledValues(t);
          g.gain.setValueAtTime(g.gain.value, t);
          g.gain.linearRampToValueAtTime(0.0001, t + 0.85);
        } catch (e) { /* ignore */ }
        setTimeout(function () { safeDisconnect(g); }, 1000);
      }
      return true;
    } catch (e) {
      return false;
    }
  }

  /* ------------------------------------------------------------
   * 11. 静音
   * ------------------------------------------------------------ */
  function setMuted(v) {
    try {
      muted = !!v;
      if (ctx && master) {
        var t = ctx.currentTime;
        master.gain.cancelScheduledValues(t);
        master.gain.setValueAtTime(Math.max(0.0001, master.gain.value), t);
        master.gain.linearRampToValueAtTime(muted ? 0.0001 : MASTER_GAIN, t + 0.06);
      }
      return muted;
    } catch (e) {
      return muted;
    }
  }

  /* ------------------------------------------------------------
   * 12. 公共 API
   * ------------------------------------------------------------ */
  var API = {
    version: '1.0.0',
    ready: false,
    names: NAMES.slice(),

    init: function () { return init(); },

    play: function (name, opts) { return play(name, opts); },

    voice: function (who) { return voice(who); },

    startAmbience: function () {
      try {
        if (!AudioCtx) return false;
        if (!ctx || !unlocked || ctx.state !== 'running') {
          // 未解锁：安全忽略，只记下意图；init 解锁后会自动开始
          amb.want = true;
          return false;
        }
        return startAmbienceNow();
      } catch (e) { return false; }
    },

    stopAmbience: function () { return stopAmbienceNow(0.9); },

    startBattleMusic: function () { return startBattleMusic(); },

    stopBattleMusic: function () { return stopBattleMusic(); },

    setMuted: function (v) { return setMuted(v); },

    isMuted: function () { return muted; },

    toggleMute: function () { return setMuted(!muted); },

    /* 额外便利接口（不破坏契约）：查询某音效是否有真实音频文件 */
    hasFile: function (name) { return !!(DEFS[name] && DEFS[name].files); }
  };

  Object.defineProperty(API, 'ready', {
    get: function () { return ready; },
    enumerable: true,
    configurable: true
  });

  W.DHAudio = API;
  // 兼容 Lead 游戏代码里的 window.DH.Audio 命名（契约是 window.DHAudio，二者同一对象）
  try {
    W.DH = W.DH || {};
    if (!W.DH.Audio) W.DH.Audio = API;
  } catch (e) { /* ignore */ }

  /* ------------------------------------------------------------
   * 13. 自动解锁：首次手势即 init（Lead 也会主动调用，幂等）
   * ------------------------------------------------------------ */
  try {
    if (typeof document !== 'undefined' && document.addEventListener) {
      var installed = false;
      function removeGesture() {
        if (!installed) return;
        installed = false;
        try {
          document.removeEventListener('pointerdown', onGesture, true);
          document.removeEventListener('touchstart', onGesture, true);
          document.removeEventListener('keydown', onGesture, true);
          document.removeEventListener('mousedown', onGesture, true);
        } catch (e) { /* ignore */ }
      }
      function onGesture() {
        try { init(); } catch (e) { /* ignore */ }
        if (unlocked) removeGesture();
      }
      installed = true;
      document.addEventListener('pointerdown', onGesture, true);
      document.addEventListener('touchstart', onGesture, true);
      document.addEventListener('keydown', onGesture, true);
      document.addEventListener('mousedown', onGesture, true);
    }
  } catch (e) { /* ignore */ }

  /* 导出内部自检信息（调试用，不影响游戏） */
  API._debug = function () {
    return {
      hasCtx: !!ctx,
      unlocked: unlocked,
      muted: muted,
      state: ctx ? ctx.state : 'none',
      loaded: Object.keys(buffers),
      failed: Object.keys(loadState).filter(function (k) { return loadState[k] === 'failed'; }),
      ambience: amb ? amb.mode : null,
      music: music.on,
      pending: pending.length
    };
  };
})(typeof window !== 'undefined' ? window : this);
