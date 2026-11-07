/*! 《嘟豪》致谢与结尾滚动字幕 · lore.js
 *
 * 手写文件（非自动生成）。职责：在 dialogues.js 之后加载，只做“浅合并”，
 * 向 window.DH_DATA 补充 lore / credits（关于页 + 结尾字幕共用），
 * 绝不覆盖 dialogues.js 已定义的 floors / banter / news / ending / ui。
 *
 * 加载顺序：js/data/dialogues.js 在前，js/data/lore.js 在后（两个经典脚本按序引入；
 *           构建时全部内联进同一个 HTML，因此本文件不含任何结束标签字样）
 * 自检：node --check duhao/src/js/data/lore.js
 * 说明：结尾字幕最后一行固定为“作者、字幕、音效、动画全部都是灵力开发。特别出演：duhao。”
 */
(function () {
  'use strict';

  var root = (typeof window !== 'undefined' ? window : globalThis);
  var D = root.DH_DATA;
  if (!D) { D = root.DH_DATA = {}; }

  /* —— 关于页 / 结尾字幕 / 版权 —— */
  var CREDITS = {
    title: '嘟豪',
    subtitle: '九十九层高塔 · 魂类武侠',
    version: 'v1.0',
    author: '灵力开发',
    authorRoles: '作者、字幕、音效、动画',
    special: '特别出演：duhao',
    // 用户原文样式（半角冒号），供逐字引用/查证；roll 末行使用全角标点版本
    subtitleLine: '作者/字幕/音效/动画全部都是灵力开发。特别出演:duhao。',
    github: 'https://github.com/lewb521',
    email: 'lewbtxdy@outlook.com',
    copyright: '© 灵力开发 · 特别出演 duhao · 保留所有权利',

    // 参考仓库 / 字体 / 其它参考：name 名称，author 作者，url 地址，license 许可，usage 本项目用法
    repos: [
      {
        name: 'GameSounds',
        author: 'kavex',
        url: 'https://github.com/kavex/GameSounds',
        license: 'GPL-3.0',
        usage: '激光充能/发射、命中、爆炸、Blip 等战斗音效（wav）'
      },
      {
        name: 'uisfx',
        author: 'romainsimon',
        url: 'https://github.com/romainsimon/uisfx',
        license: 'MIT',
        usage: '界面 hover / click / back / level-up / long-press 等 UI 音效（ogg）'
      },
      {
        name: 'sound-effects',
        author: 'ohrafaelmartins',
        url: 'https://github.com/ohrafaelmartins/sound-effects',
        license: 'free-to-use（仓库声明自由使用；未标注 SPDX 协议，以仓库说明为准）',
        usage: '雨声等环境音（ogg）'
      },
      {
        name: 'foley',
        author: 'eakbulut',
        url: 'https://github.com/eakbulut/foley',
        license: 'MIT',
        usage: 'WebAudio 程序化 foley 音效（28 个界面 cue）的合成思路与参考'
      },
      {
        name: '阿里巴巴普惠体（Alibaba PuHuiTi）',
        author: '阿里巴巴集团',
        url: 'https://fonts.alibabagroup.com/',
        license: '阿里巴巴普惠体许可协议（免费商用）',
        usage: '全站中文粗体字体，构建时子集化后内联'
      },
      {
        name: '只狼：影逝二度 / 影之刃零',
        author: 'FromSoftware / S-GAME',
        url: '',
        license: '仅作叙事与动作风格参考，未使用任何素材',
        usage: '对白克制、留白、宿命感与战斗节奏的参考'
      },
      {
        name: '《嘟豪》世界观与对话原始文档',
        author: 'duhao（用户）',
        url: '',
        license: '用户原创，授权本项目使用',
        usage: '99 层剧情、2372 行对白、30 条错乱新闻的原始出处'
      }
    ],

    thanks: [
      '感谢 duhao——特别出演，也是这个故事的起点。',
      '感谢参考仓库的作者与维护者：kavex、romainsimon、ohrafaelmartins、eakbulut。',
      '感谢阿里巴巴普惠体，让中文字能免费写进游戏。',
      '感谢每一位用户：是你们按下“开始游戏”，这座塔才有人说话。',
      '感谢开源事业：一个人的夜晚，也能做出一个游戏。',
      '感谢玩到第九十九层、并且记得他们的你。'
    ],

    // 结尾滚动字幕：who 固定 "credit"，游戏逐条向上滚动
    roll: [
      { who: 'credit', text: '《嘟豪》' },
      { who: 'credit', text: '九十九层高塔 · 魂类武侠' },
      { who: 'credit', text: '嘟豪 —— 饰演 嘟豪' },
      { who: 'credit', text: '肚耗 —— 饰演 肚耗' },
      { who: 'credit', text: '（当然是同一个人的两半）' },
      { who: 'credit', text: '作者、字幕、音效、动画：灵力开发' },
      { who: 'credit', text: '特别出演：duhao' },
      { who: 'credit', text: '剧情与对白：灵力开发' },
      { who: 'credit', text: '音效素材：kavex/GameSounds（GPL-3.0）' },
      { who: 'credit', text: '界面音效：romainsimon/uisfx（MIT）' },
      { who: 'credit', text: '环境音：ohrafaelmartins/sound-effects（free-to-use）' },
      { who: 'credit', text: '程序化 foley 参考：eakbulut/foley（MIT）' },
      { who: 'credit', text: '字体：阿里巴巴普惠体（免费商用）' },
      { who: 'credit', text: '叙事参考：《只狼：影逝二度》《影之刃零》' },
      { who: 'credit', text: '感谢一切参考仓库与它们的作者' },
      { who: 'credit', text: '感谢每一位用户，感谢开源事业' },
      { who: 'credit', text: 'github：https://github.com/lewb521' },
      { who: 'credit', text: '联系：lewbtxdy@outlook.com' },
      { who: 'credit', text: '第99层没有墙，只有漩涡。谢谢你也走到了这里。' },
      { who: 'credit', text: '愿你在塔外，见到雾散。' },
      { who: 'credit', text: '作者、字幕、音效、动画全部都是灵力开发。特别出演：duhao。' }
    ]
  };

  /* —— 世界观一句话 / 关于页文案（含仓库、邮箱与致谢） —— */
  var LORE = {
    title: '嘟豪',
    tagline: '你必须杀死那个最了解你的人九十九次，才能知道他其实就是你。',
    genre: '魂类武侠 · 九十九层高塔',
    version: 'v1.0',
    aboutTitle: '关于',
    about: [
      '《嘟豪》是一款纯前端、单文件、离线可玩的魂类武侠小游戏：剑客嘟豪被困九十九层高塔，每一层都要击败守层者肚耗，而肚耗比他自己更了解他。',
      '作者：灵力开发。作者、字幕、音效、动画全部都是灵力开发。特别出演：duhao。',
      '开发仓库：https://github.com/lewb521',
      '联系邮箱：lewbtxdy@outlook.com',
      '音效素材来自 kavex/GameSounds（GPL-3.0）、romainsimon/uisfx（MIT）、ohrafaelmartins/sound-effects（free-to-use）、eakbulut/foley（MIT）；字体为阿里巴巴普惠体（免费商用）。',
      '感谢以上参考仓库的作者与维护者，感谢每一位用户，感谢开源事业——没有它们，这座塔搭不起来。',
      '操作提示：战斗中的台词不会打断操作；嘲讽与闲聊是战斗的一部分，层数越高，嘟豪越不想听，肚耗越要说。'
    ],
    links: {
      github: 'https://github.com/lewb521',
      email: 'lewbtxdy@outlook.com'
    }
  };

  /* —— 浅合并：只补缺，绝不覆盖 dialogues.js 的字段 —— */
  function shallowFill(target, source) {
    if (!target) return source;
    for (var key in source) {
      if (Object.prototype.hasOwnProperty.call(source, key) && !Object.prototype.hasOwnProperty.call(target, key)) {
        target[key] = source[key];
      }
    }
    return target;
  }

  D.credits = shallowFill(D.credits, CREDITS);
  D.lore = shallowFill(D.lore, LORE);
  root.DH_DATA = D;
})();
