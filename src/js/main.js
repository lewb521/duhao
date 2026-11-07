/* ============================================================
   main.js —— 启动 / 资源 / 存档 / 全局状态机 / 一镜到底调度
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var U = DH.U;

  // ============================ 存档 ============================
  var SAVE_KEY = 'dh_save_v2';
  var defaults = { best:0, last:0, runs:0, deaths:0, muted:false };
  var Save = {
    data: (function(){
      var d = {};
      for(var k in defaults) d[k] = defaults[k];
      try{
        var raw = localStorage.getItem(SAVE_KEY);
        if(raw){
          var obj = JSON.parse(raw);
          for(var k2 in defaults) if(obj[k2] != null) d[k2] = obj[k2];
        }
      }catch(e){}
      return d;
    })(),
    set:function(k, v){ this.data[k] = v; this.commit(); },
    commit:function(){
      try{ localStorage.setItem(SAVE_KEY, JSON.stringify(this.data)); }catch(e){}
      if(DH.Menu && DH.Menu.updateStats) DH.Menu.updateStats();
    }
  };
  DH.Save = Save;

  // ============================ 资源 ============================
  var IMG_NAMES = [
    'boss_smug','boss_angry','boss_shock','boss_weak','boss_red','boss_neutral',
    'bg_arena','bg_arena_blur','bg_ending','blue_blade','paper_grain',
    'sketch_tower','sketch_duo','sketch_stairs','title_rope','spark'
  ];
  var Assets = {
    images:{}, ready:{}, loaded:0, total:IMG_NAMES.length, failed:[],
    url:function(name){
      if(window.DH_ASSETS && window.DH_ASSETS[name]) return window.DH_ASSETS[name];
      return '../assets/images/' + name + '.png';
    },
    img:function(name){
      return this.images[name] || null;
    },
    preload:function(cb){
      var self = this;
      var done = 0, total = IMG_NAMES.length;
      function finish(){
        done++;
        if(done >= total && cb) cb();
      }
      IMG_NAMES.forEach(function(name){
        var im = new Image();
        im.decoding = 'async';
        im.onload = function(){ self.ready[name] = true; finish(); };
        im.onerror = function(){ self.failed.push(name); finish(); };
        im.src = self.url(name);
        self.images[name] = im;
      });
      // 兜底超时
      setTimeout(function(){ if(done < total){ done = total; if(cb) cb(); } }, 6000);
    }
  };
  DH.Assets = Assets;

  // ============================ 黑场/模糊遮罩 ============================
  function blackout(on){
    var el = document.getElementById('blackout');
    if(!el) return;
    el.classList.toggle('on', !!on);
  }
  DH.App_blackout = blackout;

  // ============================ 屏幕 ============================
  var screenEls = {};
  function el(id){ return document.getElementById(id); }
  function show(id){
    var e = el(id);
    if(!e) return;
    e.classList.remove('hidden');
    if(id === 'menu'){
      e.classList.remove('enter','leave');
      void e.offsetWidth;
      e.classList.add('enter');
    }
    if(id === 'game'){
      e.classList.remove('enter');
      void e.offsetWidth;
      e.classList.add('enter');
    }
  }
  function hide(id){
    var e = el(id);
    if(e) e.classList.add('hidden');
  }

  // ============================ 全局 App ============================
  var App = {
    screen:'boot',
    dev:false,
    runId:0,
    init:function(){
      var self = this;

      // 音频解锁
      function unlock(){
        if(DH.Audio && DH.Audio.init){
          DH.Audio.init();
          if(DH.Audio.setMuted && Save.data.muted) DH.Audio.setMuted(true);
          if(self.screen === 'menu' && DH.Audio.startAmbience) DH.Audio.startAmbience();
        }
      }
      document.addEventListener('pointerdown', unlock, {passive:true});
      document.addEventListener('keydown', unlock);

      document.addEventListener('keydown', function(e){
        if(e.code === 'Space' || e.code === 'Enter'){
          if(self.screen === 'game' && DH.Game && DH.Game.active){
            e.preventDefault();
            if(DH.Game.reflectPressed) DH.Game.reflectPressed('key');
          }
        } else if(e.code === 'KeyF'){
          if(self.screen === 'game' && DH.Game && DH.Game.active && DH.Game.tryUlt) DH.Game.tryUlt();
        } else if(e.code === 'Escape'){
          if(self.screen === 'game' && DH.Game && DH.Game.active) DH.Game.togglePause();
          else if(self.aboutOpen) self.closeAbout();
        } else if(self.dev && self.screen === 'game' && DH.Game && DH.Game.devKey){
          DH.Game.devKey(e);
        }
      });

      // 失焦暂停
      document.addEventListener('visibilitychange', function(){
        if(document.hidden && self.screen === 'game' && DH.Game && DH.Game.active && !DH.Game.paused){
          DH.Game.togglePause(true);
        }
      });

      // 测试参数：?dev=1&auto=1
      var qs = location.search || '';
      if(qs.indexOf('dev') >= 0) this.dev = true;
      if(qs.indexOf('qa=ending') >= 0) this.dev = true;
      var autoStart = qs.indexOf('auto') >= 0 || qs.indexOf('qa=') >= 0;
      var directCine = qs.indexOf('cine=1') >= 0;
      var directCred = qs.indexOf('cred=1') >= 0;
      var directAbout = qs.indexOf('about=1') >= 0;

      // 初始化各模块
      if(DH.Sub) DH.Sub.init();
      if(DH.Menu) DH.Menu.init();
      if(DH.Game) DH.Game.init();
      if(DH.Cinematic) DH.Cinematic.init();
      if(DH.Brand) DH.Brand.init();
      if(DH.Fit) DH.Fit.init();

      // 静音按钮
      var muteBtn = el('btn-mute');
      if(muteBtn){
        muteBtn.classList.toggle('off', Save.data.muted);
        muteBtn.addEventListener('click', function(){
          var m = !Save.data.muted;
          Save.data.muted = m;
          Save.commit();
          muteBtn.classList.toggle('off', m);
          if(DH.Audio){ DH.Audio.setMuted(m); if(!m && DH.Audio.startAmbience) DH.Audio.startAmbience(); }
        });
      }

      // 主循环（rAF 为主；后台/工作台不可见时用定时器兜底，保证测试与切页后继续）
      var last = performance.now();
      var frameCount = 0;
      var lastRaf = performance.now();
      var _sm = (location.search||'').match(/speed=([0-9.]+)/);
      var SPEED = _sm ? Math.min(20, parseFloat(_sm[1])) : 1;
      DH._speed = SPEED;
      function step(now){
        var dt = Math.max(0, Math.min(0.05, (performance.now() - last) / 1000)) * SPEED;
        last = performance.now();
        frameCount++;
        try{
          if(DH.Brand && DH.Brand.update) DH.Brand.update(dt, now);
          if(self.screen === 'game' && DH.Game && DH.Game.active && DH.Game.frame) DH.Game.frame(dt, now);
          if(self.screen === 'cinematic' && DH.Cinematic && DH.Cinematic.active && DH.Cinematic.frame) DH.Cinematic.frame(dt, now);
        }catch(err){
          if(DH.reportError) DH.reportError('LOOP ' + (err && err.stack ? err.stack.split('\n').slice(0,3).join(' | ') : err));
        }
      }
      var loop = function(now){
        lastRaf = now;
        step(now);
        requestAnimationFrame(loop);
      };
      requestAnimationFrame(loop);
      setInterval(function(){
        var now = performance.now();
        if(now - lastRaf > 220){ step(now); }
      }, 60);
      DH._frames = function(){ return frameCount; };

      // 资源加载 → Boot
      var bootTxt = el('boot-txt');
      if(DH.Assets) DH.Assets.preload(function(){
        self.boot();
      });
      if(directCred){
        setTimeout(function(){
          if(App.screen === 'menu') App.beginCredits();
        }, 900);
      } else if(directAbout){
        setTimeout(function(){
          if(App.screen === 'menu') App.openAbout();
        }, 1000);
      } else if(directCine){
        var cineTimer = setInterval(function(){
          if(App.screen === 'menu' && !App.transitioning){
            clearInterval(cineTimer);
            var menuEl = el('menu');
            if(menuEl) menuEl.classList.add('hidden');
            App.screen = 'cinematic';
            var cine = el('cinematic');
            if(cine){ cine.classList.remove('hidden'); cine.classList.add('letterbox'); }
            setTimeout(function(){ if(DH.Cinematic) DH.Cinematic.start(); }, 600);
          }
        }, 300);
      } else if(autoStart){
        var autoTimer = setInterval(function(){
          if(App.screen === 'menu' && !App.transitioning){
            clearInterval(autoTimer);
            if(App.dev && DH.Menu && DH.Menu.setDevVisual) DH.Menu.setDevVisual(true);
            setTimeout(function(){ App.startGame(); }, 500);
          }
        }, 300);
      }
      var tick = 0;
      var bootTimer = setInterval(function(){
        tick++;
        if(bootTxt) bootTxt.textContent = '灵力开发' + new Array((tick % 4) + 1).join('·');
        if(App.screen !== 'boot') clearInterval(bootTimer);
      }, 260);
    },

    boot:function(){
      var self = this;
      var bootEl = el('boot');
      // 先把主界面摆好，招牌就位
      show('menu');
      this.screen = 'menu';
      if(DH.Menu) DH.Menu.updateStats();
      if(DH.Brand){
        DH.Brand.setInstant('brand-slot-menu', [0,0], [20,21,25]);
        DH.Brand.anchorId = 'brand-slot-menu';
        DH.Brand.anchorWhite = false;
      }
      // 等待字体，最多 1.4s
      var fontReady = (document.fonts && document.fonts.ready) ? document.fonts.ready : Promise.resolve();
      var timeout = new Promise(function(res){ setTimeout(res, 1400); });
      Promise.race([fontReady, timeout]).then(function(){
        setTimeout(function(){
          if(bootEl) bootEl.classList.add('gone');
          setTimeout(function(){ if(bootEl) bootEl.style.display = 'none'; }, 850);
          if(DH.Menu && DH.Menu.onMenuShown) DH.Menu.onMenuShown();
          if(DH.Audio && DH.Audio.startAmbience) DH.Audio.startAmbience();
        }, 320);
      });
    },

    // ---------- 主界面 ----------
    showMenu:function(instant){
      this.screen = 'menu';
      this.aboutOpen = false;
      show('menu');
      hide('about');
      if(DH.Menu) DH.Menu.updateStats();
      if(DH.Brand){
        DH.Brand.anchorId = 'brand-slot-menu';
        DH.Brand.anchorWhite = false;
        if(instant) DH.Brand.setInstant('brand-slot-menu', [0,0], [20,21,25]);
        else DH.Brand.toMenu(1000);
      }
      if(DH.Audio && DH.Audio.startAmbience) DH.Audio.startAmbience();
    },

    // ---------- 开始游戏 ----------
    startGame:function(){
      if(this.transitioning) return;
      var self = this;
      this.transitioning = true;
      this.runId++;
      if(DH.Audio){ DH.Audio.play('ui_click'); DH.Audio.stopAmbience(); }
      var menuEl = el('menu');
      if(menuEl) menuEl.classList.add('leave');
      show('game');
      setTimeout(function(){
        if(menuEl){ menuEl.classList.add('hidden'); menuEl.classList.remove('leave','enter'); }
      }, 560);
      this.screen = 'game';
      if(DH.Brand){
        DH.Brand.anchorId = 'brand-slot-game';
        DH.Brand.anchorWhite = true;
        DH.Brand.toGame(1080);
      }
      setTimeout(function(){
        if(DH.Game){
          DH.Game.start({ dev:self.dev, floor:self.dev ? 99 : 1 });
        }
        self.transitioning = false;
      }, 420);
    },

    // ---------- 游戏结束/退出 → 主界面 ----------
    exitToMenu:function(opts){
      if(this.transitioning) return;
      opts = opts || {};
      var self = this;
      this.transitioning = true;
      this.screen = 'menu';
      if(DH.Game) DH.Game.stop();
      if(DH.Audio){
        DH.Audio.stopBattleMusic();
        if(opts.death) DH.Audio.play('death');
      }
      var gameEl = el('game');
      if(gameEl){
        gameEl.classList.add('leave');
        setTimeout(function(){ gameEl.classList.add('hidden'); gameEl.classList.remove('leave','enter'); }, 700);
      }
      show('menu');           // 必须先显示主界面，品牌槽位才有尺寸
      if(DH.Brand){
        DH.Brand.anchorId = 'brand-slot-menu';
        DH.Brand.anchorWhite = false;
        DH.Brand.toMenu(1050);
      }
      if(DH.Menu) DH.Menu.updateStats();
      setTimeout(function(){
        if(DH.Audio && DH.Audio.startAmbience) DH.Audio.startAmbience();
        self.transitioning = false;
      }, 1100);
    },

    // ---------- 关于 ----------
    openAbout:function(){
      this.aboutOpen = true;
      if(DH.Audio) DH.Audio.play('ui_click');
      var about = el('about');
      if(!about) return;
      about.classList.remove('hidden','closing');
      if(DH.Menu && DH.Menu.fillAbout) DH.Menu.fillAbout();
    },
    closeAbout:function(){
      this.aboutOpen = false;
      if(DH.Audio) DH.Audio.play('ui_back');
      var about = el('about');
      if(!about) return;
      about.classList.add('closing');
      setTimeout(function(){ about.classList.add('hidden'); about.classList.remove('closing'); }, 380);
    },

    // ---------- 结局 ----------
    beginEnding:function(){
      var self = this;
      if(this.transitioning) return;
      this.transitioning = true;
      this.screen = 'cinematic';
      if(DH.Audio){
        DH.Audio.stopBattleMusic();
        DH.Audio.play('stinger');
      }
      if(DH.Game) DH.Game.stop();
      var gameEl = el('game');
      if(gameEl){ gameEl.classList.add('leave'); }
      blackout(true);
      setTimeout(function(){
        if(gameEl){ gameEl.classList.add('hidden'); gameEl.classList.remove('leave','enter','enter'); }
        blackout(false);
        var cine = el('cinematic');
        if(cine){ cine.classList.remove('hidden'); cine.classList.add('letterbox'); }
        if(DH.Cinematic) DH.Cinematic.start();
        self.transitioning = false;
      }, 720);
    },

    // ---------- 结尾：字幕 ----------
    beginCredits:function(){
      var self = this;
      this.screen = 'credits';
      var cine = el('cinematic');
      if(cine) cine.classList.add('hidden');
      var credits = el('credits');
      if(credits) credits.classList.remove('hidden');
      if(DH.Brand){
        DH.Brand.anchorId = null;
        DH.Brand.toCenter(950, function(){
          // 中心白色定格 1 秒，再上移并滚动字幕
          setTimeout(function(){
            if(DH.Brand && DH.Brand.toCredits) DH.Brand.toCredits(750);
            if(DH.Menu && DH.Menu.rollCredits) {
              DH.Menu.rollCredits(function(){ self.finishCredits(); });
            } else {
              setTimeout(function(){ self.finishCredits(); }, 8000);
            }
          }, 1000);
        });
      } else {
        setTimeout(function(){ self.finishCredits(); }, 8000);
      }
      if(DH.Audio) DH.Audio.play('credits');
    },

    finishCredits:function(){
      if(this.transitioning) return;
      this.transitioning = true;
      var self = this;
      var credits = el('credits');
      if(credits) credits.classList.add('hidden');
      show('menu');           // 先显示主界面再测招牌槽位
      if(DH.Brand){
        DH.Brand.anchorId = 'brand-slot-menu';
        DH.Brand.anchorWhite = false;
        DH.Brand.toMenu(1100);
      }
      if(DH.Menu) DH.Menu.updateStats();
      setTimeout(function(){
        self.transitioning = false;
        self.screen = 'menu';
        if(DH.Audio && DH.Audio.startAmbience) DH.Audio.startAmbience();
      }, 1100);
    },

    setDev:function(on){
      this.dev = !!on;
      if(DH.Menu && DH.Menu.setDevVisual) DH.Menu.setDevVisual(this.dev);
      if(DH.Audio){ DH.Audio.play(on ? 'banner' : 'ui_back'); }
    },

    // ---------- 存档辅助 ----------
    recordFloor:function(floor){
      var s = DH.Save.data;
      if(floor > s.best) s.best = floor;
      s.last = floor;
      DH.Save.commit();
    },
    recordDeath:function(floor){
      var s = DH.Save.data;
      s.deaths++;
      if(floor > s.best) s.best = floor;
      DH.Save.commit();
    }
  };
  DH.App = App;

  // ---------- 调试/错误可见化（默认隐藏） ----------
  var errBox = null, debugBox = null, errCount = 0;
  function ensureErrBox(){
    if(errBox) return errBox;
    errBox = document.createElement('pre');
    errBox.id = 'dh-err';
    errBox.style.cssText = 'position:fixed;left:8px;right:8px;bottom:8px;z-index:9999;display:none;' +
      'max-height:38vh;overflow:auto;background:rgba(120,0,20,.92);color:#fff;font:11px/1.5 monospace;' +
      'padding:8px 10px;border-radius:8px;white-space:pre-wrap;pointer-events:none;';
    document.body.appendChild(errBox);
    return errBox;
  }
  DH.reportError = function(msg){
    if(window.console) console.error('[嘟豪]', msg);
    errCount++;
    var b = ensureErrBox();
    b.style.display = 'block';
    b.textContent = (b.textContent + '\n' + msg).slice(-1800);
  };
  window.addEventListener('error', function(e){
    DH.reportError('ERR ' + (e.message || '') + ' @' + (e.filename || '') + ':' + (e.lineno || ''));
  });
  window.addEventListener('unhandledrejection', function(e){
    DH.reportError('REJECT ' + (e.reason && e.reason.message ? e.reason.message : e.reason));
  });
  function cvStyle(cv){
    if(!cv) return '-';
    var cs = getComputedStyle(cv);
    return 'op' + cs.opacity + ' z' + cs.zIndex + ' disp' + cs.display + ' vis' + cs.visibility + ' rect' + (cv.getBoundingClientRect().width|0) + 'x' + (cv.getBoundingClientRect().height|0);
  }
  function hitTest(){
    var p = document.elementFromPoint(window.innerWidth/2, window.innerHeight/2);
    return p ? (p.id || p.className || p.tagName) : '-';
  }
  function pixTest(cv){
    var c = cv && cv.getContext ? cv.getContext('2d') : null;
    if(!c) return '-';
    try{
      var d = c.getImageData(Math.floor(cv.width/2), Math.floor(cv.height/2), 1, 1).data;
      return d[0]+','+d[1]+','+d[2]+','+d[3];
    }catch(e){ return 'ERR'; }
  }
  function imgState(n){
    var im = DH.Assets && DH.Assets.images ? DH.Assets.images[n] : null;
    return im ? ((im.complete?'C':'L') + (im.naturalWidth||0)) : '-';
  }
  function debugTick(){
    var q = (location.search || '').indexOf('debug') >= 0;
    if(q){
      if(!debugBox){
        debugBox = document.createElement('pre');
        debugBox.style.cssText = 'position:fixed;left:6px;top:6px;z-index:9998;background:rgba(0,0,0,.72);' +
          'color:#8ff;font:10px/1.45 monospace;padding:6px 8px;border-radius:6px;white-space:pre;pointer-events:none;';
        document.body.appendChild(debugBox);
      }
      var bs = DH.Brand ? DH.Brand.state : {};
      var gs = DH.Game ? DH.Game.state : {};
      var l = gs.layout || {};
      var slotM = document.getElementById('brand-slot-menu');
      var slotG = document.getElementById('brand-slot-game');
      var r1 = slotM ? slotM.getBoundingClientRect() : {};
      var r2 = slotG ? slotG.getBoundingClientRect() : {};
      var cv = document.getElementById('scene');
      debugBox.textContent =
        'vp ' + window.innerWidth + 'x' + window.innerHeight + ' dpr' + (window.devicePixelRatio||1) +
        ' screen=' + (DH.App ? DH.App.screen : '?') + '\n' +
        'brand x' + (bs.x|0) + ' y' + (bs.y|0) + ' s' + (bs.s||0).toFixed(3) + ' col' + (bs.col ? (bs.col[0]|0) : '?') + '\n' +
        'menuSlot ' + (r1.width|0) + 'x' + (r1.height|0) + ' @' + (r1.left|0) + ',' + (r1.top|0) + '\n' +
        'gameSlot ' + (r2.width|0) + 'x' + (r2.height|0) + ' @' + (r2.left|0) + ',' + (r2.top|0) + '\n' +
        'game active=' + (gs.active?'1':'0') + ' floor=' + (gs.floor||0) + ' state=' + (gs.state||'') +
        ' bossHP=' + (gs.bossHP|0) + '\n' +
        'layout boss ' + (l.boss ? (l.boss.x|0)+','+(l.boss.y|0)+'/'+(l.boss.size|0) : '-') +
        ' hero ' + (l.hero ? (l.hero.x|0)+','+(l.hero.feet|0)+'/'+(l.hero.h|0) : '-') + '\n' +
        'canvas ' + (cv ? cv.width+'x'+cv.height+' css='+cv.clientWidth+'x'+cv.clientHeight : '-') +
        ' frames=' + (DH._frames ? DH._frames() : -1) +
        ' anim=' + (DH.Brand && DH.Brand._getA ? 'yes' : 'no') +
        '\nlog ' + (DH.Brand && DH.Brand._log ? DH.Brand._log.join(' | ') : '-') +
        '\nbranddbg ' + (DH.Brand && DH.Brand._dbg ? DH.Brand._dbg() : '-') +
        '\nrenders ' + (DH._renderCount || 0) +
        ' cam ' + (function(){ if(!DH.Cinematic||DH.Cinematic.t===undefined) return '-'; var c=DH.Cinematic.cam; return 'x'+ (c.camX|0) + ' pan'+ (c.panT||0).toFixed(2) + ' fw' + (c.fw|0) + ' z'+ (c.zoom||0).toFixed(2); })() +
        ' cine t=' + (DH.Cinematic ? DH.Cinematic.t : '-') + ' frozen=' + (DH.Cinematic ? DH.Cinematic.frozen : '-') +
        ' herodbg ' + (DH._heroDbg || '-') +
        ' cvstyle ' + cvStyle(cv) +
        '\nhit ' + hitTest() + ' pix ' + pixTest(cv) +
        ' img bg=' + imgState('bg_arena') + ' boss=' + imgState('boss_smug') + ' ending=' + imgState('bg_ending') +
        '\nerrs ' + errCount;
    }
    setTimeout(debugTick, 300);
  }
  setTimeout(debugTick, 500);

  // 启动
  if(document.readyState === 'loading'){
    document.addEventListener('DOMContentLoaded', function(){ App.init(); });
  } else {
    App.init();
  }
})();
