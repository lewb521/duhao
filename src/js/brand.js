/* ============================================================
   brand.js —— 「嘟豪」招牌：一镜到底的悬挂、移动、变色、放大
   单一元素贯穿 主界面 → 游戏 → 结局 → 字幕 → 主界面
   ============================================================ */
(function(){
  window.DH = window.DH || {};

  var GW = 360, GH = 189, ROPE = 92, ORIGIN_Y = ROPE + GH / 2;
  var WHITE = [234, 246, 255];
  var INK = [20, 21, 25];

  var el, ghostEl, ropeEl, knotEl;
  var inkImgs = [], lightImgs = [], ghostInk = [], ghostLight = [];
  var started = false;
  var t0 = 0;

  var S = {
    x:0, y:0, s:1, col:[20,21,25], white:false, big:false,
    anchor:null, anchorOff:[0,0], visible:true
  };
  var A = null; // 当前动画 {fx,fy,fs,fc, tx,ty,ts,tc, bendX,bendY, t, dur, ease, onDone}
  var _log = [];
  var _updates = 0;
  function _logPush(m){ _log.push((performance.now()|0) + ' ' + m); if(_log.length > 6) _log.shift(); }
  var G = { x:0, y:0, s:1, col:[20,21,25] }; // 幽灵拖尾
  var lastPointer = { x:0, y:0 };

  function applyColor(c, alpha){
    var wf = DH.U.clamp((c[0] - 20) / 214, 0, 1);
    var i;
    for(i=0;i<inkImgs.length;i++) inkImgs[i].style.opacity = '1';
    for(i=0;i<lightImgs.length;i++) lightImgs[i].style.opacity = wf.toFixed(3);
    for(i=0;i<ghostInk.length;i++) ghostInk[i].style.opacity = '1';
    for(i=0;i<ghostLight.length;i++) ghostLight[i].style.opacity = wf.toFixed(3);
  }

  function place(node, x, y, s, sway){
    node.style.transform = 'translate3d(' + (x - GW/2) + 'px,' + (y - ORIGIN_Y) + 'px,0) rotate(' + sway + 'deg) scale(' + s + ')';
  }

  function syncClasses(){
    el.classList.toggle('white', S.white);
    el.classList.toggle('big', S.big);
  }

  function measure(anchor, off){
    if(!anchor) return null;
    var r = anchor.getBoundingClientRect();
    if(!r.width) return null;
    return {
      x: r.left + r.width/2 + (off ? off[0] : 0),
      y: r.top + r.height/2 + (off ? off[1] : 0),
      w: r.width
    };
  }

  function targetFor(anchorId, off){
    var m = measure(document.getElementById(anchorId), off);
    if(!m) return null;
    return { x:m.x, y:m.y, s:m.w / GW };
  }

  function animateTo(tx, ty, ts, col, dur, ease, onDone){
    _logPush('anim -> ' + (tx|0) + ',' + (ty|0) + ' s' + (ts||0).toFixed(2));
    var fromCol = S.col.slice();
    A = {
      fx:S.x, fy:S.y, fs:S.s, fc:fromCol,
      tx:tx, ty:ty, ts:ts, tc:col,
      bendX:0, bendY:0,
      t:0, dur:(dur == null ? 900 : dur) / 1000,
      ease:ease || DH.U.easeInOutQuart, onDone:onDone || null
    };
    // 弧形轨迹：位移越长，弯曲越明显
    var dx = tx - S.x, dy = ty - S.y, d = Math.sqrt(dx*dx + dy*dy);
    if(d > 60){
      var bend = Math.min(120, d * 0.14);
      // 顺时针/逆时针随方向，向上拱起
      A.bendX = -dy / d * bend * 0.35;
      A.bendY = -Math.abs(dx) / d * bend;
    }
  }

  function update(dt, now){
    _updates++;
    if(!started) return;
    var sway = 0;
    if(!A){
      // 悬挂微摆
      sway = Math.sin(now * 0.0009) * (S.s < 0.4 ? 1.15 : 0.62);
      el.style.transform = 'translate3d(' + (S.x - GW/2) + 'px,' + (S.y - ORIGIN_Y) + 'px,0) rotate(' + sway + 'deg) scale(' + S.s + ')';
    } else {
      A.t += dt;
      var p = DH.U.clamp(A.t / A.dur, 0, 1);
      var e = A.ease(p);
      // 二次贝塞尔弧
      var cx = (A.fx + A.tx)/2 + A.bendX;
      var cy = (A.fy + A.ty)/2 + A.bendY;
      var mt = 1 - e;
      S.x = mt*mt*A.fx + 2*mt*e*cx + e*e*A.tx;
      S.y = mt*mt*A.fy + 2*mt*e*cy + e*e*A.ty;
      S.s = DH.U.lerp(A.fs, A.ts, e);
      S.col = [ DH.U.lerp(A.fc[0], A.tc[0], e), DH.U.lerp(A.fc[1], A.tc[1], e), DH.U.lerp(A.fc[2], A.tc[2], e) ];
      S.white = S.col[0] > 110;
      S.big = S.white && S.s > (S.baseMenuScale || 1) * 1.3;
      applyColor(S.col);
      syncClasses();
      // 速度用于拖尾
      var wobble = Math.sin(now * 0.02) * (0.4 * e * (1-e));
      el.style.transform = 'translate3d(' + (S.x - GW/2) + 'px,' + (S.y - ORIGIN_Y) + 'px,0) rotate(' + (sway + wobble) + 'deg) scale(' + S.s + ')';
      if(p >= 1){
        var cb = A.onDone;
        A = null;
        if(cb) cb();
      }
    }

    // 幽灵拖尾
    var k = 0.16;
    G.x += (S.x - G.x) * k;
    G.y += (S.y - G.y) * k;
    G.s += (S.s - G.s) * k;
    var spd = Math.abs(S.x - G.x) + Math.abs(S.y - G.y) + Math.abs(S.s - G.s) * 300;
    var op = DH.U.clamp((spd - 2) / 45, 0, 1) * 0.32;
    ghostEl.style.opacity = op;
    ghostEl.style.transform = 'translate3d(' + (G.x - GW/2) + 'px,' + (G.y - ORIGIN_Y) + 'px,0) scale(' + G.s + ')';

    // 根据位置调整挂绳透明度（主界面更实）
    ropeEl.style.opacity = S.s > 0.4 ? '1' : '.9';
  }

  function snapToTarget(anchorId, off, col){
    var tg = targetFor(anchorId, off);
    if(!tg) return false;
    S.x = tg.x; S.y = tg.y; S.s = tg.s;
    S.col = (col || INK).slice();
    S.white = S.col[0] > 110;
    G.x = S.x; G.y = S.y; G.s = S.s;
    applyColor(S.col);
    syncClasses();
    return true;
  }

  function resize(){
    if(DH.Brand.anchorId){
      var tg = targetFor(DH.Brand.anchorId, DH.Brand.anchorOff);
      if(tg){
        if(!A){
          animateTo(tg.x, tg.y, tg.s, DH.Brand.anchorWhite ? WHITE : INK, 420, DH.U.easeOutCubic);
        }
      }
    }
  }

  DH.Brand = {
    anchorId:null,
    anchorOff:[0,0],
    anchorWhite:false,
    init:function(){
      el = document.getElementById('brand');
      ghostEl = document.getElementById('brand-ghost');
      ropeEl = el.querySelector('.brand-rope');
      knotEl = el.querySelector('.brand-knot');
      if(!el) return;
      inkImgs = Array.prototype.slice.call(el.querySelectorAll('.brand-img[data-tone="ink"]'));
      lightImgs = Array.prototype.slice.call(el.querySelectorAll('.brand-img[data-tone="light"]'));
      ghostInk = Array.prototype.slice.call(ghostEl.querySelectorAll('.brand-img[data-tone="ink"]'));
      ghostLight = Array.prototype.slice.call(ghostEl.querySelectorAll('.brand-img[data-tone="light"]'));
      var urlInk = DH.Assets ? DH.Assets.url('logo_ink') : '../assets/images/logo_ink.png';
      var urlLight = DH.Assets ? DH.Assets.url('logo_light') : '../assets/images/logo_light.png';
      inkImgs.concat(ghostInk).forEach(function(im){ im.src = urlInk; });
      lightImgs.concat(ghostLight).forEach(function(im){ im.src = urlLight; });
      started = true;
      applyColor(INK);
      syncClasses();
      window.addEventListener('resize', resize);
      window.addEventListener('orientationchange', function(){ setTimeout(resize, 260); });
    },
    // 主界面
    toMenu:function(dur, cb){
      DH.Brand.anchorId = 'brand-slot-menu';
      DH.Brand.anchorOff = [0,0];
      DH.Brand.anchorWhite = false;
      var tg = targetFor('brand-slot-menu', [0,0]);
      if(!tg){ if(cb) cb(); return; }
      animateTo(tg.x, tg.y, tg.s, INK, dur || 1000, DH.U.easeInOutQuart, cb);
    },
    // 游戏右上角
    toGame:function(dur, cb){
      _logPush('toGame called');
      DH.Brand.anchorId = 'brand-slot-game';
      DH.Brand.anchorOff = [0,0];
      DH.Brand.anchorWhite = true;
      var tg = targetFor('brand-slot-game', [0,0]);
      if(!tg){ if(cb) cb(); return; }
      animateTo(tg.x, tg.y, tg.s, WHITE, dur || 1050, DH.U.easeInOutQuart, cb);
    },
    // 结局：屏幕中央放大（白色）
    toCenter:function(dur, cb){
      DH.Brand.anchorId = null;
      var w = Math.min(window.innerWidth * .74, window.innerHeight * .5, 560);
      var sc = w / GW;
      var cx = window.innerWidth / 2;
      var cy = window.innerHeight * .50;
      S.baseMenuScale = w / GW;
      animateTo(cx, cy, sc, WHITE, dur || 900, DH.U.easeOutExpo, cb);
    },
    // 字幕阶段：略微上移，保持白色
    toCredits:function(dur, cb){
      DH.Brand.anchorId = null;
      var w = Math.min(window.innerWidth * .56, window.innerHeight * .34, 420);
      var cx = window.innerWidth / 2;
      var cy = window.innerHeight * .265;
      animateTo(cx, cy, w / GW, WHITE, dur || 900, DH.U.easeInOutQuart, cb);
    },
    // 隐藏/显示
    fade:function(show, dur){
      // 通过动画到小尺寸实现“收起”，字幕阶段用
      if(!show) animateTo(S.x, S.y, 0.0001, S.col, dur || 500, DH.U.easeInCubic);
    },
    setInstant:snapToTarget,
    update:update,
    resize:resize,
    state:S,
    _log:_log,
    _getA:function(){ return A; },
    _dbg:function(){ return 'started=' + started + ' upd' + _updates + ' A' + (A ? (A.t.toFixed(2)+'/'+A.dur) : '-') + ' S' + (S.x|0) + ',' + (S.y|0); },
    _animate:animateTo
  };
})();
