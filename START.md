# START.md · 前端项目骨架速查

> 给 AI 看的"照抄模板"。新建前端项目时读这一份就够，不用再扫仓库。
> 两个参照物都是**同一个套路**：`dhjzz/tvweb`（影视聚合，前端在 `webapp/`）与
> `dhjzz/zitie`（字帖工坊，前端在 `zitie/`）。前者是有后端的应用，后者是纯离线单页。

---

## 0. 一句话概括这套模式

**零构建 + Vue 3 全局构建版 + 一张自注册表 + 一页一个 `page.xxx.js` + 一份手写 CSS。**

没有 webpack / vite / npm / SFC / `.vue` 文件 / TypeScript。所有文件都是浏览器直接能跑的
普通 `<script>`，`index.html` 里的引入顺序就是唯一的"构建配置"。

四条硬规则，先记住：

1. `window.myComponents = {}` 必须在所有业务 js 之前建好。
2. 每个页面文件是 IIFE，**末尾自己注册**：`window.myComponents.XxxPage = XxxPage`。
3. `index.js` 只做「遍历注册表 + 挂载」，**不认识任何具体页面**。
4. 加一个页面 = 拷 `page.xxx.js` + `index.html` 补一行 `<script>` + 路由表加一项。
   `index.js` 一行都不用改。

---

## 1. 两个参照物的对照

| | `tvweb/webapp` | `zitie` |
|---|---|---|
| 定位 | 影视搜索播放，Go 后端 `//go:embed all:webapp` | 纯离线字帖生成器，双击 index.html |
| Vue | `static/vue3.prod.js`（含模板编译器） | 同左 |
| 公共层 | `core.js` → `window.TvCore`（api/登录态/主题/播放器） | `utils.js` → `window.Zu`（算法/数据/排版）+ `store.js`（配置层） |
| 组件层 | 无独立文件，控件散在各页模板里 | `ui.js` → 控件 + A4 纸张 + 格子，全部 `G.ZXxx` |
| 页面 | `page.search / play / records / settings / login` | `page.home / hanzi / pinyin / eletter / num / math / stage / pen / blank / guide / settings` |
| 弹窗 | 页面内 | `collection.js`、`page.settings.js`，挂在壳上任意页面可开 |
| 路由 | hash + pushState 历史栈，`#/play?source=&id=` | 纯 hash，`#/hanzi`，白名单校验 |
| 视图层 | 业务逻辑重（播放器、弹幕） | 排版引擎重（SVG 画格、分页） |
| 状态 | 组件 `ref` + 根组件 props 下发 | `Z.settings` schema 注册表 + localStorage |

**取用建议**

- 做「有交互、多页面、要调后端」的项目 → 抄 tvweb。
- 做「表单 + 预览 + 打印/导出的生成器」→ 抄 zitie，它多出来的 `store.js`
  （页面自报 schema、自动存、脏数据清洗、导出导入）和 `useGen()` 组合骨架很值钱。

---

## 2. 目录骨架（直接照这个建）

```
项目根/
├── index.html              # 根组件模板（#app 里就是 App 的 DOM）
├── static/                 # 前端全部静态资源（tvweb 里整个目录 embed 进 Go 二进制）
│   ├── vue3.prod.js        # Vue 3 完整版，必须用 vue.global.prod.js（带模板编译器）
│   ├── app.css             # 唯一一份 CSS：变量 + 公共类 + 分页样式块
│   ├── core.js             # 公共层 → window.TvCore / window.Zu
│   ├── store.js            # （可选）配置层：schema 注册表 + 持久化
│   ├── ui.js               # （可选）组件层：控件、纸张、格子
│   ├── index.js            # 入口：路由 + 装配 + mount
│   ├── page.home.js        # 一页一个文件
│   ├── page.xxx.js
│   └── data/               # （可选）离线数据、引擎、分片
└── AGENTS.md               # 给 AI 的项目约定
```

单开一页且与主应用无关时（如 tvweb 的 `local.html`），就走
**整页自包含**：样式、JS 全在这一个文件里，不引 vue / core / app.css，用 `<a href>` 整页跳过去。
路由和后端都不用改。

---

## 3. `index.html` 骨架（顺序不能动）

```html
<!doctype html>
<html lang="zh-CN">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1, viewport-fit=cover" />
    <meta name="theme-color" content="#4f6ef7" />
    <title>项目名</title>
    <meta name="description" content="一句话说清这个站干什么" />
    <link rel="shortcut icon" href="favicon.ico" type="image/x-icon" />
    <!-- 开发阶段不带 ?v=，否则每次改动都和别人的版本号打架 -->
    <link rel="stylesheet" href="static/app.css" />
  </head>
  <body>
    <!-- 根组件模板就写在这里：先渲染出静态骨架，js 没跑完也不是白屏 -->
    <div id="app">
      <div class="app">
        <header class="topbar">
          <div class="topbar-in">
            <button class="brand" @click="go('home')">
              <span class="brand-logo">字</span>
              <span>
                <div class="brand-name">项目名</div>
                <div class="brand-sub">slug</div>
              </span>
            </button>
            <nav class="nav">
              <button v-for="r in routes" :key="r.name" class="nav-item"
                :class="{ on: route === r.name }" @click="go(r.name)">{{ r.title }}</button>
            </nav>
            <div class="topbar-right">
              <button class="icon-btn" @click="toggleTheme">{{ dark ? '☀️' : '🌙' }}</button>
            </div>
          </div>
        </header>

        <main class="wrap">
          <home-page v-if="route === 'home'" @go="go"></home-page>
          <hanzi-page v-else-if="route === 'hanzi'"></hanzi-page>
          <!-- ……每页一行 -->
        </main>

        <z-toasts></z-toasts>
      </div>
    </div>

    <script src="static/vue3.prod.js"></script>
    <script>
      // 1) 主题必须先定，否则亮底会闪一下再变暗
      try {
        var t = localStorage.getItem('app:theme');
        if (t === 'dark' || (!t && matchMedia('(prefers-color-scheme: dark)').matches)) {
          document.documentElement.classList.add('dark');
        }
      } catch (e) {}
      // 2) 注册表，必须排在业务 js 最前面
      window.myComponents = {};
    </script>

    <!-- 3) 顺序：公共层 → 组件层 → 各页面 → 入口 -->
    <script src="static/utils.js"></script>
    <script src="static/store.js"></script>
    <script src="static/ui.js"></script>
    <script src="static/page.home.js"></script>
    <script src="static/page.xxx.js"></script>
    <script src="static/index.js"></script>
  </body>
</html>
```

顺序错了就是 `undefined is not a function` 或组件渲染不出来。记住一句：
**vue → 主题 + 注册表 → 公共层 → 组件层 → page.* → index**。

---

## 4. `static/index.js`（入口模板，几乎不用改）

```js
/* 入口：路由、主题、外壳。页面组件由 page.*.js 自己注册进 window.myComponents。 */
(function () {
  const { createApp, ref, onMounted } = Vue;
  const G = (window.myComponents = window.myComponents || {});

  // 路由白名单。静态站没有服务端 rewrite，只用 hash，双击本地文件也能跑
  const ROUTES = [
    { name: 'home', title: '首页' },
    { name: 'xxx', title: '某功能' },
  ];
  const NAMES = ROUTES.map((r) => r.name).concat(['guide']); // 不进导航但可达的页
  const parse = () => {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const name = raw.split('?')[0].split('/')[0];
    return NAMES.includes(name) ? name : 'home';
  };

  const App = {
    setup() {
      const route = ref(parse());
      const dark = ref(document.documentElement.classList.contains('dark'));

      const go = (name) => { if (name !== route.value) location.hash = '#/' + name; };
      const toggleTheme = () => {
        dark.value = !dark.value;
        document.documentElement.classList.toggle('dark', dark.value);
        try { localStorage.setItem('app:theme', dark.value ? 'dark' : 'light'); } catch (e) {}
      };
      const sync = () => { route.value = parse(); window.scrollTo({ top: 0 }); };

      onMounted(() => {
        window.addEventListener('hashchange', sync);
        window.addEventListener('popstate', sync);
        if (!location.hash) history.replaceState(null, '', '#/home');
      });

      return { route, dark, go, toggleTheme, routes: ROUTES };
    },
  };

  const app = createApp(App);
  // 谁注册了就挂谁。模板里用连字符写法：<hanzi-page>
  Object.keys(G).forEach((name) => {
    const c = G[name];
    if (c && typeof c === 'object' && c.name) app.component(name, c);
  });
  app.mount('#app');
})();
```

**要带历史栈的（手机上按返回键不能退出站点）**，抄 tvweb：用 `pushState` 而不是只改
`location.hash`，`popstate` 与 `hashchange` 都走同一个 `reconcile()`；`replace=true` 表示
"同一页换内容"，不往栈里再塞一条。

**要缓存页面的**（搜索结果等了几秒才出来，返回时不能重搜）：

```js
const KEEP_ALIVE = ['SearchPage', 'RecordsPage'];
// 模板：<keep-alive :include="KEEP_ALIVE"> ... </keep-alive>
```

`keep-alive` 的 `include` 认的是组件的 **`name`** 字段，不是注册名。

---

## 5. `page.xxx.js` 骨架（一页一个文件）

```js
/* Xxx 页：一句话说清这页干什么
   依赖 core.js（window.TvCore）与 window.myComponents。
   末尾把组件注册进 window.myComponents.XxxPage，index.js 靠这个名字取用。 */
(function () {
  const { ref, computed, watch, onMounted } = Vue;
  const { api } = window.TvCore;              // 公共能力从公共层解构
  const G = (window.myComponents = window.myComponents || {});

  const XxxPage = {
    name: 'XxxPage',                          // keep-alive / devtools 认这个名字
    props: {
      // 父组件（壳）下发的状态，用 kebab-case 传：:refresh-signal="n"
      refreshSignal: { type: Number, default: 0 },
    },
    emits: ['play', 'toast'],                 // 一律 emits 声明，别用 this.$emit 裸调

    setup(props, { emit }) {
      const list = ref([]);
      const loading = ref(false);

      const load = async () => {
        loading.value = true;
        try { list.value = (await api('list')) || []; }
        catch (e) { emit('toast', e.message || '加载失败'); }
        finally { loading.value = false; }
      };

      onMounted(load);
      watch(() => props.refreshSignal, load);

      return { list, loading, load };
    },

    // 模板就写在 js 里，用反引号。工具函数别往这里塞
    template: `
      <div class="split">
        <div class="card"> ... </div>
      </div>`,
  };

  G.XxxPage = XxxPage;
})();
```

**命名坑**：Vue 把组件名连字符化时只在大写字母前插 `-`。`ZMbar` → `z-m-bar`，
模板里就得写 `<z-m-bar>`，和别的两段式不统一。所以名字写成 `ZMbar` / `ZSheet` 这种
**两段式**，模板里是 `<z-mbar>` / `<z-sheet>`。

---

## 6. 公共层约定：`core.js` / `utils.js`

一个 IIFE，把能力全挂到一个全局命名空间上，页面**从命名空间解构**，页面之间不许互相引用。

```js
(function () {
  const API = window.APP_API_BASE || 'api/';   // 后端基址，留一个 window 开关便于联调

  const api = async (path, opts) => { /* fetch 封装、错误归一、401 回调 */ };
  const theme = { get(), set(v) };
  const store = { get(k, d), set(k, v) };

  window.TvCore = { API, api, theme, store /* ... */ };
})();
```

- 想指到别的后端，在 `core.js` 之前插一行 `window.APP_API_BASE = 'http://127.0.0.1:8899/api/'`。
- 纯算法/数据/排版放 `utils.js`（zitie 的 `window.Zu`），页面与组件都从这儿取。
- **单文件可复制的通用件**单独成文（如 tvweb 的 `static/search.js`）：零依赖、无构建、
  拷走就能用，有 Vue 时顺手多挂一个 `window.SearchBox` 组件。

---

## 7. CSS 约定：一份 `app.css`，分块 + 变量

```css
/* 项目名 · 原生 CSS（无构建）
   约定：一个类一行；公共类在前，页面样式按 首页/xxx 分块。
   暗色统一挂在 html.dark 上，页面里不写 dark: 前缀。 */

/* ===== 通用：变量 ===== */
:root {
  --bg: #f4f6fb; --surface: #fff; --surface-2: #f8fafc;
  --line: #e4e8f0; --text: #1b2330; --text-2: #5a6679;
  --accent: #4f6ef7; --warn: #e2564d;
  --shadow-sm: 0 1px 2px rgba(20,32,52,.05);
  --r: 14px;
}
html.dark {
  --bg: #10141c; --surface: #1a212c; --line: #2a3341;
  --text: #e8edf6; --text-2: #9fabbf; --accent: #7d94ff;
}

/* ===== 通用：重置 ===== */
* { box-sizing: border-box; }
html, body { margin: 0; background: var(--bg); color: var(--text); }
[v-cloak] { display: none !important; }

/* ===== 通用：布局 ===== */
.wrap { max-width: 1440px; margin: 0 auto; padding: 22px 20px 80px; }
/* 折成一栏时必须 minmax(0, 1fr)：1fr 的最小宽度是 min-content，会撑破屏幕 */
.split { display: grid; grid-template-columns: 372px minmax(0, 1fr); gap: 22px; align-items: start; }
@media screen and (max-width: 1080px) { .split { grid-template-columns: minmax(0, 1fr); } }

/* ===== 页面：xxx ===== */

/* ===== 打印 ===== */
@media print {
  @page { size: A4; margin: 0; }
  .topbar, .side, .no-print, .empty { display: none !important; }
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
}

/* ===== 移动端（只作用于 screen，否则打印预览也会被当成窄屏） ===== */
@media screen and (max-width: 760px) {
  .wrap { padding: 10px 10px calc(66px + env(safe-area-inset-bottom)); }
  /* iOS 上输入框不到 16px，聚焦会整页放大且退不回来 */
  .input, input, textarea { font-size: 16px; }
}
```

几条实战经验（都是踩过的）：

- **打印和预览共用同一套尺寸**。纸张写死 `210mm × 297mm`，打印时只把 UI 藏掉、
  `zoom` 强制回 1，不做第二套版面。
- **列宽写精确 mm，不用 `1fr`**。`1fr` 每列会取整到 56.7px 之类的小数，
  打印栅格化时每 4 列凑出一条粗线，纸面上看得出来。
- **选项多的控件横滑**，别折成三行（`flex-wrap: nowrap` + `overflow-x: auto` + 右侧渐隐遮罩）。

---

## 8. 配置层（可选，生成器类项目强烈建议）

页面自己在顶部报 schema，存/读/清洗/导出全走同一处，页面不写第二份默认值：

```js
const DEFAULTS = { title: '标题', content: '默认正文', cols: 12 };
// inputs 里的是「输入类」：不落 localStorage，也不进导出的 JSON
Z.settings.define('xxx', { label: '某页', defaults: DEFAULTS, inputs: ['content'] });

// store.js 内部：
// norm()  只认 defaults 里声明过的键，类型跟着默认值走 → 旧字段、手改坏的值自然出局
// init()  读盘 → 清洗 → 与存档不一致就写回一次
// set()   写盘前剔掉 inputs
// dump()  / load()  导出、导入 JSON
// reset() 清掉本前缀的所有 key
```

好处是删过字段、改过类型、老版本存档，全都不用写迁移代码。

---

## 9. 生成器页面的公共骨架（zitie 的 `useGen`）

六个页面差异只有「表单长什么样」和「怎么排版」，重复的部分抽成组合函数：

```js
G.useGen = (key, defaults, build, validate, opts) => {
  const form = reactive(Z.settings.init(key, defaults));
  const doc = ref(null), pages = ref([]), items = ref([]);
  let seq = 0;

  const generate = async () => {
    const err = validate && validate(form);
    if (err) return Z.toast(err, 'warn');
    const my = ++seq;
    if (opts && opts.strokes && opts.strokes(form)) await Z.prefetch(form.content);
    if (my !== seq) return;             // 期间参数又变了，这次结果作废
    const out = build(form);
    // ...
  };

  // 参数一变就重排（本地几毫秒），顺手防抖 300ms 落盘
  watch(() => ({ ...form }), () => {
    clearTimeout(tid); tid = setTimeout(() => Z.settings.set(key, form), 300);
    generate();
  }, { deep: true });

  return { form, doc, pages, items, generate, print };
};
```

页面拿到 `{ form, doc, pages, items, generate, print }`，只写左侧表单 + 右侧预览两个块。
**异步生成必须带序号校验**（`seq`/`mountSeq`），否则连点两下，旧回调会顶掉新结果。

---

## 10. 避坑清单（照抄时逐条对一遍）

1. **`vue3.prod.js` 是裁剪版**：不含 Teleport。`<teleport>` 会报 `e6 is not a function` 白屏，
   要搬 DOM 就自己 `appendChild`，并且只能搬一次。
2. **模板里 `v-if` 和 `v-else-if` 中间夹注释，链就断了** —— 注释也是一行 VNode。
   条件分支各写各的 `v-if`。
3. **`keep-alive include` 认组件 `name`**，写错了等于没缓存。
4. **组件名两段式**，否则连字符化后和模板对不上（见第 5 节）。
5. **`minmax(0, 1fr)`**：任何包住固定宽内容（比如 210mm 的纸）的网格列都要加，
   否则 `min-content` 撑破屏幕。
6. **`@media print` 里 `zoom: 1 !important`**，屏幕上为了适配算出来的缩放不能带到纸上。
7. **`@media screen and (max-width: …)`** 一定要带 `screen`，不然打印预览宽度也算窄屏。
8. **主题先于首屏**：`index.html` 里内联一段脚本加 `html.dark`，别等 Vue 起来。
9. **`<div id="app">` 里放真实 DOM**：js 挂了也看到页头，不是一片白。
10. **开发阶段 `<script src>` 不带 `?v=`**（见 AGENTS.md），线上再加查询串破缓存。
11. **`index.js` 不许出现具体页面名**，一出现这套模式的收益就没了。

---

## 11. 新建项目 Checklist

```
[ ] 1. 建目录：项目根/index.html + 项目根/static/
[ ] 2. 放 static/vue3.prod.js（vue.global.prod.js，含编译器）
[ ] 3. 写 static/app.css：变量(:root + html.dark) → 重置 → 公共类 → 页面分块 → @media print → @media screen
[ ] 4. 写 static/core.js：API 基址、fetch 封装、主题、存储 → window.Xxx
[ ] 5. 写 static/ui.js（控件/容器组件）：G.ZField / ZSeg / ZButton ...
[ ] 6. 写 static/page.home.js（首页入口卡）
[ ] 7. 写 static/index.js：ROUTES + parse + App + 遍历注册 + mount
[ ] 8. index.html：模板 + 主题内联脚本 + window.myComponents={} + 按序引入
[ ] 9. 双击 index.html 验证：切页、主题、刷新后 hash 保住
[ ] 10. 之后每加一页：拷 page.xxx.js → 注册行 → index.html 加 <script> → ROUTES 加一项
```

### 给 AI 的开工提示词（可直接复用）

```
按 START.md 的「零构建 Vue3 + 自注册页面组件」模式，为 <项目名> 新建前端：
- 纯静态，双击 index.html 可用，无 npm / 无构建 / 不用 SFC
- 目录：index.html + static/{app.css, vue3.prod.js, core.js, ui.js, page.home.js, page.xxx.js, index.js}
- 每个页面是 IIFE，末尾 window.myComponents.XxxPage = XxxPage
- index.js 只做遍历注册与 mount，不出现任何具体页面名
- 新页面靠：拷 page 文件 + index.html 补一行 script + ROUTES 加一项
- 样式一份 app.css，暗色走 html.dark + CSS 变量
- 页面清单：home / <...>
```

---

## 12. 一句话总结

这套模式的全部价值在于**新增页面不需要改任何既有文件**：
页面是一个自治的 `page.xxx.js`，它自己写进注册表；入口只认注册表。
代价是全局命名空间和手写引入顺序，收益是"打开就能跑、拷走就能用、永远免构建"。
