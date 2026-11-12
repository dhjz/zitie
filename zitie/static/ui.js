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

  // 分段选择器
  G.ZSeg = {
    name: 'ZSeg',
    props: { modelValue: [String, Number, Boolean], options: { type: Array, default: () => [] } },
    emits: ['update:modelValue'],
    template: `
      <div class="seg">
        <button v-for="o in options" :key="String(o.v)" type="button"
          :class="{ on: o.v === modelValue }" :title="o.tip || ''"
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

  // 一个汉字：有笔顺数据就画 SVG 轮廓，没有就退回字体文字
  G.ZGlyph = {
    name: 'ZGlyph',
    props: {
      ch: { type: String, default: '' },
      ink: { type: String, default: '#111' },
      upTo: { type: [Number, null], default: null }, // 只画前 N 笔
      fontCss: { type: String, default: '' },
      pad: { type: Number, default: 64 },            // 内缩，字不顶格才像字帖
    },
    setup(props) {
      const paths = computed(() => {
        // 分片按需加载：strokeRev 变一次就重算一次，缺字的地方随后自己补上
        Z.strokeRev.n;
        if (!props.ch) return [];
        const all = Z.strokeFor(props.ch);
        return props.upTo == null ? all : all.slice(0, props.upTo);
      });
      // 笔形数据本身是 0..1024 满幅的，往外撑一点 viewBox 当留白
      const box = computed(() => {
        const p = props.pad;
        return `${-p} ${-p} ${1024 + p * 2} ${1024 + p * 2}`;
      });
      return { paths, box };
    },
    // 数据坐标系是 y 轴向上的 1024 方格，翻一下才是字形
    template: `
      <span class="glyph">
        <svg v-if="paths.length" :viewBox="box" xmlns="http://www.w3.org/2000/svg">
          <g transform="scale(1,-1) translate(0,-900)">
            <path v-for="(d, i) in paths" :key="i" :d="d" :fill="ink" />
          </g>
        </svg>
        <span v-else-if="ch" class="glyph-text" :style="{ color: ink, fontFamily: fontCss || 'kaiti' }">{{ ch }}</span>
      </span>`,
  };

  /* ---------------- 单元格 ---------------- */

  // 汉字格：可选拼音行 + 田/米/回宫格线
  G.ZCellCn = {
    name: 'ZCellCn',
    props: {
      cell: { type: Object, required: true }, pinyin: Boolean, guide: String, ink: String,
      cellH: { type: Number, default: 15 }, pyH: { type: Number, default: 7.4 },
    },
    template: `
      <div class="cell-cn" :style="{ minHeight: cellH + 'mm' }">
        <div v-if="pinyin" class="cell-py" :style="{ height: pyH + 'mm' }"><span>{{ cell.py || '' }}</span></div>
        <div class="cell-ch" :style="{ minHeight: cellH + 'mm' }">
          <i class="cell-guide" :class="guide"></i>
          <z-glyph v-if="cell.ch" :ch="cell.ch" :ink="cell.head ? '#262c36' : ink" :up-to="cell.upTo" />
        </div>
      </div>`,
  };

  // 英文格：四线三格
  G.ZCellEn = {
    name: 'ZCellEn',
    props: {
      cell: { type: Object, required: true }, ink: String, fontCss: String,
      cellH: { type: Number, default: 9 }, fontSize: { type: Number, default: 15 },
    },
    template: `
      <div class="cell-en" :style="{ height: cellH + 'mm' }">
        <i class="rule a"></i><i class="rule b"></i>
        <span class="word" :style="{ color: cell.head ? '#262c36' : ink, fontFamily: fontCss, fontSize: fontSize + 'px' }">{{ cell.word || '' }}</span>
      </div>`,
  };

  // 控笔格：把 PenControl 字体里的线条图形当文字画，撑满整格
  G.ZCellPen = {
    name: 'ZCellPen',
    props: {
      cell: { type: Object, required: true }, ink: String,
      cellH: { type: Number, default: 10 },
    },
    setup(props) {
      // 字形的 em 框就是格子的边长，字号直接跟格子对齐；
      // 留 2% 余量，免得描线压在边框上
      const style = computed(() => ({
        width: props.cellH + 'mm',
        height: props.cellH + 'mm',
        fontSize: props.cellH * 0.98 + 'mm',
        color: props.cell.head ? '#262c36' : props.ink,
      }));
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
      return { cols, gridStyle, fontCss };
    },
    template: `
      <div class="sheet">
        <div class="sheet-hd">
          <div class="sheet-title" :style="{ borderBottomColor: doc.line, color: doc.titleColor || '#2b3340' }">{{ doc.title || '字帖练习本' }}</div>
        </div>
        <div class="sheet-bd">
          <div v-if="doc.kind === 'cn'" class="grid-cn" :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-cn v-for="(c, i) in cells" :key="i" :cell="c" :pinyin="doc.pinyin"
              :guide="doc.guide || 'tian'" :ink="doc.ink" :cell-h="doc.cellH || 15" :py-h="doc.pyH || 7.4"></z-cell-cn>
          </div>
          <div v-else-if="doc.kind === 'en'" class="grid-en" :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-en v-for="(c, i) in cells" :key="i" :cell="c" :ink="doc.ink" :font-css="fontCss"
              :cell-h="doc.cellH || 9" :font-size="doc.fontSize || 15"></z-cell-en>
          </div>
          <div v-else-if="doc.kind === 'pen'" class="grid-pen" :class="{ gapped: doc.rowGap > 0 || doc.colGap > 0 }"
            :style="[gridStyle, { '--cell-line': doc.line }]">
            <z-cell-pen v-for="(c, i) in cells" :key="i" :cell="c" :ink="doc.ink"
              :cell-h="doc.cellH || 10"></z-cell-pen>
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
        </div>
        <div class="sheet-ft">
          <span v-if="pageTotal > 1">第 {{ pageNo }} / {{ pageTotal }} 页</span>
          <span v-else>&nbsp;</span>
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
  G.useGen = (key, defaults, build, validate) => {
    const { ref, reactive, computed, watch } = Vue;
    // 上次用过的参数记在本地，下次进来还是那套（比 zivip 每次重选省事）
    const saved = Z.load(key, {});
    const form = reactive(Object.assign({}, defaults, saved, { content: saved.content || defaults.content || '' }));
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
      await Z.prefetch(form.content || '');
      if (my !== seq) return; // 期间又改了参数，这次结果作废
      const out = build(form);
      if (!out) { Z.toast('内容为空，先填点东西', 'warn'); doc.value = null; pages.value = []; items.value = []; return; }
      doc.value = out.doc;
      pages.value = out.pages || [];
      items.value = out.items || [];
      Z.save(key, { ...form });
    };

    const print = () => {
      if (!pages.value.length && !items.value.length) { Z.toast('先生成字帖', 'warn'); return; }
      window.print();
    };

    // 进来先出一版：空白页面对新用户没意义
    Vue.onMounted(() => generate());

    // 参数一变就重排：本地计算，几毫秒的事，比点按钮顺手
    watch(() => ({ ...form }), () => {
      if (doc.value || pages.value.length) generate();
    }, { deep: true });

    return {
      form, doc, pages, items, generate, print,
      pageCount: computed(() => items.value.length || pages.value.length),
    };
  };
})();
