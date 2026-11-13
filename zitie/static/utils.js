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

  /* ---------------- 字体墨迹度量 ----------------
     几种中文字体的 em 框里，墨迹大小差得很远：隶书的字只占 em 高的 65%，
     仿宋能到 98%，行楷还往下探出 20%。字号直接取格子边长，同一个版面里
     就会出现「有的字顶天立地、有的瘦一圈」，回宫格/米字格上尤其明显。
     所以拿 canvas 量一批常用字的墨迹包络，反算字号缩放和基线位置，
     再用 <text> 按算出来的基线画 —— 六款字体出来的字一样大、一样居中。 */
  const PROBE = '永和九年岁在癸丑春眠不觉晓处闻啼鸟天地人你我他大小中国文字';
  const METRIC_DEFAULT = { scale: 0.88, baseline: 0.84 }; // 量出来之前的近似值
  const metrics = new Map();

  /* 量一款字体：字号 1000 排一遍常用字，取墨迹包络的 95 分位。
     用 canvas 的 measureText 而不是 SVG getBBox —— 后者在 Chrome 里
     返回的是 em 框（永远是 1000×1000），量不出某款字体实际画得多满。 */
  async function measureFont(key) {
    let ctx;
    try { ctx = document.createElement('canvas').getContext('2d'); } catch { return null; }
    if (!ctx) return null;
    // FontFace 是动态注入的，不显式 load 一次，量到的是回退字体
    try { await document.fonts.load(`1000px ${key}`); } catch {}
    const SIZE = 1000;
    ctx.font = `${SIZE}px ${key}, serif`;
    const hs = [], ws = [], mids = [];
    for (const ch of PROBE) {
      const t = ctx.measureText(ch);
      const asc = t.actualBoundingBoxAscent || 0;
      const desc = t.actualBoundingBoxDescent || 0;
      if (!asc && !desc) continue;
      hs.push(asc + desc);
      ws.push((t.actualBoundingBoxLeft || 0) + (t.actualBoundingBoxRight || 0));
      mids.push((asc - desc) / 2); // 墨迹中心相对基线往上多少
    }
    if (!hs.length) return null;
    const pick = (arr, q) => {
      const v = arr.slice().sort((a, b) => a - b);
      return v[Math.min(v.length - 1, Math.floor(q * v.length))];
    };
    // 取 95 分位而不是最大值：个别字（「永」「春」）会挑出去，
    // 按最大值缩，其余九成的字就都小了一号。
    const h = pick(hs, 0.95), w = pick(ws, 0.95), mid = pick(mids, 0.5);
    // 目标：墨迹占格子的 88%。字帖的字得留呼吸空间，顶格满铺不好看，
    // 而且描字时要给笔尖留位置。
    const scale = Math.min((0.88 * SIZE) / h, (0.88 * SIZE) / w);
    // 出字时 viewBox 是 0..1024、字号取 1024 × scale；
    // 基线放在 0.5 + 墨迹中心处，墨迹中心就正好压在格子正中
    const baseline = 0.5 + (mid / SIZE) * scale;
    return {
      scale: Math.round(scale * 1000) / 1000,
      baseline: Math.round(baseline * 1000) / 1000,
    };
  }

  // 量好一次就缓存；字体是异步注入的，先给个近似值顶着，
  // 量完 bump 一下版本号，字形那边自己重排。
  Z.metricRev = Vue.reactive({ n: 0 });
  Z.fontMetric = (key) => {
    if (!key) return METRIC_DEFAULT;
    if (metrics.has(key)) return metrics.get(key);
    metrics.set(key, METRIC_DEFAULT); // 占位，免得同一款字体被反复触发测量
    Z.ensureFont(key)
      .then(() => measureFont(key))
      .then((m) => { if (m) { metrics.set(key, m); Z.metricRev.n++; } });
    return METRIC_DEFAULT;
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
  /* 拼音字体只带小写字母和带调元音，几 KB，索性都预加载 */
  Z.PY_FONTS = [
    { key: 'pinyinok', name: '拼音体', url: 'static/fonts/pinyin/pinyinok.woff2', eager: true },
    { key: 'pinyin', name: '拼音黑体', url: 'static/fonts/pinyin/Pinyin.woff2', eager: true },
  ];

  /* 六款英文/拼音字体的字形度量，千分之一 em，从 woff2 里逐字量出来的：
     asc 升部顶（大写、b d f h k l 的上沿，拼音字体连声调符号一起算）、
     xh 小写 x 的高度、desc 降部底（g j p q y）。
     adv 是逐字宽度，字符顺序见 EN_CHARS / PY_CHARS，用来算一个词放不放得下。
     pinyinok 的 v 画成了 ü 的放大版（0.95 em 高），是那套字体自己的毛病，
     量 asc 时把它剔掉，不然整页字号被一个字压掉一截。
     有这几个数，字号就能从「笔画正好撑满格子」反算，不用一款字体手调一个 px。 */
  Z.EN_CHARS = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789-';
  Z.PY_CHARS = 'abcdefghijklmnopqrstuvwxyzāáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜń';
  Z.GLYPH_METRICS = {
    shouxieti: { chars: 'en', name: '手写体', asc: 721, xh: 366, desc: 363,
      adv: '488,391,439,488,439,488,488,488,342,391,439,439,684,537,439,391,439,391,439,537,439,488,781,586,' +
        '488,537,342,342,293,391,244,293,342,391,195,244,391,195,488,342,244,342,342,342,293,244,391,342,' +
        '488,439,391,342,488,488,488,488,488,488,488,488,488,488,439' },
    segoeprint: { chars: 'en', name: 'Segoe Print', asc: 859, xh: 546, desc: 340,
      adv: '777,734,699,794,684,593,776,806,317,596,744,629,946,808,804,707,809,729,639,672,775,717,1013,733,' +
        '671,766,587,582,507,661,520,373,574,626,289,322,591,286,1028,663,565,646,573,509,424,469,610,546,' +
        '881,539,591,502,0,0,0,0,0,0,0,0,0,0,641' },
    blokletterspotlood: { chars: 'en', name: 'Blokletters', asc: 945, xh: 613, desc: 378,
      adv: '661,694,761,812,771,749,976,723,621,761,754,634,890,749,857,737,888,769,764,800,808,700,1043,758,' +
        '721,735,643,606,601,658,622,469,620,535,225,346,548,241,894,622,607,659,590,544,561,542,561,514,' +
        '796,529,587,563,0,0,0,0,0,0,0,0,0,0,573' },
    myriadpro: { chars: 'en', name: 'Myriad Pro', asc: 728, xh: 480, desc: 224,
      adv: '578,516,604,698,481,480,655,664,223,376,508,450,818,674,721,516,721,527,477,480,659,525,865,530,' +
        '515,560,553,553,463,553,460,275,553,567,223,208,444,223,873,567,553,553,553,308,374,318,553,456,' +
        '746,440,437,430,0,0,0,0,0,0,0,0,0,0,300' },
    pinyinok: { chars: 'py', name: '拼音体', asc: 762, xh: 465, desc: 219,
      adv: '539,539,477,539,527,324,539,520,227,246,496,227,789,520,531,539,539,352,473,348,520,664,715,461,' +
        '488,441,516,516,516,516,527,527,527,527,309,266,309,227,531,531,531,531,520,520,520,520,520,520,' +
        '520,520,523' },
    pinyin: { chars: 'py', name: '拼音黑体', asc: 883, xh: 540, desc: 288,
      adv: '544,544,468,530,510,327,530,500,269,270,463,265,742,512,560,560,615,379,463,369,510,511,791,486,' +
        '512,468,545,543,543,545,509,509,509,509,269,269,269,269,560,560,560,560,508,510,510,510,512,510,' +
        '510,512,510' },
  };
  /* 一个词占多宽，单位 em。度量表里没有的字（生僻音节、符号）按 0.6em 估。 */
  Z.textEm = (text, fontKey) => {
    const m = Z.GLYPH_METRICS[fontKey] || Z.GLYPH_METRICS.shouxieti;
    const chars = m.chars === 'py' ? Z.PY_CHARS : Z.EN_CHARS;
    const advs = m.adv.split(',').map(Number);
    let em = 0;
    for (const ch of String(text || '')) {
      const i = chars.indexOf(ch);
      em += i >= 0 && advs[i] ? advs[i] / 1000 : 0.6;
    }
    return em;
  };

  /* 四线三格怎么摆、字写多大，全交给字体自己的度量算，不再一款字体拍一个 px。

     每款字体量三个数：asc 升部顶（大写、b d f h l 的上沿，拼音字体连声调一起算）、
     xh 小写 x 的高度、desc 降部底（g j p q y）。然后：

     - 字号让「升部顶贴格顶、降部底贴格底」：size = (格高 - 0.3mm) / (asc + desc)。
       有降部的字（apple、grape、quick）正好把整格撑满。以前给的是 17/20/22 这种死值，
       手写体的 x 高度只有 em 的 0.37，17px 折算下字母才 2.5mm ——
       8.6mm 的格子里浮着窄窄一行，就是「没填满」的观感来源
     - 上面那条内线画在 x 高度处、下面那条画在基线处，两条位置都由度量算。
       小写字母正好卡在两条线之间，四线三格的读法还在，
       而且不管字体高矮胖瘦，线都跟着自己的字形走

     各款字体 x 高度差近一倍（手写体 0.37、Blokletters 0.61），套同一套公式，
     四款英文、两款拼音在纸上看起来一样满。 */
  Z.enLayout = (fontKey, cellW, cellH) => {
    const m = Z.GLYPH_METRICS[fontKey] || Z.GLYPH_METRICS.shouxieti;
    const span = (m.asc + m.desc) / 1000;
    // 留 0.3mm：字顶到格线上，1px 的边框会压掉一牙
    const size = (cellH - 0.3) / span;
    return {
      size: Math.floor(size * 100) / 100,
      cellW, cellH,
      mid: (m.asc - m.xh) / (m.asc + m.desc),  // 上边线 = x 高度线
      base: m.asc / (m.asc + m.desc),          // 下边线 = 基线
    };
  };

  /* 中文字体都是 1MB 起，6 个全下就是 11MB。首屏只留一个楷体，
     其余等用户真的选中（或把鼠标停到字体按钮上）再拉。 */
  const fontLoaded = new Map();
  Z.ensureFont = (key) => {
    if (fontLoaded.has(key)) return fontLoaded.get(key);
    const meta = Z.ZH_FONTS.concat(Z.EN_FONTS, Z.PY_FONTS).find((f) => f.key === key);
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
  Z.gridFor = (cols, baseCellH, pinyin, reserve) => {
    // reserve：订正格那种「每页固定留一行」占掉的毫米数，从版心里扣掉再排行数
    const bodyH = Z.BODY_H - (reserve || 0);
    const gap = pinyin ? Z.PY_H : 0;
    const unit = baseCellH + gap;
    const rows = Math.max(1, Math.floor((bodyH + 0.3) / unit));
    // 每行 1px 边框约 0.26mm，算进去
    const cellH = (bodyH - rows * 0.3) / rows - gap;
    return { cols, rows, cellH: Math.round(Math.min(baseCellH * 1.15, cellH) * 100) / 100, perPage: cols * rows };
  };

  /* ---------------- 格型 / 描字类型 / 页脚 ----------------
     格型是 .cell-guide 上的一个 class，纯 CSS 伪元素 + gradient 画的；
     描字类型决定字形那条 <text> 的描边怎么写；页脚与订正格都挂在 doc 上，
     ZSheet 照着渲染 —— 各页面只管把选项原样传进来。 */
  Z.GUIDE_OPTIONS = [
    { v: 'tian', label: '田字格' }, { v: 'mi', label: '米字格' }, { v: 'hui', label: '回宫格' },
    { v: 'cross', label: '交叉格' }, { v: 'fang', label: '方格' }, { v: 'jiu', label: '九宫格' },
    { v: 'shuang', label: '双横线' }, { v: 'wu', label: '无格' },
  ];

  Z.TRACE_OPTIONS = [
    { v: 1, label: '实心' }, { v: 2, label: '空心' }, { v: 3, label: '细虚线' }, { v: 4, label: '圆点' },
  ];
  // 1 实心（填色）/ 2 空心（描边）/ 3 细虚线（描边虚线）/ 4 圆点（点线描边）
  Z.traceOf = (v) => ({ 2: 'hollow', 3: 'dash', 4: 'dot' }[Number(v)] || 'solid');

  /* 拼音行样式：默认虚线格，另给下划线、小括号、长方格三档。
     作业本上常见的就这几种，格子本身不动，只换拼音行下面那条线的画法。 */
  Z.PY_STYLES = [
    { v: 'grid', label: '虚线格' }, { v: 'under', label: '下划线' },
    { v: 'paren', label: '小括号' }, { v: 'box', label: '长方格' },
  ];
  Z.pyStyleOf = (v) => (Z.PY_STYLES.some((o) => o.v === v) ? v : 'grid');

  /* 间隔描字：一行一个记号，描/空自己排。
     「描描空」= 第一行示范、第二行描红、第三行留白，比全局的「几行描几行空」
     灵活 —— 字帖的手感全在这种逐行节奏上。 */
  Z.ROW_PATTERN_MAX = 8;
  Z.parseRowPattern = (raw) => {
    const out = [];
    for (const c of String(raw || '')) {
      if ('描df1'.indexOf(c) >= 0) out.push('t');
      else if ('空kb0'.indexOf(c) >= 0) out.push('b');
      if (out.length >= Z.ROW_PATTERN_MAX) break;
    }
    // 一行都不描的时候没意义（整块全是空行），那就当没填
    return out.some((t) => t === 't') ? out : [];
  };

  // 页脚 0 无 / 1 姓名日期 / 2 姓名班级日期
  Z.FOOT_OPTIONS = [
    { v: 0, label: '不要' }, { v: 1, label: '姓名日期' }, { v: 2, label: '姓名班级日期' },
  ];
  Z.footOf = (v) => {
    const n = Z.clamp(v, 0, 2);
    if (!n) return null;
    return { name: true, cls: n >= 2, date: true };
  };

  // 订正格：每页尾部一行「改错」区，高度从版心里扣，所以页面照样是满版
  Z.FIX_H = 14; // 一行订正格占的高度，含跟上面格子之间的空隙
  Z.fixH = (v) => (Number(v) ? Z.FIX_H : 0);

  // 汉字格：{ ch, py, head, upTo }
  const cellCh = (ch, py, head, upTo) => ({ ch: ch || '', py: py || '', head: !!head, upTo: upTo == null ? null : upTo });

  function padToRow(cells, cols, make) {
    const rest = cells.length % cols;
    if (!rest) return cells;
    for (let i = rest; i < cols; i++) cells.push(make());
    return cells;
  }

  /* 汉字字帖
     font_type: 1 描字 / 2 笔顺
     每个字：头格（深色示范）+ 描字行 + 空白行，补齐整行

     render 决定字形怎么画：描字用 text（字体整字，选哪款就是哪款），
     笔顺用 stroke（笔画轮廓，只有它能逐笔拆）。 */
  Z.genHanzi = (form) => {
    const chars = Z.chars(form.content);
    if (!chars.length) return null;
    const cols = 12;
    const pinyin = !!form.pinyin;
    const fixH = Z.fixH(form.fix);
    const grid = Z.gridFor(cols, 15, pinyin, fixH);
    const { cellH, perPage } = grid;
    const fillRow = Z.clamp(form.fill_row, 0, 5);
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    // 整段一起注音，多音字才判得准。pinyinList 跟原串逐位对齐（标点处是空串），
    // 按位置取才不会错位 —— 早先按「第几个不重复的字」取，重复字一多就串行。
    const pyAll = Z.pinyinList(form.content);
    let pk = 0;
    const fix = form.pinyin_fix || {};
    const pyOf = new Map();
    for (const ch of String(form.content)) {
      if (!/[\u4e00-\u9fa5]/.test(ch)) continue;
      const py = pyAll[pk++] || '';
      if (pyOf.has(ch)) continue;
      // 逐字改过的那批优先 —— pinyin-pro 判错的时候总得给个手动补救的口子
      const own = Object.prototype.hasOwnProperty.call(fix, ch) ? fix[ch] : null;
      pyOf.set(ch, own == null ? (py || Z.pinyinOf(ch)) : own);
    }
    const blank = () => cellCh('', '');
    const blocks = [];
    // 填了模式就按模式逐行排，没填才用「几行描 + 几行空」。
    // 笔顺帖一格里是一笔，模式那种「一行整字」跟它不是一个东西，不掺和。
    const pattern = Number(form.font_type) === 2 ? [] : Z.parseRowPattern(form.row_pattern);

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
      } else if (pattern.length) {
        // 模式的第一个描字行当示范行（第一个格子深色），后面的描行都是淡色的。
        // 不以「空」开头的时候它就是第一行；开头留白也不至于整块没有示范。
        const headRow = pattern.indexOf('t');
        pattern.forEach((t, r) => {
          for (let c = 0; c < cols; c++) {
            const head = t === 't' && r === headRow && c === 0;
            if (t === 'b') block.push(blank());
            else block.push(cellCh(ch, head ? py : '', head));
          }
        });
        blocks.push(block);
        continue;
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
        pyStyle: Z.pyStyleOf(form.py_style),
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        fontCss: form.font_key || 'kaiti',
        render: Number(form.font_type) === 2 ? 'stroke' : 'text',
        // 笔顺帖画的是笔画轮廓，描字类型对它没意义；描字帖才按选项描边
        trace: Number(form.font_type) === 2 ? 'solid' : Z.traceOf(form.trace),
        foot: Z.footOf(form.foot), fixH,
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

    const fontCss = form.font_key || 'pinyinok';
    const gridWidth = 176;
    return {
      doc: {
        kind: 'en', title: form.title, cols, cellH, pinyin: false,
        guide: 'en', line: form.border_color, ink: form.font_color,
        fontCss, gridWidth,
        foot: Z.footOf(form.foot),
        glyph: Z.enLayout(fontCss, gridWidth / cols, cellH),
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

    const gridWidth = 176;
    return {
      doc: {
        kind: 'en', title: form.title, cols, cellH, pinyin: false,
        guide: 'en', line: form.border_color, ink: form.font_color,
        fontCss, gridWidth,
        foot: Z.footOf(form.foot),
        // 字号与两条内线由字体度量算（见 Z.enLayout），一页就一个字号
        glyph: Z.enLayout(fontCss, gridWidth / cols, cellH),
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
        foot: Z.footOf(form.foot),
      },
      pages: [],
      items: Z.paginate(items, perPage2),
    };
  };

  /* 词语文章：整字渲染，按列铺
     换行交回给用户 —— 他敲了回车就是换行，没敲就一直排下去。
     硬按 12 格一刀切会把词语劈成两半（「春眠」拆到两行）。 */
  /* 空段符号：一整行只写 □（或 ☐、▢），那一行就留成空白格，
     想在哪断开、空多高都在正文里说清楚，不用靠分页碰运气。 */
  const BLANK_CHARS = '□☐▢';
  Z.BLANK_MARK = BLANK_CHARS[0];
  const isBlankLine = (line) => {
    const t = String(line).trim();
    return t.length > 0 && Array.from(t).every((c) => BLANK_CHARS.indexOf(c) >= 0);
  };

  Z.genStage = (form) => {
    const text = String(form.content || '');
    if (!text.replace(/[\s□☐▢]/g, '')) return null;
    const cols = Z.clamp(form.cols || 12, 6, 16);
    const pinyin = !!form.pinyin;
    const fixH = Z.fixH(form.fix);
    const grid = Z.gridFor(cols, 15, pinyin, fixH);
    const { cellH, perPage } = grid;
    // 拼音跟正文逐位对齐（标点、空格、□ 位置都是空串），所以下面用绝对下标取，
    // 不能自己数「第几个汉字」—— 空段一插进来就全串位了
    const pys = Z.pinyinList(text);
    const blank = { ch: '', py: '', head: false, upTo: null };
    const cells = [];
    let at = 0; // 当前行首在全文里的位置

    for (const line of text.split(/\r?\n/)) {
      const start = at;
      at += line.length + 1; // +1 是那个换行符
      // 空段：写几个 □ 就空几行，自己填字用
      if (isBlankLine(line)) {
        for (let r = 0; r < Array.from(line.trim()).length; r++) {
          cells.push(...Array.from({ length: cols }, () => blank));
        }
        continue;
      }
      const row = [];
      // 按 UTF-16 下标走，跟 pinyinList（内部是 split('')）的位次同一套
      line.split('').forEach((ch, i) => {
        if (/\s/.test(ch) || BLANK_CHARS.indexOf(ch) >= 0) return;
        // 一行塞不下就按列数硬折，这是用户自己也看得见的
        if (row.length >= cols) { cells.push(...row); row.length = 0; }
        const isZh = /[\u4e00-\u9fa5]/.test(ch);
        row.push({ ch, py: isZh ? (pys[start + i] || '') : '', head: false, upTo: null });
      });
      if (!row.length) continue;
      // 每一行末尾补齐，下一行一定从最左边开始
      while (row.length < cols) row.push(blank);
      cells.push(...row);
    }
    return {
      doc: {
        kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H,
        pyStyle: Z.pyStyleOf(form.py_style),
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        fontCss: form.font_key || 'kaiti',
        render: 'text', // 整段文字只走字体，逐笔拆一整篇课文没有意义
        trace: Z.traceOf(form.trace),
        foot: Z.footOf(form.foot), fixH,
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
     输入框里一个图形字符就是一整行，回车空一行（那行留给孩子自己画）。
     每行默认整行铺满；把「描红格数」调小，才有「前面印线、后面自己写」。
     格子边长只是基准：列数行数都按可用版面反算，再把格子撑满整页 ——
     否则右边会剩下半列空地，纸上看着像没印完。 */
  Z.genPen = (form) => {
    // 一行一个图形，空行就是空白行；一行写几个图形就是几行。
    // 顺手把小写转成大写 —— 手敲 a-w 的人不少，字体里只有大写码位
    const rowsIn = [];
    for (const line of String(form.content || '').toUpperCase().split('\n')) {
      const chars = line.split('').filter((c) => Z.PEN_CHARS.indexOf(c) >= 0);
      if (chars.length) rowsIn.push(...chars); else rowsIn.push('');
    }
    // 末尾那个换行不该白占一行
    while (rowsIn.length > 1 && rowsIn[rowsIn.length - 1] === '') rowsIn.pop();
    if (!rowsIn.some((c) => c)) return null;

    const size = Z.clamp(form.size || 10, 5, 40);
    const gap = Z.clamp(form.gap || 0, 0, 10);
    const cols = Math.max(1, Math.round((Z.PEN_WIDTH + gap) / (size + gap)));
    // 列宽是「铺满后摊下来」的结果，再拿它去算行数，格子才接近正方
    const colW = (Z.PEN_WIDTH - gap * (cols - 1)) / cols;
    const rows = Math.max(1, Math.round(Z.BODY_H / (colW + gap)));
    // 格子的边框走 box-sizing: border-box，已经在高度里了，
    // 所以只要把行间距扣掉再平摊，底部就不会留一条白边
    const cellH = Math.round(((Z.BODY_H - gap * (rows - 1)) / rows) * 100) / 100;
    const perPage = cols * rows;
    // 0 = 整行铺满（默认）；其它值是每行前面几格印线，后面留白
    const trace = Z.clamp(form.trace, 0, cols) || cols;
    const blank = { ch: '' };

    const blocks = rowsIn.map((ch) => {
      const row = [];
      for (let c = 0; c < cols; c++) row.push({ ch: ch && c < trace ? ch : '' });
      return row;
    });

    return {
      doc: {
        kind: 'pen', title: form.title, cols, cellH,
        cellW: Math.round(colW * 100) / 100,
        rowGap: gap, colGap: gap,
        line: form.border_color, ink: form.trace_color,
        foot: Z.footOf(form.foot),
        gridWidth: Z.PEN_WIDTH - gap * (cols - 1),
      },
      pages: Z.paginateBlocks(blocks, perPage, () => ({ ch: '' })),
    };
  };

  /* 空白练习纸
     guide 就是格型（跟汉字字帖同一套），另加一个 'en' 表示四线三格；
     pinyin 决定汉字格上面有没有拼音行。 */
  Z.BLANK_GUIDES = Z.GUIDE_OPTIONS.concat([{ v: 'en', label: '四线三格' }]);
  Z.genBlank = (form) => {
    const guide = form.guide || 'tian';
    const num = Z.clamp(form.num || 2, 1, 50);
    if (guide === 'en') {
      const cols = 5;
      const grid = Z.gridFor(cols, 9, false);
      const { cellH, perPage } = grid;
      const page = Array.from({ length: perPage }, () => ({ word: '', head: false }));
      return {
        doc: {
          kind: 'en', title: form.title, cols, cellH, pinyin: false, guide: 'en',
          line: form.border_color, ink: form.font_color, fontCss: 'shouxieti', gridWidth: 176,
          foot: Z.footOf(form.foot),
          // 空白纸虽然不写字，四条线也照同一个公式摆，写上去跟真字帖对得上
          glyph: Z.enLayout('shouxieti', 176 / cols, cellH),
        },
        pages: Array.from({ length: num }, () => page),
      };
    }
    const pinyin = !!form.pinyin;
    const cols = 12;
    const grid = Z.gridFor(cols, 15, pinyin);
    const { cellH, perPage } = grid;
    const page = Array.from({ length: perPage }, () => ({ ch: '', py: '', head: false }));
    return {
      doc: { kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H,
        pyStyle: Z.pyStyleOf(form.py_style), guide,
        line: form.border_color, ink: form.font_color, fontCss: 'kaiti', render: 'text',
        foot: Z.footOf(form.foot), gridWidth: 180 },
      pages: Array.from({ length: num }, () => page),
    };
  };
})();
