/* ============================================================
   fx.js —— 工具函数 / 粒子 / 屏幕震动 / 伤害数字
   ============================================================ */
(function(){
  window.DH = window.DH || {};

  var U = {
    clamp:function(v,a,b){ return v < a ? a : (v > b ? b : v); },
    lerp:function(a,b,t){ return a + (b - a) * t; },
    rand:function(a,b){ return a + Math.random() * (b - a); },
    randInt:function(a,b){ return Math.floor(a + Math.random() * (b - a + 1)); },
    pick:function(arr){ return arr[Math.floor(Math.random() * arr.length)]; },
    chance:function(p){ return Math.random() < p; },
    dist:function(x1,y1,x2,y2){ var dx=x2-x1, dy=y2-y1; return Math.sqrt(dx*dx+dy*dy); },
    // 缓动
    easeOutCubic:function(t){ return 1 - Math.pow(1-t,3); },
    easeInCubic:function(t){ return t*t*t; },
    easeInOutCubic:function(t){ return t < .5 ? 4*t*t*t : 1 - Math.pow(-2*t+2,3)/2; },
    easeOutQuart:function(t){ return 1 - Math.pow(1-t,4); },
    easeOutExpo:function(t){ return t >= 1 ? 1 : 1 - Math.pow(2,-10*t); },
    easeInOutQuart:function(t){ return t < .5 ? 8*t*t*t*t : 1 - Math.pow(-2*t+2,4)/2; },
    easeOutBack:function(t){ var c1=1.70158,c3=c1+1; return 1 + c3*Math.pow(t-1,3) + c1*Math.pow(t-1,2); },
    easeOutElastic:function(t){
      if(t===0||t===1) return t;
      return Math.pow(2,-10*t) * Math.sin((t*10-.75)*(2*Math.PI/3)) + 1;
    },
    hexToRgb:function(hex){
      hex = hex.replace('#','');
      if(hex.length===3) hex = hex[0]+hex[0]+hex[1]+hex[1]+hex[2]+hex[2];
      var n = parseInt(hex,16);
      return [ (n>>16)&255, (n>>8)&255, n&255 ];
    },
    rgbToCss:function(r,g,b,a){ return 'rgba(' + (r|0) + ',' + (g|0) + ',' + (b|0) + ',' + (a==null?1:a) + ')'; },
    fmt:function(n){ return Math.round(n).toString(); }
  };
  DH.U = U;

  // ---------- 粒子系统 ----------
  var MAX = 420;
  var parts = [];
  var rings = [];
  var texts = [];
  var shakeT = 0, shakeDur = 0, shakeAmp = 0, shakeX = 0, shakeY = 0;

  function reset(){ parts.length = 0; rings.length = 0; texts.length = 0; shakeT = shakeDur = shakeAmp = 0; }
  function cap(){ if(parts.length > MAX) parts.splice(0, parts.length - MAX); }

  function emit(o){
    if(parts.length >= MAX) return;
    parts.push({
      x:o.x, y:o.y,
      vx:o.vx || 0, vy:o.vy || 0,
      ax:o.ax || 0, ay:o.ay || 0,
      life:o.life || .8, age:0,
      size:o.size || 2, size2:o.size2 == null ? 0 : o.size2,
      col:o.col || '#9df6ff',
      col2:o.col2 || null,
      alpha:o.alpha == null ? 1 : o.alpha,
      grav:o.grav || 0,
      drag:o.drag == null ? .99 : o.drag,
      glow:o.glow !== false,
      kind:o.kind || 'dot',
      rot:o.rot || 0,
      vrot:o.vrot || 0,
      len:o.len || 6
    });
  }

  function spark(x,y,opts){
    opts = opts || {};
    var n = opts.n || 12;
    for(var i=0;i<n;i++){
      var a = opts.angle == null ? Math.random()*Math.PI*2 : opts.angle + U.rand(-.9,.9);
      var sp = U.rand(opts.spdMin || 60, opts.spd || 260);
      emit({
        x:x + U.rand(-4,4), y:y + U.rand(-4,4),
        vx:Math.cos(a)*sp, vy:Math.sin(a)*sp,
        life:U.rand(.3,.75), size:U.rand(1.5,3.6), size2:0,
        col:opts.col || '#eaf0f6', alpha:1, drag:.94, grav:opts.grav||0,
        kind:'spark', len:U.rand(4,10)
      });
    }
  }

  function dust(x,y,w,h,n){
    n = n || 1;
    for(var i=0;i<n;i++){
      emit({
        x:x + U.rand(-w/2,w/2), y:y + U.rand(-h/2,h/2),
        vx:U.rand(-8,8), vy:U.rand(-16,-4),
        life:U.rand(2.4,5), size:U.rand(1,2.6), col:'rgba(190,230,255,.55)',
        alpha:U.rand(.15,.5), drag:.995, kind:'dot', glow:true
      });
    }
  }

  function ring(x,y,r0,r1,life,col,lw){
    rings.push({ x:x,y:y,r0:r0,r1:r1,life:life||.5,age:0,col:col||'rgba(255,255,255,.8)',lw:lw||2 });
  }

  function text(x,y,str,opts){
    opts = opts || {};
    texts.push({
      x:x, y:y, str:str, life:opts.life || .95, age:0,
      col:opts.col || '#fff', size:opts.size || 22,
      vy:opts.vy == null ? -58 : opts.vy, vx:opts.vx == null ? 0 : opts.vx,
      stroke:opts.stroke || 'rgba(0,0,0,.75)', glow:opts.glow || 'rgba(120,230,255,.6)',
      bold:opts.bold !== false
    });
  }

  function shake(amp, dur){
    if(dur == null) dur = .3;
    if(amp > shakeAmp || shakeT >= shakeDur){ shakeAmp = amp; shakeDur = dur; shakeT = 0; }
  }

  function update(dt, ctx){
    var i, p, r, tx;
    for(i = parts.length - 1; i >= 0; i--){
      p = parts[i];
      p.age += dt;
      if(p.age >= p.life){ parts.splice(i,1); continue; }
      p.vx += p.ax * dt; p.vy += p.ay * dt;
      p.vy += p.grav * dt;
      p.vx *= p.drag; p.vy *= p.drag;
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.rot += p.vrot * dt;
    }
    for(i = rings.length - 1; i >= 0; i--){
      r = rings[i]; r.age += dt;
      if(r.age >= r.life) rings.splice(i,1);
    }
    for(i = texts.length - 1; i >= 0; i--){
      tx = texts[i]; tx.age += dt;
      if(tx.age >= tx.life){ texts.splice(i,1); continue; }
      tx.x += tx.vx * dt; tx.y += tx.vy * dt;
      tx.vy *= .96;
    }
    // 震动
    if(shakeT < shakeDur){
      shakeT += dt;
      var k = 1 - shakeT / shakeDur;
      var a = shakeAmp * k * k;
      shakeX = (Math.random()*2-1) * a;
      shakeY = (Math.random()*2-1) * a;
    } else { shakeX = shakeY = 0; shakeAmp = 0; }
  }

  function draw(ctx){
    var i, p, r, tx;
    // 光环
    ctx.save();
    ctx.globalCompositeOperation = 'lighter';
    for(i=0;i<rings.length;i++){
      r = rings[i];
      var t = r.age / r.life;
      var rad = U.lerp(r.r0, r.r1, U.easeOutCubic(t));
      ctx.beginPath();
      ctx.arc(r.x, r.y, Math.max(.1,rad), 0, Math.PI*2);
      ctx.strokeStyle = r.col;
      ctx.globalAlpha = (1-t) * .9;
      ctx.lineWidth = r.lw * (1-t*.6);
      ctx.stroke();
    }
    ctx.restore();

    // 粒子
    ctx.save();
    for(i=0;i<parts.length;i++){
      p = parts[i];
      var tt = p.age / p.life;
      var alpha = p.alpha * (1 - tt*tt);
      if(alpha <= .003) continue;
      if(p.glow) ctx.globalCompositeOperation = 'lighter';
      else ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = alpha;
      if(p.kind === 'spark'){
        var sp = Math.sqrt(p.vx*p.vx + p.vy*p.vy) || 1;
        var nx = p.vx/sp, ny = p.vy/sp;
        ctx.strokeStyle = p.col;
        ctx.lineWidth = p.size * (1-tt*.7);
        ctx.lineCap = 'round';
        ctx.beginPath();
        ctx.moveTo(p.x - nx*p.len, p.y - ny*p.len);
        ctx.lineTo(p.x, p.y);
        ctx.stroke();
      } else if(p.kind === 'shard'){
        ctx.save();
        ctx.translate(p.x,p.y);
        ctx.rotate(p.rot);
        ctx.fillStyle = p.col;
        ctx.fillRect(-p.size/2, -p.size/2, p.size, p.size*1.8);
        ctx.restore();
      } else if(p.kind === 'slash'){
        ctx.strokeStyle = p.col;
        ctx.lineWidth = p.size;
        ctx.globalAlpha = alpha * .8;
        ctx.beginPath();
        ctx.moveTo(p.x - p.len, p.y);
        ctx.quadraticCurveTo(p.x, p.y - p.len*.4, p.x + p.len, p.y - p.len*.12);
        ctx.stroke();
      } else {
        // 圆点 / 光斑
        var grd = ctx.createRadialGradient(p.x, p.y, 0, p.x, p.y, p.size*2.4);
        var c2 = p.col2 || p.col;
        grd.addColorStop(0, p.col);
        grd.addColorStop(.45, c2);
        grd.addColorStop(1, 'rgba(0,0,0,0)');
        ctx.fillStyle = grd;
        ctx.beginPath();
        ctx.arc(p.x, p.y, p.size*2.4, 0, Math.PI*2);
        ctx.fill();
      }
    }
    ctx.restore();

    // 伤害数字
    ctx.save();
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    for(i=0;i<texts.length;i++){
      tx = texts[i];
      var tt2 = tx.age / tx.life;
      var al = tt2 < .15 ? tt2/.15 : (1 - (tt2-.15)/.85);
      ctx.globalAlpha = U.clamp(al,0,1);
      var fs = tx.size * (tt2 < .12 ? (1 + (1-tt2/.12)*.55) : 1);
      ctx.font = '900 ' + fs + 'px "DHFont","Alibaba PuHuiTi","PingFang SC",sans-serif';
      ctx.lineWidth = Math.max(3, fs*.14);
      ctx.strokeStyle = tx.stroke;
      ctx.lineJoin = 'round';
      ctx.strokeText(tx.str, tx.x, tx.y);
      ctx.shadowColor = tx.glow; ctx.shadowBlur = 12;
      ctx.fillStyle = tx.col;
      ctx.fillText(tx.str, tx.x, tx.y);
      ctx.shadowBlur = 0;
    }
    ctx.restore();
  }

  DH.FX = {
    reset:reset, emit:emit, spark:spark, dust:dust, ring:ring, text:text, shake:shake,
    update:update, draw:draw, parts:parts,
    get shakeX(){ return shakeX; }, get shakeY(){ return shakeY; },
    applyShake:function(ctx){ if(shakeX || shakeY) ctx.translate(shakeX, shakeY); }
  };
})();
