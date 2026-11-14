/* 首页：入口卡片 + 一句话说清这东西怎么用
   不需要任何请求，纯静态。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});

  G.HomePage = {
    name: 'HomePage',
    emits: ['go'],
    setup() {
      const features = [
        { name: 'hanzi', ico: '汉', title: '汉字字帖', desc: '描红 + 笔顺拆解，拼音可选，描几行留几行都能调' },
        { name: 'pinyin', ico: 'a', title: '拼音字帖', desc: '声母、韵母、整体认读，也可只练自选的几个，或给汉字自动注音' },
        { name: 'eletter', ico: 'A', title: '英文字帖', desc: '字母表、自选字母与单词，四线三格，四款字体' },
        { name: 'num', ico: '7', title: '数字字帖', desc: '0-9 描红、空心、细虚线、描点，笔画粗细跟着字形走' },
        { name: 'math', ico: '±', title: '数学练习', desc: '加减乘除竖式口算，范围与题型自己定' },
        { name: 'stage', ico: '文', title: '词语文章', desc: '整段文字铺格子，古诗、课文、词语都行' },
        { name: 'pen', ico: '〰', title: '控笔练习', desc: '直线、折线、螺旋、波浪铺满整页，先把手练稳再写字' },
        { name: 'blank', ico: '▦', title: '空白练习纸', desc: '写字格、四线三格、作文稿纸、横线笔记、竖式计算、数学方格、坐标纸' },
      ];
      return { features };
    },
    template: `
      <div>
        <section class="hero">
          <h1>把字练好，<em>不必联网</em>。</h1>
          <p>
            纯前端生成 A4 字帖：笔顺拆解、拼音注音、四线三格、口算练习，参数改一下版面立刻重排。
            没有后端，没有登录，双击 <code>index.html</code> 就能用；打印时选「另存为 PDF」就是矢量文件。
          </p>
          <div class="hero-actions">
            <button class="btn btn-primary" @click="$emit('go', 'hanzi')">做个汉字字帖</button>
            <button class="btn" @click="$emit('go', 'blank')">先印几张空格子</button>
            <button class="btn" @click="$emit('go', 'guide')">怎么打印</button>
          </div>
          <div class="hero-tags">
            <span>零依赖 · 免打包</span><span>笔顺数据本地</span><span>A4 矢量打印</span><span>暗色模式</span>
          </div>
        </section>

        <div class="cards feat">
          <button v-for="f in features" :key="f.name" class="tile feat" @click="$emit('go', f.name)">
            <z-thumb :kind="f.name"></z-thumb>
            <div class="tile-body">
              <div class="tile-hd">
                <span class="tile-ico">{{ f.ico }}</span>
                <h4>{{ f.title }}</h4>
                <span class="tile-go">→</span>
              </div>
              <p>{{ f.desc }}</p>
            </div>
          </button>
        </div>
      </div>`,
  };
})();
