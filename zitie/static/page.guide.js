/* 使用说明：把「怎么打印才能毫米级对齐」讲清楚，这块最容易踩坑 */
(function () {
  const G = (window.myComponents = window.myComponents || {});

  G.GuidePage = {
    name: 'GuidePage',
    setup() {
      const steps = [
        { t: '选页填参数', d: '左边挑字帖类型、字号格线、颜色标题。改一个参数版面就重排，不用等。' },
        { t: '看 A4 预览', d: '右边就是一页真 A4，预览什么样打印出来就什么样。' },
        { t: '打印 / 存 PDF', d: '点「打印 / 存 PDF」，在弹出的打印对话框里选「另存为 PDF」，就得到一个矢量文件，放大不虚。' },
      ];
      const tips = [
        '纸张选 A4，边距选「无 / None」，否则会整页缩小一圈',
        '缩放保持 100%，别开「适合页面大小」',
        '勾上「背景图形」，格子线才是彩色实线',
        'Chrome / Edge 效果最好；手机上只能看不能打',
        '打印不贵，先打一张试，对齐了再批量',
      ];
      const faq = [
        { q: '数据要联网吗？', a: '不要。字帖全靠本地 6763 个字的笔画数据 + 浏览器算，断网、双击 index.html 都能用。' },
        { q: '笔顺为什么会自动关掉？', a: '笔画路径是楷体字形，换成仿宋行楷就对不上了，所以非楷体时只能描字。' },
        { q: '一个字能练几行？', a: '描字格与空白格各最多 5 行，加上头格正好一整页塞得下。' },
        { q: '空心字、虚线字是干什么的？', a: '给已经会写、但笔画走向不稳的孩子用：描空心字得自己控制笔尖，虚线字提示每一笔的起收。示范格永远是实心的。' },
        { q: '订正格会让页数变多吗？', a: '不会。订正格高度是从版心里先扣掉的，上面的格子反而会矮一点点，一页还是一页。' },
        { q: '页脚的姓名日期能改吗？', a: '页脚就是几条留白的横线，打印出来手写；选项只有「姓名日期」和「姓名班级日期」两档。' },
        { q: '为什么有的生僻字画不出来？', a: '本地数据覆盖 GB2312 常用 6763 字，超出的字会退回用字体显示文字。' },
      ];
      return { steps, tips, faq, open: Vue.ref(0) };
    },
    template: `
      <div style="max-width:900px;margin:0 auto">
        <section class="hero" style="padding:34px 32px">
          <h1 style="font-size:27px">打印前花 60 秒看这页</h1>
          <p style="margin:0">字帖废掉的九成原因不是内容，是打印设置。下面几条照做，毫米级对齐。</p>
        </section>

        <div class="card">
          <div class="card-hd"><h3>三步出纸</h3></div>
          <div class="card-bd">
            <div class="cards" style="grid-template-columns:repeat(auto-fill,minmax(240px,1fr))">
              <div v-for="(s, i) in steps" :key="i" class="tile" style="cursor:default;box-shadow:none">
                <div class="tile-ico">{{ i + 1 }}</div>
                <h4>{{ s.t }}</h4>
                <p>{{ s.d }}</p>
              </div>
            </div>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>打印设置对照表</h3></div>
          <div class="card-bd">
            <ul style="margin:0;padding-left:18px;line-height:2.2">
              <li v-for="t in tips" :key="t">{{ t }}</li>
            </ul>
          </div>
        </div>

        <div class="card">
          <div class="card-hd"><h3>常见问题</h3></div>
          <div class="card-bd">
            <div v-for="(f, i) in faq" :key="i" style="padding:12px 0" :style="i ? 'border-top:1px solid var(--line-soft)' : ''">
              <div style="font-weight:600;margin-bottom:4px">{{ f.q }}</div>
              <div class="hint" style="font-size:13px">{{ f.a }}</div>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
