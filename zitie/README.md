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
  collection.js   素材合集：弹窗、页签、填入目标页
  data/           笔顺数据、拼音引擎、素材合集数据
  fonts/          中文六款、英文四款、拼音两款、控笔线条一套
```

## 加一个页面

1. 拷一份 `static/page.hanzi.js`，改成 `page.xxx.js`
2. 末尾写 `window.myComponents.XxxPage = XxxPage`
3. `index.html` 里补 `<script src="static/page.xxx.js">`
4. `static/index.js` 的 `ROUTES` 加一项，模板里加 `<xxx-page v-else-if="route === 'xxx'">`

`index.js` 本身不用改 —— 组件是自注册的。

首页那张缩略图同理：`ui.js` 里的 `THUMBS` 加一份该页的小样数据
（几行几列、哪些字描红），`page.home.js` 的 `features` 里加一张卡就成。
缩略图是 SVG 按真实字帖比例画的，不拉笔顺分片。

## 中文字体：描字走字体，笔顺走笔画

汉字字帖的「字体」选择只对描字有效，因为它和笔顺是两条完全不同的渲染路径：

- **描字（`render: 'text'`）** 用 SVG `<text>` 按选中字体整字画。选隶书就是隶书，选行楷就是行楷。
- **笔顺（`render: 'stroke'`）** 画的是笔顺数据里的笔画轮廓路径，一个字拆成一笔一笔。数据只有楷体那一套，所以笔顺模式下字体选项没有意义 —— 换到非楷体时「笔顺」会置灰。

词语文章页同理，整段文字只走字体（`genStage` 固定 `render: 'text'`），
逐笔拆一整篇课文既看不出来也没必要。

顺带一个性能收益：描字和词语文章不再需要笔顺分片，`useGen` 的 `strokes` 判定会让它直接跳过预取。

### 六款字体怎么对齐到同一个格子

各款字体在 em 框里画得多满差很多 —— 隶书的字只占 em 高 65%，仿宋能到 98%，
行楷还往下探出 20%。字号直接取格子边长，同一版面上就会「有的顶天立地、有的瘦一圈」。

所以 `Zu.fontMetric(key)` 会用 canvas `measureText` 量一批常用字的墨迹包络
（95 分位，避开「永」「春」这类挑出去的字），反算两件事：

- `scale`：字号缩放，让墨迹占格子的 88%（留出走笔空间）
- `baseline`：基线位置，让墨迹中心落在格子正中

量好缓存起来，字体是 `FontFace` 异步注入的，所以先给个近似值、量完 bump `Zu.metricRev` 让字形重排。
用 canvas 而不是 SVG `getBBox` —— 后者在 Chrome 里返回的是 em 框（永远 1000×1000），量不出实际墨迹。

## 三个约定

- **数据模型渲染，不拼 HTML 字符串**。`utils.js` 的 `gen*` 函数算出每页有哪些格子，`ui.js` 的组件负责画。原站是 PHP 返回 HTML 再 `v-html`，改一个格子样式得动后端。
- **分页按块切**。一个字的所有练习行是一个块，`paginateBlocks` 保证它不会被页边界切断。
- **纸张锁 297mm**。预览和打印共用同一套尺寸，`app.css` 里的 `@media print` 只负责把界面藏掉。
- **英文格的字号不写死**。`utils.js` 的 `Z.GLYPH_METRICS` 里放着六款英文/拼音字体的 asc / xh / desc 和逐字宽度，`enLayout()` 按它算出字号与两条内线的位置。换字体、调行高都不用再改数字。

## 英文/拼音格的排版

四线三格的字号是量出来的：

```
size = (格高 - 0.3mm) / (asc + desc)     # 升部顶贴格顶、降部底贴格底
上边线 = asc - xh                        # 小写字母正好卡进中格
下边线 = asc                             # 基线
```

`asc` / `xh` / `desc` 是字体文件里量出来的真实字形高度（`Z.GLYPH_METRICS`），不是估的。以前每款字体手调一个 px（17 / 20 / 22），各家 x 高度差近一倍，纸上就是一溜小字浮在格中间。

加一款英文字体的话，用 `fontTools` 量一下这三个数、按 `Z.EN_CHARS` 顺序把字宽抄进 `adv`，再往 `Z.EN_FONTS` 加一条即可。

## 素材合集

顶栏右上角的「素材合集」是一堆现成的练字素材：小学一到六年级上册/下册生字表（11 份）
加国学三篇（三字经、弟子规、千字文）。点开按年级分页签，选一条，直接填进**汉字字帖**或**词语文章**。

数据在 `data/collections.js`，来源是 `../zivip/download/` 那 14 张下载页的正文 ——
也就是原站那批 PDF 字帖的内容本身。分年级生字是纯汉字串（原站就是这么排的），
国学保留标点、按 12 字断行，丢进词语文章正好一行一句。

填内容这条路只干两件事：

```js
Z.save(target, { ...Z.load(target, {}), content, title });   // 写该页的表单存档
window.dispatchEvent(new CustomEvent('zitie:fill', { detail: { key: target, patch } }));
```

写存档管「该页还没挂载」的情况 —— 切过去时 `useGen` 正是从 localStorage 读初始值；
发事件管「该页就在眼前」的情况，`useGen` 里的监听直接把内容 `Object.assign` 进表单，
参数随手重排。两件事都要做，少一件就有一种路径是空的。

## 数据

- `data/strokes.js`：6763 个 GB2312 字的笔画路径，base36 增量编码。只建「字 → 偏移」索引，用到才解码（100 字约 1ms）。
- `data/pinyin-pro.js`：pinyin-pro UMD，词组级多音字判断。

## 控笔练习

`static/fonts/pen/PenControl.woff2`（4.3KB）是一个图标字体，码位对应 32 个线条图形：
`123456789ABCDEFGHIJKLMNOPQRSTUVW`（没有 `0`、`X`、`Y`、`Z`）。

这些图形天生就是「一个格子」的尺寸，所以不做 SVG，直接把字符当文字画：
`static/page.pen.js` 出表单，`Zu.genPen()` 排版，`<z-cell-pen>` 渲染。
换格子大小就是改 `font-size`，打印出来仍然是矢量的。

**输入方式是一个 textarea**，不是「勾选一串图形」。一行一个图形字符，回车就是一行空白，
所以复制、剪切、粘贴、删掉某一行都跟编辑普通文本一样。下面的图形按钮点一下插到
**光标所在位置**（点按钮时输入框会失焦、`selectionStart` 会归零，位置自己记着）；
从没点进过输入框就插到末尾。一行里写几个字符就是几行纸，小写 `a-w` 自动转大写。

**每行格子是铺满的**。格子边长只是基准：先按 `184mm / (边长 + 间距)` 反算列数，
再把 184mm 摊给这些列（`doc.cellW`），行数同理按摊出来的列宽反算 ——
不然右边会剩下半列空地，纸上看着像没印完。想让「前面描红、后面自己写」，
把「描红格数」从 0 改成 6 就行，那 6 格之后留白。

一个坑：字体的线条是「细长矩形」，横线只有 0.9% em 高，12mm 的格子算下来不到 0.02mm，
屏幕上直接消失、纸上也会被打印机吃掉。所以 `.cell-pen` 加了 `-webkit-text-stroke: .07mm`，
落在纸面上大约一根细线的粗，正好适合描。

笔顺数据遵循 Arphic Public License，拼音引擎 MIT。
