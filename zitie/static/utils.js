/* 工具层：笔顺数据解码、拼音、数学出题、分页、存储、打印
   全部挂在 window.Zu 上，页面脚本（page.*.js）与组件（ui.js）都从这里取。
   必须在 page.*.js 之前加载。 */
(function () {
  const Z = (window.Zu = window.Zu || {});

  /* ---------------- 小工具 ---------------- */
  Z.clamp = (v, lo, hi) => Math.min(hi, Math.max(lo, Number(v) || 0));
  Z.randInt = (lo, hi) => lo + Math.floor(Math.random() * (hi - lo + 1));
  Z.chars = (text) => (String(text || '').match(/[\u4e00-\u9fa5]/g) || []);
  Z.paginate = (list, per) => {
    if (!list.length) return [[]];
    const out = [];
    for (let i = 0; i < list.length; i += per) out.push(list.slice(i, i + per));
    return out;
  };

  /* 按块分页：一个字/一个音节的练习块不许被页边界切开。
     块比一页还大时只能硬切（那种情况说明参数设得太狠）。
     fill：把非末页补齐成整页，免得页面底下缺一块白 —— 打印出来就像没印完。 */
  Z.paginateBlocks = (blocks, per, fill) => {
    const pages = [];
    let cur = [];
    for (const block of blocks) {
      if (block.length > per) {
        if (cur.length) { pages.push(cur); cur = []; }
        for (let i = 0; i < block.length; i += per) pages.push(block.slice(i, i + per));
        continue;
      }
      if (cur.length + block.length > per) { pages.push(cur); cur = []; }
      cur = cur.concat(block);
    }
    if (cur.length) pages.push(cur);
    if (!pages.length) return [[]];
    if (fill) {
      // 每页都补齐：字帖的一页就该是一整版格子，
      // 底下留半页白纸看着像没印完
      for (const p of pages) while (p.length < per) p.push(fill());
    }
    return pages;
  };

  /* ---------------- 本地存储 ---------------- */
  // 记一下上次用的设置，下次进页面还是那套（跟 zivip 每次都要重选不一样）
  Z.load = (key, fallback) => {
    try {
      const raw = localStorage.getItem('zitie:' + key);
      if (!raw) return fallback;
      return Object.assign({}, fallback, JSON.parse(raw));
    } catch { return fallback; }
  };
  Z.save = (key, value) => {
    try { localStorage.setItem('zitie:' + key, JSON.stringify(value)); } catch {}
  };

  /* ---------------- 主题 ---------------- */
  Z.THEME_KEY = 'zitie:theme';
  Z.theme = {
    get() {
      try { return localStorage.getItem(Z.THEME_KEY) || (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light'); }
      catch { return 'light'; }
    },
    set(v) {
      try { localStorage.setItem(Z.THEME_KEY, v); } catch {}
      document.documentElement.classList.toggle('dark', v === 'dark');
    },
  };

  /* ---------------- 笔顺数据 ----------------
     6763 个字的笔画路径，base36 增量编码，全量 7MB / gzip 3MB。
     字帖天然是「按需取字」：一次二三十个字。所以切成 41 个分片
     （每片 512 个码位），用到哪个字才去拉那一片 —— 首屏不付这个代价。
     数据以 window.ZU_SHARD(桶号, 文本) 的形式回来，见 static/data/strokes/。 */
  const B36 = '0123456789abcdefghijklmnopqrstuvwxyz';
  const QUANT = 2; // 坐标量化步长，2/1024 em ≈ 0.03mm
  const SHARD_SIZE = 512;
  const BASE = 0x4e00;

  const blobs = new Map();      // 桶号 → 原始文本
  const index = new Map();      // 字 → [起, 止]（在该桶的文本里）
  const decoded = new Map();    // 字 → 笔画路径数组
  const pending = new Map();    // 桶号 → Promise

  const shardOf = (ch) => Math.floor((ch.codePointAt(0) - BASE) / SHARD_SIZE);

  function indexShard(no, blob) {
    if (blobs.has(no)) return;
    blobs.set(no, blob);
    let pos = 0;
    while (pos < blob.length) {
      let nl = blob.indexOf('\n', pos);
      if (nl < 0) nl = blob.length;
      if (nl > pos) index.set(blob[pos], [no, pos + 1, nl]);
      pos = nl + 1;
    }
  }

  // 分片脚本加载完会调这个
  window.ZU_SHARD = indexShard;

  function loadShard(no) {
    if (blobs.has(no)) return Promise.resolve();
    if (pending.has(no)) return pending.get(no);
    const p = new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = `static/data/strokes/${no}.js`;
      el.onload = el.onerror = () => resolve();
      document.head.appendChild(el);
    });
    pending.set(no, p);
    return p;
  }

  const unzig = (v) => (v & 1 ? -((v + 1) >> 1) : v >> 1);

  function decode(s) {
    // 一笔 = 一串 4 位 base36 数对（x/y）；首点绝对坐标，其余是增量
    const out = [];
    for (const seg of s.split(';')) {
      if (!seg) continue;
      let d = '';
      let p = 0;
      let prev = [0, 0];
      let first = true;
      while (p < seg.length) {
        const c = seg[p];
        if ('MQLCZ'.indexOf(c) >= 0) { d += c + ' '; p++; continue; }
        const ax = B36.indexOf(seg[p]) * 36 + B36.indexOf(seg[p + 1]);
        const ay = B36.indexOf(seg[p + 2]) * 36 + B36.indexOf(seg[p + 3]);
        p += 4;
        let x, y;
        if (first) { x = ax - 128; y = ay - 128; first = false; }
        else { x = prev[0] + unzig(ax); y = prev[1] + unzig(ay); }
        prev = [x, y];
        d += x * QUANT + ' ' + y * QUANT + ' ';
      }
      out.push(d.trim());
    }
    return out;
  }

  const CH_NONE = [];

  // 同步取：分片还没到就返回空，渲染层靠 reactive 版本再补一次
  Z.strokesOf = (ch) => {
    if (!ch) return CH_NONE;
    if (decoded.has(ch)) return decoded.get(ch);
    const span = index.get(ch);
    if (!span) return CH_NONE;
    const blob = blobs.get(span[0]);
    if (!blob) return CH_NONE;
    const paths = decode(blob.slice(span[1], span[2]));
    decoded.set(ch, paths);
    return paths;
  };

  // 预先加载这批字所在的分片，返回 Promise
  Z.prefetch = (text) => {
    const nos = new Set();
    for (const ch of String(text || '')) {
      const cp = ch.codePointAt(0);
      if (cp >= BASE && cp <= 0x9fff) nos.add(shardOf(ch));
    }
    return Promise.all([...nos].map(loadShard));
  };

  /* 渲染组件用这个：先问一次同步数据，缺的分片拉回来后再触发更新。
     reactive 版本号一变，Vue 就重算 → 字就补上了。

     注意一点：分片里也可能压根没这个字（超出 GB2312 的生僻字）。
     那种情况必须记住「问过了」，否则每次重算都去 load 一次、
     load 完又 bump 版本号、又重算 —— 死循环，页面直接卡死。 */
  Z.strokeRev = Vue.reactive({ n: 0 });
  const asked = new Map(); // 字 → 是否已问过分片
  Z.strokeFor = (ch) => {
    const paths = Z.strokesOf(ch);
    if (!paths.length && ch && !asked.has(ch)) {
      const cp = ch.codePointAt(0);
      if (cp >= BASE && cp <= 0x9fff) {
        asked.set(ch, true);
        loadShard(shardOf(ch)).then(() => { Z.strokeRev.n++; });
      }
    }
    return paths;
  };

  /* ---------------- 拼音 ---------------- */
  // pinyin-pro：多音字按词组判，「长大了」不会读成 cháng
  const PY = () => window.pinyinPro;
  Z.pinyinOf = (ch, text) => {
    const pro = PY();
    if (!pro) return '';
    try {
      if (text && text.length > 1) {
        const all = pro.pinyin(text, { type: 'array' });
        const i = String(text).indexOf(ch);
        if (i >= 0 && all[i]) return all[i];
      }
      return pro.pinyin(ch, { type: 'array' })[0] || '';
    } catch { return ''; }
  };

  // 一段话逐字注音：整段一起喂给 pinyin-pro，多音字才判得准；
  // 标点、空格用 nonZh:'removed' 剔掉，剩下的跟汉字一一对应。
  Z.pinyinList = (text) => {
    const pro = PY();
    const chars = String(text || '').split('');
    const zh = chars.filter((c) => /[\u4e00-\u9fa5]/.test(c));
    if (!zh.length) return chars.map(() => '');
    let arr = [];
    try { arr = pro.pinyin(zh.join(''), { type: 'array', nonZh: 'removed' }) || []; } catch { arr = []; }
    let k = 0;
    return chars.map((c) => (/[\u4e00-\u9fa5]/.test(c) ? (arr[k++] || Z.pinyinOf(c)) : ''));
  };

  /* ---------------- 数学出题 ---------------- */
  const OPS = ['+', '-', '×', '÷'];

  function opsFor(cipher, count) {
    const n = count - 1;
    const fill = (pool) => Array.from({ length: n }, () => pool[Z.randInt(0, pool.length - 1)]);
    switch (Number(cipher)) {
      case 1: return fill(['+']);
      case 2: return fill(['-']);
      case 3: return fill(['+', '-']);
      case 4: return fill(['×']);
      case 5: return fill(['÷']);
      case 6: return fill(['×', '÷']);
      default: return fill(OPS);
    }
  }

  function parseRange(max) {
    const parts = String(max || '10-19').split('-');
    let lo = parseInt(parts[0], 10);
    let hi = parseInt(parts[1], 10);
    if (isNaN(lo)) lo = 0;
    if (isNaN(hi)) hi = lo;
    if (hi < lo) { const t = lo; lo = hi; hi = t; }
    return [lo, hi];
  }

  // 求值：先乘除后加减；brackets 为真时先把头两个数括起来算
  function evalExpr(nums, ops, brackets) {
    const calc = (a, op, b) => {
      switch (op) {
        case '+': return a + b;
        case '-': return a - b;
        case '×': return a * b;
        default: return b === 0 ? NaN : a / b;
      }
    };
    let list = nums.slice();
    let opl = ops.slice();
    if (brackets && list.length > 2) {
      list = [calc(list[0], opl[0], list[1])].concat(list.slice(2));
      opl = opl.slice(1);
    }
    const items = [list[0]];
    const addOps = [];
    for (let i = 0; i < opl.length; i++) {
      if (opl[i] === '×' || opl[i] === '÷') {
        items[items.length - 1] = calc(items[items.length - 1], opl[i], list[i + 1]);
      } else {
        addOps.push(opl[i]);
        items.push(list[i + 1]);
      }
    }
    let total = items[0];
    for (let k = 0; k < addOps.length; k++) total = calc(total, addOps[k], items[k + 1]);
    return total;
  }
  Z.evalExpr = evalExpr;

  // 生成一道题：{ nums, ops, total, blank, brackets }
  // blank 是 'total'（等号后填空）或某个数字下标（挖掉某个数）
  Z.makeQuestion = (form) => {
    const count = Z.clamp(form.count || 2, 2, 4);
    const [lo, hi] = parseRange(form.max);
    const decimal = String(form.type) === '2';
    const wantInt = String(form.integer) === '1';
    const wantPlus = String(form.plus) === '1';
    const brackets = String(form.brackets) === '1' && count > 2;
    const top = Math.max(hi, lo + 1);

    for (let attempt = 0; attempt < 400; attempt++) {
      const ops = opsFor(form.cipher, count);
      const nums = [];
      let ok = true;

      for (let i = 0; i < count; i++) {
        const prevOp = i > 0 ? ops[i - 1] : null;
        if (!decimal && prevOp === '÷') {
          // 除法先定除数和商，乘回去当被除数，保证整除也不越界
          const d = Z.randInt(2, Math.max(2, Math.min(top, 9)));
          const qMax = Math.max(1, Math.floor(top / d));
          const qMin = Math.max(1, Math.ceil(lo / d));
          const q = Z.randInt(Math.min(qMin, qMax), qMax);
          const dividend = d * q;
          if (dividend > top || dividend < lo) { ok = false; break; }
          nums[i - 1] = dividend;
          nums[i] = d;
          continue;
        }
        if (!decimal && prevOp === '×' && i > 0) {
          nums[i] = Z.randInt(1, Math.max(1, Math.min(top, 9)));
          if (nums[i - 1] * nums[i] > top) { ok = false; break; }
          continue;
        }
        if (decimal) {
          nums.push(Number((Z.randInt(lo, hi) + Z.randInt(0, 9) / 10).toFixed(1)));
        } else {
          nums.push(Z.randInt(lo, hi));
        }
      }
      if (!ok) continue;
      if (nums.some((n) => !isFinite(n) || n < Math.min(0, lo) || n > top)) continue;

      const total = evalExpr(nums, ops, brackets);
      if (!isFinite(total)) continue;
      if (wantInt && !Number.isInteger(total)) continue;
      if (wantPlus && total < 0) continue;
      if (total > top * 4) continue; // 乘法容易出离谱的大数，给孩子做的题别太夸张

      // 挖空某个数时得验一下：那个空填回去要唯一、要在数值范围里、不能负。
      // 否则题面上会冒出 27 这种孩子还没学的数。
      let blank = 'total';
      if (String(form.position) === '1' && Math.random() < 0.5) {
        const idx = Z.randInt(0, nums.length - 1);
        const solutions = [];
        const lowOk = Math.min(lo, 0);
        for (let cand = lowOk; cand <= top; cand++) {
          const probe = nums.slice();
          probe[idx] = cand;
          if (Math.abs(evalExpr(probe, ops, brackets) - total) < 1e-9) solutions.push(cand);
        }
        if (solutions.length === 1 && solutions[0] >= lo && solutions[0] >= 0 && solutions[0] <= top) {
          blank = idx;
        }
      }
      return { nums, ops, total, blank, brackets };
    }

    // 兜底：两道数的加法，永远出得来
    const a = Z.randInt(lo, hi);
    const b = Z.randInt(lo, hi);
    return { nums: [a, b], ops: ['+'], total: a + b, blank: 'total', brackets: false };
  };

  // 一道题拆成渲染用的块：num / op / bracket / blank / eq
  Z.questionParts = (q) => {
    const parts = [];
    q.nums.forEach((n, i) => {
      if (i > 0) parts.push({ t: 'op', v: q.ops[i - 1] });
      if (q.brackets && i === 1) parts.push({ t: 'bracket', v: '(' });
      parts.push(q.blank === i ? { t: 'blank', v: '' } : { t: 'num', v: String(n) });
    });
    if (q.brackets) parts.push({ t: 'bracket', v: ')' });
    parts.push({ t: 'eq', v: '=' });
    // 空出来的那个数，等号后面就是答案；挖走某个数时答案本身要露出来
    parts.push(q.blank === 'total' ? { t: 'blank', v: '' } : { t: 'num', v: String(Number(q.total.toFixed(2))) });
    return parts;
  };

  /* ---------------- 字号 / 主题色 ---------------- */
  Z.BORDER_COLORS = [
    { name: '蓝色', value: 'rgb(56, 152, 219)' },
    { name: '绿色', value: 'rgb(82, 166, 172)' },
    { name: '红色', value: 'rgb(205, 79, 79)' },
    { name: '黑色', value: 'rgb(51, 51, 51)' },
    { name: '灰色', value: 'rgb(148, 160, 176)' },
  ];
  Z.INK_COLORS = [
    { name: '红色', value: 'rgb(255, 120, 120)' },
    { name: '浅红', value: 'rgb(251, 170, 170)' },
    { name: '淡红', value: 'rgb(255, 220, 220)' },
    { name: '黑色', value: 'rgb(84, 92, 104)' },
    { name: '浅黑', value: 'rgb(170, 170, 170)' },
    { name: '淡黑', value: 'rgb(214, 216, 220)' },
  ];
  Z.DARK = 'rgb(38, 44, 54)';
  Z.ZH_FONTS = [
    { key: 'kaiti', name: '楷体', url: 'static/fonts/zh/kaiti.woff2', eager: true },
    { key: 'fangsong', name: '仿宋', url: 'static/fonts/zh/fangsong.woff2' },
    { key: 'lishu', name: '隶书', url: 'static/fonts/zh/lishu.woff2' },
    { key: 'xingkai', name: '行楷', url: 'static/fonts/zh/xingkai.woff2' },
    { key: 'pangzhonghua', name: '庞中华', url: 'static/fonts/zh/pangzhonghua.woff2' },
    { key: 'kaishu', name: '硬笔楷书', url: 'static/fonts/zh/kaishu.woff2' },
  ];
  Z.EN_FONTS = [
    { key: 'shouxieti', name: '手写体', url: 'static/fonts/en/shouxieti.woff2', eager: true },
    { key: 'segoeprint', name: 'Segoe Print', url: 'static/fonts/en/SegoePrint.woff2' },
    { key: 'blokletterspotlood', name: 'Blokletters', url: 'static/fonts/en/BloklettersPotlood.woff2' },
    { key: 'myriadpro', name: 'Myriad Pro', url: 'static/fonts/en/MyriadProLightSemiExtIt.woff2' },
  ];

  /* 中文字体都是 1MB 起，6 个全下就是 11MB。首屏只留一个楷体，
     其余等用户真的选中（或把鼠标停到字体按钮上）再拉。 */
  const fontLoaded = new Map();
  Z.ensureFont = (key) => {
    if (fontLoaded.has(key)) return fontLoaded.get(key);
    const meta = Z.ZH_FONTS.concat(Z.EN_FONTS).find((f) => f.key === key);
    if (!meta || !window.FontFace) return Promise.resolve();
    const done = new FontFace(key, `url(${meta.url})`, { display: 'swap' })
      .load()
      .then((face) => { document.fonts.add(face); })
      .catch(() => {});
    fontLoaded.set(key, done);
    return done;
  };

  /* ---------------- 版式引擎 ----------------
     页面只填参数，这里算出「每页有哪些格子」。A4 净高 262mm 是
     297 - 上下页边距 - 标题栏 - 页脚，格子高度加起来别超过它。 */
  // A4 297 - 上下页边距 10+8 - 标题 13 - 页脚 8 = 258，留 2mm 给边框容差
  Z.BODY_H = 256;
  Z.PEN_WIDTH = 184; // 控笔页可用宽度，左右各留 13mm 页边距
  Z.PY_H = 7.4; // 拼音行高度，跟 app.css 里的 .cell-py 对齐

  /* 一页能放几行、格子多高。
     先把行数取整，再把余量平摊回格子 —— 否则页面底部会空出一条白边，
     打印出来就是「上面挤、下面空」。 */
  Z.gridFor = (cols, baseCellH, pinyin) => {
    const gap = pinyin ? Z.PY_H : 0;
    const unit = baseCellH + gap;
    const rows = Math.max(1, Math.floor((Z.BODY_H + 0.3) / unit));
    // 每行 1px 边框约 0.26mm，算进去
    const cellH = (Z.BODY_H - rows * 0.3) / rows - gap;
    return { cols, rows, cellH: Math.round(Math.min(baseCellH * 1.15, cellH) * 100) / 100, perPage: cols * rows };
  };

  // 汉字格：{ ch, py, head, upTo }
  const cellCh = (ch, py, head, upTo) => ({ ch: ch || '', py: py || '', head: !!head, upTo: upTo == null ? null : upTo });

  function padToRow(cells, cols, make) {
    const rest = cells.length % cols;
    if (!rest) return cells;
    for (let i = rest; i < cols; i++) cells.push(make());
    return cells;
  }

  /* 汉字字帖
     mode: 'trace' 描字 / 'stroke' 笔顺
     每个字：头格（深色示范）+ 描字行 + 空白行，补齐整行 */
  Z.genHanzi = (form) => {
    const chars = Z.chars(form.content);
    if (!chars.length) return null;
    const cols = 12;
    const pinyin = !!form.pinyin;
    const grid = Z.gridFor(cols, 15, pinyin);
    const { cellH, perPage } = grid;
    const fillRow = Z.clamp(form.fill_row, 0, 5);
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    // 整段一起注音，多音字才判得准；只留汉字位置的音
    const pyAll = Z.pinyinList(form.content).filter((x) => x);
    const pyOf = new Map();
    for (const ch of chars) if (!pyOf.has(ch)) pyOf.set(ch, pyAll[pyOf.size] || Z.pinyinOf(ch));
    const blank = () => cellCh('', '');
    const blocks = [];

    for (const ch of chars) {
      const py = pyOf.get(ch) || '';
      const block = [];
      if (Number(form.font_type) === 2) {
        // 笔顺：整字示范，再一笔一笔追加
        // 分片已由 useGen 预取，这里拿得到真笔画数
        const n = Math.max(1, Z.strokesOf(ch).length);
        block.push(cellCh(ch, py, true));
        for (let i = 1; i <= n; i++) block.push(cellCh(ch, '', false, i));
        padToRow(block, cols, () => cellCh(ch, '', false));
        for (let r = 0; r < fillRow; r++) for (let c = 0; c < cols; c++) block.push(cellCh(ch, '', false));
      } else {
        block.push(cellCh(ch, py, true));
        for (let i = 1; i < fillRow * cols; i++) block.push(cellCh(ch, '', false));
        // 不补描字行时也不在这里补齐 —— 不然一个字就占一整行，
        // 12 个字铺一排变成了竖着排 12 行。留给最后统一铺。
      }
      for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
      if (fillRow || blankRow) padToRow(block, cols, blank);
      blocks.push(block);
    }

    return {
      doc: {
        kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H,
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        fontCss: form.font_key || 'kaiti',
        gridWidth: 180,
      },
      pages: Z.paginateBlocks(blocks, perPage, () => cellCh('', '')),
    };
  };

  /* 拼音字帖
     type 1 声母 / 2 韵母 / 3 整体认读 / 4 汉字注音 */
  const SHENGMU = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
  const YUNMU = ['a', 'o', 'e', 'i', 'u', 'ü', 'ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 'üe', 'er', 'an', 'en', 'in', 'un', 'ün', 'ang', 'eng', 'ing', 'ong'];
  const ZHENGTI = ['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si', 'yi', 'wu', 'yu', 'ye', 'yue', 'yuan', 'yin', 'yun', 'ying'];
  Z.PINYIN_SETS = { 1: SHENGMU, 2: YUNMU, 3: ZHENGTI };

  Z.genPinyin = (form) => {
    const cols = 8;
    const grid = Z.gridFor(cols, 11, false);
    const { cellH, perPage } = grid;
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    const blocks = [];
    const blank = () => ({ word: '', head: false, py: true });

    if (Number(form.type) === 4) {
      const chars = Z.chars(form.content);
      if (!chars.length) return null;
      const pys = Z.pinyinList(form.content);
      const repeat = Z.clamp(form.repeat_times || 6, 1, 30);
      chars.forEach((ch, idx) => {
        const py = pys[idx] || Z.pinyinOf(ch);
        const block = [{ word: py, head: true, py: true }];
        for (let i = 0; i < repeat; i++) block.push({ word: py, head: false, py: true });
        padToRow(block, cols, blank);
        for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
        blocks.push(block);
      });
    } else {
      const list = Z.PINYIN_SETS[Number(form.type)] || SHENGMU;
      for (const s2 of list) {
        // 一个音节占两行：第一格深色示范，其余同内容可描
        const block = [];
        for (let i = 0; i < cols * 2; i++) block.push({ word: s2, head: i === 0, py: true });
        for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
        blocks.push(block);
      }
    }

    return {
      doc: {
        kind: 'en', title: form.title, cols, cellH, pinyin: false,
        guide: 'en', line: form.border_color, ink: form.font_color,
        fontCss: 'pinyinok', fontSize: 20, gridWidth: 176,
      },
      pages: Z.paginateBlocks(blocks, perPage, () => ({ word: '', head: false, py: true })),
    };
  };

  /* 英文字帖
     type 'alphabet' 字母表 / 'word' 单词 */
  Z.genEnglish = (form) => {
    const cols = 5;
    const grid = Z.gridFor(cols, 9, false);
    const { cellH, perPage } = grid;
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    const fontCss = form.font_key || 'shouxieti';
    const blocks = [];
    const blank = () => ({ word: '', head: false });

    if (form.type === 'word') {
      const words = String(form.content || '').split(/[\s,，|]+/).filter(Boolean);
      if (!words.length) return null;
      const repeat = Z.clamp(form.repeat_times || 10, 1, 30);
      for (const w of words) {
        const block = [{ word: w, head: true }];
        for (let i = 1; i < repeat; i++) block.push({ word: w, head: false });
        padToRow(block, cols, blank);
        for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
        blocks.push(block);
      }
    } else {
      for (let c = 65; c <= 90; c++) {
        const pair = String.fromCharCode(c) + String.fromCharCode(c + 32);
        const block = [];
        for (let i = 0; i < cols * 2; i++) block.push({ word: pair, head: i === 0 });
        for (let r = 0; r < blankRow; r++) for (let c2 = 0; c2 < cols; c2++) block.push(blank());
        blocks.push(block);
      }
    }

    return {
      doc: {
        kind: 'en', title: form.title, cols, cellH, pinyin: false,
        guide: 'en', line: form.border_color, ink: form.font_color,
        fontCss, fontSize: 17, gridWidth: 176,
      },
      pages: Z.paginateBlocks(blocks, perPage, () => ({ word: '', head: false })),
    };
  };

  /* 数学练习：每页 60 题，2 个数一行 3 题，3~4 个数一行 2 题 */
  Z.genMath = (form) => {
    const total = Z.clamp(form.total || 60, 1, 400);
    const half = Z.clamp(form.count || 2, 2, 4) > 2;
    const items = [];
    for (let i = 0; i < total; i++) {
      const q = Z.makeQuestion(form);
      items.push({ parts: Z.questionParts(q), half });
    }
    // 一页铺 20 行，行高按可用高度反算，题目上下均匀
    const rows = 20;
    const rowH = Math.round(((Z.BODY_H - rows * 0.3) / rows) * 100) / 100;
    const perPage2 = half ? rows * 2 : rows * 3;
    return {
      doc: {
        kind: 'math', title: form.title, cols: half ? 2 : 3, cellH: rowH,
        line: form.border_color || 'rgb(56, 152, 219)', ink: form.font_color,
      },
      pages: [],
      items: Z.paginate(items, perPage2),
    };
  };

  /* 词语文章：整字渲染，按列铺
     换行交回给用户 —— 他敲了回车就是换行，没敲就一直排下去。
     硬按 12 格一刀切会把词语劈成两半（「春眠」拆到两行）。 */
  Z.genStage = (form) => {
    const text = String(form.content || '');
    if (!text.replace(/\s/g, '')) return null;
    const cols = Z.clamp(form.cols || 12, 6, 16);
    const pinyin = !!form.pinyin;
    const grid = Z.gridFor(cols, 15, pinyin);
    const { cellH, perPage } = grid;
    const pys = Z.pinyinList(text);
    const blank = { ch: '', py: '', head: false, upTo: null };
    const cells = [];
    let pyIdx = 0;

    for (const line of text.split(/\r?\n/)) {
      const row = [];
      for (const ch of line) {
        if (/\s/.test(ch)) continue;
        // 一行塞不下就按列数硬折，这是用户自己也看得见的
        if (row.length >= cols) { cells.push(...row); row.length = 0; }
        const isZh = /[\u4e00-\u9fa5]/.test(ch);
        row.push({ ch, py: isZh ? (pys[pyIdx++] || '') : '', head: false, upTo: null });
      }
      if (!row.length) continue;
      // 每一行末尾补齐，下一行一定从最左边开始
      while (row.length < cols) row.push(blank);
      cells.push(...row);
    }
    return {
      doc: {
        kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H,
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        fontCss: form.font_key || 'kaiti',
        gridWidth: 180,
      },
      pages: Z.paginate(cells, perPage).map((p) =>
        // 文章页补满整版：抄写纸的格子就该是满的
        p.concat(Array.from({ length: perPage - p.length }, () => blank))),
    };
  };

  /* ---------------- 控笔练习 ----------------
     PenControl 字体里就是 32 个线条图形，字符表固定：
     123456789ABCDEFGHIJKLMNOPQRSTUVW（没有 0、X、Y、Z）。
     每个图形天生一个「格子」的尺寸，直接当文字画 —— 打印出来是矢量，
     比拿一串 SVG path 拼省事，也随格子缩放。 */
  Z.PEN_CHARS = '123456789ABCDEFGHIJKLMNOPQRSTUVW';
  Z.PEN_PATTERNS = [
    { ch: '1', name: '横线' }, { ch: '2', name: '竖线' },
    { ch: '3', name: '横向折线' }, { ch: '4', name: '纵向折线' },
    { ch: '5', name: '螺旋' }, { ch: '6', name: '反向螺旋' },
    { ch: '7', name: '方格网' }, { ch: '8', name: '斜格网' },
    { ch: '9', name: '直角' }, { ch: 'A', name: '反向直角' },
    { ch: 'B', name: '竖虚线' }, { ch: 'C', name: '横虚线' },
    { ch: 'D', name: '回形框' }, { ch: 'E', name: '反向回形' },
    { ch: 'F', name: '阶梯' }, { ch: 'G', name: '反向阶梯' },
    { ch: 'H', name: '山峰折线' }, { ch: 'I', name: 'V 形折线' },
    { ch: 'J', name: '横向波浪' }, { ch: 'K', name: '竖向波浪' },
    { ch: 'L', name: '左上斜线' }, { ch: 'M', name: '右上斜线' },
    { ch: 'N', name: '连笔圈' }, { ch: 'O', name: '竖圈' },
    { ch: 'P', name: '弧线' }, { ch: 'Q', name: '斜折线' },
    { ch: 'R', name: '弧形' }, { ch: 'S', name: '圆圈' },
    { ch: 'T', name: '断线直角' }, { ch: 'U', name: '五角星' },
    { ch: 'V', name: '双圆' }, { ch: 'W', name: '桃心' },
  ];
  Z.PEN_TRACE_COLORS = [
    { name: '淡蓝', value: 'rgb(150, 180, 215)' },
    { name: '浅灰', value: 'rgb(168, 178, 192)' },
    { name: '淡红', value: 'rgb(226, 160, 160)' },
    { name: '淡绿', value: 'rgb(150, 190, 165)' },
    { name: '深灰', value: 'rgb(110, 122, 140)' },
  ];

  /* 控笔练习
     一个图形练几行（lines），每行前 trace 格描红、其余留给自己写；
     一组练完再补 blank_row 行整行空白。选中的图形按顺序往下排。
     格子多大用 size 定，一页放几格由它反算 —— 换一档边长，版面跟着变。 */
  Z.genPen = (form) => {
    const picks = String(form.picks || '').split('').filter((c) => Z.PEN_CHARS.indexOf(c) >= 0);
    if (!picks.length) return null;
    const size = Z.clamp(form.size || 10, 5, 40);
    const gap = Z.clamp(form.gap || 0, 0, 10);
    const cols = Math.max(3, Math.floor((Z.PEN_WIDTH + gap) / (size + gap)));
    const rows = Math.max(2, Math.floor((Z.BODY_H + gap) / (size + gap)));
    const perPage = cols * rows;
    const trace = Z.clamp(form.trace || 0, 0, cols);
    const lines = Z.clamp(form.lines || 1, 1, 12);
    const blankRow = Z.clamp(form.blank_row || 0, 0, 12);
    const blank = () => ({ ch: '', head: false });

    const blocks = [];
    for (const ch of picks) {
      for (let r = 0; r < lines; r++) {
        const row = [];
        // 每行第一格印深色，当示范；后面的描红格浅一点，描完自己写
        for (let c = 0; c < cols; c++) row.push({ ch: c < trace ? ch : '', head: c === 0 });
        blocks.push(row);
      }
      for (let r = 0; r < blankRow; r++) blocks.push(Array.from({ length: cols }, blank));
    }

    return {
      doc: {
        kind: 'pen', title: form.title, cols, cellH: size,
        rowGap: gap, colGap: gap,
        line: form.border_color, ink: form.trace_color,
        // 列宽就是格子边长，间距交给 gap；ZSheet 按 gridWidth/cols 取列宽
        gridWidth: cols * size,
      },
      pages: Z.paginateBlocks(blocks, perPage, blank),
    };
  };

  /* 空白练习纸
     type 1 田字格 / 2 田+拼音 / 3 米字格 / 4 米+拼音 / 5 英文四线 */
  Z.genBlank = (form) => {
    const type = Z.clamp(form.type || 1, 1, 5);
    const num = Z.clamp(form.num || 2, 1, 50);
    if (type === 5) {
      const cols = 5;
      const grid = Z.gridFor(cols, 9, false);
      const { cellH, perPage } = grid;
      const page = Array.from({ length: perPage }, () => ({ word: '', head: false }));
      return {
        doc: { kind: 'en', title: form.title, cols, cellH, pinyin: false, guide: 'en', line: form.border_color, ink: form.font_color, fontCss: 'shouxieti', fontSize: 15, gridWidth: 176 },
        pages: Array.from({ length: num }, () => page),
      };
    }
    const pinyin = type === 2 || type === 4;
    const guide = type === 3 || type === 4 ? 'mi' : 'tian';
    const cols = 12;
    const grid = Z.gridFor(cols, 15, pinyin);
    const { cellH, perPage } = grid;
    const page = Array.from({ length: perPage }, () => ({ ch: '', py: '', head: false }));
    return {
      doc: { kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H, guide, line: form.border_color, ink: form.font_color, fontCss: 'kaiti', gridWidth: 180 },
      pages: Array.from({ length: num }, () => page),
    };
  };
})();
