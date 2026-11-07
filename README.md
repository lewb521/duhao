# 嘟豪 · 九十九层

《嘟豪》是一款纯前端、单文件、离线可玩的像素风动作小游戏：

- **在线游玩**：开启 GitHub Pages 后访问本仓库首页即可（入口 `index.html`）。
- **离线游玩**：下载 `index.html`，双击用浏览器打开。
- 单文件版本已把图片、音频、字体全部内联，无需服务器、无需联网。

## 玩法

BOSS 双眼变红的 0.3 秒（外加 0.1 秒）是激光出手前摇——点击「弹」用量子护盾反弹。
每次反弹造成 15 点伤害并积攒 1 格灵力；满 5 格后点击「靈」释放 2 秒激光柱，造成 10 倍伤害。
被击中损失 33% 生命；击败 BOSS 会触发「地狱归来 / Faze up」，BOSS 血量 +20%。
共 99 层，99 层后进入 16:9 电影叙事结局。

## 仓库结构

```
index.html          # 成品：单文件游戏（GitHub Pages 入口）
src/                # 开发源码（index.html / css / js / data）
assets/             # 美术、音效、字体与授权清单
build.py            # 单文件构建脚本：python3 build.py
README.md
```

## 构建

```bash
python3 build.py
```

会读取 `src/`、`assets/` 并生成 `dist/嘟豪.html` 单文件。

## 素材与致谢

- 作者：灵力开发
- 特别出演：duhao
- 音效：[kavex/GameSounds](https://github.com/kavex/GameSounds)（GPL-3.0）、[romainsimon/uisfx](https://github.com/romainsimon/uisfx)（MIT/CC0）、[ohrafaelmartins/sound-effects](https://github.com/ohrafaelmartins/sound-effects)、[eakbulut/foley](https://github.com/eakbulut/foley)（MIT）
- 字体：阿里巴巴普惠体（免费商用，子集内联）
- 原始世界观 / 对话 / 美术素材：用户提供，授权本项目使用

> 注意：kavex/GameSounds 音效为 GPL-3.0，再分发时请遵循对应许可；逐文件来源见 [assets/audio/CREDITS.json](assets/audio/CREDITS.json)。

—— 愿你在塔外，见到雾散。
