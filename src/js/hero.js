/* ============================================================
   hero.js —— 主角「嘟豪」像素小人 + 量子护盾（程序化绘制）
   像素网格 32×48，先渲染到离屏 canvas 再最近邻缩放
   ============================================================ */
(function(){
  window.DH = window.DH || {};

  var W = 32, H = 48, S = 4; // 逻辑像素 / 放大倍率
  var PAL = {
    hair:'#0b1017', hairHi:'#28333f', skin:'#d6a172', skinSh:'#b17c50',
    robe:'#182430', robeHi:'#2a3d4e', robeLo:'#0e161e', dark:'#070b10',
    cyan:'#dfe9f3', cyanHi:'#ffffff', cyanLo:'#7f8b98',
    steel:'#d5eaf2', steelHi:'#f4fdff', hilt:'#a3804c', hiltHi:'#d8b57a',
    boot:'#10151c', scarf:'#434d58'
  };

  function rect(c, x, y, w, h, col){
    c.fillStyle = col;
    c.fillRect(x, y, w, h);
  }

  // 画一帧主角：朝向右侧（面向 BOSS）
  function drawPixelHero(c, opt){
    opt = opt || {};
    var breath = opt.breath ? 1 : 0;

    // 披风（身后，向左飘）
    rect(c, 6, 14, 4, 15, PAL.robeLo);
    rect(c, 4, 18, 3, 12, PAL.robeLo);
    rect(c, 3, 22, 2, 9, PAL.robeLo);
    rect(c, 5, 30, 3, 2, PAL.cyanLo);
    rect(c, 7, 27, 3, 1, PAL.cyanLo);

    // 后腿
    rect(c, 18, 34, 4, 9, PAL.dark);
    rect(c, 19, 43, 5, 3, PAL.boot);
    rect(c, 18, 45, 7, 2, PAL.boot);

    // 前腿
    rect(c, 12, 34, 4, 10, PAL.robeLo);
    rect(c, 13, 44, 4, 3, PAL.boot);
    rect(c, 12, 46, 7, 1, PAL.boot);
    rect(c, 21, 47, 7, 1, 'rgba(0,0,0,.35)');

    // 袍摆（向左展开）
    rect(c, 9, 25, 15, 3, PAL.robe);
    rect(c, 7, 28, 18, 3, PAL.robe);
    rect(c, 5, 31, 21, 3, PAL.robe);
    rect(c, 4, 34, 22, 2, PAL.robeLo);
    rect(c, 5, 33, 20, 1, PAL.robeHi);
    rect(c, 4, 35, 22, 1, PAL.cyanLo);

    // 躯干
    rect(c, 11, 15, 12, 10, PAL.robe);
    rect(c, 12, 16, 4, 8, PAL.robeHi);
    rect(c, 20, 16, 2, 7, PAL.robeLo);
    // 交领
    rect(c, 14, 12, 5, 3, PAL.scarf);
    rect(c, 13, 14, 7, 2, PAL.dark);
    rect(c, 16, 13, 1, 6, PAL.cyan);
    // 腰带
    rect(c, 10, 23, 15, 2, PAL.cyan);
    rect(c, 14, 23, 3, 2, PAL.cyanHi);
    rect(c, 10, 25, 15, 1, PAL.cyanLo);

    // 右臂（面向 BOSS 的一侧，持剑）
    rect(c, 22, 15, 4, 5, PAL.robe);
    rect(c, 23, 19, 3, 4, PAL.robeHi);
    rect(c, 23, 22, 3, 2, PAL.skin);
    // 左臂
    rect(c, 9, 16, 3, 5, PAL.robe);
    rect(c, 8, 20, 3, 4, PAL.robeLo);
    rect(c, 8, 23, 2, 2, PAL.skinSh);

    // 剑（斜向右下，像素阶梯，短一些以免抢戏）
    rect(c, 23, 22, 4, 2, PAL.hilt);
    rect(c, 24, 21, 1, 4, PAL.hiltHi);
    rect(c, 25, 24, 2, 3, PAL.steel);
    rect(c, 26, 27, 2, 3, PAL.steelHi);
    rect(c, 27, 30, 2, 3, PAL.steel);
    rect(c, 28, 33, 1, 2, PAL.steelHi);
    rect(c, 25, 24, 1, 2, PAL.steelHi);
    rect(c, 22, 23, 1, 1, PAL.cyanLo);

    // 头发（后束 + 高发髻）
    rect(c, 13, 3, 9, 4, PAL.hair);
    rect(c, 15, 1, 4, 3, PAL.hair);
    rect(c, 16, 0, 3, 2, PAL.hair);
    rect(c, 16, 2, 4, 1, PAL.cyan);
    rect(c, 11, 6, 3, 6, PAL.hair);
    rect(c, 20, 6, 3, 7, PAL.hair);
    rect(c, 14, 4, 4, 1, PAL.hairHi);

    // 脸
    rect(c, 14, 5, 6, 6, PAL.skin);
    rect(c, 14, 9, 5, 2, PAL.skinSh);
    rect(c, 19, 9, 1, 2, PAL.skinSh);
    rect(c, 20, 8, 1, 2, PAL.skin);
    // 刘海
    rect(c, 14, 4, 7, 2, PAL.hair);
    rect(c, 17, 5, 3, 1, PAL.hair);
    // 眼与眉（坚毅）
    rect(c, 17, 7, 2, 1, PAL.dark);
    rect(c, 18, 8, 1, 1, PAL.skinSh);
    rect(c, 17, 6, 3, 1, PAL.hair);
    // 颈部
    rect(c, 15, 10, 5, 2, PAL.skinSh);

    // 青色轮廓光（右侧）
    rect(c, 24, 14, 1, 4, PAL.cyan);
    rect(c, 25, 20, 1, 3, PAL.cyanLo);
    rect(c, 25, 29, 1, 3, PAL.cyanLo);
    rect(c, 22, 31, 1, 2, PAL.cyanLo);
    // 袍角摆动帧差异
    if(breath){
      rect(c, 4, 33, 2, 2, PAL.robeLo);
      rect(c, 5, 35, 3, 1, PAL.cyanLo);
      rect(c, 21, 30, 2, 2, PAL.robeHi);
    } else {
      rect(c, 6, 32, 2, 2, PAL.robeLo);
      rect(c, 3, 34, 3, 1, PAL.robeLo);
      rect(c, 20, 31, 2, 2, PAL.robeHi);
    }
  }

  var frames = null;

  function makeFrame(breath){
    var cv = document.createElement('canvas');
    cv.width = W * S; cv.height = H * S;
    var c = cv.getContext('2d');
    c.imageSmoothingEnabled = false;
    c.scale(S, S);
    drawPixelHero(c, {breath:breath});
    return cv;
  }

  function ensure(){
    if(frames) return frames;
    frames = [makeFrame(0), makeFrame(1)];
    return frames;
  }

  function draw(ctx, x, y, h, t, opts){
    opts = opts || {};
    var fr = ensure();
    var scale = h / H;
    var w = W * scale;
    var bob = Math.sin(t * 2.2) * h * 0.012;
    if(opts.guard) bob -= h * .006;

    // 地面阴影
    ctx.save();
    ctx.globalAlpha = .55;
    var sg = ctx.createRadialGradient(x, y + 2, 0, x, y + 2, w * .95);
    sg.addColorStop(0, 'rgba(0,0,0,.62)');
    sg.addColorStop(.5, 'rgba(0,0,0,.3)');
    sg.addColorStop(1, 'rgba(0,0,0,0)');
    ctx.fillStyle = sg;
    ctx.beginPath();
    ctx.ellipse(x, y + h * .015, w * .95, h * .06, 0, 0, Math.PI * 2);
    ctx.fill();
    ctx.restore();

    // 呼吸光晕
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(x, y - h * .45, 0, x, y - h * .45, w * 1.8);
    g.addColorStop(0, 'rgba(80,215,240,' + (opts.glow ? .22 : .1) + ')');
    g.addColorStop(1, 'rgba(80,215,240,0)');
    ctx.fillStyle = g;
    ctx.fillRect(x - w * 2, y - h * 1.4, w * 4, h * 1.6);
    ctx.restore();

    ctx.save();
    ctx.imageSmoothingEnabled = false;
    if(opts.hurt){
      ctx.globalAlpha = .85;
    }
    var idx = Math.floor(t * 2.4) % 2;
    var _im = fr[idx];
    if(_im && _im.width){ ctx.drawImage(_im, x - w / 2, y - h + bob, w, h); }
    if(opts.hurt){
      ctx.globalCompositeOperation = 'source-atop';
      ctx.fillStyle = 'rgba(255,60,80,.5)';
      ctx.fillRect(x - w / 2, y - h + bob, w, h);
    }
    ctx.restore();
  }

  // 量子护盾：六边形能量场，面向右侧 BOSS
  function drawShield(ctx, cx, cy, r, t, state){
    state = state || 'idle';
    var pulse = .5 + .5 * Math.sin(t * 3.1);
    var alpha = (state === 'reflect') ? 1 : (state === 'guard' ? .82 : .55);
    var rot = t * .35 + (state === 'reflect' ? (t * 2.2) : 0);
    if(state === 'reflect'){
      alpha = .35 + .65 * Math.abs(Math.sin(t * 24));
    }

    ctx.save();
    ctx.translate(cx, cy);
    // 外发光
    ctx.globalCompositeOperation = 'lighter';
    var g = ctx.createRadialGradient(0, 0, r * .2, 0, 0, r * 1.9);
    g.addColorStop(0, 'rgba(235,242,250,' + (.24 * alpha) + ')');
    g.addColorStop(.55, 'rgba(200,214,228,' + (.1 * alpha) + ')');
    g.addColorStop(1, 'rgba(40,140,220,0)');
    ctx.fillStyle = g;
    ctx.beginPath();
    ctx.arc(0, 0, r * 1.9, 0, Math.PI * 2);
    ctx.fill();

    // 六边形主面
    function hex(rad, ang, fill, stroke, lw, dash){
      ctx.beginPath();
      for(var i = 0; i < 6; i++){
        var a = ang + i * Math.PI / 3;
        var px = Math.cos(a) * rad, py = Math.sin(a) * rad;
        if(i === 0) ctx.moveTo(px, py); else ctx.lineTo(px, py);
      }
      ctx.closePath();
      if(fill){ ctx.fillStyle = fill; ctx.fill(); }
      if(stroke){ ctx.strokeStyle = stroke; ctx.lineWidth = lw || 1.5; if(dash) ctx.setLineDash(dash); ctx.stroke(); ctx.setLineDash([]); }
    }
    hex(r, rot, 'rgba(235,242,250,' + (.1 * alpha) + ')', 'rgba(255,255,255,' + (.7 * alpha) + ')', 2.2);
    hex(r * .72, -rot * 1.3, null, 'rgba(226,236,246,' + (.32 * alpha) + ')', 1.2, [5, 6]);

    // 内部纹路
    ctx.globalCompositeOperation = 'lighter';
    hex(r * .4, rot * 1.6, 'rgba(255,255,255,' + (.12 * alpha) + ')', 'rgba(255,255,255,' + (.5 * alpha) + ')', 1);
    ctx.beginPath();
    ctx.arc(0, 0, r * .12, 0, Math.PI * 2);
    ctx.fillStyle = 'rgba(255,255,255,' + (.7 * alpha) + ')';
    ctx.fill();

    // 反射闪光
    if(state === 'reflect'){
      ctx.globalCompositeOperation = 'lighter';
      var fg = ctx.createRadialGradient(0, 0, 0, 0, 0, r * 1.6);
      fg.addColorStop(0, 'rgba(255,255,255,.9)');
      fg.addColorStop(.35, 'rgba(180,250,255,.5)');
      fg.addColorStop(1, 'rgba(120,230,255,0)');
      ctx.fillStyle = fg;
      ctx.beginPath();
      ctx.arc(0, 0, r * 1.6, 0, Math.PI * 2);
      ctx.fill();
    }
    ctx.restore();
  }

  DH.Hero = { draw:draw, drawShield:drawShield, W:W, H:H };
})();
