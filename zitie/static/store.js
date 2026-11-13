/* 配置层：一份显式 schema + 一个出入口
   每个页面在顶部自报家门（默认值 + 哪些字段算「输入」），
   存储、默认值合并、脏数据清洗、导出导入、恢复默认，全走这里。
   输入类字段（正文、逐字注音）不落 localStorage，也不进导出的 JSON。

   还有一份跨页共用的「全局设置」（姓名、自动日期）：它不是某个页面的参数，
   存在 zitie:global，读写都过同一套 norm，导出时单独挂在 JSON 的 global 上。 */
(function () {
  const Z = window.Zu;
  const PRE = 'zitie:';
  const reg = {}; // key → { label, defaults, inputs }

  const clone = (v) => (v && typeof v === 'object' ? JSON.parse(JSON.stringify(v)) : v);

  // 页面唯一要写的就这一行：schema 留在页面顶部，store 不猜也不复制默认值
  const define = (key, opts) => {
    const o = opts || {};
    reg[key] = { label: o.label || key, defaults: o.defaults || {}, inputs: o.inputs || [] };
  };

  // 只认 defaults 里声明过的键，类型跟着默认值走 ——
  // 删过的旧字段、手改坏的 json（字符串塞进数字位）自然出局
  const norm = (key, val) => {
    const spec = reg[key] || { defaults: {}, inputs: [] };
    const out = {};
    for (const k in spec.defaults) {
      const d = spec.defaults[k];
      const v = val ? val[k] : undefined;
      out[k] = !spec.inputs.includes(k) && v !== undefined && typeof v === typeof d ? v : clone(d);
    }
    return out;
  };

  const strip = (key, obj) => {
    for (const k of reg[key].inputs) delete obj[k];
    return obj;
  };

  // 进来先读：输入类一律回落到默认值。读的结果跟存档不一样就写回一次，
  // 老版本存在里面的正文（content）也就此冲掉，别一直躺在 localStorage 里
  const init = (key, defaults) => {
    if (!reg[key]) define(key, { defaults });
    const stored = Z.load(key, null);
    // 落盘那份要剔掉输入类；但返回给表单的这份不能剔 ——
    // 剔了页面连默认正文都拿不到，一进去就是空的，还得先报一句「先输入要练的字」
    const out = strip(key, norm(key, stored));
    if (JSON.stringify(out) !== JSON.stringify(stored)) Z.save(key, out);
    return norm(key, out);
  };

  const set = (key, form) => { Z.save(key, strip(key, norm(key, form))); };

  /* 全局设置：schema 跟页面走同一套 norm，脏数据清洗不必写两遍。
     页面读的是一份 reactive（Z.global），所以 setGlobal 要把值同步回去，
     否则预览里的页脚得刷页才更新。 */
  define('global', { label: '全局', defaults: Z.GLOBAL_DEFAULTS });
  const setGlobal = (patch) => {
    Object.assign(Z.global, strip('global', norm('global', { ...Z.global, ...patch })));
    Z.save('global', { ...Z.global });
  };
  // 开局读一遍：老存档里的姓名、开关状态得在第一次画纸之前就位
  setGlobal(Z.load('global', {}));

  // 导出：每个页面一份，输入类剔掉；主题算全局配置，一起带上
  const dump = () => {
    const pages = {};
    for (const key in reg) {
      if (key === 'global') continue;
      pages[key] = strip(key, norm(key, Z.load(key, {})));
    }
    return {
      app: 'zitie', v: 1, savedAt: new Date().toISOString(),
      theme: Z.theme.get(), global: norm('global', { ...Z.global }), pages,
    };
  };

  // 导入：逐页 norm 后写回，不认识的页（旧版本 / 别人手改的）直接跳过
  const load = (json) => {
    if (!json || typeof json !== 'object' || json.app !== 'zitie' || !json.pages || typeof json.pages !== 'object') {
      throw new Error('这不是字帖工坊导出的配置文件');
    }
    let n = 0;
    for (const key in json.pages) {
      if (!reg[key]) continue;
      set(key, json.pages[key]);
      n++;
    }
    if (!n) throw new Error('文件里没有认得的页面配置');
    const t = json.theme;
    if (t === 'dark' || t === 'light') Z.theme.set(t);
    // 全局设置可能来自老版本导出的文件（那会儿还没有这一项），没有就跳过
    if (json.global && typeof json.global === 'object') setGlobal(json.global);
    return n;
  };

  // 恢复默认：把本机这份全清了（含主题），刷新后按系统偏好重来
  const reset = () => {
    const keys = [];
    for (let i = 0; i < localStorage.length; i++) {
      const k = localStorage.key(i);
      if (k && k.indexOf(PRE) === 0) keys.push(k);
    }
    keys.forEach((k) => { try { localStorage.removeItem(k); } catch {} });
  };

  // 设置弹窗里列一下「存了哪些页、每页几项」；全局那份不算页面，跳过
  const list = () => Object.keys(reg).filter((k) => k !== 'global').map((key) => {
    const spec = reg[key];
    const count = Object.keys(spec.defaults).filter((k) => !spec.inputs.includes(k)).length;
    return { key, label: spec.label, count };
  });

  Z.settings = { define, init, set, dump, load, reset, list, setGlobal };
})();
