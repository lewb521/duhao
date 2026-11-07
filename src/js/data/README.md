# 《嘟豪》内容数据说明（src/js/data/）

本目录两个文件均为**经典脚本**（非 ES module），按顺序加载后所有内容挂在 `window.DH_DATA`：

```html
<script src="js/data/dialogues.js"></script>  <!-- 先：floors / banter / news / ending / ui -->
<script src="js/data/lore.js"></script>       <!-- 后：浅合并补 credits / lore，不覆盖上面字段 -->
```

自检：

```bash
node --check duhao/src/js/data/dialogues.js
node --check duhao/src/js/data/lore.js
node -e "global.window=global;eval(require('fs').readFileSync('duhao/src/js/data/dialogues.js','utf8'));console.log(DH_DATA.floors.length, DH_DATA.news.length)"   # 99 30
node duhao/tools/content/verify.js   # 全量校验（逐字比对原文 + 接口契约）
```

## 1. 数据来源与解析方式

| 数据 | 来源 | 解析规则 |
| --- | --- | --- |
| `floors`（99 层台词） | `work/dialogue2000.txt`（2372 行，99 层） | 层标题 `【第12层 · 相识之幕 · 敌意】` → `n / arcName / mood`；台词行 `肚耗：xxx` / `嘟豪：xxx`（全角冒号）→ `who`（肚耗=`boss`，嘟豪=`hero`）、`text`（正文一律保留原标点与语气词，如“（笑）”“（拔剑）”原样留在 text 里）。文件头部的说明文字与空行不进入数据。 |
| `news`（30 条） | `work/worldview.txt` 第九章“三十条怪诞时空错乱理由” | 逐条取正文段落（跳过章节说明行与目录页码行），逐字保留。 |
| `banter` / `ending` / `ui` | `duhao/tools/content/extra.json`（人工创作） | 生成时合并进 `dialogues.js`。 |
| `credits` / `lore` | `duhao/src/js/data/lore.js`（手写） | 浅合并进 `DH_DATA`，只补缺、不覆盖。 |

生成命令：`node duhao/tools/content/gen_dialogues.js`
（会先断言 99 层齐全、关键层非空、新闻 30 条、banter 各池 ≥15 条，再写文件。）

校验命令：`node duhao/tools/content/verify.js`（独立重解析原文逐字比对，不依赖生成器。）

**补齐说明：** `dialogue2000.txt` 中 99 个层标题全部齐全（1–99 无缺层），因此没有空层占位，也没有任何一层需要补写。关键层原句数：1 层 14 句、11 层 14 句、22 层 15 句、33 层 13 句、44 层 15 句、50 层 15 句、55 层 16 句、66 层 13 句、77 层 13 句、88 层 14 句、98 层 16 句、99 层 20 句，全部原样保留。第 99 层层标题只有“轮回之间”（无 · 基调段），`mood` 按世界观表 5-1 取“送别与重置”。全 99 层共 2266 句台词；每层最少 13 句、中位 24 句、最多 24 句。

## 2. 字段速查

```js
window.DH_DATA = {
  meta:    { floorsTotal:99, arcs:[...], keyFloors:[1,11,22,33,44,50,55,66,77,88,98,99], dialogueRatio:"40% 剧情 + 50% 嘲讽 + 10% 闲聊" },
  floors:  [ { n:1, arc:1, arcName:"相识之幕", mood:"敌意", lines:[ {who:"boss", text:"..."} ] } ], // 99 项，语气词保留
  banter:  { 1:{ taunt:{boss:[],hero:[]}, chat:{boss:[],hero:[]} }, 2:{...}, 3:{...} },
  news:    [ "毁灭博士宣布加入复仇者联盟，并在入职第一天当选年度最佳员工。", ... ], // 30 条字符串
  ending:  {
    monologue: [ {who:"boss", text:"孩子，我认可你了。可是，你不让为我们很想吗？你不想知道真相吗？"}, ... ],
    stabCue: "一把蓝色的利刃迅速插入BOSS体内",     // 用户指定原文，逐字
    heroLine:{ who:"hero", text:"关于我是谁，我想，我知道，我是。" }, // 用户指定原文，逐字
    bossLastWords: [ ... ],
    sequence: [ {type:"line",who:"boss",text:"..."}, {type:"cue",text:"..."}, ... ], // 可直接按序播放的演出脚本
    epilogue: [ "白光。第一层。……" ]
  },
  ui:      { start:"开始游戏", about:"关于", best:"历史最佳", last:"上场层数", floorUnit:"层",
             devOn:"开发者模式已开启", devOff:"开发者模式已关闭", trust:"信任", hp:"生命",
             charge:"灵", reflect:"弹", banner:["地狱归来","Faze up"],
             reviveLine:{who:"hero",text:"真的假的？！"}, death:[...], floorIntro:[...],
             paused:"暂停", resume:"继续", quit:"退出" },
  credits: { author:"灵力开发", special:"特别出演：duhao", github:"https://github.com/lewb521",
             email:"lewbtxdy@outlook.com", repos:[...], thanks:[...], roll:[...] },
  lore:    { title, tagline, genre, version, aboutTitle, about:[...], links:{github,email} }
}
```

### 用法提示

- **幕划分**：`arc` 1=1–33（相识之幕·敌意）、2=34–66（裂痕之幕·动摇）、3=67–98（崩解之幕·疲惫）、4=第 99 层（轮回之间）。
- **banter 配比**：战斗对白 = 40% 剧情（`floors[i].lines`，按层播放）+ 50% 嘲讽（`banter[arc].taunt[who]`）+ 10% 闲聊（`banter[arc].chat[who]`）。每幕每角色 taunt 20 条、chat 15 条（两池均 ≥15，避免高密度战斗台词枯竭）。
- **占位符**：`ui.death` / `ui.floorIntro` 的文案支持 `{n}`（当前层数）、`{arcName}`、`{mood}`，由渲染层替换。
- **结局播放**：可直接遍历 `ending.sequence`：`type:"line"` 显示对话框（用 `who` 区分音色），`type:"cue"` 只做演出/字幕（如蓝刃刺入、白光），最后接 `credits.roll` 滚动字幕。`ending.monologue / stabCue / heroLine / bossLastWords` 为拆好的兼容字段。
- **结尾字幕**：`credits.roll` 最后一行固定为“作者、字幕、音效、动画全部都是灵力开发。特别出演：duhao。”；`credits.subtitleLine` 保留用户原文样式（半角冒号）用于逐字查证。关于页用 `credits.github / email / repos / thanks` 与 `lore.about`。
- **字符安全**：对白中只有中文全角引号「」“”与半角单引号 `'`，没有半角双引号/反斜杠/控制字符；生成器用 `JSON.stringify` 输出字符串，`node --check` 通过，可安全内联进 `<script>`（无 `</script>` 字样）。全为 ES5 语法（无 import/export、`?.`、`??`、箭头函数）。
- **只读约定**：`dialogues.js` 由脚本生成，请改 `tools/content/extra.json` 后重新生成，不要手改；`lore.js` 为手写文件。

## 3. 文件

| 文件 | 说明 | 大小 |
| --- | --- | --- |
| `dialogues.js` | 自动生成 + 人工润色：floors / banter / news / ending / ui / meta | ≈274 KB |
| `lore.js` | 手写：credits（作者、特别出演、GitHub、邮箱、7 条参考清单、感谢、21 行滚动字幕）与 lore（世界观一句话、关于页文案） | ≈7.5 KB |
