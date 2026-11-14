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
     fill：把非末页补齐成整页，免得页面底下缺一块白 —— 打印出来就像没印完。

     weight：一个 cell 占几格，默认各占 1 格。笔顺条的字头条只算高度不算格数
     （记 0，高度摊进每行的提示行里），跟有拼音行的格式一样按整行数分页。 */
  Z.paginateBlocks = (blocks, per, fill, weight) => {
    const w = weight || (() => 1);
    const width = (list) => list.reduce((n, c) => n + w(c), 0);
    const pages = [];
    let cur = [];
    const flush = () => { if (cur.length) { pages.push(cur); cur = []; } };

    for (const block of blocks) {
      if (width(block) > per) {
        // 块比一页还大：按格重找切点硬切，切完照样接着排后面的块
        flush();
        let piece = [];
        let acc = 0;
        for (const c of block) {
          if (acc + w(c) > per && piece.length) { pages.push(piece); piece = []; acc = 0; }
          piece.push(c);
          acc += w(c);
        }
        if (piece.length) pages.push(piece);
        continue;
      }
      if (width(cur) + width(block) > per) flush();
      cur = cur.concat(block);
    }
    flush();
    if (!pages.length) return [[]];
    if (fill) {
      // 每页都补齐：字帖的一页就该是一整版格子，
      // 底下留半页白纸看着像没印完
      for (const p of pages) {
        let left = per - width(p);
        while (left > 0) {
          const c = fill();
          const cw = w(c);
          if (cw <= 0) break;
          p.push(c);
          left -= cw;
        }
      }
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

  /* ---------------- 全局设置（跨页面共用一份） ----------------
     姓名、自动生成日期这种「每张纸都要印、但跟哪个页面无关」的东西放这儿，
     不塞进各页的 form：一份存在 zitie:global，改一处全部页脚跟着变。
     用 reactive 包着，设置弹窗里一改，已经挂着的 A4 预览立刻重画。 */
  Z.GLOBAL_DEFAULTS = { name: '', auto_date: 0 };
  // 真正的读写走 store.js 的 schema（导出、导入、恢复默认一并管），
  // 这里只留一个空的 reactive 壳子给它填，页面读到的永远是同一份
  Z.global = Vue.reactive(Object.assign({}, Z.GLOBAL_DEFAULTS));

  // 页脚上印的日期：YYYY-MM-DD，跟导出配置的文件名一个习惯，好认
  Z.today = () => {
    const d = new Date();
    const p = (n) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
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
  /* 精简版（见 static/config.js 的 IS_LITE）：只收常用字的同名分片目录，
     分片号算法不变，所以这里只是「换个目录读」，别处一行都不用改。 */
  const IS_LITE = !!window.IS_LITE;
  Z.IS_LITE = IS_LITE;
  const STROKES_DIR = IS_LITE ? 'static/data/strokes_lite' : 'static/data/strokes';
  const MEDIANS_DIR = IS_LITE ? 'static/data/medians_lite' : 'static/data/medians';

  /* 精简版目录不存在时，页面会「一格一格空着」而不报错 —— 静默失败最难查，
     所以第一次 404 就在控制台点一句，省得对着空白页猜。 */
  let dirWarned = false;
  function warnMissingDir(url) {
    if (dirWarned) return;
    dirWarned = true;
    console.warn(`[字帖] ${url} 没加载到。IS_LITE = ${IS_LITE}，` +
      `请确认对应目录存在，或用 node scripts/lite.js 生成精简版资源。`);
  }

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
      el.src = `${STROKES_DIR}/${no}.js`;
      el.onload = () => resolve();
      el.onerror = () => { warnMissingDir(el.src); resolve(); };
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

  /* ---------------- 笔心线 / 描点数据 ----------------
     空心、虚线这些只要字形轮廓（strokes）就够，但「圆点画」「擦除画」得知道
     这一笔从哪起步、往哪走 —— 那是笔心线（medians）。描点更是要沿笔心线
     一个点一个点摆出来，半径还得取到轮廓的最近距离，一次几千回查询，
     浏览器里现算一个字要小半秒（原站就是因此弹「正在生成圆点数据」）。

     所以这里的数据是离线算好的：同一个字两条记录，一条笔心线、一条描点，
     编码方式跟笔顺一模一样（首点绝对 +128，其余 zigzag 增量，两位 base36）。
     同样按 41 个分片懒加载，且跟笔顺共用一个分片号 —— 只用到实心字的人
     一个字节都不下。见 static/data/medians/。 */
  const mBlobs = new Map();     // 桶号 → [笔心线文本, 描点文本]
  const mIndex = new Map();     // 字 → { no, m: 笔心线起点, d: 描点起点 }
  const mPending = new Map();
  const mDecoded = new Map();   // 字 → { s: [[x,y]...], d: [[x,y,r]...] }

  const lineAt = (blob, at) => {
    if (!at) return '';
    const nl = blob.indexOf('\n', at);
    return blob.slice(at, nl < 0 ? blob.length : nl);
  };

  function indexMedian(no, medBlob, dotBlob) {
    if (mBlobs.has(no)) return;
    mBlobs.set(no, [medBlob || '', dotBlob || '']);
    // 两段各扫一遍，只记每个字在这一段里的起点 —— 终点等取的时候再找换行，
    // 这样索引就是一个字一条，不用在内存里摊开
    [['m', medBlob || ''], ['d', dotBlob || '']].forEach(([k, blob]) => {
      let pos = 0;
      while (pos < blob.length) {
        let nl = blob.indexOf('\n', pos);
        if (nl < 0) nl = blob.length;
        if (nl > pos) {
          const rec = mIndex.get(blob[pos]) || { no };
          rec[k] = pos + 1;
          mIndex.set(blob[pos], rec);
        }
        pos = nl + 1;
      }
    });
  }

  function loadMedian(no) {
    if (mBlobs.has(no)) return Promise.resolve();
    if (mPending.has(no)) return mPending.get(no);
    const p = new Promise((resolve) => {
      const el = document.createElement('script');
      el.src = `${MEDIANS_DIR}/${no}.js`;
      el.onload = () => resolve();
      el.onerror = () => { warnMissingDir(el.src); resolve(); };
      document.head.appendChild(el);
    });
    mPending.set(no, p);
    return p;
  }

  const mUnzig = (v) => (v & 1 ? -((v + 1) >> 1) : v >> 1);

  // 笔心线：一笔一串点，笔与笔之间用 ; 隔开
  function decodeMedians(s) {
    const out = [];
    for (const seg of String(s).split(';')) {
      if (!seg) continue;
      const pts = [];
      let p = 0;
      let prev = null;
      while (p + 3 < seg.length) {
        const ax = B36.indexOf(seg[p]) * 36 + B36.indexOf(seg[p + 1]);
        const ay = B36.indexOf(seg[p + 2]) * 36 + B36.indexOf(seg[p + 3]);
        p += 4;
        if (!prev) prev = [ax - 128, ay - 128];
        else prev = [prev[0] + mUnzig(ax), prev[1] + mUnzig(ay)];
        pts.push(prev);
      }
      if (pts.length) out.push(pts);
    }
    return out;
  }

  // 描点：每点三个数（x / y / r），x、y 是增量，r 直接是值
  function decodeDots(s) {
    const out = [];
    for (const seg of String(s).split(';')) {
      if (!seg) continue;
      const pts = [];
      let p = 0;
      let px = 0;
      let py = 0;
      while (p + 5 < seg.length) {
        px += mUnzig(B36.indexOf(seg[p]) * 36 + B36.indexOf(seg[p + 1]));
        py += mUnzig(B36.indexOf(seg[p + 2]) * 36 + B36.indexOf(seg[p + 3]));
        const r = B36.indexOf(seg[p + 4]) * 36 + B36.indexOf(seg[p + 5]);
        p += 6;
        pts.push([px, py, r]);
      }
      if (pts.length) out.push(pts);
    }
    return out;
  }

  /* 同步取：分片还没到就先返回 null，渲染层靠 medianRev 再补一次。
     跟 strokeFor 一样得记住「问过了」，否则每次重算都 load 一遍、
     load 完 bump 版本号又重算，转成死循环。 */
  Z.medianRev = Vue.reactive({ n: 0 });
  const mAsked = new Set();
  Z.mediansFor = (ch) => {
    if (!ch) return null;
    if (mDecoded.has(ch)) return mDecoded.get(ch);
    const cp = ch.codePointAt(0);
    if (cp < BASE || cp > 0x9fff) return null;
    const rec = mIndex.get(ch);
    if (rec && mBlobs.has(rec.no)) {
      const [med, dot] = mBlobs.get(rec.no);
      const out = { s: decodeMedians(lineAt(med, rec.m)), d: decodeDots(lineAt(dot, rec.d)) };
      mDecoded.set(ch, out);
      return out;
    }
    if (!mAsked.has(ch)) {
      mAsked.add(ch);
      loadMedian(shardOf(ch)).then(() => { Z.medianRev.n++; });
    }
    return null;
  };

  // 分片脚本加载完会调这个，形如 window.ZU_MEDIAN(桶号, `笔心线`, `描点`)
  window.ZU_MEDIAN = indexMedian;

  // 预取：这批字所在的分片先拉回来，别等渲染时一片一片补
  Z.prefetchMedian = (text) => {
    const nos = new Set();
    for (const ch of String(text || '')) {
      const cp = ch.codePointAt(0);
      if (cp >= BASE && cp <= 0x9fff) nos.add(shardOf(ch));
    }
    return Promise.all([...nos].map(loadMedian));
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
    const stack = Z.fontStack(key);
    try { await document.fonts.load(`1000px ${stack}`); } catch {}
    const SIZE = 1000;
    ctx.font = `${SIZE}px ${stack}`;
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
  /* 每款字体都按「它自己的名字」挂进 CSS：name 是界面上显示的名字，
     css 是 font-family 列表，头一个就是 FontFace 注入用的族名。
     所以渲染侧一律走 Z.fontStack(key)，别处不要再写死 kaiti / pinyinok 这种内部键 ——
     列表里第一个是中文/字体本名，后面跟着系统里同名字体，末尾是通用族兜底。
     这样 1MB 的中文字体还没下完时，页面先拿系统那款同名字体顶着，
     选「仿宋」就出仿宋，不会白着一片等下载。 */
  /* 中文字体目录跟着 IS_LITE 走：精简版只有常用字的子集（scripts/lite.js 生成） */
  const ZH_DIR = IS_LITE ? 'static/fonts/zh_lite' : 'static/fonts/zh';
  /* 界面字（.th-glyph、订正行这些 CSS 里写死 '楷体' 的地方）等不到 FontFace 注入，
     所以先在 <head> 里挂一条 @font-face，地址跟着上面的目录走。 */
  (function declareKaiti() {
    const el = document.createElement('style');
    el.textContent = `@font-face { font-family: '楷体'; src: url('${ZH_DIR}/kaiti.woff2') format('woff2'); font-display: swap; }`;
    document.head.appendChild(el);
  })();
  Z.ZH_FONTS = [
    { key: 'kaiti', name: '楷体', css: "'楷体', 'KaiTi', 'STKaiti', serif", url: `${ZH_DIR}/kaiti.woff2`, eager: true },
    { key: 'fangsong', name: '仿宋', css: "'仿宋', 'FangSong', 'STFangsong', '楷体', serif", url: `${ZH_DIR}/fangsong.woff2` },
    { key: 'lishu', name: '隶书', css: "'隶书', 'LiSu', 'STLiti', '楷体', serif", url: `${ZH_DIR}/lishu.woff2` },
    { key: 'xingkai', name: '行楷', css: "'行楷', 'STXingkai', '华文行楷', '楷体', serif", url: `${ZH_DIR}/xingkai.woff2` },
    { key: 'pangzhonghua', name: '庞中华', css: "'庞中华', 'PangZhonghua', '楷体', serif", url: `${ZH_DIR}/pangzhonghua.woff2` },
    { key: 'kaishu', name: '硬笔楷书', css: "'硬笔楷书', 'QXyingbikai', '楷体', serif", url: `${ZH_DIR}/kaishu.woff2` },
  ];
  Z.EN_FONTS = [
    { key: 'shouxieti', name: '手写体', css: "'手写体', 'ShouXieTi', cursive", url: 'static/fonts/en/shouxieti.woff2', eager: true },
    { key: 'segoeprint', name: 'Segoe Print', css: "'Segoe Print', cursive", url: 'static/fonts/en/SegoePrint.woff2' },
    { key: 'blokletterspotlood', name: 'Blokletters', css: "'Blokletters', 'Blokletters Potlood', cursive", url: 'static/fonts/en/BloklettersPotlood.woff2' },
    { key: 'myriadpro', name: 'Myriad Pro', css: "'Myriad Pro', 'Myriad Pro Light SemiExt', sans-serif", url: 'static/fonts/en/MyriadProLightSemiExtIt.woff2' },
  ];
  /* 拼音字体只带小写字母和带调元音，几 KB，索性都预加载 */
  Z.PY_FONTS = [
    { key: 'pinyinok', name: '拼音体', css: "'拼音体', 'GB Pinyinok-B', serif", url: 'static/fonts/pinyin/pinyinok.woff2', eager: true },
    { key: 'pinyin', name: '拼音黑体', css: "'拼音黑体', '拼音', sans-serif", url: 'static/fonts/pinyin/Pinyin.woff2', eager: true },
  ];
  Z.ALL_FONTS = Z.ZH_FONTS.concat(Z.EN_FONTS, Z.PY_FONTS);
  Z.fontOf = (key) => Z.ALL_FONTS.find((f) => f.key === key);
  /* 渲染一律走这个：拿到的是 CSS font-family 列表，不是内部键 */
  Z.fontStack = (key) => {
    const m = Z.fontOf(key);
    return m ? m.css : `${key || 'sans-serif'}, sans-serif`;
  };
  /* FontFace 只认单个族名，取列表第一个、去掉引号 */
  Z.fontFamily = (key) => String(Z.fontStack(key)).split(',')[0].trim().replace(/^['"]|['"]$/g, '');

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
  /* 字体里到底有没有这个字。
     量宽度判不出来：中文字体缺字也是按一个 em 报宽度，跟真有字一模一样。
     所以看图 —— 同一个位置画两遍，一次画这个字、一次画一个「肯定是豆腐块」的
     私用区码位，两次的像素不一样才算真有这个字。
     字体没装完之前一律当作有；量一次缓存一次，metricRev 一变再重算。 */
  const glyphHas = new Map();
  let hasCv = null;
  Z.hasGlyph = (ch, key) => {
    if (!ch) return true;
    const k = (key || 'kaiti') + '|' + ch;
    if (glyphHas.has(k)) return glyphHas.get(k);
    if (typeof document === 'undefined' || !document.fonts) return true;
    const stack = Z.fontStack(key || 'kaiti');
    if (!document.fonts.check(`64px ${stack}`)) return true;
    let ok = true;
    try {
      if (!hasCv) { hasCv = document.createElement('canvas'); hasCv.width = 96; hasCv.height = 80; }
      const ctx = hasCv.getContext('2d', { willReadFrequently: true });
      const shot = (text) => {
        ctx.clearRect(0, 0, hasCv.width, hasCv.height);
        ctx.font = `64px ${stack}`;
        ctx.textBaseline = 'top';
        ctx.fillStyle = '#000';
        ctx.fillText(text, 8, 8);
        return ctx.getImageData(0, 0, hasCv.width, hasCv.height).data;
      };
      const a = shot(ch);
      const b = shot('\ue000');
      let diff = 0;
      for (let i = 3; i < a.length; i += 4) if (Math.abs(a[i] - b[i]) > 24) diff++;
      ok = diff > 8;
    } catch { ok = true; }
    glyphHas.set(k, ok);
    return ok;
  };

  Z.ensureFont = (key) => {
    if (fontLoaded.has(key)) return fontLoaded.get(key);
    const meta = Z.fontOf(key);
    if (!meta || !window.FontFace) return Promise.resolve();
    const done = new FontFace(Z.fontFamily(key), `url(${meta.url})`, { display: 'swap' })
      .load()
      .then((face) => { document.fonts.add(face); })
      .catch(() => {});
    fontLoaded.set(key, done);
    return done;
  };

  /* ---------------- 版式引擎 ----------------
     页面只填参数，这里算出「每页有哪些格子」。A4 净高 262mm 是
     297 - 上下页边距 - 标题栏 - 页脚，格子高度加起来别超过它。 */
  // A4 297 - 上下页边距 10+8 - 标题 13 - 页脚 14 = 252，留 2mm 给边框容差
  // 页脚从 8 加到 14（见 app.css 的 .sheet-ft）：多出来的 6mm 就是格区与
  // 「姓名」横线之间的落笔空间，版心相应少 6mm，纸面照样是满的
  Z.BODY_H = 250;
  Z.PEN_WIDTH = 184; // 控笔页可用宽度，左右各留 13mm 页边距
  Z.PY_H = 7.4; // 拼音行高度，跟 app.css 里的 .cell-py 对齐

  /* 每行格数两档：12 格（常规）/ 13 格（密）。
     纸张 210 宽，左右留 13mm 时版心只有 184 —— 塞 13 格每格 14.15mm，
     比 12 格那档的 15mm 明显瘦，格子看着就「挤扁」了。
     所以 13 档把左右页边距收到 10mm，版心 190，格区取 188：
     188 / 13 = 14.46mm，正好落在 14.2~14.6 这个「跟 12 档差不离」的区间。
     12 档仍是 180 / 12 = 15mm，老版面对齐，不去动它。 */
  Z.COLS_OPTIONS = [
    { v: 12, label: '12 格', tip: '常规密度：格子 15mm，不加减行时一页 17 行（带拼音行 11 行）' },
    { v: 13, label: '13 格', tip: '密排：左右页边距收窄到 10mm，格区 188mm，格子 14.46mm' },
  ];
  // 拼音是整音节塞一格，12 列会把字压到 5mm 以下描不动，所以拼音页单独两档
  Z.PY_COLS_OPTIONS = [
    { v: 8, label: '8 格', tip: '常规密度，一音节一格 22mm' },
    { v: 10, label: '10 格', tip: '密排，一音节一格 17.6mm，长音节（zhuang、ying）会自动缩一点' },
  ];
  Z.colsOf = (cols) => (Number(cols) >= 13 ? 13 : 12);
  /* 格区宽度：12 档沿用原来的 180，13 档把左右页边距从 13mm 收到 10mm，
     版心 184 → 190，格区取 188。188 / 13 = 14.46mm，
     否则 180 / 13 = 13.85mm，比 12 档瘦一圈，格子就「压扁」了。 */
  Z.gridWidthOf = (cols, base) => (Number(cols) >= 13 ? 188 : base || 180);
  Z.padXOf = (cols) => (Number(cols) >= 13 ? 10 : 13);

  /* 一页能放几行、格子多高。
     先把行数取整，再把余量平摊回格子 —— 否则页面底部会空出一条白边，
     打印出来就是「上面挤、下面空」。 */
  Z.gridFor = (cols, baseCellH, pinyin, reserve, gapMm) => {
    // reserve：订正格那种「每页固定留一行」占掉的毫米数，从版心里扣掉再排行数
    // gapMm：拼音行（笔顺条则是字头行）的高度，给了就按它算，不给还是老规矩
    const bodyH = Z.BODY_H - (reserve || 0);
    const gap = gapMm == null ? (pinyin ? Z.PY_H : 0) : gapMm;
    const unit = baseCellH + gap;
    const rows = Math.max(1, Math.floor((bodyH + 0.3) / unit));
    // 每行 1px 边框约 0.26mm，算进去
    const cellH = (bodyH - rows * 0.3) / rows - gap;
    return { cols, rows, cellH: Math.round(Math.min(baseCellH * 1.15, cellH) * 100) / 100, perPage: cols * rows };
  };

  /* 汉字字帖的「挤一挤」：一个字的练习块整块搬，不许切页。
     版心放得下 11 行，一块却占 3 行 —— 11 = 3 × 3 + 2，剩下那 2 行谁都不够，
     只能空着印白纸。用户说的「明明还有地方」「再加一个字就好了」，就是这 2 行。

     那就让每行矮一点，把第 12 行挤出来。两个来源：
       1) 格子头上那条提示行（拼音行 / 笔顺条字头）：7.4mm 里拼音只占 4.3mm，
          押到 6mm 就省出 1.4mm，格子一寸没动；
       2) 还不够就让格子等比缩小 —— 注意是「等比」：高度和列宽一起缩，
          格子仍是正方形。只缩高度会压成扁格，比留白更难看。
     缩的上限是 8%（15 → 13.8，仍比 13 格档里那个 14.46 的高度差不离），
     提示行下限 6mm。再往下压当然更省纸，但描字的手感就没了。

     只认页数真能变少的那档；挤到底还是那么多页，就原样退回默认，一行都不白改。
     描字、笔顺、笔顺条走的是同一套：区别只在每行摊到多少「提示行」高度。 */
  Z.CELL_KEEP = 0.92;
  Z.HINT_MIN = 6;
  Z.fitHanziGrid = (blocks, cols, opt, weight) => {
    /* gap：每行摊到的提示行高度（拼音行 / 笔顺条字头），没有就 0
       reserve：订正格那种每页固定占掉的高度 */
    const { gap: gap0, reserve } = opt;
    const bodyH = Z.BODY_H - (reserve || 0);
    const def = { ...Z.gridFor(cols, 15, false, reserve, gap0), gap: gap0 };
    const pagesOf = (g) => Z.paginateBlocks(blocks, g.perPage, null, weight).length;
    const defPages = pagesOf(def);
    // 一页就装得下，没什么可挤的
    if (defPages <= 1) return def;

    const r2 = (v) => Math.round(v * 100) / 100;
    const cellFloor = r2(15 * Z.CELL_KEEP);
    // 提示行压到 Z.HINT_MIN 就到底，再不够才动格子
    const floorOf = (v) => Math.min(v, Z.HINT_MIN);
    for (let rows = def.rows + 1; rows <= def.rows + 6; rows++) {
      // 每行能有多少高度（扣掉每行 1px 边框那 0.3mm）
      const unit = (bodyH - rows * 0.3) / rows;
      // 先让格子吃 15mm（或者它本来就有的高度），富余给提示行；
      // 提示行压到底还不够才动格子
      const h = r2(Math.min(15, def.cellH, unit - floorOf(gap0)));
      if (h < cellFloor) break;
      const gap = gap0 ? r2(Math.min(gap0, Math.max(floorOf(gap0), unit - h))) : 0;
      const g = { cols, rows, cellH: h, gap, perPage: cols * rows };
      if (pagesOf(g) < defPages) {
        /* 格子等比缩：高度缩了几成，列宽也按同样的比例缩，方格还是方格 ——
           只缩高度会压成扁格，比留白更难看。
           但列宽不再超过原版心摊出来的那份：13 格档本来就瘦（14.46），
           再按比例缩就掉到 14 以下了，宁可让它比高度宽 0.07mm。 */
        const baseW = Z.gridWidthOf(cols) / cols;
        return { ...g, colW: r2(Math.min(h, baseW)) };
      }
    }
    return def;
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

  /* 描字类型：两条完全不同的实现路子，按「有没有轮廓数据」分。
     数字一直是矢量字形（轮廓 + 笔心线），全套都能做；
     汉字/词语文章走字体整字，只能靠 SVG 的 stroke 描边 —— 细节见 ui.js 的 ZGlyph。

     数值是给老存档留的：1~4 沿用原来的实心/空心/细虚线/圆点，5 往后是新加的。
     编号顺序基本照原站那个下拉框，认起来不费劲。 */
  Z.TRACE_OPTIONS = [
    { v: 1, label: '实心' },
    { v: 2, label: '空心' },
    { v: 8, label: '空心虚线', tip: '空心字但轮廓是虚线，比纯空心少一点压迫感' },
    { v: 3, label: '细虚线' },
    { v: 9, label: '细虚线·密', tip: '同一条虚线，段落更密，远看接近实线' },
    { v: 5, label: '细实线', tip: '只描轮廓不填色，笔画细，适合钢笔临摹' },
    { v: 6, label: '点虚线', tip: '一串短点，提示笔画的走向' },
    { v: 10, label: '填充虚线', tip: '轮廓投到笔心线上：先铺一条淡色带，再压虚线，字有肉感' },
    { v: 4, label: '圆点' },
    { v: 7, label: '擦除画', tip: '笔画被挖成白线。本质是把笔心线从字里剃掉' },
    { v: 11, label: '浅底擦除', tip: '擦除画 + 一层很淡的轮廓底，看得见字形但笔迹是白的' },
  ];
  Z.TRACE_KEYS = ['solid', 'hollow', 'hollowDash', 'dash', 'dashDense', 'line', 'dotLine', 'fillDash', 'dot', 'erase', 'eraseFaint'];
  // 1 实心 / 2 空心 / 3 细虚线 / 4 圆点 / 5 细实线 / 6 点虚线 / 7 擦除画 / 8 空心虚线 / 9 细虚线·密 / 10 填充虚线 / 11 浅底擦除
  const TRACE_MAP = {
    1: 'solid', 2: 'hollow', 3: 'dash', 4: 'dot',
    5: 'line', 6: 'dotLine', 7: 'erase', 8: 'hollowDash',
    9: 'dashDense', 10: 'fillDash', 11: 'eraseFaint',
  };
  /* 接受的可能是数字（表单里的值）也可能是 key 串（doc.trace 已经转过一次），
     两样都认 —— 页面把选项原样传下来，中间少写一次转换就少一处错。 */
  Z.traceOf = (v) => (typeof v === 'string' && Z.TRACE_KEYS.includes(v) ? v : TRACE_MAP[Number(v)] || 'solid');
  // 这几档要笔心线（笔画从哪走），只有矢量字形才拿得到
  Z.TRACE_NEEDS_MEDIAN = ['dotLine', 'fillDash', 'dot', 'erase', 'eraseFaint'];
  // 这几档字体整字那条路做不出来（CSS 描不了字形轮廓，也就挖不出笔心线）
  Z.TRACE_VECTOR_ONLY = ['fillDash', 'erase', 'eraseFaint'];
  Z.traceNeedsMedian = (key) => Z.TRACE_NEEDS_MEDIAN.includes(key);
  // 字体整字那条路：做不了的档位直接落回细虚线，别让版面空着
  Z.fontTraceOf = (v) => {
    const k = Z.traceOf(v);
    return Z.TRACE_VECTOR_ONLY.includes(k) ? 'dash' : k;
  };
  Z.traceVectorOnly = (key) => Z.TRACE_VECTOR_ONLY.includes(key);

  /* 四线三格（英文、拼音）能给的档位，五档一个不少：
     实心、空心、空心虚线、细虚线、圆点。
     「空心虚线」留着，只是效果换成最早那版细虚线（细线描轮廓的虚线，
     本来就是空心的样子）；老的那套粗虚线参数删掉，给重写后的细虚线用。
     细实线跟空心差不太多，细虚线·密在这么小的字上会碎成一团墨点，
     填充虚线、擦除画要笔心线 —— 都不给，宁缺毋滥。 */
  const EN_TRACES = ['solid', 'hollow', 'hollowDash', 'dash', 'dot'];
  Z.EN_TRACE_OPTIONS = Z.TRACE_OPTIONS.filter((o) => EN_TRACES.includes(Z.traceOf(o.v)));
  // 字体整字那条路（汉字描字帖、词语文章）能给的档位：描边那一类都行
  Z.FONT_TRACE_OPTIONS = Z.TRACE_OPTIONS.filter((o) => !Z.TRACE_VECTOR_ONLY.includes(Z.traceOf(o.v)));

  /* 每一档描字到底怎么画。原站那套试得很透了，参数照搬，只换算量纲：
     它的格子基准是 670px，我们的字形是 1024 方格，乘 1.528。

     两条实现路子，差别只有一句：
     **字形轮廓能描边，但轮廓里没有「笔从哪走」这件事 —— 那得靠笔心线。**
       轮廓路线（stroke/dash）：描 <text> 或 <path> 的边缘。空心、空心虚线走这条。
       笔心线路线（mw/mdash）：沿笔心线画一条宽线。细虚线、细实线、点虚线、
         填充虚线、擦除画全在这条上 —— 100~200 宽的带子铺满整笔，
         再把轮廓当裁切区，出去的剪掉，剩下的就是一道笔迹。

     字段（stroke/mw 是两套路子的宽度，同一档两边都要各自的值）：
       fill     整字填色
       stroke   轮廓描边宽度（矢量字形那条路）
       dash/cap 轮廓那条线的节奏与线头
       mw       笔心线带子宽度、mdash 带子的虚线节奏
       clip     拿字形轮廓当裁切区
       paper    用纸色画 —— 那就是「擦除」
       faint    先铺一层淡轮廓底再擦（数值就是那层底的不透明度）
       f*       字体整字那条路用的近似值（那边只能描边，量纲也不同） */
  Z.TRACE_SPEC = {
    solid:      { fill: true },
    hollow:     { stroke: 15, fstroke: 22 },
    hollowDash: { stroke: 15, dash: '61 61', fstroke: 22, fdash: '52 48' },
    line:       { mw: 38, fstroke: 9 },
    dash:       { mw: 38, mdash: '46 46', fstroke: 12, fdash: '44 32' },
    dashDense:  { mw: 38, mdash: '76 92', fstroke: 12, fdash: '18 12' },
    // 点虚线：笔心线上摆一串等径小点（round 线头 + 零长线段）。
    // 与「圆点」不同：这里的点大小一致，圆点那档的半径跟着笔画肥瘦走
    dotLine:    { mw: 38, mdash: '0 107', mcap: 'round', fstroke: 16, fdash: '0 64', fcap: 'round' },
    // 圆点：矢量字形摆离线算好的圆（半径跟着笔画肥瘦走）；
    // 字体整字没这份数据，拿 dasharray 0 + 圆头摆一串等径点顶着
    dot:        { dots: true, fstroke: 17, fdash: '0 46', fcap: 'round' },
    fillDash:   { mw: 191, mdash: '31 46', clip: true },
    /* 擦除画：沿笔心线挖一条细白槽穿进笔画里，字剩下两侧的边 ——
       练的是「笔尖该走哪条道」，跟空心字那种「看清轮廓」是两个目的。
       白槽不能开太宽，宽过笔画就把整笔吃掉了 —— 常笔画也就 70~90 单位，
       取 34 刚好在中间开一道槽，两侧各剩一条能看清的边。
       纸是纯白的，白槽本身不显形，所以底下垫一层淡轮廓当底 ——
       擦除画垫得实一点，浅底擦除只垫个引子。 */
    erase:      { faint: 0.85, mw: 34, clip: true, paper: true },
    eraseFaint: { faint: 0.3, mw: 34, clip: true, paper: true },

  };
  /* 四线三格（英文 / 拼音）那一套的描边值。
     那儿的字号是 mm、字形是「文字」，跟 1024 方格不是一套量纲，
     所以按「字号的百分比」给，换字体、换格高都跟着缩放。
     四线三格的行高本来就小（2~3mm 的字），描边超过字高 1/10 就糊成一团。 */
  Z.TRACE_EM = {
    /* 空心要的是一圈看得清的轮廓，按字号的 2%~5% 给；全是按字号的比例给，
       换字体、调格高都跟着缩放。

       空心虚线：档位留着，效果换成最早那版细虚线 —— 1.4% 的细线描轮廓、
       0.07/0.045 的短划，本来就是「空心的虚线」该有的样子。
       老的那套粗虚线（4.8% / 0.13/0.09）从这里删掉，挪给重写的细虚线。

       细虚线：一串看得清的圆点，不再是几乎连成实线的细点阵。
       点在字形的路径上排（零长划 + 圆头），再拿实心字形当裁切区
       把两圈轮廓上的点并成一串、裁掉溢出部分 —— 字里有断续的点，
       没有空心框。w 是点径、gap 是点距，都按字号比例给；
       点距比点径大不少，屏幕预览里也分得开一颗颗点（0.3mm 级的小点
       在 96dpi 下只有 1 像素，会糊成一片淡实线，别再往回收）。
       和「圆点」档的区别：那边是沿轮廓的小点（两圈分明、有心）。

       汉字字帖 / 数字字帖走 TRACE_SPEC，不受影响；圆点档本身不动。 */
    hollow:     { w: 0.048 },
    hollowDash: { w: 0.014, dash: [0.07, 0.045] },
    line:       { w: 0.024 },
    dash:       { dots: true, w: 0.05, gap: 0.09 },
    dashDense:  { w: 0.03, dash: [0.06, 0.05] },
    dotLine:    { w: 0.042, dash: [0, 0.16], cap: 'round' },
    dot:        { w: 0.02, dash: [0, 0.055], cap: 'round' },
  };
  // 做不了的那几档（要笔心线）落到细虚线，返回 null 表示「这里没有描边」
  Z.traceEm = (key) => Z.TRACE_EM[key] || (Z.traceVectorOnly(key) ? Z.TRACE_EM.dash : null);

  // 示范格永远实心 —— 描字类型只改后面那些淡色的练习格
  Z.traceSpec = (key) => Z.TRACE_SPEC[key] || Z.TRACE_SPEC.solid;

  // 笔心线画成一条折线路径，给 <path d> 用
  Z.polyPath = (pts) => {
    if (!pts || !pts.length) return '';
    let d = `M ${pts[0][0]} ${pts[0][1]}`;
    for (let i = 1; i < pts.length; i++) d += ` L ${pts[i][0]} ${pts[i][1]}`;
    return d;
  };

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

  /* 页脚：0 不要 / 1 姓名日期 / 2 姓名班级日期 / 3 姓名 / 4 日期
     1、2 是老存档里的编号，不能动 —— 换了号老用户一进页面页脚就错了。
     新增的「只要姓名」「只要日期」排在后面，用 3、4。
     列表按「不要 → 姓名 → 日期 → 两个都要 → 加上班级」排，读起来顺。 */
  Z.FOOT_OPTIONS = [
    { v: 0, label: '不要' },
    { v: 3, label: '姓名' },
    { v: 4, label: '日期' },
    { v: 1, label: '姓名日期' },
    { v: 2, label: '姓名班级日期' },
  ];
  // 姓名、日期取全局设置里那份：填了姓名就印出来，开了自动日期就印今天。
  // 没填的仍是一条留白横线，打印出来手写 —— 交作业两种用法都有人要。
  Z.footOf = (v) => {
    const n = Number(v) || 0;
    if (!n || !Z.FOOT_OPTIONS.some((o) => o.v === n)) return null;
    const name = String(Z.global.name || '').trim();
    const date = Number(Z.global.auto_date) ? Z.today() : '';
    return {
      name: n === 1 || n === 2 || n === 3,
      cls: n === 2,
      date: n === 1 || n === 2 || n === 4,
      nameText: name,
      dateText: date,
    };
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
     font_type: 1 描字 / 2 笔顺 / 3 笔顺条
     1、2：每个字一块，头格（深色示范）+ 描字行 + 空白行，补齐整行
     3：每块先来一条跨整行的字头（整字 + 拼音 + 笔顺小图串），
        下面才是整行的描红 —— 作业本上那种「示范一行、练字一行」的排法

     render 决定字形怎么画：描字用 text（字体整字，选哪款就是哪款），
     笔顺用 stroke（笔画轮廓，只有它能逐笔拆）。 */
  Z.genHanzi = (form) => {
    const chars = Z.chars(form.content);
    if (!chars.length) return null;
    const cols = Z.colsOf(form.cols);
    const fontType = Number(form.font_type);
    // 笔顺条把拼音挪进字头行里，格子里就不再单独留拼音行了
    const strip = fontType === 3;
    const pinyin = !strip && !!form.pinyin;
    const fixH = Z.fixH(form.fix);
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
    // 页尾补齐的行也要占一条提示行，不然比带拼音行的格式矮一截、纸底露白
    const pad = () => ({ ...blank(), pad: true });
    const blocks = [];
    // 填了模式就按模式逐行排，没填才用「几行描 + 几行空」。
    // 笔顺帖一格里是一笔，模式那种「一行整字」跟它不是一个东西，不掺和。
    const pattern = fontType === 2 ? [] : Z.parseRowPattern(form.row_pattern);
    /* 三种格式共用一套分页模型：一行 = 格子 + 头顶一条提示行。
       描字/笔顺的提示行是每格都有的拼音行（7.4mm）；笔顺条的提示行是
       「一个字一条」的跨整行字头，把它摊到这个字的几行格子上，每行摊
       7.4 / 行数 —— 跟拼音行一样进 gridFor 算每页行数、一样参与挤版。
       字头条本身不占格数（weight 0），块宽就是 行数 × cols，全是整数，
       于是按整行分页、按格补齐，跟另外两种格式走完全同一条路。 */
    const rowsPerBlock = strip ? (pattern.length || fillRow + blankRow || 1) : 0;
    const gap = strip ? Z.PY_H / rowsPerBlock : (pinyin ? Z.PY_H : 0);
    const weight = (c) => (c.kind === 'headbar' ? 0 : 1);

    // 笔顺条的描红行：一行一行的整字，第一行第一格深色示范（跟别的格式一个规矩）
    const stripRows = (block, ch) => {
      const rows = pattern.length ? pattern : null;
      if (rows) {
        const headRow = rows.indexOf('t');
        rows.forEach((t, r) => {
          for (let c = 0; c < cols; c++) {
            if (t === 'b') block.push(blank());
            else block.push(cellCh(ch, '', t === 't' && r === headRow && c === 0));
          }
        });
        return;
      }
      // 一描一空都不给时也留一行描红：否则整块只剩字头，分页会把它当成 0 宽
      if (!fillRow && !blankRow) {
        for (let c = 0; c < cols; c++) block.push(cellCh(ch, '', c === 0));
        return;
      }
      for (let r = 0; r < fillRow; r++) {
        for (let c = 0; c < cols; c++) block.push(cellCh(ch, '', r === 0 && c === 0));
      }
      for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
    };

    for (const ch of chars) {
      const py = pyOf.get(ch) || '';
      const block = [];
      if (strip) {
        // 字头：整字 + 拼音 + 笔顺小图串，跨整行占一格；
        // 拼音跟着「有没有拼音」这个开关走，关了就只留字和笔顺
        block.push({ kind: 'headbar', ch, py: form.pinyin ? py : '', head: true });
        stripRows(block, ch);
        blocks.push(block);
        continue;
      }
      if (fontType === 2) {
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

    /* 块排好了才轮到版心：默认 15mm 格子 + 每行摊到的提示行，
       页尾差一行时挤一挤把下一块挪上来（见 Z.fitHanziGrid）。 */
    const grid = Z.fitHanziGrid(blocks, cols, { gap, reserve: fixH }, weight);
    const { cellH, perPage } = grid;
    // 挤过之后提示行可能矮了一点；字头条把摊出去的几行高度收回来
    const pyH = pinyin ? grid.gap : Z.PY_H;
    const barH = strip ? Math.round(grid.gap * rowsPerBlock * 100) / 100 : 0;
    // 格子等比缩过的话，版心宽度也跟着缩，方格才不会变成扁格
    const gridWidth = grid.colW ? Math.round(grid.colW * cols * 100) / 100 : Z.gridWidthOf(cols);

    return {
      doc: {
        kind: 'cn', title: form.title, cols, cellH, pinyin, pyH,
        pyStyle: Z.pyStyleOf(form.py_style),
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        fontCss: form.font_key || 'kaiti',
        render: fontType === 2 ? 'stroke' : 'text',
        /* 笔顺帖画的是笔画轮廓 + 笔心线，十一档全支持；
           描字帖、笔顺条走字体整字，只有描边那一类做得了，其余落回细虚线 */
        trace: fontType === 2 ? Z.traceOf(form.trace) : Z.fontTraceOf(form.trace),
        foot: Z.footOf(form.foot), fixH,
        gridWidth, padX: Z.padXOf(cols),
        /* 笔顺条字头行的高度：每行提示高度 × 这个字占几行，挤过版会一起变矮 */
        barH,
        /* 补齐行也要占一条提示行：跟带拼音行的格式一样把整页铺满 */
        padHint: strip ? Math.round(grid.gap * 100) / 100 : 0,
      },
      pages: Z.paginateBlocks(blocks, perPage, pad, weight),
    };
  };

  /* 拼音字帖
     type 1 声母 / 2 韵母 / 3 整体认读 / 4 汉字注音 */
  const SHENGMU = ['b', 'p', 'm', 'f', 'd', 't', 'n', 'l', 'g', 'k', 'h', 'j', 'q', 'x', 'zh', 'ch', 'sh', 'r', 'z', 'c', 's', 'y', 'w'];
  const YUNMU = ['a', 'o', 'e', 'i', 'u', 'ü', 'ai', 'ei', 'ui', 'ao', 'ou', 'iu', 'ie', 'üe', 'er', 'an', 'en', 'in', 'un', 'ün', 'ang', 'eng', 'ing', 'ong'];
  const ZHENGTI = ['zhi', 'chi', 'shi', 'ri', 'zi', 'ci', 'si', 'yi', 'wu', 'yu', 'ye', 'yue', 'yuan', 'yin', 'yun', 'ying'];
  Z.PINYIN_SETS = { 1: SHENGMU, 2: YUNMU, 3: ZHENGTI };

  Z.genPinyin = (form) => {
    const cols = Z.clamp(form.cols || 8, 6, 10) >= 10 ? 10 : 8;
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
        fontCss, gridWidth, padX: Z.padXOf(cols),
        // 拼音也是 <text>，能描边；笔心线那几档做不了，落到 solid
        trace: Z.fontTraceOf(form.trace),
        foot: Z.footOf(form.foot),
        glyph: Z.enLayout(fontCss, gridWidth / cols, cellH),
      },
      pages: Z.paginateBlocks(blocks, perPage, () => ({ word: '', head: false, py: true })),
    };
  };

  /* 英文字帖
     type 'alphabet' 字母表 / 'word' 单词 */
  Z.genEnglish = (form) => {
    const fontCss = form.font_key || 'shouxieti';
    const blank = () => ({ word: '', head: false });
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    const blocks = [];
    const words = form.type === 'word'
      ? String(form.content || '').split(/[\s,，|]+/).filter(Boolean)
      : [];
    if (form.type === 'word' && !words.length) return null;

    /* 列数按最长的那个词反算，不再一律 5 列。
       四线三格的字号只由格高决定（见 Z.enLayout），格宽只负责「放不放得下」：
       老版固定 5 列，每格 35mm，可一个 Aa 才 8mm 宽，右边空掉四分之三 ——
       这就是「英文格为什么这么宽」的答案。那份余量本来是给长单词留的，
       字母表用不上，短词也用不上。

       现在每格宽度 = 最长的词占的宽 + 2.4mm 呼吸位，夹在 15mm（跟汉字格同宽）
       到 35mm（原来那档）之间；列数按它反算，余量再平摊回格子，整行铺满。
       词太长（congratulation）时格子撑到上限，剩下的交给 ZCellEn 里那个
       「长词自己缩字号」的兜底 —— 总不能为了一个词把整页列数砍到 2。 */
    const probeH = Z.gridFor(12, 9, false).cellH; // 格高与列数无关，先探一次
    const size = Z.enLayout(fontCss, 0, probeH).size;
    const widest = words.reduce((a, b) => (Z.textEm(b, fontCss) > Z.textEm(a, fontCss) ? b : a), '');
    const wantW = Z.clamp(Z.textEm(widest, fontCss) * size + 2.4, 15, 35);
    const cols = words.length ? Z.clamp(Math.floor(Z.gridWidthOf(12) / wantW), 3, 12) : 12;
    const gridWidth = Z.gridWidthOf(12);
    const grid = Z.gridFor(cols, 9, false);
    const { cellH, perPage } = grid;

    if (form.type === 'word') {
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
        fontCss, gridWidth, padX: Z.padXOf(12),
        trace: Z.fontTraceOf(form.trace),
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

  /* ---------------- 数字 ---------------- */
  /* 数字不是字体，是矢量字形。
     原站的数字模板把「专用数字 / 字母数字专用」两套字形按
     strokes（轮廓）+ medians（运笔线）存成数据，服务端 myfont 接口原样吐出来 ——
     跟汉字的笔顺数据同一种存法，所以能描红、能空心、能描点。
     下载过来的字体文件是有的（/font/…），但那只够填色；逐笔描点必须靠轮廓数据。

     描点（圆点画）的做法：沿每笔的运笔线按步长取点，取点半径 = 该点到
     本笔轮廓的最近距离 —— 也就是说点的粗细跟着笔画的肥瘦走，横细竖粗。
     原站是运行时拿 SVG 的 getTotalLength/getPointAtLength 现算的，
     一个字几千次点查询，所以它每次切到「圆点画」都要弹「正在生成圆点数据」。
     我们离线算好放进 data/num.js（算法就是下面注释里那套，一字不差），
     打开即用，零等待。 */
  Z.NUM_FONTS = [
    { key: 'plain', name: '专用数字' },
    { key: 'alpha', name: '字母数字专用' },
  ];
  Z.numFontOf = (key) => (Z.NUM_FONTS.some((f) => f.key === key) ? key : 'plain');

  // 一套字形共用一个包络框：同一个字号下，1 和 8 的笔画粗细才对得上，
  // 每个字各按自己的包围盒缩放，1 就会被撑成跟 8 一样宽。
  Z.numMeta = (key) => {
    const all = window.ZU_DIGITS || {};
    const set = all[Z.numFontOf(key)];
    if (!set) return { box: [-100, -220, 510, 990], glyphs: {} };
    return set;
  };
  Z.numGlyph = (key, ch) => {
    const meta = Z.numMeta(key);
    return meta.glyphs[ch] || null;
  };

  /* 数字字帖
     每格一个数字：头格深色示范，后面几格描（实心 / 空心 / 细虚线 / 圆点）。
     圆点这一档就是原站那个「描点」—— 一串点勾出运笔线，孩子顺着点画。 */
  Z.genNumber = (form) => {
    const digits = String(form.content || '').replace(/[^0-9]/g, '').split('');
    if (!digits.length) return null;
    const cols = Z.colsOf(form.cols);
    const fixH = Z.fixH(form.fix);
    const grid = Z.gridFor(cols, 15, false, fixH);
    const { cellH, perPage } = grid;
    // 「每字格数」含示范格那一格：填 12 就是一个数字占一整行
    const span = Z.clamp(form.repeat_times || cols, 1, 60);
    const blankRow = Z.clamp(form.blank_row, 0, 5);
    const blank = () => ({ ch: '', head: false });
    const blocks = [];

    for (const ch of digits) {
      const block = [];
      for (let i = 0; i < span; i++) block.push({ ch, head: i === 0 });
      padToRow(block, cols, blank);
      for (let r = 0; r < blankRow; r++) for (let c = 0; c < cols; c++) block.push(blank());
      blocks.push(block);
    }

    return {
      doc: {
        kind: 'num', title: form.title, cols, cellH,
        numFont: Z.numFontOf(form.num_font),
        guide: form.guide || 'tian', line: form.border_color, ink: form.font_color,
        // 描点不是描边：那是沿笔画摆一串点，跟空心/虚线是两回事
        trace: Z.traceOf(form.trace),
        foot: Z.footOf(form.foot), fixH,
        gridWidth: Z.gridWidthOf(cols), padX: Z.padXOf(cols),
      },
      pages: Z.paginateBlocks(blocks, perPage, () => blank()),
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
    // 文章页要窄列才好「一句一行」，所以 8/10 也留着，不像别的页只给 12/13
    const cols = [8, 10, 12, 13].includes(Number(form.cols)) ? Number(form.cols) : 12;
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
        trace: Z.fontTraceOf(form.trace),
        foot: Z.footOf(form.foot), fixH,
        gridWidth: Z.gridWidthOf(cols), padX: Z.padXOf(cols),
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
    const cols = Z.colsOf(form.cols);
    const gridWidth = Z.gridWidthOf(cols);
    if (guide === 'en') {
      const grid = Z.gridFor(cols, 9, false);
      const { cellH, perPage } = grid;
      const page = Array.from({ length: perPage }, () => ({ word: '', head: false }));
      return {
        doc: {
          kind: 'en', title: form.title, cols, cellH, pinyin: false, guide: 'en',
          line: form.border_color, ink: form.font_color, fontCss: 'shouxieti', gridWidth,
          padX: Z.padXOf(cols), foot: Z.footOf(form.foot),
          // 空白纸虽然不写字，四条线也照同一个公式摆，写上去跟真字帖对得上
          glyph: Z.enLayout('shouxieti', gridWidth / cols, cellH),
        },
        pages: Array.from({ length: num }, () => page),
      };
    }
    const pinyin = !!form.pinyin;
    const grid = Z.gridFor(cols, 15, pinyin);
    const { cellH, perPage } = grid;
    const page = Array.from({ length: perPage }, () => ({ ch: '', py: '', head: false }));
    return {
      doc: { kind: 'cn', title: form.title, cols, cellH, pinyin, pyH: Z.PY_H,
        pyStyle: Z.pyStyleOf(form.py_style), guide,
        line: form.border_color, ink: form.font_color, fontCss: 'kaiti', render: 'text',
        foot: Z.footOf(form.foot), gridWidth, padX: Z.padXOf(cols) },
      pages: Array.from({ length: num }, () => page),
    };
  };
})();
