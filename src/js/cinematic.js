/* ============================================================
   cinematic.js —— 第 99 层结局：16:9 电影叙事
   白光 · 倒地的 BOSS · 蓝色利刃 · 镜头向左 · 「我是。」
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var U = DH.U;

  var C = {
    active:false, t:0, last:0, frameW:0, frameH:0, dpr:1,
    done:false, cut:false, ev:0,
    camX:0, panT:0, zoom:1,
    bossShockT:-1, stabT:-1, flash:0,
    subTimer:null, subHide:null,
    freeze:-1, frozen:false,
    events:[]
  };
  var canvas, ctx, els = {};

  function frameRect(){
    var vv = window.visualViewport;
    var w = Math.round(window.innerWidth || 0);
    var h = Math.round((vv && vv.height) || window.innerHeight || 0);
    // 16:9 电影画幅：优先填满宽度，限制高度
    var fw = Math.min(w, h * 16 / 9);
    var fh = fw * 9 / 16;
    return { x:(w - fw) / 2, y:(h - fh) / 2, w:fw, h:fh };
  }

  function resize(){
    if(!canvas) return;
    var dpr = Math.min(window.devicePixelRatio || 1, 2);
    var vv = window.visualViewport;
    var vw = window.innerWidth || 0;
    var vh2 = Math.round((vv && vv.height) || window.innerHeight || 0);
    C.dpr = dpr;
    canvas.width = Math.round(vw * dpr);
    canvas.height = Math.round(vh2 * dpr);
    canvas.style.width = vw + 'px';
    canvas.style.height = vh2 + 'px';
    ctx.setTransform(dpr,0,0,dpr,0,0);
    var f = frameRect();
    C.frameW = f.w; C.frameH = f.h;
  }

  function init(){
    canvas = document.getElementById('cine-canvas');
    if(!canvas) return;
    ctx = canvas.getContext('2d', {alpha:false}) || canvas.getContext('2d');
    els.sub = document.getElementById('cine-sub');
    els.speaker = document.getElementById('cine-speaker');
    els.text = document.getElementById('cine-text');
    els.skip = document.getElementById('cine-skip');
    window.addEventListener('resize', resize);
    if(els.skip){
      els.skip.addEventListener('click', function(e){
        e.stopPropagation();
        if(C.t > 2) skipAll();
      });
    }
    resize();
  }

  function sub(who, text, hold){
    if(!els.sub) return;
    els.sub.classList.remove('hidden');
    els.sub.classList.toggle('boss', who === 'boss');
    els.speaker.textContent = who === 'boss' ? '肚耗' : (who === 'hero' ? '嘟豪' : '');
    els.text.textContent = text;
    els.sub.classList.remove('in');
    void els.sub.offsetWidth;
    els.sub.classList.add('in');
    if(C.subHide){ clearTimeout(C.subHide); }
    C.subHide = setTimeout(function(){
      if(els.sub){
        els.sub.style.transition = 'opacity .5s ease';
        els.sub.style.opacity = '0';
      }
    }, hold || 3800);
  }

  function hideSub(){
    if(els.sub) els.sub.classList.add('hidden');
  }

  function start(){
    var D = window.DH_DATA || {};
    var E = D.ending || {};
    var monologue = (E.monologue && E.monologue[0]) ? E.monologue[0] : {who:'boss', text:'孩子，我认可你了。可是，你不让为我们很想吗？你不想知道真相吗？'};
    var heroLine = E.heroLine || {who:'hero', text:'关于我是谁，我想，我知道，我是。'};
    C.active = true; C.t = 0; C.last = performance.now(); C.done = false; C.cut = false;
    C.ev = 0; C.camX = -C.frameW * 0.63; C.panT = 0; C.zoom = 1;
    C.bossShockT = -1; C.stabT = -1; C.flash = 0;
    resize();
    // 打字幕样式复位
    if(els.sub){ els.sub.classList.remove('hidden'); els.sub.style.opacity = '1'; els.sub.style.transition = ''; }
    C.events = [
      { t:0.55, run:function(){
          sub('boss', monologue.text, 4400);
          if(DH.Audio) DH.Audio.play('heartbeat');
        } },
      { t:2.95, run:function(){ if(DH.Audio) DH.Audio.play('heartbeat'); } },
      { t:5.15, run:function(){ if(DH.Audio) DH.Audio.play('heartbeat'); } },
      { t:5.65, run:function(){
          C.stabT = 0;
          hideSub();
          if(DH.Audio) DH.Audio.play('stab');
        } },
      { t:5.95, run:function(){
          C.bossShockT = 0; C.flash = 1;
          if(DH.Audio) DH.Audio.play('glitch');
        } },
      { t:6.75, run:function(){
          C.panT = 0.0001;
        } },
      { t:9.25, run:function(){
          sub('hero', heroLine.text, 4300);
          if(DH.Audio) DH.Audio.play('heartbeat');
        } },
      { t:13.9, run:function(){ cutToBlack(); } }
    ];
    if(els.skip) els.skip.classList.remove('fade');
    if(DH.Audio) DH.Audio.play('stinger');
    var mct = (location.search || '').match(/ct=([0-9.]+)/);
    if(mct){
      C.freeze = parseFloat(mct[1]);
      // 快进到指定时间，便于截帧验收
      while(C.t < C.freeze){ update(0.016); }
      C.frozen = true;
      C.cut = C.freeze >= 13.9;
    }
  }

  function skipAll(){
    if(!C.active) return;
    cutToBlack();
  }

  function cutToBlack(){
    if(C.cut) return;
    C.cut = true;
    hideSub();
    if(els.skip) els.skip.classList.add('fade');
    if(DH.Audio) DH.Audio.play('glitch');
    if(C.frozen) return;
    setTimeout(function(){
      if(!C.active) return;
      C.active = false;
      if(DH.App) DH.App.beginCredits();
    }, 900);
  }

  function update(dt){
    if(C.frozen) return;
    C.t += dt;
    var ev = C.events;
    while(C.ev < ev.length && C.t >= ev[C.ev].t){
      try{ ev[C.ev].run(); }catch(e){}
      C.ev++;
    }
    // 镜头
    if(C.panT > 0){
      C.panT += dt;
      var p = U.clamp(C.panT / 2.5, 0, 1);
      // 线性向左
      C.camX = U.lerp(-C.frameW * 0.63, -C.frameW * 1.60, p);
      C.zoom = 1;
      if(p >= 1) C.zoom = U.lerp(1, 1.045, U.clamp((C.panT - 2.5) / 2.0, 0, 1));
    } else if(C.stabT >= 0 && C.panT === 0){
      C.zoom = U.lerp(1, 1.035, U.clamp(C.t / 6, 0, 1));
    }
    if(C.stabT >= 0) C.stabT += dt;
    if(C.bossShockT >= 0) C.bossShockT += dt;
    C.flash = Math.max(0, C.flash - dt * 2.6);
  }

  function frame(dt, now){
    if(!C.active) return;
    update(dt);
    render();
  }

  function drawBackground(fw, fh){
    var im = DH.Assets.img('bg_ending') || DH.Assets.img('bg_arena');
    if(im && im.naturalWidth){
      // 背景随镜头轻微视差
      var par = C.camX * 0.18;
      var sc = Math.max(fw / im.naturalWidth, fh / im.naturalHeight) * 1.14;
      var iw = im.naturalWidth * sc, ih = im.naturalHeight * sc;
      var ix = (fw - iw) / 2 + par;
      var iy = (fh - ih) / 2;
      ctx.drawImage(im, ix, iy, iw, ih);
    } else {
      ctx.fillStyle = '#07080c';
      ctx.fillRect(0, 0, fw, fh);
    }
    // 冷光 + 暖光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var cold = ctx.createRadialGradient(fw*.28, -fh*.2, 0, fw*.28, -fh*.2, fw*.9);
    cold.addColorStop(0, 'rgba(120,180,255,.16)');
    cold.addColorStop(.5, 'rgba(70,110,200,.06)');
    cold.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = cold;
    ctx.fillRect(0, 0, fw, fh);
    var warm = ctx.createRadialGradient(fw*.62, fh*.95, 0, fw*.62, fh*.95, fw*.55);
    warm.addColorStop(0, 'rgba(255,180,110,.20)');
    warm.addColorStop(1, 'rgba(255,150,80,0)');
    ctx.fillStyle = warm;
    ctx.fillRect(0, 0, fw, fh);
    ctx.restore();
    // 提亮底图
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    ctx.globalAlpha = .22;
    if(im && im.naturalWidth){
      var sc2 = Math.max(fw / im.naturalWidth, fh / im.naturalHeight) * 1.14;
      ctx.drawImage(im, (fw - im.naturalWidth*sc2)/2, (fh - im.naturalHeight*sc2)/2, im.naturalWidth*sc2, im.naturalHeight*sc2);
    }
    ctx.restore();
    // 压暗
    var g = ctx.createLinearGradient(0, 0, 0, fh);
    g.addColorStop(0, 'rgba(2,3,7,.86)');
    g.addColorStop(.45, 'rgba(4,6,12,.45)');
    g.addColorStop(1, 'rgba(2,3,7,.9)');
    ctx.fillStyle = g;
    ctx.fillRect(0, 0, fw, fh);
    // 地面暖光
    var lg = ctx.createRadialGradient(fw * .58, fh * .82, 0, fw * .58, fh * .82, fw * .5);
    lg.addColorStop(0, 'rgba(255,180,110,.16)');
    lg.addColorStop(1, 'rgba(255,160,90,0)');
    ctx.fillStyle = lg;
    ctx.fillRect(0, 0, fw, fh);
  }

  function drawWorld(fw, fh){
    var world = { bossX:0, bossY:fh * .50, heroX:-fw * 1.12, heroFeet:fh * .99 };
    var time = C.t;

    // BOSS 身体（一摊暗色袍影）
    var bx = world.bossX;
    ctx.save();
    var heapY = world.bossY + fh * .30;
    // 地面
    var fg = ctx.createLinearGradient(0, fh * .66, 0, fh);
    fg.addColorStop(0, 'rgba(10,14,22,0)');
    fg.addColorStop(.35, 'rgba(6,9,15,.75)');
    fg.addColorStop(1, 'rgba(2,3,6,.95)');
    ctx.fillStyle = fg;
    ctx.fillRect(0, fh * .60, fw, fh * .40);
    // 袍身（倒地的身体）
    ctx.fillStyle = '#0b0f18';
    ctx.beginPath();
    ctx.moveTo(bx - fw * .30, heapY + fh * .22);
    ctx.quadraticCurveTo(bx - fw * .24, heapY - fh * .08, bx - fw * .04, heapY - fh * .10);
    ctx.quadraticCurveTo(bx + fw * .20, heapY - fh * .10, bx + fw * .26, heapY + fh * .10);
    ctx.quadraticCurveTo(bx + fw * .10, heapY + fh * .26, bx - fw * .30, heapY + fh * .22);
    ctx.closePath();
    ctx.fill();
    // 袍身青色轮廓光
    ctx.strokeStyle = 'rgba(110,200,255,.20)';
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.moveTo(bx - fw * .26, heapY + fh * .10);
    ctx.quadraticCurveTo(bx - fw * .10, heapY - fh * .06, bx + fw * .16, heapY - fh * .02);
    ctx.stroke();
    // 地面反光
    var refl2 = ctx.createRadialGradient(bx, fh * .94, 0, bx, fh * .94, fw * .30);
    refl2.addColorStop(0, 'rgba(255,190,130,.20)');
    refl2.addColorStop(.5, 'rgba(255,160,100,.06)');
    refl2.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl2;
    ctx.fillRect(bx - fw * .30, fh * .82, fw * .60, fh * .18);
    ctx.restore();

    // 地面光反
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var refl = ctx.createRadialGradient(bx, world.bossY + fh*.44, 0, bx, world.bossY + fh*.44, fw*.30);
    refl.addColorStop(0, 'rgba(255,190,130,.12)');
    refl.addColorStop(.5, 'rgba(255,160,100,.04)');
    refl.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = refl;
    ctx.fillRect(bx - fw*.3, world.bossY + fh*.36, fw*.6, fh*.10);
    ctx.restore();

    // BOSS 头（倒在地上）
    var sz = fh * .50;
    var imgName = (C.bossShockT >= 0) ? 'boss_shock' : 'boss_weak';
    var img = DH.Assets.img(imgName) || DH.Assets.img('boss_weak') || DH.Assets.img('boss_neutral');
    var angle = (C.bossShockT >= 0) ? U.lerp(-1.02, -.60, U.clamp(C.bossShockT / .35, 0, 1)) : -1.02;
    var breathing = Math.sin(time * 1.2) * fh * .0035;
    var shockLift = (C.bossShockT >= 0) ? U.clamp(C.bossShockT / .25, 0, 1) * -fh * .012 : 0;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var rim = ctx.createRadialGradient(bx, world.bossY, sz*.1, bx, world.bossY, sz*.75);
    rim.addColorStop(0, 'rgba(140,200,255,.16)');
    rim.addColorStop(.6, 'rgba(90,140,220,.06)');
    rim.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = rim;
    ctx.beginPath(); ctx.arc(bx, world.bossY, sz*.75, 0, Math.PI*2); ctx.fill();
    ctx.restore();
    ctx.save();
    ctx.translate(bx, world.bossY + breathing + shockLift);
    ctx.rotate(angle);
    ctx.imageSmoothingEnabled = false;
    // 头后的暗影
    if(img && img.naturalWidth){
      ctx.globalAlpha = .5;
      ctx.drawImage(img, -sz/2 + 8, -sz/2 + 10, sz, sz);
      ctx.globalAlpha = 1;
      ctx.drawImage(img, -sz/2, -sz/2, sz, sz);
    } else {
      ctx.fillStyle = '#2a1b26';
      ctx.beginPath(); ctx.arc(0,0,sz*.42,0,Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // 眼睛微光
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var exx = bx + Math.cos(angle) * (-sz * .06) - Math.sin(angle) * (-sz * .03);
    var eyy = world.bossY + Math.sin(angle) * (-sz * .06) + Math.cos(angle) * (-sz * .03);
    var eg = ctx.createRadialGradient(exx, eyy, 0, exx, eyy, sz * .16);
    eg.addColorStop(0, 'rgba(255,235,210,' + (C.bossShockT >= 0 ? .5 : .16) + ')');
    eg.addColorStop(1, 'rgba(255,180,120,0)');
    ctx.fillStyle = eg;
    ctx.beginPath(); ctx.arc(exx, eyy, sz * .16, 0, Math.PI * 2); ctx.fill();
    ctx.restore();

    // 漂浮灰烬
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(var ei=0; ei<22; ei++){
      var eph = C.t * (.22 + (ei%7)*.03) + ei*1.7;
      var ex = (Math.sin(eph) * .5 + .5) * fw * 1.2 - fw * .1;
      var ey = fh * .75 - ((C.t*.06 + ei*.13) % 1) * fh * .62;
      var ea = .10 + .08 * Math.sin(eph*2);
      if(ea < 0) continue;
      ctx.fillStyle = 'rgba(255,200,150,' + ea.toFixed(2) + ')';
      ctx.beginPath(); ctx.arc(ex, ey, 1.2 + (ei%3)*.7, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();

    // 英雄
    var hx = world.heroX;
    var hsx = hx - C.camX;
    var heroH = fh * .86;
    if(hsx > -fw * .5){
      ctx.save();
      ctx.globalCompositeOperation = 'source-over';
      DH.Hero.draw(ctx, hx, world.heroFeet, heroH, time, {guard:false, glow:true});
      // 剑柄与蓝色余刃
      var handX = hx + heroH * .17, handY = world.heroFeet - heroH * .50;
      ctx.globalCompositeOperation = 'lighter';
      var bg = ctx.createRadialGradient(handX, handY, 0, handX, handY, heroH * .35);
      bg.addColorStop(0, 'rgba(120,220,255,.35)');
      bg.addColorStop(1, 'rgba(80,180,255,0)');
      ctx.fillStyle = bg;
      ctx.beginPath(); ctx.arc(handX, handY, heroH * .35, 0, Math.PI*2); ctx.fill();
      // 剑柄
      ctx.fillStyle = '#d8b57a';
      ctx.fillRect(handX - 4, handY - 3, 26, 6);
      ctx.fillStyle = '#5fe6ff';
      ctx.fillRect(handX + 18, handY - 1.5, 6, 3);
      // 指向 BOSS 的细长蓝刃
      var bossSX = bx, bossSY = world.bossY;
      var grad = ctx.createLinearGradient(handX, handY, bossSX, bossSY);
      grad.addColorStop(0, 'rgba(160,240,255,.85)');
      grad.addColorStop(.7, 'rgba(90,210,255,.55)');
      grad.addColorStop(1, 'rgba(80,190,255,0)');
      ctx.strokeStyle = grad;
      ctx.lineWidth = 2.2;
      ctx.beginPath(); ctx.moveTo(handX + 24, handY); ctx.lineTo(bossSX, bossSY); ctx.stroke();
      ctx.restore();
    }

    // 蓝色利刃（飞行插入）
    if(C.stabT >= 0 && C.stabT < 2.6){
      drawBlade(bx, world.bossY, fw, fh);
    }
    // 插入后残留的光
    if(C.stabT >= 2.6){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      var sg = ctx.createRadialGradient(bx, world.bossY, 0, bx, world.bossY, sz * .6);
      sg.addColorStop(0, 'rgba(160,240,255,.18)');
      sg.addColorStop(1, 'rgba(120,210,255,0)');
      ctx.fillStyle = sg;
      ctx.beginPath(); ctx.arc(bx, world.bossY, sz * .6, 0, Math.PI * 2); ctx.fill();
      ctx.restore();
    }

    // 雾气/尘埃
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(var i=0;i<14;i++){
      var ph = time * (.16 + i * .017) + i * 2.1;
      var px = ((Math.sin(ph) * .5 + .5) * fw * 1.4 - fw * .2);
      var py = ((Math.cos(ph * 1.3) * .5 + .5) * fh * .8 + fh * .1);
      var a = .05 + .04 * Math.sin(ph * 2);
      var g2 = ctx.createRadialGradient(px, py, 0, px, py, fh * .1);
      g2.addColorStop(0, 'rgba(130,180,230,' + Math.max(0,a) + ')');
      g2.addColorStop(1, 'rgba(100,150,220,0)');
      ctx.fillStyle = g2;
      ctx.beginPath(); ctx.arc(px, py, fh * .1, 0, Math.PI*2); ctx.fill();
    }
    ctx.restore();
  }

  function drawBlade(bx, by, fw, fh){
    var t = C.stabT;
    var sz = fh * .50;
    var startX = bx + fw * .55;
    var startY = by - fh * .4;
    var endX = bx + fw * .015;
    var endY = by + fh * .24;
    var p = U.clamp(t / .28, 0, 1);
    var tipX = U.lerp(startX, endX, U.easeInCubic(p));
    var tipY = U.lerp(startY, endY, U.easeInCubic(p));
    // 刀身从右后方飞来，刀尖朝左
    var ang = Math.atan2(endY - startY, endX - startX);
    var len = fh * .95;
    var tailX = tipX - Math.cos(ang) * len;
    var tailY = tipY - Math.sin(ang) * len;
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var grad = ctx.createLinearGradient(tipX, tipY, tailX, tailY);
    grad.addColorStop(0, 'rgba(235,255,255,.98)');
    grad.addColorStop(.22, 'rgba(120,235,255,.9)');
    grad.addColorStop(.8, 'rgba(40,150,255,.35)');
    grad.addColorStop(1, 'rgba(30,120,255,0)');
    ctx.strokeStyle = grad;
    ctx.lineCap = 'round';
    ctx.lineWidth = fh * .035;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
    // 白芯
    ctx.strokeStyle = 'rgba(245,255,255,.95)';
    ctx.lineWidth = fh * .008;
    ctx.beginPath(); ctx.moveTo(tailX, tailY); ctx.lineTo(tipX, tipY); ctx.stroke();
    // 刃光
    var rg = ctx.createRadialGradient(tipX, tipY, 0, tipX, tipY, fh * .11);
    rg.addColorStop(0, 'rgba(240,255,255,.95)');
    rg.addColorStop(.35, 'rgba(120,230,255,.6)');
    rg.addColorStop(1, 'rgba(80,180,255,0)');
    ctx.fillStyle = rg;
    ctx.beginPath(); ctx.arc(tipX, tipY, fh * .11, 0, Math.PI*2); ctx.fill();
    ctx.restore();

    // 命中火花
    if(p >= 1 && t < 1.5){
      ctx.save();
      ctx.globalCompositeOperation = 'lighter';
      for(var i=0;i<10;i++){
        var a = Math.random() * Math.PI * 2;
        var r = Math.random() * fh * .12;
        ctx.fillStyle = 'rgba(160,240,255,' + (.6 * (1 - (t - .28) / 1.2)) + ')';
        ctx.beginPath(); ctx.arc(endX + Math.cos(a) * r, endY + Math.sin(a) * r, 1.6, 0, Math.PI*2); ctx.fill();
      }
      ctx.restore();
    }
  }

  function drawOverlay(fw, fh, rect){
    // 暗角
    var vg = ctx.createRadialGradient(fw/2, fh/2, fh*.3, fw/2, fh/2, fw*.7);
    vg.addColorStop(0, 'rgba(0,0,0,0)');
    vg.addColorStop(1, 'rgba(0,0,0,.72)');
    ctx.fillStyle = vg;
    ctx.fillRect(0, 0, fw, fh);
    // 闪白
    if(C.flash > 0){
      ctx.fillStyle = 'rgba(200,245,255,' + (C.flash * .7) + ')';
      ctx.fillRect(0, 0, fw, fh);
    }
    // 黑场切入
    if(C.cut){
      var t = U.clamp((C.t - 13.9) / .25, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + t + ')';
      ctx.fillRect(0, 0, fw, fh);
    }
  }

  function render(){
    var W = window.innerWidth, H = window.innerHeight;
    ctx.setTransform(C.dpr, 0, 0, C.dpr, 0, 0);
    ctx.clearRect(0, 0, W, H);
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, W, H);
    var f = frameRect();
    var fw = f.w, fh = f.h;
    ctx.save();
    ctx.beginPath();
    ctx.rect(f.x, f.y, fw, fh);
    ctx.clip();
    ctx.translate(f.x, f.y);
    drawBackground(fw, fh);
    ctx.save();
    // 变焦
    var zx = fw * .55, zy = fh * .6;
    ctx.translate(zx, zy);
    ctx.scale(C.zoom, C.zoom);
    ctx.translate(-zx, -zy);
    // 镜头平移
    ctx.translate(-C.camX, 0);
    drawWorld(fw, fh);
    ctx.restore();
    drawOverlay(fw, fh, f);
    ctx.restore();
    // 画幅之外纯黑
    ctx.fillStyle = '#000';
    if(f.y > 0) ctx.fillRect(0, 0, W, f.y);
    if(f.y + fh < H) ctx.fillRect(0, f.y + fh, W, H - f.y - fh);
    // 黑场整体
    if(C.cut){
      var t2 = U.clamp((C.t - 13.9) / .2, 0, 1);
      ctx.fillStyle = 'rgba(0,0,0,' + t2 + ')';
      ctx.fillRect(0, 0, W, H);
    }
    if((location.search||'').indexOf('debug') >= 0){
      // 调试标记：世界坐标可视化
      var camX = C.camX, fw2 = f.w, fh2 = f.h;
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.restore();
      ctx.save();
      ctx.translate(f.x, f.y);
      ctx.translate(-camX, 0);
      ctx.globalCompositeOperation = 'lighter';
      ctx.strokeStyle = 'rgba(255,0,0,.8)'; ctx.lineWidth = 3;
      ctx.beginPath(); ctx.moveTo(0, 0); ctx.lineTo(0, fh); ctx.stroke();
      ctx.strokeStyle = 'rgba(0,255,0,.8)';
      ctx.beginPath(); ctx.moveTo(-fw2 * 1.12, 0); ctx.lineTo(-fw2 * 1.12, fh); ctx.stroke();
      ctx.restore();
      ctx.save();
      ctx.fillStyle = '#0f0';
      ctx.font = 'bold 16px monospace';
      ctx.fillText('t=' + C.t.toFixed(2) + ' cam=' + camX.toFixed(0) + ' fw=' + fw2.toFixed(0) + ' boss=0 hero=' + (-fw2*1.12).toFixed(0), f.x + 6, f.y + 18);
      ctx.restore();
    }
    if((location.search||'').indexOf('mirror') >= 0){
      C._mirrorT = C._mirrorT || 0;
      var mt = performance.now();
      if(mt - C._mirrorT > 700){
        C._mirrorT = mt;
        try{
          var mir = document.getElementById('dh-cmirror');
          if(!mir){
            mir = document.createElement('img');
            mir.id = 'dh-cmirror';
            mir.style.cssText = 'position:fixed;left:0;top:0;width:100vw;height:100vh;z-index:9997;pointer-events:none;';
            document.body.appendChild(mir);
          }
          mir.src = canvas.toDataURL('image/jpeg', .75);
        }catch(e){}
      }
    }
  }

  DH.Cinematic = {
    init:init, start:start, frame:frame, skip:skipAll,
    resize:resize,
    get active(){ return C.active; },
    get t(){ return C.t; },
    get cam(){ return {camX:C.camX, panT:C.panT, fw:C.frameW, fh:C.frameH, zoom:C.zoom}; },
    get frozen(){ return C.frozen; }
  };
})();
