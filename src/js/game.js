/* ============================================================
   game.js —— 战斗主循环：像素 BOSS / 量子护盾 / 弹反 / 靈
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var U = DH.U;

  var WINDUP = 0.30;          // 红眼前摇
  var WINDOW_EXTRA = 0.10;    // 前摇后额外 0.1s 判定
  var BEAM_TRAVEL = 0.18;     // 激光飞行动画（可见）
  var BOUNCE_TRAVEL = 0.18;   // 反弹飞行
  var RECOVER = 0.48;
  var REFLECT_DMG = 15;
  var ULT_DMG = REFLECT_DMG * 10; // 150
  var HERO_MAX = 100;
  var BOSS_HIT = 33;
  var KEY_FLOORS = {1:1,11:1,22:1,33:1,44:1,50:1,55:1,66:1,77:1,88:1,98:1,99:1};

  var G = {
    active:false, paused:false, dev:false, floor:1, seq:0,
    bossMax:100, bossHP:100, heroHP:HERO_MAX,
    charges:0, ultReady:false, combo:0,
    state:'idle', stateT:0,
    attackTimer:0, reflected:false, beam:null,
    bossExpr:'smug', bossFlash:0, bossHurt:0, heroHurt:0,
    ultT:0, ultAcc:0, ultShown:0,
    reviveT:0, clearing:false, dying:false,
    t:0, lastNow:0, dpr:1, cw:0, ch:0,
    layout:null, bgDustT:0, coolUntil:0, lastWinState:false,
    dlg:{ timer:2.2, plotIdx:0, lastWho:null, introLeft:0, introTimer:0, introMode:false, key:false },
    hintShown:false, ending:false, freeze:false,
    qa:{ auto:false, ending:false, fast:false }
  };
  var canvas, ctx;
  var els = {};

  // ============================ 尺寸/布局 ============================
  function resize(){
    if(!canvas) return;
    var vv = window.visualViewport;
    var w = Math.round(window.innerWidth || 0);
    var h = Math.round((vv && vv.height) || window.innerHeight || 0);
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    G.dpr = dpr; G.cw = w; G.ch = h;
    canvas.width = Math.round(w * dpr);
    canvas.height = Math.round(h * dpr);
    canvas.style.width = w + 'px';
    canvas.style.height = h + 'px';
    ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    var portrait = h > w * 1.12;
    var bossSize = portrait ? Math.min(w * 0.56, h * 0.30) : Math.min(w * 0.32, h * 0.56);
    var heroH = portrait ? Math.min(h * 0.20, w * 0.46) : Math.min(h * 0.30, w * 0.20);
    heroH = Math.max(heroH, 96);
    var heroX = portrait ? w * 0.19 : w * 0.17;
    var heroFeet = portrait ? h * 0.80 : h * 0.86;
    var bossX = portrait ? w * 0.72 : w * 0.80;
    var bossY = portrait ? h * 0.405 : h * 0.42;
    G.layout = {
      portrait:portrait,
      boss:{ x:bossX, y:bossY, size:bossSize, bob:bossSize * 0.012 },
      hero:{ x:heroX, feet:heroFeet, h:heroH },
      shield:{ x:heroX + heroH * 0.30, y:heroFeet - heroH * 0.50, r:heroH * 0.27 }
    };
    // 背景 cover
    var im = DH.Assets.img('bg_arena');
    if(im && im.naturalWidth){
      var sc = Math.max(w / im.naturalWidth, h / im.naturalHeight) * 1.06;
      G.bg = { x:(w - im.naturalWidth * sc) / 2, y:(h - im.naturalHeight * sc) / 2, w:im.naturalWidth * sc, h:im.naturalHeight * sc };
    } else G.bg = { x:0, y:0, w:w, h:h };
  }

  // ============================ 初始化 ============================
  function init(){
    canvas = document.getElementById('scene');
    if(!canvas) return;
    ctx = canvas.getContext('2d', {alpha:false, desynchronized:false}) || canvas.getContext('2d');
    els = {
      floor: document.getElementById('hud-floor'),
      arc: document.getElementById('hud-arc'),
      bossFill: document.getElementById('boss-hp-fill'),
      bossTxt: document.getElementById('boss-hp-txt'),
      heroFill: document.getElementById('hero-hp-fill'),
      charge: document.getElementById('charge-pips'),
      combo: document.getElementById('combo-chip'),
      reflect: document.getElementById('btn-reflect'),
      ult: document.getElementById('btn-ult'),
      exit: document.getElementById('btn-exit'),
      pause: document.getElementById('pause'),
      resume: document.getElementById('btn-resume'),
      quit: document.getElementById('btn-quit'),
      pauseSub: document.getElementById('pause-sub'),
      subtitle: document.getElementById('subtitle')
    };
    // 充能点
    if(els.charge){
      els.charge.innerHTML = '';
      for(var i=0;i<5;i++){
        var d = document.createElement('i');
        d.className = 'pip';
        els.charge.appendChild(d);
      }
    }
    // 按钮
    if(els.reflect){
      var press = function(e){ if(e && e.preventDefault) e.preventDefault(); reflectPressed('btn'); };
      els.reflect.addEventListener('pointerdown', press);
      els.reflect.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    }
    if(els.ult) els.ult.addEventListener('pointerdown', function(e){ if(e && e.preventDefault) e.preventDefault(); tryUlt(); });
    if(els.exit) els.exit.addEventListener('pointerdown', function(e){ if(e) e.preventDefault(); togglePause(true); });
    if(els.resume) els.resume.addEventListener('click', function(){ togglePause(false); });
    if(els.quit) els.quit.addEventListener('click', function(){ togglePause(false); if(DH.App) DH.App.exitToMenu(); });
    window.addEventListener('resize', resize);
    window.addEventListener('orientationchange', function(){ setTimeout(resize, 220); });
    resize();
    updateHud();
  }

  // ============================ 开始 ============================
  function start(opts){
    opts = opts || {};
    G.active = true;
    G.paused = false;
    G.dev = !!opts.dev;
    var qs = location.search || '';
    G.qa.auto = qs.indexOf('qa=1') >= 0;
    G.qa.ending = qs.indexOf('qa=ending') >= 0;
    G.qa.fast = qs.indexOf('qa=fast') >= 0;
    G.floorStart = performance.now();
    G.seq++;
    G.floor = Math.max(1, Math.min(99, opts.floor || 1));
    G.heroHP = HERO_MAX;
    G.charges = 0; G.ultReady = false; G.combo = 0;
    G.beam = null; G.reflected = false; G.clearing = false; G.dying = false; G.ending = false;
    G.bossExpr = 'smug'; G.bossFlash = 0;
    G.t = 0; G.lastNow = performance.now();
    DH.FX.reset();
    resize();
    if(els.pause) els.pause.classList.add('hidden');
    if(els.subtitle) els.subtitle.classList.add('hidden');
    if(DH.Sub) DH.Sub.clear();
    startFloor(G.floor, true);
    if((location.search||'').indexOf('pose=') >= 0){ setTimeout(applyPose, 1900); }
    if(DH.Audio) DH.Audio.startBattleMusic();
  }

  function stop(){
    G.active = false;
    G.paused = false;
    G.seq++;
    if(DH.Sub) DH.Sub.clear();
    if(DH.FX) DH.FX.reset();
    if(els.pause) els.pause.classList.add('hidden');
  }

  function startFloor(floor, fresh){
    G.floor = floor;
    G.bossMax = 100 + 20 * (floor - 1);
    G.bossHP = G.bossMax;
    G.heroHP = HERO_MAX;
    G.charges = 0; G.ultReady = false; G.combo = 0;
    G.state = 'intro'; G.stateT = 0;
    G.attackTimer = 1.2;
    G.dying = false; G.clearing = false;
    G.beam = null; G.reflected = false;
    G.bossExpr = 'smug';
    var f = getFloorData(floor);
    G.dlg.plotIdx = 0;
    G.dlg.timer = 1.6;
    G.dlg.introMode = !!KEY_FLOORS[floor] && !(DH._speed > 1);
    G.dlg.introLeft = G.dlg.introMode ? 4 : 0;
    G.dlg.introTimer = 1.35;
    G.dlg.lastWho = null;
    updateHud();
    var mech = DH.UI.floorTitle(floor, f ? (f.arcName + ' · ' + f.mood) : '', {hold:1050});
    if(DH.Audio) DH.Audio.play('floor_clear');
    // 层标题结束后进入对战
    mech.then(function(){
      if(!G.active) return;
      if(!G.dlg.introMode){ G.state = 'playing'; G.attackTimer = 1.1; }
    });
    if(DH.App) DH.App.recordFloor(floor);
    if(floor === 1 && !G.dev && DH.Save.data.deaths > 0){
      // 记忆不清零：BOSS 记得
      setTimeout(function(){
        if(!G.active || G.floor !== 1) return;
        var n = DH.Save.data.deaths + 1;
        DH.Sub.say('boss', '哟，老朋友。第 ' + n + ' 次了。我记得，你记得吗？');
      }, 2600);
    }
    if(floor === 99 && !fresh) {
      setTimeout(function(){
        if(!G.active) return;
        DH.Sub.say('boss', '九十九层。轮回之间。欢迎来到塔的嗓子眼。');
      }, 2600);
    }
  }

  function getFloorData(n){
    var D = window.DH_DATA;
    if(!D || !D.floors) return null;
    return D.floors[n-1] || null;
  }

  // ============================ 对话 ============================
  function banterList(cat){
    var D = window.DH_DATA;
    if(!D || !D.banter) return [];
    var f = getFloorData(G.floor);
    var arc = f ? f.arc : 1;
    var pool = D.banter[arc] || D.banter[1];
    if(!pool) return [];
    var out = [];
    var catPool = pool[cat] || (cat === 'chat' ? pool.taunt : null) || pool.taunt;
    if(!catPool) return [];
    function add(who, arr){
      if(!arr) return;
      for(var i=0;i<arr.length;i++){
        var item = arr[i];
        if(typeof item === 'string') out.push({who:who, text:item});
        else if(item && item.text) out.push({who:item.who || who, text:item.text});
      }
    }
    add('boss', catPool.boss);
    add('hero', catPool.hero);
    return out;
  }

  function maybeSay(who, text){
    if(!DH.Sub || !text) return;
    if(G.clearing || G.dying || G.ending) return;
    DH.Sub.say(who, text);
  }

  function pickDialogue(){
    var f = getFloorData(G.floor);
    if(!f) return null;
    var lines = f.lines || [];
    var plotLeft = G.dlg.plotIdx < lines.length;
    var roll = Math.random();
    var line = null;
    if(plotLeft && (roll < 0.4 || G.dlg.plotIdx < 2)){
      line = lines[G.dlg.plotIdx++];
    } else {
      var wantChat = roll > 0.9;
      var pool = banterList(wantChat ? 'chat' : 'taunt');
      if(!pool.length) pool = banterList('taunt');
      if(pool.length){
        var filtered = pool.filter(function(l){ return l.who !== G.dlg.lastWho; });
        line = U.pick(filtered.length ? filtered : pool);
      } else if(plotLeft){
        line = lines[G.dlg.plotIdx++];
      }
    }
    if(!line) return null;
    if(typeof line === 'string') line = {who:'boss', text:line};
    return line;
  }

  function dialogueTick(dt){
    if(!DH.Sub) return;
    if(G.state === 'dying' || G.ending) return;
    if(G.dlg.introMode && G.state === 'intro'){
      G.dlg.introTimer -= dt;
      if(G.dlg.introTimer <= 0 && DH.Sub.isIdle() && G.dlg.introLeft > 0){
        var l = pickDialogue();
        if(l){
          G.dlg.lastWho = l.who;
          maybeSay(l.who, l.text);
          G.dlg.introLeft--;
          G.dlg.introTimer = 0.45;
        } else {
          G.dlg.introLeft = 0;
        }
      }
      if(G.dlg.introLeft <= 0 && G.state === 'intro'){
        G.state = 'playing';
        G.attackTimer = 1.0;
        G.dlg.timer = 1.4;
      }
      return;
    }
    if(G.state !== 'playing' && G.state !== 'fire' && G.state !== 'recover') return;
    G.dlg.timer -= dt;
    if(G.dlg.timer <= 0){
      if(DH.Sub.isIdle()){
        var line = pickDialogue();
        if(line){
          G.dlg.lastWho = line.who;
          maybeSay(line.who, line.text);
        }
        G.dlg.timer = Math.max(2.5, 4.6 - G.floor * 0.014) + U.rand(-0.4, 1.0);
      } else {
        G.dlg.timer = 0.6;
      }
    }
  }

  // ============================ 攻击流程 ============================
  function nextAttackDelay(){
    var base = Math.max(1.32, 2.35 - G.floor * 0.0075);
    return base + U.rand(-0.22, 0.5);
  }

  function beginWindup(){
    G.state = 'windup';
    G.stateT = 0;
    G.reflected = false;
    G.bossExpr = 'red';
    if(DH.Audio) DH.Audio.play('laser_charge');
    // 红眼预警粒子
    var L = G.layout;
    var ep = eyePos('a');
    DH.FX.spark(ep.x, ep.y, {n:6, col:'#ff5c72', spd:90, spdMin:20, grav:-20});
  }

  function eyePos(which){
    var L = G.layout, b = L.boss;
    var sz = b.size;
    var bob = Math.sin(G.t * 1.35) * b.bob;
    var ox = which === 'a' ? -sz * 0.125 : sz * 0.125;
    return { x:b.x + ox, y:b.y + bob - sz * 0.02 };
  }

  function fireLaser(){
    G.state = 'fire';
    G.stateT = 0;
    var ep = eyePos(U.chance(.55) ? 'a' : 'b');
    var sh = G.layout.shield;
    G.beam = { phase:'toHero', t:0, dur:BEAM_TRAVEL, sx:ep.x, sy:ep.y, ex:sh.x, ey:sh.y };
    if(DH.Audio) DH.Audio.play('laser_fire');
    DH.FX.ring(ep.x, ep.y, 4, 50, .35, 'rgba(255,255,255,.8)', 2);
    DH.FX.spark(ep.x, ep.y, {n:14, col:'#f4f7fb', spd:240, spdMin:80});
    G.bossExpr = 'angry';
  }

  function resolveHeroHit(){
    if(G.beam && G.beam.phase === 'toHero'){
      // 是否已成功弹反？
      if(G.reflected){
        // 反弹
        var sh = G.layout.shield;
        var ep = eyePos('a');
        G.beam = { phase:'toBoss', t:0, dur:BOUNCE_TRAVEL, sx:sh.x, sy:sh.y, ex:ep.x, ey:ep.y };
        if(DH.Audio) DH.Audio.play('reflect');
        DH.FX.ring(sh.x, sh.y, 8, 110, .5, 'rgba(255,255,255,.95)', 3);
        DH.FX.spark(sh.x, sh.y, {n:26, col:'#f4f7fb', spd:420, spdMin:120});
        DH.FX.shake(6, .22);
        flashShield();
      } else {
        G.beam = null;
        hitHero();
        recover();
      }
    }
  }

  function resolveBossHit(){
    if(!G.beam || G.beam.phase !== 'toBoss') return;
    var ep = G.beam.ex, ey = G.beam.ey;
    G.beam = null;
    G.bossHP -= REFLECT_DMG;
    G.charges = Math.min(5, G.charges + 1);
    G.combo++;
    G.bossFlash = 1;
    G.bossHurt = 0.35;
    updateHud();
    if(DH.Audio) DH.Audio.play('boss_hit');
    DH.FX.text(ep.x + U.rand(-12,12), ey - 30, '-' + REFLECT_DMG, {col:'#f4f7fb', size:G.cw*0.055});
    DH.FX.spark(ep.x, ey, {n:30, col:'#f4f7fb', spd:360, spdMin:120});
    DH.FX.ring(ep.x, ey, 8, 130, .55, 'rgba(255,255,255,.85)', 3);
    DH.FX.shake(9, .3);
    if(G.charges >= 5 && !G.ultReady){
      G.ultReady = true;
      updateHud();
      if(DH.Audio) DH.Audio.play('ult_ready');
      DH.UI.toast('靈 · 蓄满', 1600);
    }
    if(U.chance(.32)) barks('hero');
    if(G.bossHP <= 0){
      G.bossHP = 0;
      updateHud();
      bossDown();
      return;
    }
    recover();
  }

  function hitHero(){
    G.combo = 0;
    if(G.dev){
      DH.FX.text(G.layout.shield.x, G.layout.shield.y - 40, '无敌', {col:'#ffffff', size:G.cw*0.05});
      DH.FX.shake(4, .2);
      updateHud();
      recover();
      return;
    }
    G.heroHP = Math.max(0, G.heroHP - BOSS_HIT);
    G.heroHurt = .45;
    updateHud();
    if(DH.Audio) DH.Audio.play('reflect_fail');
    DH.UI.damageFlash();
    DH.FX.shake(13, .42);
    DH.FX.text(G.layout.hero.x + 20, G.layout.hero.feet - G.layout.hero.h * .7, '-' + BOSS_HIT, {col:'#eef3f8', size:G.cw*0.06});
    DH.FX.spark(G.layout.shield.x, G.layout.shield.y, {n:26, col:'#ff9aa8', spd:320, spdMin:80});
    if(U.chance(.45)) barks('boss');
    if(G.heroHP <= 0){ die(); return; }
    recover();
  }

  function recover(){
    G.state = 'recover';
    G.stateT = 0;
    G.reflected = false;
    G.bossExpr = 'smug';
    G.attackTimer = nextAttackDelay();
  }

  function barks(who){
    if(!DH.Sub || !DH.Sub.isIdle()) return;
    var pool = banterList('taunt');
    if(!pool.length) return;
    var filtered = pool.filter(function(l){ return l.who === who; });
    if(!filtered.length) return;
    var l = U.pick(filtered);
    G.dlg.lastWho = l.who;
    maybeSay(l.who, l.text);
  }

  // ============================ 弹反输入 ============================
  function reflectPressed(src){
    if(!G.active || G.paused || !DH.Sub) return;
    if(G.state === 'dying' || G.ending || G.clearing) return;
    var now = performance.now() / 1000;
    if(G.reflected) return;
    var inWindow = false;
    if(G.state === 'windup' && G.stateT <= WINDUP + WINDOW_EXTRA) inWindow = true;
    if(G.state === 'fire' && G.stateT <= WINDOW_EXTRA) inWindow = true;
    if(G.state === 'intro') return;
    if(now < G.coolUntil) return;
    if(inWindow){
      G.reflected = true;
      flashShield();
      DH.FX.ring(G.layout.shield.x, G.layout.shield.y, 10, 90, .35, 'rgba(255,255,255,.9)', 3);
      DH.FX.spark(G.layout.shield.x, G.layout.shield.y, {n:10, col:'#f4f7fb', spd:200, spdMin:60});
      if(DH.Audio) DH.Audio.play('shield_hum');
      // 若激光尚未发射，等发射后自动反弹
    } else {
      // 空挥 / 抢按：进入冷却
      G.coolUntil = now + 0.55;
      if(els.reflect){
        els.reflect.classList.remove('deny');
        void els.reflect.offsetWidth;
        els.reflect.classList.add('deny');
      }
      DH.FX.spark(G.layout.shield.x, G.layout.shield.y, {n:8, col:'#aeb8c4', spd:120, spdMin:30});
      if(DH.Audio) DH.Audio.play('reflect_fail');
    }
  }

  function flashShield(){
    // 通过 state 的短标志驱动盾牌闪烁
    G.shieldFlash = 0.45;
  }

  // ============================ 大招 靈 ============================
  function tryUlt(){
    if(!G.active || G.paused) return;
    if(G.state === 'dying' || G.ending || G.clearing) return;
    // 开发者模式：无量火，随时可放「靈」
    if(!G.ultReady && !G.dev){
      if(DH.Audio) DH.Audio.play('ui_back');
      return;
    }
    if(G.state === 'ult') return;
    startUlt();
  }

  function startUlt(){
    G.ultReady = false;
    G.charges = 0;
    G.state = 'ult';
    G.stateT = 0;
    G.ultT = 0;
    G.ultAcc = 0;
    G.ultShown = 0;
    G.beam = null;
    G.attackTimer = 1.4;
    updateHud();
    if(DH.Audio) DH.Audio.play('ult_beam');
    DH.FX.ring(G.layout.hero.x, G.layout.hero.feet - G.layout.hero.h * .5, 10, 160, .6, 'rgba(255,230,160,.9)', 4);
    DH.FX.shake(8, .5);
    DH.UI.toast('靈', 900);
  }

  function updateUlt(dt){
    var T = 2.0;
    G.ultT += dt;
    G.stateT = G.ultT;
    var dmg = ULT_DMG / T * dt;
    G.ultAcc += dmg;
    var apply = Math.floor(G.ultAcc);
    if(apply > 0){
      G.ultAcc -= apply;
      G.bossHP = Math.max(0, G.bossHP - apply);
      G.ultShown += apply;
      G.bossFlash = Math.max(G.bossFlash, .5);
      updateHud();
    }
    DH.FX.shake(3, .12);
    if(Math.random() < .55){
      var ep = eyePos(U.chance(.5) ? 'a' : 'b');
      DH.FX.spark(ep.x + U.rand(-30,30), ep.y + U.rand(-20,30), {n:2, col:'#ffe6a8', spd:200, spdMin:40});
    }
    // 伤害数字
    if(G.ultT - G.lastUltText > .22){
      G.lastUltText = G.ultT;
      var L = G.layout;
      DH.FX.text(L.boss.x + U.rand(-L.boss.size*.22, L.boss.size*.22), L.boss.y + U.rand(-L.boss.size*.18, L.boss.size*.18), '-' + REFLECT_DMG, {col:'#f4f7fb', size:G.cw*0.05, life:.7});
    }
    if(G.ultT >= T){
      G.state = 'recover';
      G.stateT = 0;
      G.attackTimer = 1.4;
      if(DH.Audio) DH.Audio.play('boss_hit');
      if(G.bossHP <= 0){ bossDown(); }
    }
  }

  // ============================ 击败/复活 ============================
  function bossDown(){
    if(G.clearing || G.ending) return;
    G.clearing = true;
    G.state = 'dead';
    G.stateT = 0;
    G.bossExpr = 'weak';
    G.bossFlash = 0;
    G.beam = null;
    G.reflected = false;
    DH.FX.ring(G.layout.boss.x, G.layout.boss.y, 20, G.layout.boss.size * .9, .9, 'rgba(255,240,200,.8)', 4);
    DH.FX.spark(G.layout.boss.x, G.layout.boss.y, {n:40, col:'#ffe6b8', spd:400, spdMin:80});
    DH.FX.shake(14, .6);
    if(DH.Audio) DH.Audio.play('boss_death');
    var seq = G.seq;
    if(G.floor >= 99){
      G.ending = true;
      setTimeout(function(){
        if(!G.active || G.seq !== seq) return;
        // 最后一击后的最后一句
        DH.Sub.say('boss', '……孩子，过来。');
        setTimeout(function(){
          if(!G.active || G.seq !== seq) return;
          if(DH.App) DH.App.beginEnding();
        }, 1600);
      }, 900);
      return;
    }
    setTimeout(function(){
      if(!G.active || G.seq !== seq) return;
      reviveSequence();
    }, 950);
  }

  function reviveSequence(){
    var seq = G.seq;
    var mech = (G.floor % 2 === 0) ? 'Faze up' : '地狱归来';
    var data = window.DH_DATA || {};
    var banners = (data.ui && data.ui.banner) || ['地狱归来','Faze up'];
    mech = U.pick(banners);
    G.reviveT = 0;
    DH.UI.banner(mech, '血肉重铸 · 血量 +20%', {hold:2100}).then(function(){
      if(!G.active || G.seq !== seq) return;
      bossRevive();
    });
    if(DH.Audio) DH.Audio.play('revive');
    G.state = 'revive';
    G.stateT = 0;
  }

  function bossRevive(){
    var seq = G.seq;
    var next = G.floor + 1;
    G.floor = next;
    G.bossMax = 100 + 20 * (next - 1);
    G.bossHP = G.bossMax;
    G.heroHP = HERO_MAX;
    G.charges = 0;
    G.ultReady = false;
    G.combo = 0;
    G.bossExpr = 'smug';
    G.bossFlash = 1;
    G.state = 'playing';
    G.stateT = 0;
    G.attackTimer = 1.5;
    G.clearing = false;
    G.dlg.plotIdx = 0;
    G.dlg.introMode = false;
    G.dlg.introLeft = 0;
    G.dlg.timer = 1.6;
    G.dlg.lastWho = null;
    G.beam = null;
    updateHud();
    if(DH.App) DH.App.recordFloor(next);
    DH.FX.ring(G.layout.boss.x, G.layout.boss.y, 30, G.layout.boss.size, .9, 'rgba(255,250,230,.9)', 5);
    DH.FX.spark(G.layout.boss.x, G.layout.boss.y, {n:50, col:'#fff3d0', spd:420, spdMin:60});
    DH.UI.floorTitle(next, (getFloorData(next) || {}).arcName || '', {hold:900});
    if(DH.Sub){
      var ui = (window.DH_DATA && window.DH_DATA.ui) || {};
      var line = ui.reviveLine || {who:'hero', text:'真的假的？！'};
      DH.Sub.say('hero', line.text);
      setTimeout(function(){
        if(!G.active || G.seq !== seq) return;
        var f = getFloorData(next);
        if(f && f.lines && f.lines.length) DH.Sub.say(f.lines[0].who, f.lines[0].text);
      }, 2600);
    }
    if(DH.Audio) DH.Audio.play('floor_clear');
  }

  // ============================ 死亡 ============================
  function die(){
    if(G.dying || G.ending) return;
    G.dying = true;
    G.state = 'dying';
    G.stateT = 0;
    G.combo = 0;
    G.bossExpr = 'smug';
    DH.FX.shake(16, .8);
    DH.FX.spark(G.layout.hero.x, G.layout.hero.feet - G.layout.hero.h * .6, {n:36, col:'#f4f7fb', spd:360, spdMin:100});
    if(DH.Audio) DH.Audio.play('death');
    var ui = (window.DH_DATA && window.DH_DATA.ui) || {};
    var deathLine = ui.death && ui.death[Math.floor(Math.random()*ui.death.length)];
    if(deathLine && DH.Sub) DH.Sub.say(typeof deathLine === 'string' ? 'boss' : deathLine.who, typeof deathLine === 'string' ? deathLine : deathLine.text);
    else if(DH.Sub) DH.Sub.say('boss', '第 ' + G.floor + ' 层。记住我。下次见。');
    var seq = G.seq;
    setTimeout(function(){
      if(!G.active || G.seq !== seq) return;
      G.ending = true;
      if(DH.App){
        DH.App.recordDeath(G.floor);
        DH.App.exitToMenu({death:true});
      }
    }, 2600);
  }

  // ============================ 暂停 ============================
  function togglePause(force){
    if(!G.active) return;
    if(G.state === 'dying' || G.ending) return;
    G.paused = (force == null) ? !G.paused : !!force;
    if(els.pause) els.pause.classList.toggle('hidden', !G.paused);
    if(G.paused){
      if(els.pauseSub) els.pauseSub.textContent = '第 ' + G.floor + ' 层 · 记忆将保留';
      if(DH.Audio) DH.Audio.stopBattleMusic();
    } else {
      if(DH.Audio) DH.Audio.startBattleMusic();
    }
  }

  // ============================ HUD ============================
  function updateHud(){
    var f = getFloorData(G.floor) || {};
    if(els.floor) els.floor.textContent = G.floor;
    if(els.arc) els.arc.textContent = (f.arcName || '') + (f.mood ? ' · ' + f.mood : '');
    if(els.bossFill){
      var r = G.bossMax > 0 ? Math.max(0, G.bossHP / G.bossMax) : 0;
      els.bossFill.style.transform = 'scaleX(' + r + ')';
    }
    if(els.bossTxt) els.bossTxt.textContent = Math.ceil(G.bossHP) + ' / ' + G.bossMax;
    if(els.heroFill){
      els.heroFill.style.transform = 'scaleX(' + Math.max(0, G.heroHP / HERO_MAX) + ')';
    }
    if(els.charge){
      var pips = els.charge.children;
      for(var i=0;i<pips.length;i++){
        var on = i < G.charges || G.ultReady || G.dev;
        pips[i].classList.toggle('on', on);
      }
    }
    if(els.ult){
      var ready = G.ultReady || G.dev; // 开发者模式无限灵
      els.ult.disabled = !ready;
      els.ult.classList.toggle('ready', ready);
    }
    if(els.combo){
      if(G.combo >= 2){
        els.combo.textContent = '反弹 ×' + G.combo;
        els.combo.classList.add('show');
      } else els.combo.classList.remove('show');
    }
  }

  // ============================ QA 摆拍 ============================
  function applyPose(){
    var m = (location.search || '').match(/pose=([a-z0-9]+)/);
    if(!m) return;
    var p = m[1];
    var L = G.layout;
    G.freeze = true;
    G.qa.auto = false;
    if(DH.Sub) DH.Sub.clear();
    G.clearing = false; G.dying = false;
    if(p === 'windup'){
      G.state = 'windup'; G.stateT = 0.22; G.bossExpr = 'red'; G.reflected = false;
    } else if(p === 'fire'){
      var ep = eyePos('a'), sh = L.shield;
      G.state = 'fire'; G.stateT = 0.05; G.bossExpr = 'angry';
      G.beam = { phase:'toHero', t:0.11, dur:BEAM_TRAVEL, sx:ep.x, sy:ep.y, ex:sh.x, ey:sh.y };
    } else if(p === 'reflect'){
      var sh2 = L.shield, ep2 = eyePos('b');
      G.state = 'fire'; G.stateT = 0.05; G.bossExpr = 'red'; G.reflected = true;
      G.beam = { phase:'toBoss', t:0.07, dur:BOUNCE_TRAVEL, sx:sh2.x, sy:sh2.y, ex:ep2.x, ey:ep2.y };
      G.shieldFlash = .4;
    } else if(p === 'ult'){
      G.state = 'ult'; G.stateT = 1.0; G.ultT = 1.0; G.charges = 0; G.ultReady = false;
      G.bossHP = Math.max(1, Math.round(G.bossMax * .55)); G.bossExpr = 'weak';
    } else if(p === 'ultready'){
      G.charges = 5; G.ultReady = true; G.state = 'idle'; G.bossExpr = 'smug';
    } else if(p === 'revive'){
      G.state = 'revive'; G.stateT = 0.8; G.bossHP = 0; G.bossExpr = 'weak';
    } else if(p === 'dying'){
      G.heroHP = 1; G.state = 'dying'; G.stateT = 1.2; G.bossExpr = 'smug'; G.dying = true;
    } else if(p === 'banner'){
      if(DH.UI) DH.UI.banner('地狱归来', '血肉重铸 · 血量 +20%', {hold: 6000});
    } else if(p === 'floor'){
      if(DH.UI) DH.UI.floorTitle(G.floor, '相识之幕 · 敌意', {hold: 6000});
    } else if(p === 'bossdead'){
      G.state = 'dead'; G.stateT = 1.0; G.bossHP = 0; G.bossExpr = 'weak'; G.clearing = true;
    }
    updateHud();
    if(els.reflect) els.reflect.classList.toggle('window', p === 'windup' || p === 'fire');
  }

  // ============================ 主循环 ============================
  function frame(dt, now){
    if(!G.active) return;
    G.t += dt;
    if(!G.paused && !G.freeze){
      update(dt);
    }
    render();
  }

  function update(dt){
    var w = DH.U.clamp;
    // 冷却与闪烁衰减
    G.bossFlash = Math.max(0, G.bossFlash - dt * 3);
    G.bossHurt = Math.max(0, G.bossHurt - dt);
    G.heroHurt = Math.max(0, G.heroHurt - dt);
    G.shieldFlash = Math.max(0, (G.shieldFlash || 0) - dt);
    if(G.reviveT >= 0) G.reviveT += dt;

    // ---- QA 自动演奏（仅 URL 参数触发，正式游玩无影响） ----
    if(G.qa.auto){
      if(!G.qa.lastReflect) G.qa.lastReflect = 0;
      if(G.state === 'windup' && G.stateT > 0.10 && !G.reflected && performance.now() - G.qa.lastReflect > 800){
        G.qa.lastReflect = performance.now();
        reflectPressed('qa');
      }
      if(G.ultReady && (G.state === 'idle' || G.state === 'recover') && performance.now() - (G.qa.lastUlt || 0) > 1500){
        G.qa.lastUlt = performance.now();
        tryUlt();
      }
    }
    if(G.qa.fast && !G.clearing && !G.dying && (G.state === 'playing' || G.state === 'intro' || G.state === 'idle' || G.state === 'recover')){
      if(performance.now() - (G.qa.floorEnter || 0) > 6000){
        G.qa.floorEnter = performance.now();
        if(performance.now() - G.floorStart > 6000 && G.bossHP > 0){
          G.bossHP = 0; updateHud(); bossDown();
        }
      }
    }
    if(G.qa.ending && !G.clearing && !G.dying && G.floor === 99){
      if(performance.now() - G.floorStart > 4500 && G.bossHP > 0){
        G.bossHP = 0; updateHud(); bossDown();
      }
    }
    // 护盾/按钮窗口态
    var win = (G.state === 'windup' && G.stateT <= WINDUP + WINDOW_EXTRA) || (G.state === 'fire' && G.stateT <= WINDOW_EXTRA);
    if(win !== G.lastWinState){
      G.lastWinState = win;
      if(els.reflect) els.reflect.classList.toggle('window', win);
    }
    var nowS = performance.now() / 1000;
    if(els.reflect) els.reflect.classList.toggle('cool', nowS < G.coolUntil);

    dialogueTick(dt);

    if(G.state === 'death'){ return; }
    if(G.dying){ G.stateT += dt; return; }
    if(G.state === 'intro'){
      G.stateT += dt;
      return;
    }
    if(G.state === 'ult'){
      updateUlt(dt);
      return;
    }
    G.stateT += dt;
    switch(G.state){
      case 'windup':
        if(G.stateT >= WINDUP){ fireLaser(); }
        break;
      case 'fire':
        if(G.beam){
          G.beam.t += dt;
          if(G.beam.t >= G.beam.dur){
            if(G.beam.phase === 'toHero') resolveHeroHit();
            else resolveBossHit();
          }
        } else { recover(); }
        break;
      case 'recover':
        if(G.stateT >= RECOVER){
          G.state = 'idle';
          G.stateT = 0;
          G.attackTimer = nextAttackDelay();
          G.bossExpr = 'smug';
        }
        break;
      case 'idle':
        G.attackTimer -= dt;
        if(G.attackTimer <= 0) beginWindup();
        break;
      case 'playing':
        // 兼容：进入攻击循环
        G.state = 'idle';
        G.attackTimer = Math.min(G.attackTimer, .8);
        break;
      case 'revive':
        // 播放复活光柱，但等待 banner 回调推进
        break;
      case 'dead':
        break;
    }
  }

  // ============================ 渲染 ============================
  function render(){
    if(!ctx) return;
    DH._renderCount = (DH._renderCount || 0) + 1;
    var w = G.cw, h = G.ch;
    ctx.setTransform(G.dpr, 0, 0, G.dpr, 0, 0);
    ctx.clearRect(0, 0, w, h);

    // 背景
    drawBackground();

    ctx.save();
    DH.FX.applyShake(ctx);
    drawBossAura();
    drawBoss();
    drawHero();
    drawBeams();
    drawUltBeam();
    drawBossLight();
    DH.FX.draw(ctx);
    ctx.restore();

    drawOverlay(w, h);
    // QA：把 canvas 镜像成 <img>，便于环境截屏验证（仅 ?mirror=1 时）
    if((location.search||'').indexOf('mirror') >= 0){
      DH._lastMirror = DH._lastMirror || 0;
      var tmr = performance.now();
      if(tmr - DH._lastMirror > 900){
        DH._lastMirror = tmr;
        try{
          var mir = document.getElementById('dh-mirror');
          if(!mir){
            mir = document.createElement('img');
            mir.id = 'dh-mirror';
            mir.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9997;pointer-events:none;';
            document.body.appendChild(mir);
          }
          mir.src = canvas.toDataURL('image/jpeg', 0.72);
        }catch(e){}
      }
    }
  }

  function drawBackground(){
    var w = G.cw, h = G.ch, bg = G.bg;
    var im = DH.Assets.img('bg_arena');
    if(im && im.complete && im.naturalWidth){
      ctx.save();
      ctx.imageSmoothingEnabled = false; // 图二为像素风原图，放大保持颗粒感
      ctx.drawImage(im, bg.x + Math.sin(G.t * .12) * 6, bg.y + Math.cos(G.t * .09) * 4, bg.w, bg.h);
      ctx.restore();
    } else {
      ctx.fillStyle = '#0a0d14';
      ctx.fillRect(0, 0, w, h);
    }
    // 纯色压暗（无渐变），保留图二本身的可读性
    ctx.fillStyle = 'rgba(5,8,14,.30)';
    ctx.fillRect(0, 0, w, h);
    // 顶部/底部纯色压条，保证 HUD 与字幕可读
    ctx.fillStyle = 'rgba(3,5,10,.34)';
    ctx.fillRect(0, 0, w, h * .12);
    ctx.fillRect(0, h * .86, w, h * .14);

    // 漂浮尘埃
    G.bgDustT -= 1/60;
    if(G.bgDustT <= 0){
      G.bgDustT = 0.14;
      DH.FX.dust(U.rand(0, w), U.rand(h * .1, h * .9), w * .1, h * .1, 1);
    }

    // 红眼前摇的全屏脉动
    if(G.state === 'windup'){
      var p = G.stateT / WINDUP;
      ctx.fillStyle = 'rgba(235,242,250,' + (0.025 + 0.05 * p) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  function drawBossAura(){
    var L = G.layout, b = L.boss;
    var bob = Math.sin(G.t * 1.35) * b.bob;
    var x = b.x, y = b.y + bob;
    var sz = b.size;
    var state = G.state;
    var power = state === 'windup' ? 1 : (state === 'dead' ? .2 : .55);
    var col = state === 'windup' ? [255, 70, 90] : (G.bossHurt > 0 ? [235, 242, 250] : (state === 'dead' ? [140, 150, 170] : [230, 238, 248]));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y, sz * .1, x, y, sz * .78);
    g.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (.18 * power + .04) + ')');
    g.addColorStop(.55, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',' + (.08 * power) + ')');
    g.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - sz, y - sz, sz * 2, sz * 2);
    ctx.restore();

    // 悬浮的暗影触须
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(var i=0;i<5;i++){
      var ph = G.t * (.8 + i * .11) + i * 1.7;
      var bx = x + Math.sin(ph) * sz * (.18 + i * .035);
      var by = y + sz * .42;
      var len = sz * (.28 + .06 * Math.sin(ph * 1.3 + i));
      var grad = ctx.createLinearGradient(bx, by, bx, by + len);
      grad.addColorStop(0, 'rgba(235,242,250,.12)');
      grad.addColorStop(1, 'rgba(235,242,250,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 6 - i * .8;
      ctx.beginPath();
      ctx.moveTo(bx, by);
      ctx.quadraticCurveTo(bx + Math.sin(ph * 1.7) * sz * .1, by + len * .6, bx + Math.sin(ph * 1.2) * sz * .18, by + len);
      ctx.stroke();
    }
    ctx.restore();

    // 地面暗影
    ctx.save();
    var sg = ctx.createRadialGradient(x, y + sz * .52, 0, x, y + sz * .52, sz * .7);
    sg.addColorStop(0, 'rgba(0,0,0,.55)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y + sz * .52, sz * .66, sz * .12, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();
  }

  function drawBoss(){
    var L = G.layout, b = L.boss;
    var bob = Math.sin(G.t * 1.35) * b.bob;
    var hurtOff = G.bossHurt > 0 ? Math.sin(G.t * 90) * 5 * (G.bossHurt / .35) : 0;
    var x = b.x + hurtOff, y = b.y + bob, sz = b.size;
    var img = DH.Assets.img('boss_' + (G.bossExpr === 'red' ? 'red' : G.bossExpr));
    if(!img || !img.naturalWidth) img = DH.Assets.img('boss_neutral') || DH.Assets.img('boss_smug');
    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if(img && img.naturalWidth){
      ctx.drawImage(img, x - sz/2, y - sz/2, sz, sz);
      // 受击白光
      if(G.bossFlash > 0){
        ctx.globalCompositeOperation = 'lighter';
        ctx.globalAlpha = Math.min(.8, G.bossFlash);
        ctx.drawImage(img, x - sz/2, y - sz/2, sz, sz);
        ctx.globalAlpha = 1;
        ctx.globalCompositeOperation = 'source-over';
      }
    } else {
      // 占位：防止素材缺失时黑屏
      ctx.fillStyle = 'rgba(60,40,55,.85)';
      ctx.beginPath(); ctx.arc(x, y, sz*.42, 0, Math.PI*2); ctx.fill();
      ctx.fillStyle = '#ff8a9a';
      ctx.fillRect(x - sz*.18, y - sz*.06, sz*.1, sz*.06);
      ctx.fillRect(x + sz*.08, y - sz*.06, sz*.1, sz*.06);
    }
    ctx.restore();

    // 眼睛红光
    var eyeA = { x:x - sz * .125, y:y - sz * .02 };
    var eyeB = { x:x + sz * .125, y:y - sz * .02 };
    var glowA = 0;
    if(G.state === 'windup') glowA = 0.55 + 0.45 * Math.sin(G.t * 40);
    else if(G.state === 'fire') glowA = 0.9;
    else if(G.state === 'ult') glowA = 0.3;
    if(glowA > 0){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      [eyeA, eyeB].forEach(function(e){
        var rg = ctx.createRadialGradient(e.x, e.y, 0, e.x, e.y, sz * .16);
        rg.addColorStop(0, 'rgba(255,220,225,' + (.9 * glowA) + ')');
        rg.addColorStop(.25, 'rgba(255,40,70,' + (.75 * glowA) + ')');
        rg.addColorStop(1, 'rgba(255,20,50,0)');
        ctx.fillStyle = rg;
        ctx.beginPath();
        ctx.arc(e.x, e.y, sz * .16, 0, Math.PI*2);
        ctx.fill();
      });
      ctx.restore();
    }
  }

  function drawHero(){
    var L = G.layout, hr = L.hero, sh = L.shield;
    var hurt = G.heroHurt > 0;
    DH.Hero.draw(ctx, hr.x, hr.feet, hr.h, G.t, {guard:true, hurt:hurt, glow:G.ultReady});
    var shieldState = 'idle';
    if(G.shieldFlash > 0) shieldState = 'reflect';
    else if(G.state === 'windup' || G.state === 'fire') shieldState = 'guard';
    else if(G.state === 'ult') shieldState = 'guard';
    DH.Hero.drawShield(ctx, sh.x, sh.y, sh.r, G.t, shieldState);
  }

  function drawBeams(){
    if(!G.beam) return;
    var b = G.beam;
    var t = U.clamp(b.t / b.dur, 0, 1);
    var ex = U.lerp(b.sx, b.ex, U.easeInCubic(t));
    var ey = U.lerp(b.sy, b.ey, U.easeInCubic(t));
    var toBoss = b.phase === 'toBoss';
    var col = toBoss ? [255, 255, 255] : [250, 252, 255];
    var w0 = toBoss ? 7 : 5.5;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 外辉
    var g = ctx.createLinearGradient(b.sx, b.sy, ex, ey);
    g.addColorStop(0, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.0)');
    g.addColorStop(.3, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.25)');
    g.addColorStop(1, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.85)');
    ctx.strokeStyle = g;
    ctx.lineWidth = w0 * 3.2;
    ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(ex, ey); ctx.stroke();
    // 中束
    ctx.strokeStyle = 'rgba(255,255,255,.96)';
    ctx.lineWidth = w0;
    ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(ex, ey); ctx.stroke();
    // 白芯
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = Math.max(1, w0 * .32);
    ctx.beginPath(); ctx.moveTo(b.sx, b.sy); ctx.lineTo(ex, ey); ctx.stroke();
    // 端点光
    var rg = ctx.createRadialGradient(ex, ey, 0, ex, ey, w0 * 6);
    rg.addColorStop(0, 'rgba(255,255,255,.95)');
    rg.addColorStop(.4, 'rgba(' + col[0] + ',' + col[1] + ',' + col[2] + ',.55)');
    rg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(ex, ey, w0 * 6, 0, Math.PI*2); ctx.fill();
    ctx.restore();
  }

  function drawUltBeam(){
    if(G.state !== 'ult') return;
    var L = G.layout;
    var sx = L.hero.x + L.hero.h * .18, sy = L.hero.feet - L.hero.h * .52;
    var ex = L.boss.x, ey = L.boss.y;
    var t = U.clamp(G.ultT / 2.0, 0, 1);
    var grow = Math.min(1, G.ultT / .25);
    var wdt = (18 + Math.sin(G.t * 30) * 6) * grow * (0.7 + 0.3 * Math.sin(t * Math.PI));
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.lineCap = 'round';
    // 主光柱
    var g = ctx.createLinearGradient(sx, sy, ex, ey);
    g.addColorStop(0, 'rgba(255,255,255,.12)');
    g.addColorStop(.25, 'rgba(245,249,253,.45)');
    g.addColorStop(.7, 'rgba(238,245,252,.82)');
    g.addColorStop(1, 'rgba(255,255,255,.95)');
    ctx.strokeStyle = g;
    ctx.lineWidth = wdt * 2.6;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = 'rgba(250,252,255,.95)';
    ctx.lineWidth = wdt;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    ctx.strokeStyle = '#fff';
    ctx.lineWidth = wdt * .35;
    ctx.beginPath(); ctx.moveTo(sx, sy); ctx.lineTo(ex, ey); ctx.stroke();
    // 环
    ctx.strokeStyle = 'rgba(255,235,180,.5)';
    ctx.lineWidth = 2;
    for(var i=0;i<4;i++){
      var rr = 20 + ((G.ultT * 240 + i * 60) % 200);
      ctx.beginPath(); ctx.arc(ex, ey, rr, 0, Math.PI*2); ctx.stroke();
    }
    ctx.restore();
  }

  function drawBossLight(){
    if(G.state === 'revive' || G.clearing){
      // 白光柱（微微泛黄）
      var L = G.layout, b = L.boss;
      var t = U.clamp((G.stateT || 0) / 1.4, 0, 1);
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var w = b.size * (.28 + .3 * t);
      var g = ctx.createLinearGradient(b.x, 0, b.x, b.y + b.size * .5);
      g.addColorStop(0, 'rgba(255,250,225,0)');
      g.addColorStop(.35, 'rgba(255,248,220,.35)');
      g.addColorStop(1, 'rgba(255,240,200,.05)');
      ctx.fillStyle = g;
      ctx.beginPath();
      ctx.moveTo(b.x - w * .4, 0);
      ctx.lineTo(b.x + w * .4, 0);
      ctx.lineTo(b.x + w, b.y + b.size * .5);
      ctx.lineTo(b.x - w, b.y + b.size * .5);
      ctx.closePath();
      ctx.fill();
      ctx.restore();
    }
  }

  function drawOverlay(w, h){
    // 屏幕边缘青色光（護盾充能滿）
    if(G.ultReady){
      var p = .5 + .5 * Math.sin(G.t * 6);
      var g = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.34, w/2, h/2, Math.max(w,h)*.72);
      g.addColorStop(0, 'rgba(255,210,120,0)');
      g.addColorStop(1, 'rgba(255,200,110,' + (.06 + .04*p) + ')');
      ctx.fillStyle = g;
      ctx.fillRect(0, 0, w, h);
    }
    // 死亡暗角
    if(G.dying){
      var t = U.clamp(G.stateT / 2.6, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + (.15 + .7 * t) + ')';
      ctx.fillRect(0, 0, w, h);
    }
    // 低血量红边
    if(G.heroHP > 0 && G.heroHP <= 34 && !G.dev){
      var a = .18 + .12 * Math.sin(G.t * 5);
      var gg = ctx.createRadialGradient(w/2, h/2, Math.min(w,h)*.36, w/2, h/2, Math.max(w,h)*.7);
      gg.addColorStop(0, 'rgba(255,255,255,0)');
      gg.addColorStop(1, 'rgba(255,255,255,' + (a * 0.55) + ')');
      ctx.fillStyle = gg;
      ctx.fillRect(0, 0, w, h);
    }
    // 开场/层切换白闪
    if(G.state === 'revive'){
      var t2 = U.clamp(G.stateT / 1.2, 0, 1);
      ctx.fillStyle = 'rgba(255,250,235,' + (.28 * (1 - t2)) + ')';
      ctx.fillRect(0, 0, w, h);
    }
  }

  // ============================ 开发者调试键 ============================
  function devKey(e){
    if(e.code === 'KeyK'){ if(G.active && !G.ending){ G.bossHP = 0; updateHud(); bossDown(); } }
    else if(e.code === 'KeyU'){ G.charges = 5; G.ultReady = true; updateHud(); }
    else if(e.code === 'KeyJ'){ if(G.active && !G.clearing){ G.bossHP = 1; updateHud(); } }
    else if(e.code === 'KeyN'){ if(G.active && !G.clearing){ G.floor = Math.min(98, G.floor + 1); startFloor(G.floor, true); } }
  }

  DH.Game = {
    init:init, start:start, stop:stop, frame:frame, resize:resize,
    togglePause:togglePause, reflectPressed:reflectPressed, tryUlt:tryUlt,
    devKey:devKey,
    get active(){ return G.active; },
    get paused(){ return G.paused; },
    get floor(){ return G.floor; },
    state:G
  };
})();
