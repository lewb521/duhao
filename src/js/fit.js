/* ============================================================
   fit.js —— 自适应屏幕：视口单位、设备档位、旋转/缩放自适应
   1) 用 visualViewport 计算真实可视高度，避免移动端地址栏遮挡
   2) 按屏幕尺寸给 <body> 打档位类：竖/横、紧凑、大屏、极小屏
   3) 统一派发 dh-fit 事件，让招牌/战斗/电影画布各自重排
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var raf = 0, lastW = 0, lastH = 0, lastDpr = 0;

  function apply(){
    var vv = window.visualViewport;
    var w = Math.round(window.innerWidth || 0);
    var h = Math.round((vv && vv.height) || window.innerHeight || 0);
    var dpr = window.devicePixelRatio || 1;
    if(w === lastW && h === lastH && dpr === lastDpr) return;
    lastW = w; lastH = h; lastDpr = dpr;

    var root = document.documentElement;
    // 真实可视高度（供 vh 使用）
    root.style.setProperty('--vh', (h * 0.01) + 'px');
    root.style.setProperty('--vw', (w * 0.01) + 'px');
    root.style.setProperty('--app-h', h + 'px');

    // UI 缩放系数：以 390×844 为基准，限制在 0.82 ~ 1.18
    var sq = Math.sqrt((w / 390) * (h / 844));
    var ui = Math.max(0.82, Math.min(1.18, sq));
    root.style.setProperty('--ui', ui.toFixed(3));

    // 设备档位
    var b = document.body;
    if(!b) return;
    var portrait = h >= w;
    var compact = h < 620 || w < 360;
    var tiny = h < 520 || w < 320;
    var large = Math.min(w, h) >= 720;
    var landscape = w > h * 1.15;
    // 字幕垂直位置：屏幕中央稍下方，随可视高度自适应
    var subRatio = 0.568;
    if(landscape) subRatio = 0.548;
    if(compact) subRatio = 0.552;
    if(tiny) subRatio = 0.542;
    root.style.setProperty('--sub-top', Math.round(h * subRatio) + 'px');
    b.classList.toggle('dh-portrait', portrait);
    b.classList.toggle('dh-landscape', landscape);
    b.classList.toggle('dh-compact', compact);
    b.classList.toggle('dh-tiny', tiny);
    b.classList.toggle('dh-large', large);

    // 通知各模块重排
    try{
      if(DH.Brand && DH.Brand.resize) DH.Brand.resize();
      if(DH.Game && DH.Game.resize) DH.Game.resize();
      if(DH.Cinematic && DH.Cinematic.resize) DH.Cinematic.resize();
      if(DH.Sub && DH.Sub.refit) DH.Sub.refit();
      if(DH.Menu && DH.Menu.onResize) DH.Menu.onResize();
    }catch(e){}
    var ev;
    try{ ev = new CustomEvent('dh-fit', {detail:{w:w, h:h, dpr:dpr}}); }
    catch(e2){ ev = document.createEvent('Event'); ev.initEvent('dh-fit', true, true); }
    window.dispatchEvent(ev);
  }

  function schedule(){
    if(raf) return;
    raf = requestAnimationFrame(function(){
      raf = 0;
      apply();
    });
  }

  function init(){
    apply();
    window.addEventListener('resize', schedule, {passive:true});
    window.addEventListener('orientationchange', function(){
      setTimeout(schedule, 60);
      setTimeout(schedule, 320);
    });
    if(window.visualViewport){
      window.visualViewport.addEventListener('resize', schedule, {passive:true});
      window.visualViewport.addEventListener('scroll', schedule, {passive:true});
    }
    // 屏幕旋转锁定/变化后的二次校准
    if(screen.orientation && screen.orientation.addEventListener){
      screen.orientation.addEventListener('change', function(){ setTimeout(schedule, 200); });
    }
    // 字体加载完成后重新排版（避免字体切换导致行高变化）
    if(document.fonts && document.fonts.ready){
      document.fonts.ready.then(function(){ setTimeout(schedule, 80); });
    }
  }

  DH.Fit = { init:init, apply:apply, schedule:schedule };
})();
