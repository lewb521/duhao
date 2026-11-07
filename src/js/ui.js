/* ============================================================
   ui.js —— 字幕 / 横幅 / 层标题 / Toast / 泛光反馈
   ============================================================ */
(function(){
  window.DH = window.DH || {};
  var U = DH.U;

  function wait(ms){ return new Promise(function(res){ setTimeout(res, ms); }); }

  // ---------------- 字幕（使命召唤式） ----------------
  var Sub = {
    el:null, speakerEl:null, textEl:null,
    queue:[], busy:false, cur:null,
    typing:false, typeTimer:null, holdTimer:null, hideTimer:null,
    lastSpeaker:null,
    init:function(){
      this.el = document.getElementById('subtitle');
      this.speakerEl = document.getElementById('sub-speaker');
      this.textEl = document.getElementById('sub-text');
      var self = this;
      if(this.el){
        this.el.addEventListener('pointerdown', function(e){
          e.stopPropagation();
          self.advance();
        });
      }
    },
    isIdle:function(){ return !this.busy && this.queue.length === 0; },
    clear:function(){
      this.queue.length = 0;
      this.finishLine();
      this.busy = false;
      this.cur = null;
      if(this.el) this.el.classList.add('hidden');
    },
    say:function(who, text, opt){
      if(!text) return false;
      if(this.queue.length >= 3) return false;
      this.queue.push({ who:who, text:text, opt:opt || {} });
      if(!this.busy) this.next();
      return true;
    },
    next:function(){
      if(!this.queue.length){ this.busy = false; this.cur = null; return; }
      this.busy = true;
      var line = this.queue.shift();
      this.cur = line;
      this.lastSpeaker = line.who;
      var boss = line.who === 'boss';
      this.el.classList.remove('hidden');
      this.el.classList.toggle('boss', boss);
      this.speakerEl.textContent = boss ? '肚耗' : (line.who === 'hero' ? '嘟豪' : '……');
      this.el.style.opacity = '1';
      this.el.style.filter = 'none';
      this.el.classList.remove('in');
      // 强制重排以重播入场动画
      void this.el.offsetWidth;
      this.el.classList.add('in');
      this.fitText(line.text);
      // 打字机
      var self = this;
      this.textEl.textContent = '';
      var chars = Array.from(line.text);
      var i = 0;
      var speed = line.opt.speed || 26;
      this.typing = true;
      if(this.typeTimer) clearInterval(this.typeTimer);
      this.typeTimer = setInterval(function(){
        i += 1;
        if(i >= chars.length) i = chars.length;
        self.textEl.textContent = chars.slice(0, i).join('');
        if(i % 3 === 0 && DH.Audio && DH.Audio.voice) DH.Audio.voice(line.who);
        if(i >= chars.length){
          clearInterval(self.typeTimer);
          self.typeTimer = null;
          self.typing = false;
          self.afterType(line);
        }
      }, speed);
    },
    // 依据屏幕宽度/句子长度自适应字号，保证小屏也不出框
    fitText:function(text){
      if(!this.textEl) return;
      var len = Array.from(text || '').length;
      var vw = window.innerWidth || 390;
      var vh = (window.visualViewport && window.visualViewport.height) || window.innerHeight || 844;
      var boxW = Math.min(vw * 0.86, 700);
      var fs = Math.min(17, Math.max(13, boxW / 24));
      if(len > 46) fs = Math.min(fs, boxW / 26);
      if(len > 64) fs = Math.min(fs, boxW / 30);
      // 高度上限：避免小屏多行顶到操作区
      fs = Math.min(fs, Math.max(13, vh * 0.028));
      fs = Math.max(13.5, Math.min(fs, 18));
      this.textEl.style.fontSize = fs.toFixed(1) + 'px';
      this.textEl.style.lineHeight = '1.62';
    },
    refit:function(){
      if(this.cur) this.fitText(this.cur.text);
    },
    afterType:function(line){
      var self = this;
      var hold = line.opt.hold != null ? line.opt.hold : Math.max(1700, Math.min(6000, line.text.length * 85));
      if(this.holdTimer) clearTimeout(this.holdTimer);
      this.holdTimer = setTimeout(function(){
        self.hideLine();
      }, hold);
    },
    hideLine:function(){
      var self = this;
      if(!this.el) return;
      this.el.style.transition = 'opacity .32s ease, filter .32s ease';
      this.el.style.opacity = '0';
      this.el.style.filter = 'blur(5px)';
      if(this.hideTimer) clearTimeout(this.hideTimer);
      this.hideTimer = setTimeout(function(){
        self.el.classList.add('hidden');
        self.busy = false;
        self.cur = null;
        self.next();
      }, 330);
    },
    advance:function(){
      if(!this.busy) return;
      if(this.typing){
        // 立即完成当前句
        if(this.typeTimer){ clearInterval(this.typeTimer); this.typeTimer = null; }
        this.typing = false;
        if(this.cur) this.textEl.textContent = this.cur.text;
        this.afterType(this.cur);
      } else {
        if(this.holdTimer){ clearTimeout(this.holdTimer); this.holdTimer = null; }
        this.hideLine();
      }
    },
    finishLine:function(){
      if(this.typeTimer){ clearInterval(this.typeTimer); this.typeTimer = null; }
      if(this.holdTimer){ clearTimeout(this.holdTimer); this.holdTimer = null; }
      if(this.hideTimer){ clearTimeout(this.hideTimer); this.hideTimer = null; }
      this.typing = false;
      if(this.el){ this.el.style.opacity = '1'; this.el.style.transition = ''; this.el.style.filter = ''; }
    }
  };

  // ---------------- 横幅 ----------------
  var bannerTimer = null;
  function banner(mainText, subText, opt){
    opt = opt || {};
    var el = document.getElementById('banner');
    var mainEl = document.getElementById('banner-main');
    var subEl = document.getElementById('banner-sub');
    if(!el) return wait(0);
    if(bannerTimer){ clearTimeout(bannerTimer); bannerTimer = null; }
    el.classList.remove('out');
    mainEl.textContent = mainText;
    subEl.textContent = subText || '';
    el.classList.remove('hidden');
    // 重播
    el.classList.remove('show');
    void el.offsetWidth;
    el.classList.add('show');
    if(DH.Audio) DH.Audio.play('banner');
    return new Promise(function(res){
      bannerTimer = setTimeout(function(){
        el.classList.add('out');
        bannerTimer = setTimeout(function(){
          el.classList.add('hidden');
          el.classList.remove('show', 'out');
          res();
        }, 720);
      }, opt.hold || 2200);
    });
  }

  // ---------------- 层标题 ----------------
  function floorTitle(n, arc, opt){
    opt = opt || {};
    var el = document.getElementById('floor-title');
    if(!el) return wait(0);
    document.getElementById('ft-num').textContent = '第 ' + n + ' 层';
    document.getElementById('ft-arc').textContent = arc || '';
    el.classList.remove('hidden', 'out');
    void el.offsetWidth;
    return new Promise(function(res){
      setTimeout(function(){
        el.classList.add('out');
        setTimeout(function(){ el.classList.add('hidden'); res(); }, 620);
      }, opt.hold || 1250);
    });
  }

  // ---------------- toast ----------------
  var toastTimer = null;
  function toast(text, ms){
    var el = document.getElementById('toast');
    if(!el) return;
    el.textContent = text;
    el.classList.remove('hidden', 'out');
    void el.offsetWidth;
    el.classList.remove('out');
    if(toastTimer) clearTimeout(toastTimer);
    toastTimer = setTimeout(function(){
      el.classList.add('out');
      toastTimer = setTimeout(function(){ el.classList.add('hidden'); }, 320);
    }, ms || 1800);
  }

  function damageFlash(){
    var el = document.getElementById('damage-flash');
    if(!el) return;
    el.classList.remove('hit');
    void el.offsetWidth;
    el.classList.add('hit');
  }

  DH.wait = wait;
  DH.Sub = Sub;
  DH.UI = { banner:banner, floorTitle:floorTitle, toast:toast, damageFlash:damageFlash, wait:wait };
})();
