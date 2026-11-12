# zitie · 字帖工坊

纯前端离线字帖生成器。双击 `index.html` 就能用，不需要安装、打包或联网。

## 目录

```
index.html        根组件模板
static/
  app.css         界面样式 + 打印版面
  utils.js        工具层：笔顺解码 / 拼音 / 出题 / 分页排版
  ui.js           组件层：控件、A4 纸张、格子
  index.js        入口：路由、主题、装配
  page.*.js       各功能页（自注册进 window.myComponents）
  data/           笔顺数据与拼音引擎
  fonts/          楷体、仿宋、隶书、行楷、庞中华、硬笔、手写英文、控笔线条
```

## 加一个页面

1. 拷一份 `static/page.hanzi.js`，改成 `page.xxx.js`
2. 末尾写 `window.myComponents.XxxPage = XxxPage`
3. `index.html` 里补 `<script src="static/page.xxx.js">`
4. `static/index.js` 的 `ROUTES` 加一项，模板里加 `<xxx-page v-else-if="route === 'xxx'">`

`index.js` 本身不用改 —— 组件是自注册的。

## 三个约定

- **数据模型渲染，不拼 HTML 字符串**。`utils.js` 的 `gen*` 函数算出每页有哪些格子，`ui.js` 的组件负责画。原站是 PHP 返回 HTML 再 `v-html`，改一个格子样式得动后端。
- **分页按块切**。一个字的所有练习行是一个块，`paginateBlocks` 保证它不会被页边界切断。
- **纸张锁 297mm**。预览和打印共用同一套尺寸，`app.css` 里的 `@media print` 只负责把界面藏掉。

## 数据

- `data/strokes.js`：6763 个 GB2312 字的笔画路径，base36 增量编码。只建「字 → 偏移」索引，用到才解码（100 字约 1ms）。
- `data/pinyin-pro.js`：pinyin-pro UMD，词组级多音字判断。

## 控笔练习

`static/fonts/pen/PenControl.woff2`（4.3KB）是一个图标字体，码位对应 32 个线条图形：
`123456789ABCDEFGHIJKLMNOPQRSTUVW`（没有 `0`、`X`、`Y`、`Z`）。

这些图形天生就是「一个格子」的尺寸，所以不做 SVG，直接把字符当文字画：
`static/page.pen.js` 出表单，`Zu.genPen()` 排版，`<z-cell-pen>` 渲染。
换格子大小就是改 `font-size`，打印出来仍然是矢量的。

一个坑：字体的线条是「细长矩形」，横线只有 0.9% em 高，12mm 的格子算下来不到 0.02mm，
屏幕上直接消失、纸上也会被打印机吃掉。所以 `.cell-pen` 加了 `-webkit-text-stroke: .07mm`，
落在纸面上大约一根细线的粗，正好适合描。

每行第一格印深色当示范，同一行前面几格是浅色描红（描红格数可调），剩下的空格自己写；
一个图形练几行、每组后面补几行空白都能设。列数由格子边长反算，换一档边长版面就跟着变。

笔顺数据遵循 Arphic Public License，拼音引擎 MIT。
