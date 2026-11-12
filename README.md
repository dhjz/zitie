# zitie · 字帖

自研的田字格字帖生成器。纯前端、离线、免打包，双击 `index.html` 就能用。

- 站点镜像（原站静态资源，供对照参考）：[`zivip/`](./zivip)
- 自研新版（Vue 3，离线 HTML）：[`zitie/`](./zitie)

---

## 调研报告

> 记录于 ISSUE #5。目标：搞清「笔顺 + 拼音 + 画格」这三件事能不能自己干，以及代价。

### 结论先说

**这事不难。难点不在数据，在排版品味和打印对齐。**

三条链路都打通并验证过了：纯前端生成 A4、SVG 画格、笔形数据 + 拼音，Chrome headless 打 A4 PDF 5 页 201KB，矢量不失真，毫米级尺寸准确。

真正的硬活是排版系统：字号、行距、格子间距、页边距、分页不许切断一行、拼音基线对齐。这才是「现代化 UI」能跟原站拉开差距的地方。

### 笔顺：hanzi-writer-data 是唯一正确答案

不用纠结别的方案。

- 9575 个字。跟仓库里 `strokes.js` 的 6762 个 GB2312 字逐个比对，**覆盖率 100%**
- 每字三份数据：`strokes`（SVG 轮廓路径）、`medians`（笔心线）、`radStrokes`（部首笔画），平均 1.8KB
- 跟现用数据同源（makemeahanzi），但换来的是标准 JSON，不用再自己写 base36 zigzag 解码
- 配 `hanzi-writer`（MIT，40KB / gzip 10KB）就有动画、描红、`quiz()` 默写、`animateCharacter()`

**cnchar 只适合当补充，别指望它出字形。** 实测三件事：

- `cnchar.stroke('我')` 只回笔画数，`cnchar-draw` 是 Canvas 现画，精度远不如轮廓路径
- 32 个部首/独体字的笔画数跟 hanzi-writer-data 对不上（`氵` 5/0、`扌` 3/0、`丶` 1/0）
- `orderToWord()` 在 3.2.6 直接报「参数笔画名数组有误」—— 它自己的 bug，拿不到笔画名

所以笔画**名称**（横竖撇捺折）要么用它，要么拿 `medians` 首尾方向自己判个八分类，后者更可控。

### 拼音：pinyin-pro 完胜

MIT，零依赖，318KB / gzip 140KB，UMD 直接 `<script>` 引，双击打开也能跑。

多音字靠词组上下文判，实测：

| 输入 | 输出 | |
|---|---|---|
| 长大了 | `zhǎng dà le` | 对 |
| 银行行长 | `yín háng háng zhǎng` | 对 |
| 重庆 | `chóng qìng` | 对 |
| 绿女略 | `lǜ nǚ lüè` | ü 带两点，对 |

对画拼音格特别有用的是 `{type:'all'}`，它直接吐出 `initial` / `final` / `finalHead` / `finalBody` / `finalTail` / `num` / `polyphonic` —— **四线三格要的分层信息全在里面**，不用自己切声韵母。还有 `customPinyin()` 可以加权修词典。

反观原来的 `pinyin.js`：6763 个单字静态表，跟 pinyin-pro 逐字比对 **256 处不一致**，而且「长」这种只能给一个音，无语境能力。90KB 换成 140KB gzip 拿到词组级准确率，很值。

### 画格：别往 iconfont 里塞格子字符

原方案在 iconfont 里塞 `\e07` / `\e08` 当格线。改成纯 SVG / CSS 画：

- 田字格 / 米字格 / 回宫格 / 九宫格都是几行线，跟着单元格走
- 任意缩放不糊、换色改一个属性、打印矢量、描红/淡格/虚线的透明度随手调
- 虚线用 `border-style: dashed`，示范字深色、描红淡红、空白格只留格线，三档对比干净

### 体积：必须按需加载

完整 GB2312 笔画数据（JSON）：仅 `strokes` 14.7MB / gzip 5.76MB，加 `medians` 18.8MB / gzip 7.58MB。比现有 `strokes.js` 的 7.3MB（gzip 3.2MB）大一倍。

**别全量解码。** 字帖天然是按需取字（一次 20 到 100 个字，每字 1.8KB）。实测现有 `strokes.js` 光解析脚本就要 149ms。

新版做法：保留那份 6763 字的 base36 数据，切成 41 个分片（每片 512 个码位），用到哪个字才拉那一片；分片里再按「字 → 偏移」索引，只在解码时取那一段。

实测「永和九年岁在癸丑」这句：只拉 7 个分片、约 220KB（gzip 后更小），整页首屏 3.0MB，比全量省了 5.5MB。解码 100 个字 **1ms**。

代价是数据得走 `http(s)`（`file://` 下 fetch/script 受限）—— 不过 `index.html` 双击打开照样能跑，因为分片是用 `<script>` 标签注入的，不受 CORS 限制。

### 一个坑：许可证

hanzi-writer-data 不是 MIT，是 **Arphic Public License**。能用、能商用、能改，但：

- 改过的数据得以同协议公开
- 未改的要保留 `ARPHICPL.TXT`

要「自研」到闭源分发的话，这条得想清楚；只用不改的话，附上许可证文件就行。

### 技术栈建议（已落地）

**零构建**，保持双击能用的调性。

- 单页 HTML + Vue 3（全局构建，不用 SFC）+ 楷体字体本地化
- 排版全 CSS Grid，`@page { size: A4 }` 锁死，纸张宽高写成 `210mm × 297mm`
- 导出走 `window.print()`，Chrome 里选「另存为 PDF」就是矢量
- 页高按 `297 - 边距 - 标题 - 页脚` 算出可用高度，再按行数反算格子高度 —— 不留白边也不溢出

---

## 新版 zitie 做了什么

目录结构参照 [tvweb/webapp](https://cnb.cool/dhjzz/tvweb/-/tree/main/webapp)：`index.html` + `static/`，页面是 `index.js`（主页面）+ `page.xx.js`（子页面，自注册全局组件）。

```
zitie/
├── index.html               # 根组件模板（App 就是它）
└── static/
    ├── app.css              # UI 与打印版面
    ├── utils.js             # 工具层：笔顺解码 / 拼音 / 出题 / 分页排版
    ├── ui.js                # 组件层：控件 + A4 纸张 + 格子
    ├── index.js             # 入口：路由、主题、装配
    ├── page.home.js         # 首页
    ├── page.hanzi.js        # 汉字字帖（描字 / 笔顺）
    ├── page.pinyin.js       # 拼音字帖（声母 / 韵母 / 整体认读 / 汉字注音）
    ├── page.eletter.js      # 英文字帖（字母表 / 单词）
    ├── page.math.js         # 数学练习（口算）
    ├── page.stage.js        # 词语文章
    ├── page.blank.js        # 空白练习纸
    ├── page.guide.js        # 打印说明
    ├── data/
    │   ├── strokes/         # 6763 字笔顺，41 个分片按需加载
    │   └── pinyin-pro.js    # 拼音引擎
    └── fonts/               # 楷体/仿宋/隶书/行楷/庞中华/硬笔 + 手写英文字体
```

对比原站（zivip）：

| | zivip | zitie |
|---|---|---|
| 框架 | Vue 2 + jQuery + Element UI + layui | Vue 3，零依赖 |
| 拼装 | PHP 接口返回 HTML 字符串 | 本地 `v-for` 渲染数据模型 |
| 打包 | 需要 | 不需要，双击即用 |
| 数据 | 全量 `strokes.js` 7MB 首屏就下 | 41 个分片按需拉，首屏只下用到的那几片 |
| 拼音 | 6763 字静态表，无多音字 | pinyin-pro，词组级判音 |
| 样式 | 2018 风格 | 圆角、阴影、暗色、贴纸式 A4 预览 |

功能对照：汉字（描字/笔顺/拼音/格型/行数）、拼音（四类）、英文（字母/单词/四种字体）、数学（加减乘除混合、范围、括号、挖空）、词语文章、空白练习纸 —— 原站有的都在。

新增的能力：

- 参数改一下版面立即重排，不用反复点「生成」
- 设置记在本地，下次进来还是那套
- 分页按「一个字一块」切，绝不把某字的练习行切断
- 格线纯 CSS/SVG 画，换色换格型只改属性
- 暗色模式
- 纸张锁 297mm，预览什么样打印什么样

## 用法

```bash
# 直接开
open zitie/index.html

# 或者起个静态服务（fonts 用相对路径，file:// 也 OK）
cd zitie && python3 -m http.server 8000
```

打印：点「打印 / 存 PDF」→ 纸张 A4、边距选「无」、缩放 100%、勾上「背景图形」。

## 许可

笔顺数据来自 makemeahanzi / hanzi-writer-data，遵循 **Arphic Public License**；拼音引擎 pinyin-pro 为 MIT。
