/* 入口：路由、主题、外壳
   页面组件由 page.*.js 自己注册进 window.myComponents，这里只管装配。
   新增页面：拷一份 page.xxx.js，末尾 G.XxxPage = XxxPage，
   再到 index.html 补一行 <script> 与一个 <xxx-page v-else-if>。 */
(function () {
  const { createApp, ref, onMounted } = Vue;
  const Z = window.Zu;
  const G = (window.myComponents = window.myComponents || {});

  // hash 路由：静态站点没有服务端 rewrite，用 #/hanzi 双击本地文件也能跑
  const ROUTES = [
    { name: 'home', title: '首页' },
    { name: 'hanzi', title: '汉字字帖' },
    { name: 'pinyin', title: '拼音字帖' },
    { name: 'eletter', title: '英文字帖' },
    { name: 'num', title: '数字字帖' },
    { name: 'math', title: '数学练习' },
    { name: 'stage', title: '词语文章' },
    { name: 'pen', title: '控笔练习' },
    { name: 'blank', title: '空白练习纸' },
  ];
  const NAMES = ROUTES.map((r) => r.name).concat(['guide']);
  const parse = () => {
    const raw = (location.hash || '').replace(/^#\/?/, '');
    const name = raw.split('?')[0].split('/')[0];
    return NAMES.includes(name) ? name : 'home';
  };

  const App = {
    setup() {
      const route = ref(parse());
      const dark = ref(document.documentElement.classList.contains('dark'));
      // 素材合集弹窗放在壳上：任何页面都能点开，不各页复制一份
      const showCollections = ref(false);
      // 设置（导入导出配置）同样放壳上，任何页面都能点
      const showSettings = ref(false);

      const go = (name) => {
        if (name === route.value) return;
        location.hash = '#/' + name;
      };
      const toggleTheme = () => {
        dark.value = !dark.value;
        Z.theme.set(dark.value ? 'dark' : 'light');
      };

      const sync = () => {
        route.value = parse();
        window.scrollTo({ top: 0, behavior: 'smooth' });
        scrollNavIntoView();
      };

      /* 纸张缩放：以前写死 zoom: .46，360 宽屏上纸顶出边、414 宽又留一条白，
         768 的平板上干脆整张纸溢出。这里量一次「210mm 究竟是几个像素」，
         再按预览区真正能用的宽度反算缩放比，存进 CSS 变量 --sheet-zoom。

         基准要用纸槽自己的宽度，不能用视口：wrap 和 preview-body 各有一层内边距，
         按视口算出来的纸会宽出几十像素。纸槽被 Tab 藏起来时（手机上停在「设置」）
         它量不到宽度，退回视口估一个 —— 那种时候谁也看不见纸，差一点无所谓。 */
      let lastAvail = 0;
      const fitSheet = () => {
        const ruler = document.createElement('div');
        ruler.style.cssText = 'position:absolute;left:-9999px;top:0;width:210mm;height:0';
        document.body.appendChild(ruler);
        const mm210 = ruler.getBoundingClientRect().width || 794;
        ruler.remove();
        const box = document.querySelector('.preview-body');
        let avail = 0;
        if (box && box.clientWidth) {
          const cs = getComputedStyle(box);
          avail = box.clientWidth - parseFloat(cs.paddingLeft || 0) - parseFloat(cs.paddingRight || 0);
        }
        if (!(avail > 0)) avail = document.documentElement.clientWidth - 32;
        // 纸自己有 4px 圆角 + 阴影，左右各留 4px 呼吸就够，再多就是白扔
        avail = Math.max(240, avail - 8);
        // 同宽就不折腾：缩放一变高度会变，ResizeObserver 会再叫回来，白白来回算
        if (Math.abs(avail - lastAvail) < 1) return;
        lastAvail = avail;
        const z = Math.min(1, Math.max(0.3, avail / mm210));
        document.documentElement.style.setProperty('--sheet-zoom', z.toFixed(4));
      };
      // 手机切到「预览」Tab 时纸槽才第一次有宽度，得重算一次（ui.js 的 setPane 调它）
      Z.fitSheet = fitSheet;

      // 导航 8 个入口在手机上滑不完，切页时把当前项滚进视野
      const scrollNavIntoView = () => {
        const el = document.querySelector('.nav-item.on');
        if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'center' });
      };

      onMounted(() => {
        window.addEventListener('hashchange', sync);
        window.addEventListener('popstate', sync);
        if (!location.hash) history.replaceState(null, '', '#/home');
        fitSheet();
        let rt = 0;
        window.addEventListener('resize', () => { clearTimeout(rt); rt = setTimeout(fitSheet, 150); });
        // 手机转屏的方向变化不一定触发 resize，再挂一次
        window.addEventListener('orientationchange', () => setTimeout(fitSheet, 220));
        // 首帧那会儿纸还没排出来，量到的是 0；后面切页面、切 Tab、窗口变化都会改宽度，
        // 所以直接盯住纸槽的尺寸变化，比自己排一堆时机点靠谱。
        if (window.ResizeObserver) new ResizeObserver(() => fitSheet()).observe(document.body);
        scrollNavIntoView();
      });

      return { route, dark, go, toggleTheme, routes: ROUTES, showCollections, showSettings };
    },
  };

  const app = createApp(App);
  // 谁注册了就挂谁，模板里用连字符写法（<hanzi-page>）
  Object.keys(G).forEach((name) => {
    if (G[name] && typeof G[name] === 'object' && G[name].name) app.component(name, G[name]);
  });
  app.mount('#app');
})();
