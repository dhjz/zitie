/* 组件层：通用控件 + A4 版面渲染
   每个组件写进 window.myComponents，index.js 统一 app.component() 注册，
   模板里用连字符标签（<z-sheet> / <z-seg>）。
   渲染走数据模型，不拼 HTML 字符串 —— 页面只负责「算出每页有哪些格子」。 */
(function () {
  const { computed } = Vue;
  const Z = window.Zu;
  const G = (window.myComponents = window.myComponents || {});

  /* ---------------- 控件 ---------------- */

  // 一行设置项：左边标签，右边控件
  G.ZField = {
    name: 'ZField',
    props: { label: { type: String, default: '' }, tip: { type: String, default: '' } },
    template: `
      <div class="field">
        <label :title="tip">{{ label }}</label>
        <div class="field-body"><slot></slot></div>
      </div>`,
  };

  // 分段选择器。选项可以带 disabled，点不动的那种（笔顺只对楷体有效）
  G.ZSeg = {
    name: 'ZSeg',
    props: { modelValue: [String, Number, Boolean], options: { type: Array, default: () => [] } },
    emits: ['update:modelValue'],
    template: `
      <div class="seg">
        <button v-for="o in options" :key="String(o.v)" type="button"
          :class="{ on: o.v === modelValue, off: o.disabled }" :title="o.tip || ''"
          :disabled="!!o.disabled"
          @click="$emit('update:modelValue', o.v)">{{ o.label }}</button>
      </div>`,
  };

  // 色板：预设 + 自定义（原生取色器，省掉 jscolor 那一坨）
  G.ZColors = {
    name: 'ZColors',
    props: { modelValue: String, palette: { type: Array, default: () => [] }, allowCustom: { type: Boolean, default: true } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const hex = computed(() => {
        const m = String(props.modelValue || '').match(/(\d+)\D+(\d+)\D+(\d+)/);
        if (!m) return '#4f6ef7';
        return '#' + [1, 2, 3].map((i) => Number(m[i]).toString(16).padStart(2, '0')).join('');
      });
      const custom = (e) => {
        const v = e.target.value;
        const r = parseInt(v.slice(1, 3), 16);
        const g = parseInt(v.slice(3, 5), 16);
        const b = parseInt(v.slice(5, 7), 16);
        emit('update:modelValue', `rgb(${r}, ${g}, ${b})`);
      };
      const isCustom = computed(() => !props.palette.some((p) => p.value === props.modelValue));
      return { hex, custom, isCustom };
    },
    template: `
      <div class="chip-list">
        <button v-for="c in palette" :key="c.value" type="button" class="chip"
          :class="{ on: modelValue === c.value }" @click="$emit('update:modelValue', c.value)">
          <i :style="{ background: c.value }"></i>{{ c.name }}
        </button>
        <label v-if="allowCustom" class="chip" :class="{ on: isCustom }" :title="'自定义颜色'">
          <i :style="{ background: hex }"></i>自定义
          <input type="color" :value="hex" @input="custom" style="width:0;height:0;opacity:0;position:absolute" />
        </label>
      </div>`,
  };

  // 字体：直接拿字体本身当预览
  G.ZFonts = {
    name: 'ZFonts',
    props: { modelValue: String, fonts: { type: Array, default: () => [] }, sample: { type: String, default: '永和九年' } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      // 字体文件按需拉：鼠标移上去（或已选中）才去下那个 1MB 的 woff2。
      // 注意别在没用上之前就写 font-family —— 光声明就会让浏览器开始下载。
      const loaded = Vue.reactive({});
      const warm = (key) => window.Zu.ensureFont(key).then(() => { loaded[key] = true; });
      const pick = (key) => { warm(key); emit('update:modelValue', key); };
      const styleOf = (f) => (loaded[f.key] ? { fontFamily: f.key } : null);
      Vue.onMounted(() => {
        props.fonts.forEach((f) => { if (f.eager || f.key === props.modelValue) warm(f.key); });
      });
      Vue.watch(() => props.modelValue, (k) => k && warm(k));
      return { warm, pick, styleOf };
    },
    template: `
      <div class="chip-list">
        <button v-for="f in fonts" :key="f.key" type="button" class="chip font-chip"
          :class="{ on: modelValue === f.key }" :style="styleOf(f)"
          :title="f.name" @mouseenter="warm(f.key)" @focus="warm(f.key)" @click="pick(f.key)">{{ sample }}</button>
      </div>`,
  };

  // 数字输入（描字行/空白行/数量那种）
  G.ZNum = {
    name: 'ZNum',
    props: { modelValue: [Number, String], min: { type: Number, default: 0 }, max: { type: Number, default: 9 }, suffix: { type: String, default: '' } },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const set = (e) => {
        const v = parseInt(e.target.value, 10);
        emit('update:modelValue', isNaN(v) ? props.min : Math.min(props.max, Math.max(props.min, v)));
      };
      return { set };
    },
    template: `
      <span class="num">
        <input class="input" type="number" :min="min" :max="max" :value="modelValue" @change="set" @input="set" />
        <span class="hint" v-if="suffix">{{ suffix }}</span>
      </span>`,
  };

  /* ---------------- 字形 ---------------- */

  /* 一个汉字，两条渲染路径：
       mode='stroke' 笔画轮廓 —— 只有这条路能逐笔拆解，笔顺帖用；
       mode='text'   字体整字 —— 描字帖、词语文章用，选哪款中文字体就是哪款。
     两条路都走 SVG（text 元素打印出来也是矢量），所以版面尺寸算法一致。
     字体的墨迹大小和基线由 Zu.fontMetric 量出来，各款字体都刚好压在格子里。

     描字类型（空心/虚线/圆点…）在这两条路上实现不一样，差别的根源只有一句：
     **CSS 描不了字形轮廓，但 SVG 的 stroke 可以。**
       - 字体整字：一条 <text> 挂 stroke + dasharray，想怎么描就怎么描。
         但描不到「笔心线」—— 字体里没有这个信息，所以填充虚线、擦除画做不了。
       - 笔画轮廓：轮廓 path 有了，笔心线也有（data/medians 那份），
         于是既能描边、也能沿笔心线画带子、还能拿轮廓当裁切区把笔心线剃出来。 */
  G.ZGlyph = {
    name: 'ZGlyph',
    props: {
      ch: { type: String, default: '' },
      ink: { type: String, default: '#111' },
      upTo: { type: [Number, null], default: null }, // 只画前 N 笔
      mode: { type: String, default: 'stroke' },     // stroke 笔画轮廓 / text 字体整字
      fontCss: { type: String, default: '' },
      trace: { type: String, default: 'solid' },     // 见 Zu.TRACE_SPEC
      head: { type: Boolean, default: false },       // 深色示范格
      pad: { type: Number, default: 64 },            // 内缩，字不顶格才像字帖
    },
    setup(props) {
      const paths = computed(() => {
        // 字体整字那条路根本不画轮廓 —— 别顺手把几百 KB 的笔顺分片拉下来
        if (props.mode !== 'stroke' || !props.ch) return [];
        // 分片按需加载：strokeRev 变一次就重算一次，缺字的地方随后自己补上
        Z.strokeRev.n;
        const all = Z.strokeFor(props.ch);
        return props.upTo == null ? all : all.slice(0, props.upTo);
      });
      // 笔心线也只在笔画那条路上要：字体整字拿不到，硬要也没用
      const med = computed(() => {
        if (props.mode !== 'stroke' || !props.ch) return null;
        Z.medianRev.n;
        return Z.mediansFor(props.ch);
      });
      const medians = computed(() => {
        const m = med.value;
        if (!m) return [];
        const all = m.s || [];
        return props.upTo == null ? all : all.slice(0, props.upTo);
      });
      /* 圆点（描点）：矢量字形有离线算好的圆，半径跟着笔画肥瘦走 ——
         横细竖粗，这才是原站那个「圆点画」的样子。
         字体整字没这份数据，只能退回 dasharray 摆的等径点。 */
      const dots = computed(() => {
        const m = med.value;
        if (!m || !m.d || props.head) return [];
        if (props.trace !== 'dot') return [];
        const all = props.upTo == null ? m.d : m.d.slice(0, props.upTo);
        return all.flat();
      });
      // 笔形数据本身是 0..1024 满幅的，往外撑一点 viewBox 当留白。
      // 字体整字不用留 —— 字号已经按墨迹缩到格子的 88%，再留白就瘦一圈。
      const box = computed(() => {
        const p = props.mode === 'text' ? 0 : props.pad;
        return `${-p} ${-p} ${1024 + p * 2} ${1024 + p * 2}`;
      });
      // 字体度量是异步量出来的（字体文件先加载），量完 metricRev 变一次就重排
      const face = computed(() => {
        Z.metricRev.n;
        const key = props.fontCss || 'kaiti';
        const m = Z.fontMetric(key);
        // 字体里没有的字（生僻字）交给系统楷体，别掉到 serif 的宋体上去
        return {
          family: `${key}, 'KaiTi', 'STKaiti', serif`,
          size: 1024 * m.scale,
          y: 1024 * m.baseline,
        };
      });
      /* 这一格到底怎么画。示范格（head）一律实心 —— 孩子得先看清字形。
         字体整字那条路只能描边，所以宽笔迹那几档就用 f* 那组近似值；
         真做不出来（填充虚线、擦除画）在页面上已经置灰，兜底给个细虚线。 */
      const spec = computed(() => {
        if (props.head) return Z.traceSpec('solid');
        const sp = Z.traceSpec(props.trace);
        // 笔画那条路：分片还在路上时没有笔心线，先按轮廓描边顶着，分片到了自己重画
        if (props.mode === 'stroke' && sp.mw && !medians.value.length) return Z.traceSpec('dash');
        return sp;
      });
      // 字体整字那条路按 <text> 的 fill/stroke 走（f* 是这条路专用的宽度）
      const paint = computed(() => {
        const sp = spec.value;
        if (sp.fill) return { fill: props.ink, stroke: 'none', w: 0, dash: null, cap: null };
        const w = sp.fstroke || sp.stroke || 0;
        if (!w) return { fill: props.ink, stroke: 'none', w: 0, dash: null, cap: null };
        return {
          fill: 'none',
          stroke: props.ink,
          w,
          dash: sp.fdash || sp.dash || null,
          cap: sp.fcap || sp.cap || null,
        };
      });
      // 笔画轮廓那条路：轮廓照 sp 描，笔心线另外画一条带子
      const strokePaths = computed(() => {
        const sp = spec.value;
        const line = Z.polyPath;
        return {
          fill: sp.fill ? props.ink : 'none',
          stroke: sp.stroke ? props.ink : 'none',
          w: sp.stroke || 0,
          dash: sp.dash || null,
          cap: sp.cap || null,
          faint: sp.faint || 0,
          mw: sp.mw || 0,
          mdash: sp.mdash || null,
          mcap: sp.mcap || 'butt',
          paper: !!sp.paper,
          clip: !!sp.clip,
          medianPaths: (sp.mw ? medians.value.map(line) : []),
        };
      });
      // 裁切区要唯一 id：一页几十个格子，id 撞了后面全串味
      const uid = 'zc' + Math.random().toString(36).slice(2, 8);
      return { paths, medians, dots, box, face, paint, strokePaths, uid };
    },
    // 数据坐标系是 y 轴向上的 1024 方格，翻一下才是字形
    template: `
      <span class="glyph" :class="mode">
        <svg v-if="mode === 'text' && ch" :viewBox="box" xmlns="http://www.w3.org/2000/svg">
          <!-- 示范格（head）永远是实心深色，孩子得先看清字形；
               描字类型只改后面那些淡色的练习格 -->
          <text x="512" :y="face.y" :font-size="face.size" :font-family="face.family"
            text-anchor="middle" :fill="paint.fill" :stroke="paint.stroke" :stroke-width="paint.w"
            :stroke-dasharray="paint.dash" :stroke-linecap="paint.cap">{{ ch }}</text>
        </svg>
        <svg v-else-if="paths.length" :viewBox="box" xmlns="http://www.w3.org/2000/svg">
          <defs v-if="strokePaths.clip && strokePaths.mw">
            <!-- 字形轮廓当裁切区：笔心线画得再粗，也只留在字里面 -->
            <clipPath :id="uid">
              <path v-for="(d, i) in paths" :key="'c' + i" :d="d" />
            </clipPath>
          </defs>
          <g transform="scale(1,-1) translate(0,-900)">
            <!-- 浅底那一层：先给个很淡的轮廓，擦掉笔心线之后还认得出字 -->
            <template v-if="strokePaths.faint">
              <path v-for="(d, i) in paths" :key="'f' + i" :d="d" :fill="ink" :fill-opacity="strokePaths.faint" />
            </template>
            <!-- 圆点：有离线描点就摆圆，没有才退回 dasharray 摆的等径点 -->
            <template v-if="dots.length">
              <circle v-for="(p, i) in dots" :key="'d' + i" :cx="p[0]" :cy="p[1]" :r="p[2]" :fill="ink" />
            </template>
            <!-- 轮廓本体：有 stroke 就是空心/虚线，纯 fill 就是实心 -->
            <template v-else>
              <path v-for="(d, i) in paths" :key="i" :d="d"
                :fill="strokePaths.fill" :stroke="strokePaths.stroke"
                :stroke-width="strokePaths.w" :stroke-dasharray="strokePaths.dash"
                :stroke-linecap="strokePaths.cap" stroke-linejoin="round" />
            </template>
            <!-- 笔心线带子：填充虚线（淡）与擦除画（白）都走这条 -->
            <g v-if="strokePaths.mw" :clip-path="strokePaths.clip ? ('url(#' + uid + ')') : null">
              <path v-for="(d, i) in strokePaths.medianPaths" :key="'m' + i" :d="d"
                fill="none" :stroke="strokePaths.paper ? '#fff' : ink"
                :stroke-width="strokePaths.mw" :stroke-dasharray="strokePaths.mdash"
                :stroke-linecap="strokePaths.mcap" stroke-linejoin="round" />
            </g>
          </g>
        </svg>
        <span v-else-if="ch" class="glyph-text" :style="{ color: ink, fontFamily: fontCss || 'kaiti' }">{{ ch }}</span>
      </span>`,
  };

  /* 一个数字。
     数据是 1024 方格、y 轴向上的矢量字形（见 data/num.js），跟汉字笔顺一套坐标，
     所以同样 scale(1,-1) 翻过来画。数字天生就是矢量字形（轮廓 + 笔心线 + 描点
     都是现成的），所以描字那张表十一档全都能出：
       实心 / 空心 / 空心虚线 / 细虚线 / 细虚线·密 / 细实线 / 点虚线
       / 填充虚线 / 圆点 / 擦除画 / 浅底擦除
     圆点是把离线算好的 [x,y,r] 串直接摆成 circle —— 点的粗细跟着笔画肥瘦走，
     不是均匀排一串点。填充虚线与擦除画都拿轮廓当裁切区，把笔心线剃出来。 */
  G.ZGlyphNum = {
    name: 'ZGlyphNum',
    props: {
      ch: { type: String, default: '' },
      fontKey: { type: String, default: 'plain' },
      ink: { type: String, default: '#262c36' },
      trace: { type: String, default: 'solid' },
      head: { type: Boolean, default: false },
      pad: { type: Number, default: 40 },
    },
    setup(props) {
      // 同一套字形的 10 个数字共用一个包络框：各按自己的包围盒缩放，
      // 「1」会被撑成跟「8」一样宽，整页数字胖瘦不齐
      const g = computed(() => Z.numGlyph(props.fontKey, props.ch));
      const box = computed(() => {
        const meta = Z.numMeta(props.fontKey);
        const [x0, y0, x1, y1] = meta.box;
        const p = props.pad;
        // y 翻过来之后 viewBox 的纵向范围是 [B-y1, B-y0]
        const B = 1000;
        return `${x0 - p} ${B - y1 - p} ${x1 - x0 + p * 2} ${y1 - y0 + p * 2}`;
      });
      // 示范格永远实心深色 —— 先看清字形，描字类型只管练习格
      const spec = computed(() => (props.head ? Z.traceSpec('solid') : Z.traceSpec(props.trace)));
      // 描点数据是扁平的 [x,y,r,...]，模板里按 3 个一组拆
      const dots = computed(() => {
        if (!spec.value.dots || !g.value) return [];
        const flat = g.value.d || [];
        const out = [];
        for (let i = 0; i + 2 < flat.length; i += 3) out.push([flat[i], flat[i + 1], flat[i + 2]]);
        return out;
      });
      const sp = computed(() => {
        const v = spec.value;
        return {
          fill: v.fill ? props.ink : 'none',
          stroke: v.stroke ? props.ink : 'none',
          w: v.stroke || 0,
          dash: v.dash || null,
          cap: v.cap || null,
          faint: v.faint || 0,
          mw: v.mw || 0,
          mdash: v.mdash || null,
          mcap: v.mcap || 'butt',
          paper: !!v.paper,
          clip: !!v.clip,
          medianPaths: v.mw && g.value ? (g.value.m || []).map(Z.polyPath) : [],
        };
      });
      const ink = computed(() => (props.head ? '#262c36' : props.ink));
      const uid = 'zn' + Math.random().toString(36).slice(2, 8);
      return { g, box, spec, sp, dots, ink, uid };
    },
    template: `
      <span class="glyph text">
        <svg v-if="g" :viewBox="box" xmlns="http://www.w3.org/2000/svg">
          <defs v-if="sp.clip && sp.medianPaths.length">
            <clipPath :id="uid">
              <path v-for="(d, i) in g.s" :key="'c' + i" :d="d" />
            </clipPath>
          </defs>
          <g transform="scale(1,-1) translate(0,-1000)">
            <!-- 浅底：擦掉笔心线之前先留一层很淡的轮廓，字还认得出来 -->
            <template v-if="sp.faint">
              <path v-for="(d, i) in g.s" :key="'f' + i" :d="d" :fill="ink" :fill-opacity="sp.faint" />
            </template>
            <template v-if="spec.dots">
              <circle v-for="(d, i) in dots" :key="i" :cx="d[0]" :cy="d[1]" :r="d[2]" :fill="ink" />
            </template>
            <template v-else>
              <path v-for="(d, i) in g.s" :key="i" :d="d"
                :fill="sp.fill" :stroke="sp.stroke" :stroke-width="sp.w"
                :stroke-dasharray="sp.dash" :stroke-linecap="sp.cap" stroke-linejoin="round" />
              <g v-if="sp.mw && sp.medianPaths.length" :clip-path="sp.clip ? ('url(#' + uid + ')') : null">
                <path v-for="(d, i) in sp.medianPaths" :key="'m' + i" :d="d"
                  fill="none" :stroke="sp.paper ? '#fff' : ink" :stroke-width="sp.mw"
                  :stroke-dasharray="sp.mdash" :stroke-linecap="sp.mcap" stroke-linejoin="round" />
              </g>
            </template>
          </g>
        </svg>
        <span v-else class="glyph-text" :style="{ color: ink }">{{ ch }}</span>
      </span>`,
  };

  /* ---------------- 首页缩略图 ----------------
     功能卡上那张小样：按真实字帖的比例画一张迷你 A4 版面。
     用 SVG 而不是 DOM 拼格子 —— viewBox 一缩放就自适应卡片宽度，
     格子保持正方形、格线不会糊。字形走字体文字，不拉笔顺分片，
     首页不该为了几张缩略图多下几百 KB。 */
  const THUMB_W = 320;
  const THUMB_H = 200;

  // 一张纸的版面参数：格子多大、几列、有没有拼音行
  const LAYOUTS = {
    cn: { cell: 44, cols: 6, top: 38 },
    en: { cellW: 44, cellH: 30, cols: 6, top: 40 },
    math: { rowH: 34, cols: 2, top: 38 },
    // 控笔纸的格子跟田字格差不多大，一行铺满六格
    pen: { cell: 42, cols: 6, top: 38 },
  };

  // 缩略图内容：paper 里的 rows 每格 { t: 字/词, s: 'head'|'trace'|'' }
  const THUMBS = {
    hanzi: {
      kind: 'cn', guide: 'tian', title: '字帖练习本',
      rows: [
        ['永', '永', '永', '永', '永', ''],
        ['永', '永', '永', '', '', ''],
        ['', '', '', '', '', ''],
        ['和', '和', '和', '和', '和', ''],
        ['和', '和', '和', '', '', ''],
        ['', '', '', '', '', ''],
      ],
    },
    stage: {
      kind: 'cn', guide: 'tian', title: '课文抄写',
      rows: [
        ['春', '眠', '不', '觉', '晓', ''],
        ['处', '处', '闻', '啼', '鸟', ''],
        ['', '', '', '', '', ''],
        ['夜', '来', '风', '雨', '声', ''],
        ['花', '落', '知', '多', '少', ''],
        ['', '', '', '', '', ''],
      ],
    },
    blank: {
      kind: 'cn', guide: 'mi', title: '练习纸', plain: true,
      rows: [
        ['', '', '', '', '', ''], ['', '', '', '', '', ''], ['', '', '', '', '', ''],
        ['', '', '', '', '', ''], ['', '', '', '', '', ''], ['', '', '', '', '', ''],
      ],
    },
    pinyin: {
      kind: 'en', guide: 'en', title: '拼音练习本', font: 'pinyinok',
      rows: [
        ['b', 'p', 'm', 'f', 'd', 't'],
        ['b', 'p', 'm', 'f', 'd', 't'],
        ['', '', '', '', '', ''],
        ['n', 'l', 'g', 'k', 'h', 'j'],
        ['n', 'l', 'g', 'k', 'h', 'j'],
        ['', '', '', '', '', ''],
      ],
    },
    eletter: {
      kind: 'en', guide: 'en', title: 'English Practice', font: 'shouxieti',
      rows: [
        ['Aa', 'Bb', 'Cc', 'Dd', 'Ee', 'Ff'],
        ['', '', '', '', '', ''],
        ['apple', '', '', '', '', ''],
        ['', '', '', '', '', ''],
        ['Gg', 'Hh', 'Ii', 'Jj', 'Kk', 'Ll'],
        ['', '', '', '', '', ''],
        ['banana', '', '', '', '', ''],
      ],
    },
    // 控笔：字是 PenControl 字体里的图形码位，1 = 横线，J = 波浪…
    // 首行不设深色示范 —— 控笔纸上本来就全是淡色描线，没有「示范」这回事
    pen: {
      kind: 'pen', title: '控笔练习',
      // 纸上只露前三四行（底部故意被卡片裁掉），所以把花样放前面
      rows: [
        ['1', '1', '1', '1', '1', '1'],
        ['J', 'J', 'J', 'J', 'J', 'J'],
        ['5', '5', '5', '5', '5', '5'],
        ['', '', '', '', '', ''],
        ['3', '3', '3', '3', '3', '3'],
      ],
    },
    // 数字：跟汉字格同一套版面，格子里的内容换成一串数字
    num: {
      kind: 'cn', guide: 'tian', title: '数字练习',
      rows: [
        ['0', '0', '0', '0', '0', ''],
        ['1', '1', '1', '1', '1', ''],
        ['2', '2', '2', '2', '2', ''],
        ['3', '3', '3', '3', '3', ''],
        ['', '', '', '', '', ''],
        ['4', '4', '4', '4', '4', ''],
      ],
    },
    math: {
      kind: 'math', title: '口算练习',
      rows: [
        ['3 + 5 =', '9 - 4 ='], ['6 × 2 =', '8 ÷ 4 ='], ['12 + 7 =', '20 - 8 ='],
        ['35 - 9 =', '7 × 3 ='], ['48 ÷ 6 =', '16 + 25 ='], ['23 + 9 =', '54 - 8 ='],
      ],
    },
  };

  G.ZThumb = {
    name: 'ZThumb',
    props: { kind: { type: String, default: 'hanzi' } },
    setup(props) {
      const conf = computed(() => THUMBS[props.kind] || THUMBS.hanzi);

      // 把 rows 摊成定位好的格子列表，模板只管遍历
      const cells = computed(() => {
        const c = conf.value;
        const L = LAYOUTS[c.kind];
        const out = [];
        (c.rows || []).forEach((row, r) => {
          row.forEach((t, i) => {
            // 首格深色示范，其余淡红描红 —— 跟真字帖的档位一致
            const ink = !t ? '' : i === 0 ? 'head' : 'trace';
            if (c.kind === 'cn') {
              out.push({ x: 24 + i * L.cell, y: L.top + r * L.cell, w: L.cell, h: L.cell, t, ink, guide: c.guide });
            } else if (c.kind === 'en') {
              out.push({ x: 24 + i * L.cellW, y: L.top + r * L.cellH, w: L.cellW, h: L.cellH, t, ink, guide: c.guide, small: t.length > 2 });
            } else if (c.kind === 'pen') {
              out.push({ x: 24 + i * L.cell, y: L.top + r * L.cell, w: L.cell, h: L.cell, t });
            }
          });
        });
        // 数学题单独一类：一行两列，右边留横线当答案位
        if (c.kind === 'math') {
          out.length = 0;
          const colW = (THUMB_W - 48) / 2;
          (c.rows || []).forEach((row, r) => {
            row.forEach((t, i) => {
              out.push({ x: 24 + i * colW, y: L.top + r * L.rowH, w: colW, h: L.rowH, t });
            });
          });
        }
        return out;
      });

      const box = computed(() => {
        const c = conf.value;
        const L = LAYOUTS[c.kind];
        if (c.kind === 'cn') return { w: THUMB_W, h: THUMB_H, cols: L.cols, cell: L.cell, top: L.top };
        if (c.kind === 'en') return { w: THUMB_W, h: THUMB_H, cols: L.cols, cellW: L.cellW, cellH: L.cellH, top: L.top };
        if (c.kind === 'pen') return { w: THUMB_W, h: THUMB_H, cols: L.cols, cell: L.cell, top: L.top };
        return { w: THUMB_W, h: THUMB_H };
      });

      return { conf, cells, box, W: THUMB_W, H: THUMB_H };
    },
    template: `
      <div class="thumb">
        <!-- 卡片上已经有标题文字，图对读屏来说是重复的 -->
        <svg :viewBox="'0 0 ' + W + ' ' + H" preserveAspectRatio="xMidYMin slice"
          xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
          <defs>
            <!-- id 带上 kind：同一页上有六张图，id 不能撞 -->
            <filter :id="'thumb-shadow-' + kind" x="-20%" y="-10%" width="140%" height="130%">
              <feDropShadow dx="0" dy="5" stdDeviation="6" flood-color="#101828" flood-opacity="0.14" />
            </filter>
          </defs>

          <!-- 纸：故意画到画布外面，底部被裁掉，暗示「还有一整页」 -->
          <rect x="12" y="8" width="296" height="330" rx="6" fill="#fff" :filter="'url(#thumb-shadow-' + kind + ')'" />

          <!-- 标题 -->
          <text :x="W / 2" y="24" text-anchor="middle" class="th-title">{{ conf.title }}</text>
          <line :x1="W / 2 - 46" :x2="W / 2 + 46" y1="29" y2="29" stroke="#2b3340" stroke-width="1.4" opacity=".75" />

          <!-- 格子 -->
          <g v-for="(c, i) in cells" :key="i">
            <template v-if="conf.kind === 'math'">
              <text :x="c.x + 4" :y="c.y + c.h * 0.66" class="th-math">{{ c.t }}</text>
              <line :x1="c.x + 8 + c.t.length * 6.4" :x2="c.x + c.w - 16" :y1="c.y + c.h * 0.72" :y2="c.y + c.h * 0.72"
                stroke="#c9d4e2" stroke-width="1" />
            </template>
            <template v-else-if="conf.kind === 'pen'">
              <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" fill="none" stroke="#cbd7e4" stroke-width="1" />
              <text v-if="c.t" :x="c.x + c.w / 2" :y="c.y + c.h / 2" text-anchor="middle" dominant-baseline="central"
                class="th-pen">{{ c.t }}</text>
            </template>
            <template v-else>
              <rect :x="c.x" :y="c.y" :width="c.w" :height="c.h" fill="none" stroke="#cbd7e4" stroke-width="1" />
              <template v-if="c.guide === 'tian' || c.guide === 'mi'">
                <line :x1="c.x + c.w / 2" :x2="c.x + c.w / 2" :y1="c.y" :y2="c.y + c.h" stroke="#dee7f0" stroke-width="1" stroke-dasharray="3 3" />
                <line :x1="c.x" :x2="c.x + c.w" :y1="c.y + c.h / 2" :y2="c.y + c.h / 2" stroke="#dee7f0" stroke-width="1" stroke-dasharray="3 3" />
              </template>
              <template v-if="c.guide === 'mi'">
                <line :x1="c.x" :y1="c.y" :x2="c.x + c.w" :y2="c.y + c.h" stroke="#eaf1f8" stroke-width="1" />
                <line :x1="c.x + c.w" :y1="c.y" :x2="c.x" :y2="c.y + c.h" stroke="#eaf1f8" stroke-width="1" />
              </template>
              <template v-if="c.guide === 'en'">
                <line :x1="c.x" :x2="c.x + c.w" :y1="c.y + c.h * 0.28" :y2="c.y + c.h * 0.28" stroke="#d9e4ef" stroke-width="1" stroke-dasharray="3 3" />
                <line :x1="c.x" :x2="c.x + c.w" :y1="c.y + c.h * 0.72" :y2="c.y + c.h * 0.72" stroke="#d9e4ef" stroke-width="1" stroke-dasharray="3 3" />
              </template>
              <text v-if="c.t" :x="c.x + c.w / 2" :y="c.y + c.h / 2" text-anchor="middle" dominant-baseline="central"
                class="th-glyph" :class="[conf.kind, c.ink, { small: c.small }]" :style="conf.font ? { fontFamily: conf.font } : null">{{ c.t }}</text>
            </template>
          </g>
        </svg>
      </div>`,
  };

  /* ---------------- 单元格 ---------------- */

  // 汉字格：可选拼音行 + 田/米/回宫格线
  G.ZCellCn = {
    name: 'ZCellCn',
    props: {
      cell: { type: Object, required: true }, pinyin: Boolean, guide: String, ink: String,
      mode: { type: String, default: 'text' }, fontCss: String,
      trace: { type: String, default: 'solid' },
      cellH: { type: Number, default: 15 }, pyH: { type: Number, default: 7.4 },
      pyStyle: { type: String, default: 'grid' }, // grid 虚线格 / under 下划线 / paren 小括号 / box 长方格
    },
    template: `
      <div class="cell-cn" :style="{ minHeight: cellH + 'mm' }">
        <div v-if="pinyin" class="cell-py" :class="'py-' + pyStyle" :style="{ height: pyH + 'mm' }">
          <span>{{ cell.py || '' }}</span>
        </div>
        <div class="cell-ch" :style="{ minHeight: cellH + 'mm' }">
          <i class="cell-guide" :class="guide"></i>
          <z-glyph v-if="cell.ch" :ch="cell.ch" :ink="cell.head ? '#262c36' : ink"
            :mode="mode" :up-to="cell.upTo" :font-css="fontCss" :trace="trace" :head="cell.head" />
        </div>
      </div>`,
  };

  // 数字格：格子跟汉字格同一套（田字格 / 米字格 / 方格…），只是格子里画数字
  G.ZCellNum = {
    name: 'ZCellNum',
    props: {
      cell: { type: Object, required: true }, guide: String, ink: String,
      fontKey: { type: String, default: 'plain' },
      trace: { type: String, default: 'solid' },
      cellH: { type: Number, default: 15 },
    },
    template: `
      <div class="cell-cn" :style="{ minHeight: cellH + 'mm' }">
        <div class="cell-ch" :style="{ minHeight: cellH + 'mm' }">
          <i class="cell-guide" :class="guide"></i>
          <z-glyph-num v-if="cell.ch" :ch="cell.ch" :font-key="fontKey" :ink="ink"
            :trace="trace" :head="cell.head" />
        </div>
      </div>`,
  };

  // 英文格：四线三格。
  // 文字走 SVG 而不是 span —— 基线能精确落在第三条线的位置上（单位就是 mm，
  // 跟版面同一套量纲），不然只能靠 line-height 猜，字会浮在格中间。
  // 两条内线、字号也从字体度量算（见 Zu.enLayout），各款字体各自填满自己的格。
  G.ZCellEn = {
    name: 'ZCellEn',
    props: {
      cell: { type: Object, required: true }, ink: String, fontCss: String,
      fontKey: { type: String, default: 'shouxieti' },
      trace: { type: String, default: 'solid' },
      cellW: { type: Number, default: 35 }, cellH: { type: Number, default: 9 },
      size: { type: Number, default: 6 }, mid: { type: Number, default: 1 / 3 }, base: { type: Number, default: 2 / 3 },
    },
    setup(props) {
      const box = computed(() => `0 0 ${props.cellW} ${props.cellH}`);
      // 一处例外：长词（congratulation、zhuang）自己缩到格内，
      // 免得顶穿隔壁格 —— 但不能因为一个长词把整页的字都变小
      const fontSize = computed(() => {
        const em = Z.textEm(props.cell.word, props.fontKey);
        if (!em) return props.size;
        return Math.floor(Math.min(props.size, (props.cellW - 2.4) / em) * 100) / 100;
      });
      /* 描字：四线三格里的字同样是 <text>，所以那套 stroke + dasharray 照样能用。
         只是这里量纲是 mm 不是 1024 方格，描边宽度得按字号折算 ——
         取字号的 7% 作基准（约等于 1024 方格里的 24 那条线）。
         示范格（head）永远实心，跟汉字那边一致。 */
      const paint = computed(() => {
        if (props.cell.head) return { fill: '#262c36', stroke: 'none', w: 0, dash: null, cap: null };
        // 这里的量纲是 mm、字形是「文字」，所以描边按字号的百分比给（见 Zu.TRACE_EM）
        const em = Z.traceEm(Z.traceOf(props.trace)) || Z.traceOf(props.trace);
        if (typeof em === 'string' || !em.w) {
          return { fill: props.ink, stroke: 'none', w: 0, dash: null, cap: null };
        }
        const r2 = (v) => Math.round(v * 100) / 100;
        return {
          fill: 'none',
          stroke: props.ink,
          w: r2(Math.max(0.1, fontSize.value * em.w)),
          dash: em.dash ? em.dash.map((v) => r2(fontSize.value * v)).join(' ') : null,
          cap: em.cap || null,
        };
      });
      return { box, fontSize, paint };
    },
    template: `
      <div class="cell-en" :style="{ height: cellH + 'mm' }">
        <i class="rule" :style="{ top: (mid * 100) + '%' }"></i>
        <i class="rule" :style="{ top: (base * 100) + '%' }"></i>
        <svg class="word" :viewBox="box" xmlns="http://www.w3.org/2000/svg">
          <!-- viewBox 的单位就是 mm（跟格子同一套量纲），所以 font-size 直接写数字，
               1 个单位 = 1mm。size 由 Zu.enLayout 按字体度量反算。 -->
          <text v-if="cell.word" :x="cellW / 2" :y="base * cellH" text-anchor="middle"
            :font-family="fontCss" :font-size="fontSize" :fill="paint.fill" :stroke="paint.stroke"
            :stroke-width="paint.w" :stroke-dasharray="paint.dash" :stroke-linecap="paint.cap">{{ cell.word }}</text>
        </svg>
      </div>`,
  };

  // 控笔格：把 PenControl 字体里的线条图形当文字画，撑满整格
  G.ZCellPen = {
    name: 'ZCellPen',
    props: {
      cell: { type: Object, required: true }, ink: String,
      cellH: { type: Number, default: 10 },
      cellW: { type: Number, default: 10 },
    },
    setup(props) {
      // 宽度交给栅格（列宽由版面摊出来），这里只管高度和字号。
      // 字形的 em 框就是格子的边长，字号取长宽里小的那个，留 2% 余量，
      // 免得描线压在边框上。
      const style = computed(() => {
        const side = Math.min(props.cellH, props.cellW || props.cellH);
        return {
          height: props.cellH + 'mm',
          fontSize: side * 0.98 + 'mm',
          color: props.ink,
        };
      });
      return { style };
    },
    template: `
      <div class="cell-pen" :style="style"><span v-if="cell.ch">{{ cell.ch }}</span></div>`,
  };

  /* ---------------- A4 纸张 ---------------- */

  G.ZSheet = {
    name: 'ZSheet',
    props: {
      doc: { type: Object, required: true },
      cells: { type: Array, default: () => [] },
      items: { type: Array, default: () => [] },
      pageNo: { type: Number, default: 1 },
      pageTotal: { type: Number, default: 1 },
    },
    setup(props) {
      const cols = computed(() => props.doc.cols || 12);
      // 列宽写成精确 mm，不用 1fr：1fr 每列会取整到 56.7px 之类的小数，
      // 打印栅格化时每 4 列凑出一条粗线，纸面上看得出来。
      const gridStyle = computed(() => {
        const total = props.doc.gridWidth || 180;
        const w = Math.round((total / cols.value) * 1000) / 1000;
        const colGap = props.doc.colGap || 0;
        return {
          gridTemplateColumns: `repeat(${cols.value}, ${w}mm)`,
          // 有列间距时总宽要把它算进去，否则居中会偏
          width: `${w * cols.value + colGap * (cols.value - 1)}mm`,
          color: props.doc.line,
          rowGap: (props.doc.rowGap || 0) + 'mm',
          columnGap: colGap + 'mm',
        };
      });
      const fontCss = computed(() => props.doc.fontCss || '');
      // 英文/拼音格的字号与基线，由 gen* 按字体度量算好带过来；
      // 老数据没有这个字段就现算一份，别让页面白屏
      const glyph = computed(() => {
        const w = Math.round(((props.doc.gridWidth || 176) / cols.value) * 100) / 100;
        return props.doc.glyph || window.Zu.enLayout(props.doc.fontCss, w, props.doc.cellH || 9);
      });
      /* 左右页边距跟着格区宽度走：13 格那档格区 188mm，左右各留 10mm 刚好；
         12 格仍是 180 + 13mm，老版面对齐。纸张 210mm 不变，
         所以「格区 + 两边留白 = 210」这一步在任何一档都成立。 */
      const padStyle = computed(() => {
        const x = props.doc.padX;
        return x == null ? {} : { paddingLeft: x + 'mm', paddingRight: x + 'mm' };
      });
      return { cols, gridStyle, fontCss, glyph, padStyle };
    },
    template: `
      <div class="sheet" :style="padStyle">
        <div class="sheet-hd">
          <div class="sheet-title" :style="{ borderBottomColor: doc.line, color: doc.titleColor || '#2b3340' }">{{ doc.title || '字帖练习本' }}</div>
        </div>
        <div class="sheet-bd">
          <div v-if="doc.kind === 'cn'" class="grid-cn" :class="'guide-' + (doc.guide || 'tian')"
            :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-cn v-for="(c, i) in cells" :key="i" :cell="c" :pinyin="doc.pinyin"
              :guide="doc.guide || 'tian'" :ink="doc.ink" :mode="doc.render || 'text'"
              :trace="doc.trace || 'solid'" :py-style="doc.pyStyle || 'grid'"
              :font-css="fontCss" :cell-h="doc.cellH || 15" :py-h="doc.pyH || 7.4"></z-cell-cn>
          </div>
          <div v-else-if="doc.kind === 'num'" class="grid-cn" :class="'guide-' + (doc.guide || 'tian')"
            :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-num v-for="(c, i) in cells" :key="i" :cell="c" :guide="doc.guide || 'tian'"
              :ink="doc.ink" :font-key="doc.numFont" :trace="doc.trace || 'solid'"
              :cell-h="doc.cellH || 15"></z-cell-num>
          </div>
          <div v-else-if="doc.kind === 'en'" class="grid-en" :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-en v-for="(c, i) in cells" :key="i" :cell="c" :ink="doc.ink" :trace="doc.trace || 'solid'"
              :font-css="fontCss" :font-key="doc.fontCss" :cell-h="glyph.cellH" :cell-w="glyph.cellW"
              :size="glyph.size" :mid="glyph.mid" :base="glyph.base"></z-cell-en>
          </div>
          <div v-else-if="doc.kind === 'pen'" class="grid-pen" :class="{ gapped: doc.rowGap > 0 || doc.colGap > 0 }"
            :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-pen v-for="(c, i) in cells" :key="i" :cell="c" :ink="doc.ink"
              :cell-h="doc.cellH || 10" :cell-w="doc.cellW || doc.cellH || 10"></z-cell-pen>
          </div>
          <div v-else-if="doc.kind === 'math'" class="math-wrap">
            <div v-for="(it, i) in items" :key="i" class="math-item" :class="{ half: it.half }">
              <template v-for="(p, j) in it.parts" :key="j">
                <span v-if="p.t === 'blank'" class="blank"></span>
                <span v-else-if="p.t === 'op'" class="op">{{ p.v }}</span>
                <span v-else-if="p.t === 'bracket'" class="bracket">{{ p.v }}</span>
                <span v-else-if="p.t === 'eq'" class="op">{{ p.v }}</span>
                <span v-else>{{ p.v }}</span>
              </template>
            </div>
          </div>
          <!-- 订正格：每页底部一行「改错」，从版心里扣出来的高度，
               所以上面的格子照样铺满，不会多出一页来 -->
          <div v-if="doc.fixH" class="fix-row" :style="{ height: doc.fixH + 'mm', '--cell-line': doc.line }">
            <span class="fix-tag">订正</span>
            <i></i><i></i>
          </div>
        </div>
        <div class="sheet-ft">
          <!-- 页脚：学生交作业得写名字，纸上没地方写就得手抄一行 -->
          <div v-if="doc.foot" class="foot-fields">
            <span v-if="doc.foot.name">姓名：<i></i></span>
            <span v-if="doc.foot.cls">班级：<i></i></span>
            <span v-if="doc.foot.date">日期：<i></i></span>
          </div>
          <span v-if="pageTotal > 1" class="foot-page">第 {{ pageNo }} / {{ pageTotal }} 页</span>
        </div>
      </div>`,
  };

  // 预览区：头部操作条 + 一堆 A4
  G.ZPreview = {
    name: 'ZPreview',
    props: {
      doc: { type: Object, default: null },
      pages: { type: Array, default: () => [] },
      items: { type: Array, default: () => [] },
      emptyText: { type: String, default: '左边设好参数，点「生成字帖」' },
    },
    emits: ['print', 'regen'],
    setup(props, { emit }) {
      const count = computed(() => (props.items && props.items.length ? props.items.length : props.pages.length));
      const print = () => {
        if (!count.value) return;
        emit('print');
      };
      return { count, print };
    },
    template: `
      <div class="card preview">
        <div class="preview-hd">
          <div class="preview-meta">
            <span class="badge">A4</span>
            <span v-if="count">{{ count }} 页 · 竖版</span>
            <span v-else>还没有内容</span>
          </div>
          <div class="row-between" style="gap:8px">
            <button class="btn" type="button" @click="$emit('regen')">重新生成</button>
            <button class="btn btn-primary" type="button" @click="print" :disabled="!count">打印 / 存 PDF</button>
          </div>
        </div>
        <div class="preview-body">
          <template v-if="count">
            <z-sheet v-for="(p, i) in pages" :key="i" :doc="doc" :cells="p"
              :page-no="i + 1" :page-total="pages.length"></z-sheet>
            <template v-if="items.length">
              <z-sheet v-for="(pageItems, i) in items" :key="'m' + i" :doc="doc" :items="pageItems"
                :page-no="i + 1" :page-total="items.length"></z-sheet>
            </template>
          </template>
          <div v-else class="empty">
            <div class="empty-ico">✍️</div>
            <div>{{ emptyText }}</div>
          </div>
        </div>
      </div>`,
  };

  /* ---------------- 轻提示 ---------------- */
  // 页面里直接 Zu.toast('...')，根组件挂一个 <z-toasts> 收
  const toasts = (window.Zu.toasts = Vue.reactive([]));
  window.Zu.toast = (msg, kind) => {
    const id = Date.now() + Math.random();
    toasts.push({ id, msg, kind: kind || 'info' });
    setTimeout(() => {
      const i = toasts.findIndex((t) => t.id === id);
      if (i >= 0) toasts.splice(i, 1);
    }, 2600);
  };
  G.ZToasts = {
    name: 'ZToasts',
    setup() { return { toasts }; },
    template: `
      <div class="toasts">
        <div v-for="t in toasts" :key="t.id" class="toast" :class="t.kind">{{ t.msg }}</div>
      </div>`,
  };

  /* ---------------- 生成器页面的公共骨架 ----------------
     六个字帖页面的差异只有「表单长什么样」和「怎么排版」，
     状态管理、生成、打印、本地记忆这套全在这里，页面只管填参数。 */
  G.useGen = (key, defaults, build, validate, opts) => {
    const needStrokes = (opts && opts.strokes) || (() => true);
    const { ref, reactive, computed, watch } = Vue;
    // 参数统一走 Z.settings：默认值合并、脏数据清洗、输入类不落盘都在那里。
    // 页面已经在顶部 define 过就按它的 schema 来，没有就临时用这份 defaults。
    const form = reactive(Z.settings.init(key, defaults));
    // 删过字体之后，本地存的还是旧 key（比如 enitali），表单里会留一个空选项
    if (defaults.font_key && !(Z.EN_FONTS.concat(Z.PY_FONTS, Z.ZH_FONTS).some((f) => f.key === form.font_key))) {
      form.font_key = defaults.font_key;
    }
    const doc = ref(null);
    const pages = ref([]);
    const items = ref([]);
    // 排版要用笔顺数据（笔顺帖得知道一个字有几笔），先把分片拉齐再算，
    // 否则首帧会按 0 笔排，页面会跳一下。
    let seq = 0;
    const generate = async () => {
      const err = validate && validate(form);
      if (err) { Z.toast(err, 'warn'); return; }
      const my = ++seq;
      // 只有真的要画笔画轮廓时才去拉分片；字体整字那条路不需要。
      // 笔心线跟轮廓同号分片，一起拉 —— 圆点、填充虚线、擦除画都指望它，
      // 少拉一次首帧就得先按「细虚线」顶着画，闪一下才变。
      if (needStrokes(form)) {
        const text = form.content || '';
        await Promise.all([Z.prefetch(text), Z.prefetchMedian(text)]);
      }
      if (my !== seq) return; // 期间又改了参数，这次结果作废
      const out = build(form);
      if (!out) { Z.toast('内容为空，先填点东西', 'warn'); doc.value = null; pages.value = []; items.value = []; return; }
      doc.value = out.doc;
      pages.value = out.pages || [];
      items.value = out.items || [];
    };

    const print = () => {
      if (!pages.value.length && !items.value.length) { Z.toast('先生成字帖', 'warn'); return; }
      window.print();
    };

    // 进来先出一版：空白页面对新用户没意义
    Vue.onMounted(generate);

    // 参数一变就重排：本地计算，几毫秒的事，比点按钮顺手。
    // 顺手落盘（防抖 300ms）：以前保存挂在 generate 里，校验不过就把改的配置一起丢了。
    let tid = 0;
    watch(() => ({ ...form }), () => {
      clearTimeout(tid);
      tid = setTimeout(() => Z.settings.set(key, form), 300);
      if (doc.value || pages.value.length) generate();
    }, { deep: true });

    return {
      form, doc, pages, items, generate, print,
      pageCount: computed(() => items.value.length || pages.value.length),
    };
  };
})();
