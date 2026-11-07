/* ============================================================
   menu.js —— 主界面 / 关于 / 滚动字幕
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var U = DH.U;

  var holdStart = 0, holdRaf = null, holding = false, holdDone = false;
  var lastTapAt = 0, armedUntil = 0, thisHoldIsDouble = false;
  var statsInit = false;

  function $(id){ return document.getElementById(id); }

  function updateStats(){
    var s = DH.Save.data;
    var b = $('stat-best'), l = $('stat-last');
    if(b) b.textContent = s.best || 0;
    if(l) l.textContent = s.last || 0;
  }

  function setDevVisual(on){
    // 隐藏功能：不显示任何提示/状态
  }

  function clearHoldVisual(){
    var icon = $('dev-icon');
    if(icon){
      icon.classList.remove('pressing');
      icon.style.setProperty('--dev-p', 0);
    }
  }

  function startHold(e){
    if(e && e.preventDefault) e.preventDefault();
    if(holding) return;
    var now = performance.now();
    var gap = now - lastTapAt;
    thisHoldIsDouble = (gap > 0 && gap <= 380); // 第二击（双击）
    if(thisHoldIsDouble) armedUntil = now + 2600; // 双击后 2.6s 内可接长按
    lastTapAt = now;

    holding = true;
    holdDone = false;
    holdStart = now;
    var icon = $('dev-icon');
    if(icon) icon.classList.add('pressing');
    if(DH.Audio) DH.Audio.play('ui_hover');

    function tick(t){
      if(!holding) return;
      var p = Math.min(1, (t - holdStart) / 2000);
      if(icon) icon.style.setProperty('--dev-p', p);
      if(p >= 1){ holdDone = true; finishHold(); return; }
      holdRaf = requestAnimationFrame(tick);
    }
    holdRaf = requestAnimationFrame(tick);
  }

  function cancelHold(){
    if(!holding) return;
    holding = false;
    if(holdRaf){ cancelAnimationFrame(holdRaf); holdRaf = null; }
    clearHoldVisual();
  }

  function finishHold(){
    if(!holding) return;
    holding = false;
    if(holdRaf){ cancelAnimationFrame(holdRaf); holdRaf = null; }
    clearHoldVisual();

    // 成功条件：本次按住是双击的第二击，或双击后 2.6 秒内接的长按
    var success = thisHoldIsDouble || performance.now() <= armedUntil;
    thisHoldIsDouble = false;
    if(success){
      armedUntil = 0;
      if(DH.App) DH.App.setDev(!DH.App.dev);
      if(navigator.vibrate) try{ navigator.vibrate([18, 40, 26]); }catch(e){}
      if(DH.Audio) DH.Audio.play('glitch');
    } else {
      // 单纯长按：什么也没有
      if(DH.Audio) DH.Audio.play('ui_back');
      if(DH.UI && DH.UI.toast) DH.UI.toast('啥也没有!!!', 1600);
      var icon = $('dev-icon');
      if(icon){
        icon.classList.remove('deny');
        void icon.offsetWidth;
        icon.classList.add('deny');
        setTimeout(function(){ icon.classList.remove('deny'); }, 400);
      }
    }
  }

  function fillAbout(){
    var D = window.DH_DATA || {};
    var c = D.credits || {};
    var lore = D.lore || {};
    var reps = $('about-repos');
    if(reps && c.repos){
      reps.innerHTML = '';
      c.repos.forEach(function(r){
        var d = document.createElement('div');
        d.className = 'repo-row';
        d.innerHTML = '<b>' + (r.name || '') + '</b> · <i>' + (r.license || '') + '</i><br>' +
          (r.usage ? '<span>' + r.usage + '</span> ' : '') +
          (r.url ? '<a href="' + r.url + '" target="_blank" rel="noopener">' + r.url.replace(/^https?:\/\//, '') + '</a>' : '');
        reps.appendChild(d);
      });
    }
    var th = $('about-thanks');
    if(th && c.thanks){
      th.innerHTML = '';
      (Array.isArray(c.thanks) ? c.thanks : [c.thanks]).forEach(function(t){
        var d = document.createElement('div');
        d.textContent = t;
        th.appendChild(d);
      });
    }
    var g = $('link-github'), m = $('link-mail');
    if(g && (c.github || (lore.links && lore.links.github))) g.href = c.github || lore.links.github;
    if(m && (c.email || (lore.links && lore.links.email))) m.href = 'mailto:' + (c.email || lore.links.email);
  }

  // ---------- 滚动字幕 ----------
  var rolling = false;
  function rollCredits(done){
    var screen = $('credits');
    var rollEl = $('credits-roll');
    var endEl = $('credits-end');
    if(!screen || !rollEl){ done(); return; }
    var D = window.DH_DATA || {};
    var c = D.credits || {};
    var lines = c.roll || [];
    var d = window.DH_DATA && window.DH_DATA.credits;
    var html = '';
    html += '<div class="roll-major">嘟豪</div>';
    html += '<div class="roll-fade">九十九层 · 一镜到底</div>';
    var i;
    for(i=0;i<lines.length;i++){
      var it = lines[i] || {};
      var text = it.text || it;
      if(typeof text !== 'string') continue;
      // 99 层结束后的滚动字幕不再自我介绍「灵力开发」
      if(text.indexOf('灵力开发') !== -1) continue;
      if(it.who === 'major' || /^特别出演/.test(text)) html += '<div class="roll-major">' + text + '</div>';
      else html += '<div class="roll-line">' + text + '</div>';
    }
    html += '<div class="roll-fade">—— 游戏结束 ——</div>';
    rollEl.innerHTML = html;
    rollEl.classList.remove('scrolling');
    rollEl.style.opacity = '1';
    void rollEl.offsetWidth;
    // 依据内容高度计算滚动时长
    var h = rollEl.scrollHeight + window.innerHeight;
    var dur = Math.max(16, Math.min(40, h / 55));
    if((location.search||'').indexOf('short') >= 0) dur = 5;
    rollEl.style.setProperty('--credits-dur', dur + 's');
    rollEl.classList.add('scrolling');
    rolling = true;
    if(endEl){ endEl.classList.remove('show'); endEl.textContent = ''; }
    var finished = false;
    function finish(){
      if(finished) return;
      finished = true;
      rolling = false;
      setTimeout(function(){ done(); }, 900);
    }
    rollEl.addEventListener('animationend', function(){
      if(endEl){ endEl.classList.add('show'); }
      setTimeout(finish, 1300);
    }, {once:true});
    // 点击加速/跳过
    screen.onclick = function(){
      if(!rolling) return;
      rollEl.style.animationDuration = '2.5s';
      rollEl.classList.remove('scrolling');
      void rollEl.offsetWidth;
      rollEl.classList.add('scrolling');
    };
  }

  function init(){
    var start = $('btn-start'), about = $('btn-about'), close = $('btn-about-close');
    if(start) start.addEventListener('click', function(){
      if(DH.Audio) DH.Audio.play('ui_click');
      if(DH.App) DH.App.startGame();
    });
    if(about) about.addEventListener('click', function(){ if(DH.App) DH.App.openAbout(); });
    if(close) close.addEventListener('click', function(){ if(DH.App) DH.App.closeAbout(); });

    var icon = $('dev-icon');
    if(icon){
      icon.addEventListener('pointerdown', startHold);
      icon.addEventListener('pointerup', cancelHold);
      icon.addEventListener('pointercancel', cancelHold);
      icon.addEventListener('pointerleave', cancelHold);
      icon.addEventListener('contextmenu', function(e){ e.preventDefault(); });
    }
    updateStats();
  }

  function onMenuShown(){
    var menu = $('menu');
    if(menu){
      menu.classList.remove('enter');
      void menu.offsetWidth;
      menu.classList.add('enter');
    }
  }

  DH.Menu = {
    init:init,
    updateStats:updateStats,
    setDevVisual:setDevVisual,
    fillAbout:fillAbout,
    rollCredits:rollCredits,
    onMenuShown:onMenuShown
  };
})();
