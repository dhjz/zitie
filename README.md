纯前端离线字帖生成器：不装、不连网，双击 `index.html` 就能生成并打印 A4 字帖。

没有后端、没有登录、没有构建步骤。汉字笔顺、拼音注音、英文四线三格、数学口算、
空白格纸，参数一改版面立刻重排，打印时选「另存为 PDF」就是矢量文件。

## 能做什么

| 页面 | 内容 |
|---|---|
| 汉字字帖 | 描红 / 笔顺 / 笔顺条，11 档描字（空心、虚线、点虚线、擦除画…），拼音可选 |
| 拼音字帖 | 声母、韵母、整体认读，自选只练指定的几个音节，或给汉字自动注音 |
| 英文字帖 | 字母表、自选字母与单词，四线三格，四款字体 |
| 数字字帖 | 0-9 描红、空心、细虚线、描点，字形是矢量数据不是字体 |
| 数学练习 | 加减乘除竖式口算，范围、题型、挖空位置自己定 |
| 词语文章 | 整段文字铺格子，古诗、课文、词语都行 |
| 控笔练习 | 直线、折线、螺旋、波浪铺满整页，先把手练稳 |
| 空白练习纸 | 田字格、米字格、拼音格、四线三格，外加作文稿纸、横线笔记、竖式计算、数学方格、坐标纸 |

配套还有：素材合集（一~六年级生字表、国学经典）、每页参数自动保存、
亮暗主题、配置导出导入 JSON。

## 跑起来

```bash
# 方式一：直接双击（fonts 走相对路径，file:// 也能用）
open index.html

# 方式二：起个静态服务
python3 -m http.server 8000
```

不需要 `npm install`，`scripts/` 里的 node 依赖只服务构建期。

## 打印

这几条不对齐，字帖八成会废：

- 纸张 A4，边距选「无 / None」
- 缩放保持 100%，别开「适合页面大小」
- 勾上「背景图形」，格子线才是彩色实线
- Chrome / Edge 效果最好

页面里的「?」按钮有完整说明。

## 目录

```
index.html        根组件模板，脚本引入顺序就是唯一的「构建配置」
static/
  app.css         界面样式 + 打印版面
  utils.js        工具层：笔顺解码 / 拼音 / 出题 / 分页排版
  store.js        配置层：schema 注册表、自动保存、导出导入
  ui.js           组件层：控件、A4 纸张、格子
  index.js        入口：路由、主题、装配
  page.*.js       各功能页，自注册进 window.myComponents
  config.js       全局开关 IS_LITE（完整版 / 精简版）
  data/           笔顺、笔心线、拼音引擎、数字字形、素材合集、课文生字
  fonts/          中文六款、英文四款、拼音两款、控笔线条一套
scripts/          构建期脚本：生成精简版资源
```

技术栈是「零构建 + Vue 3 全局构建版 + 一页一个 `page.xxx.js` + 一份手写 CSS」，
没有 webpack / vite / SFC。加一页的步骤见 [Report.md](Report.md#加一个页面)。

## 完整版与精简版

完整版覆盖 GB2312 共 6763 字，笔顺 + 笔心线 + 中文字体约 23MB。
只想给中小学生用的话改一个常量：

```js
// static/config.js
window.IS_LITE = true;
```

打开后只读 `data/strokes_lite`、`data/medians_lite`、`fonts/zh_lite` 三个目录，
体积减半。资源由脚本生成，改过字表或字体后重跑一次：

```bash
cd scripts
npm install
node lite.js          # 生成
node lite.js --check  # 只核对覆盖率与体积
```

想直接拿去用：打一个只含精简版资源的离线站点 zip，

```bash
python3 scripts/pack-lite.py --tag v1.0-lite   # 产物 dist/zitie-lite-v1.0-lite.zip
```

推一个名字里带 `lite` 的 Tag（如 `v1.0-lite`），流水线会自动打出这个 zip
并挂到对应的 Release 附件上，解压双击 `index.html` 即可用。

## 文档

- [Report.md](Report.md) —— 设计笔记：排版、字体、配置层、移动端适配的实现细节
- [START.md](START.md) —— 这套前端骨架的速查模板，新建同类项目照着抄
- [AGENTS.md](AGENTS.md) —— 给 AI 的项目约定

## 数据来源与许可

本项目代码以 [MIT](LICENSE) 协议开源，可自由使用、修改、分发，保留版权声明即可。

第三方资源各自保留原协议：

- 笔顺数据来自 [makemeahanzi](https://github.com/skishore/makemeahanzi) / hanzi-writer-data，遵循 **Arphic Public License**
- 拼音引擎 [pinyin-pro](https://github.com/zh-lx/pinyin-pro)，MIT
- 其余代码为项目自身实现

## 截图

| 首页 | 汉字字帖 |
|---|---|
| ![首页](https://gcore.jsdelivr.net/gh/dhjz/zitie@main/appimg/1.jpg) | ![汉字字帖](https://gcore.jsdelivr.net/gh/dhjz/zitie@main/appimg/2.jpg) |

| 拼音字帖 | 数字字帖 |
|---|---|
| ![拼音字帖](https://gcore.jsdelivr.net/gh/dhjz/zitie@main/appimg/3.jpg) | ![数字字帖](https://gcore.jsdelivr.net/gh/dhjz/zitie@main/appimg/4.jpg) |
