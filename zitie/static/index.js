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
      };

      onMounted(() => {
        window.addEventListener('hashchange', sync);
        window.addEventListener('popstate', sync);
        if (!location.hash) history.replaceState(null, '', '#/home');
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
