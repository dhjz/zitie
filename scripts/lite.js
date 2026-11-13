#!/usr/bin/env node
/* 生成「精简版」静态资源：只保留常用字的笔顺 / 笔心线与中文字体子集。
 *
 *   cd scripts && npm install      # 首次装依赖（fontmin、wawoff2）
 *   node lite.js                   # 生成
 *   node lite.js --check           # 只核对覆盖率，不写文件
 *
 * 产物（index.html 的 IS_LITE 打开后，前端就读这几个目录）：
 *   static/data/strokes_lite/<分片号>.js
 *   static/data/medians_lite/<分片号>.js
 *   static/fonts/zh_lite/<字体>.woff2
 *
 * 分片号与源文件一一对应（同一个字永远在同一个分片），所以前端只换目录、
 * 不换算法：shardOf(ch) 算出来的号在两边是同一个。
 *
 * 字表＝ scripts/common-chars.txt（现代汉语常用字 3500）
 *      ＋ 内置素材（素材合集、课文生字表）里出现的字
 *      ＋ ASCII / 标点 / 拼音带调字母（字帖里的拼音行、编号要用）
 * 之所以要把内置素材并进来：默认内容「永和九年岁在癸丑」里的「癸」就不在 3500 里，
 * 只留 3500 的话，一打开汉字页就是空白格。
 */
const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const STATIC = path.join(ROOT, 'static');
const CHECK_ONLY = process.argv.includes('--check');

/* ---------------- 字表 ---------------- */
const HAN = /[\u4e00-\u9fa5]/g;

function readCommonChars() {
  const file = path.join(__dirname, 'common-chars.txt');
  const text = fs.readFileSync(file, 'utf8');
  return new Set(text.match(HAN) || []);
}

// 内置素材是普通 js 赋值，直接在沙箱里跑一遍取出所有汉字
function readMaterialChars() {
  const out = new Set();
  const window = {};
  const walk = (v) => {
    if (typeof v === 'string') { (v.match(HAN) || []).forEach((c) => out.add(c)); return; }
    if (v && typeof v === 'object') Object.values(v).forEach(walk);
  };
  for (const name of ['collections.js', 'lessons.js']) {
    const file = path.join(STATIC, 'data', name);
    if (!fs.existsSync(file)) continue;
    const src = fs.readFileSync(file, 'utf8');
    new Function('window', src)(window);
  }
  walk(window);
  return out;
}

// 字体子集里额外要塞的东西：界面上写死的中文、ASCII、全角标点、拼音带调字母
const EXTRA =
  '永和九年岁在癸丑春眠不觉晓处闻啼鸟天地人你我他大小中国文字' +
  '订正姓名日期年级班级第页共描红临写笔顺字帖空行' +
  '0123456789' +
  'abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ' +
  'āáǎàēéěèīíǐìōóǒòūúǔùǖǘǚǜńü' +
  '，。、；：！？「」『』（）《》〈〉—…·～';
const CH = (s) => String(s).match(/[\u4e00-\u9fa5]/g) || [];

/* ---------------- 笔顺 / 笔心线：按行过滤 ----------------
   源文件形如 window.ZU_SHARD(3,`…多行…`);
   每行一条记录，行首那个字就是这条记录的字。整行搬走，编码一个字节都不动。 */
function parseBlobs(file, fnName) {
  const src = fs.readFileSync(file, 'utf8');
  const head = `window.${fnName}(`;
  const at = src.indexOf(head);
  if (at < 0) throw new Error(`${file} 不是 ${fnName} 格式`);
  const close = src.lastIndexOf(');');
  // 只挑反引号包住的那几段（笔顺一段，笔心线两段），其余原样留着
  const raw = src.slice(at + head.length, close);
  const blobs = [];
  let i = 0;
  while (i < raw.length) {
    const q = raw.indexOf('`', i);
    if (q < 0) break;
    const q2 = raw.indexOf('`', q + 1);
    blobs.push({ from: q + 1, to: q2, value: raw.slice(q + 1, q2) });
    i = q2 + 1;
  }
  return { src, raw, blobs, head, close };
}

function buildShards(srcDir, dstDir, fnName, keep) {
  const written = [];
  let bytes = 0;
  fs.mkdirSync(dstDir, { recursive: true });
  for (const name of fs.readdirSync(srcDir).filter((f) => f.endsWith('.js'))) {
    const { src, raw, blobs, head, close } = parseBlobs(path.join(srcDir, name), fnName);
    let out = '';
    let prev = 0;
    let kept = 0;
    for (const b of blobs) {
      const lines = b.value.split('\n').filter((line) => {
        if (!line) return false;
        return keep.has(line[0]);
      });
      kept += lines.length;
      out += raw.slice(prev, b.from) + lines.join('\n');
      prev = b.to;
    }
    out += raw.slice(prev);
    if (!kept) continue;                        // 整片都不常用，这个文件不必留
    const text = head + out + src.slice(close);
    if (!CHECK_ONLY) fs.writeFileSync(path.join(dstDir, name), text);
    written.push(name);
    bytes += Buffer.byteLength(text);
  }
  return { files: written, bytes };
}

/* ---------------- 字体子集 ----------------
   fontmin 的 glyph 插件吃 ttf 不吃 woff2，所以先用 wawoff2 解开，
   取完子集再用 ttf2woff2 压回去 —— 转出来的 woff2 浏览器认。 */
async function buildFonts(keep) {
  let fontmin;
  let wawoff2;
  try {
    fontmin = require('fontmin');
    wawoff2 = require('wawoff2');
  } catch (e) {
    console.error('缺少依赖，先在 scripts/ 目录跑一次 npm install（fontmin、wawoff2）');
    throw e;
  }
  const srcDir = path.join(STATIC, 'fonts', 'zh');
  const dstDir = path.join(STATIC, 'fonts', 'zh_lite');
  fs.mkdirSync(dstDir, { recursive: true });

  // 除了汉字，ASCII、标点、拼音带调字母也一并塞进去：字帖页脚、拼音行、
  // 订正格用的都是中文字体画出来的。字体本身没画的码位 fontmin 会跳过。
  const text = [...keep].join('') + EXTRA;
  const out = [];
  for (const name of fs.readdirSync(srcDir).filter((f) => f.endsWith('.woff2'))) {
    const src = fs.readFileSync(path.join(srcDir, name));
    const ttf = Buffer.from(await wawoff2.decompress(src));
    const cm = new fontmin();
    cm.src(ttf);
    cm.use(fontmin.glyph({ text, hinting: false }));
    cm.use(fontmin.ttf2woff2());
    const files = await new Promise((resolve, reject) => {
      cm.run((err, res) => (err ? reject(err) : resolve(res)));
    });
    const woff2 = files.find((f) => f.path.endsWith('.woff2'));
    if (!woff2) throw new Error(`${name} 子集化失败`);
    const dest = path.join(dstDir, name);
    if (!CHECK_ONLY) fs.writeFileSync(dest, woff2.contents);
    out.push({ name, before: src.length, after: woff2.contents.length });
  }
  return out;
}

/* ---------------- main ---------------- */
const kb = (n) => (n / 1024).toFixed(0) + 'KB';
const mb = (n) => (n / 1024 / 1024).toFixed(2) + 'MB';

async function main() {
  const common = readCommonChars();
  const material = readMaterialChars();
  const keep = new Set([...common, ...material, ...CH(EXTRA)]);
  console.log(`字表：常用字 ${common.size} ＋ 内置素材 ${material.size} → 合计 ${keep.size} 个字`);

  const strokes = buildShards(
    path.join(STATIC, 'data', 'strokes'),
    path.join(STATIC, 'data', 'strokes_lite'),
    'ZU_SHARD',
    keep
  );
  const medians = buildShards(
    path.join(STATIC, 'data', 'medians'),
    path.join(STATIC, 'data', 'medians_lite'),
    'ZU_MEDIAN',
    keep
  );

  console.log(`笔顺：${strokes.files.length} 个分片，${mb(strokes.bytes)}`);
  console.log(`笔心线：${medians.files.length} 个分片，${mb(medians.bytes)}`);

  const fonts = await buildFonts(keep);
  let before = 0;
  let after = 0;
  for (const f of fonts) {
    before += f.before;
    after += f.after;
    console.log(`字体 ${f.name.padEnd(18)} ${kb(f.before).padStart(8)} → ${kb(f.after).padStart(7)}`);
  }
  console.log(`中文字体合计 ${mb(before)} → ${mb(after)}`);
  console.log(CHECK_ONLY ? '（--check：只核对，没写文件）' : '完成：static/data/*_lite、static/fonts/zh_lite');
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
