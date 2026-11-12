/* 汉字字帖：描字 / 笔顺，拼音可选
   字源：static/data/strokes.js（6763 个 GB2312 字的笔画路径），
   拼音：pinyin-pro，整段一起判多音字。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '字帖练习本',
    content: '永和九年岁在癸丑',
    font_key: 'kaiti',
    font_type: 1,       // 1 描字 2 笔顺
    pinyin: 1,
    guide: 'tian',      // 见 Z.GUIDE_OPTIONS
    trace: 1,           // 1 实心 2 空心 3 细虚线 4 圆点
    fill_row: 1,        // 每个字几行描字格
    blank_row: 1,       // 每个字几行空格
    fix: 0,             // 每页尾部要不要一行订正格
    foot: 1,            // 0 无 / 1 姓名日期 / 2 姓名班级日期
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(255, 120, 120)',
  };

  const validate = (f) => {
    if (!Z.chars(f.content).length) return '先输入要练的汉字';
    return '';
  };

  G.HanziPage = {
    name: 'HanziPage',
    setup() {
      // 只有笔顺帖要逐笔拆，得先等笔画数据到位；描字帖走字体，不用等
      const gen = G.useGen('hanzi', DEFAULTS, Z.genHanzi, validate, { strokes: (f) => Number(f.font_type) === 2 });
      const { form, doc, pages, items, generate, print, pageCount } = gen;

      const fontOptions = Z.ZH_FONTS;
      const guideOptions = Z.GUIDE_OPTIONS;
      const traceOptions = Z.TRACE_OPTIONS;
      const footOptions = Z.FOOT_OPTIONS;
      // 笔顺模式画的是笔画轮廓数据，描字类型（空心/虚线）对它没意义
      const traceTip = Vue.computed(() =>
        Number(form.font_type) === 2 ? '笔顺画的是笔画轮廓，描字类型不生效，切到「描字」才管用' : '');
      // 输入框里非汉字会被点出来，不静默吞掉
      const dropped = Vue.computed(() => {
        const raw = String(form.content || '').replace(/[\u4e00-\u9fa5\s，。、；：！？,.;:!?]/g, '');
        return raw.length;
      });
      const charCount = Vue.computed(() => Z.chars(form.content).length);

      // 笔顺模式画的是笔画轮廓数据，跟选哪款字体无关；换了非楷体就退回描字，
      // 免得用户以为字体没生效
      const strokeDisabled = Vue.computed(() => form.font_key !== 'kaiti');
      Vue.watch(strokeDisabled, (v) => { if (v && form.font_type === 2) form.font_type = 1; });

      return {
        ...gen, form, doc, pages, items, generate, print, pageCount,
        fontOptions, guideOptions, traceOptions, footOptions, traceTip,
        charCount, dropped, strokeDisabled,
        borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS,
      };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>汉字字帖</h3><span class="hint">{{ charCount }} 字</span></div>
            <div class="card-bd">
              <z-field label="内容" tip="只收汉字，标点空格会自动略过">
                <textarea class="input" v-model="form.content" rows="3"
                  placeholder="在这儿粘一段课文、一句话，或者几个生字"></textarea>
                <div class="hint" v-if="dropped">有 {{ dropped }} 个非汉字字符不会出现在字帖里</div>
              </z-field>

              <z-field label="格式" tip="描字按上面选的字体整字渲染；笔顺是逐笔拆开的笔画轮廓，跟字体无关">
                <z-seg v-model="form.font_type" :options="[
                  { v: 1, label: '描字' },
                  { v: 2, label: '笔顺', disabled: strokeDisabled,
                    tip: strokeDisabled ? '笔顺是逐笔拆开的笔画轮廓，只能用楷体的笔画数据；描字才跟着字体走' : '逐笔演示笔顺' }
                ]"></z-seg>
              </z-field>

              <z-field label="格型">
                <z-seg v-model="form.guide" :options="guideOptions"></z-seg>
              </z-field>

              <z-field label="描字" tip="空心字、虚线字用来练笔顺走向；示范格永远实心，只改练习格">
                <z-seg v-model="form.trace" :options="traceOptions"></z-seg>
                <div class="hint" v-if="traceTip">{{ traceTip }}</div>
              </z-field>

              <z-field label="字体">
                <z-fonts v-model="form.font_key" :fonts="fontOptions" sample="永字八法"></z-fonts>
              </z-field>

              <z-field label="拼音">
                <z-seg v-model="form.pinyin" :options="[{ v: 1, label: '有拼音' }, { v: 0, label: '无拼音' }]"></z-seg>
              </z-field>

              <z-field label="行数" tip="每个字后面补几行描字格 / 空白格">
                <z-num v-model="form.fill_row" :min="0" :max="5" suffix="行描字"></z-num>
                <z-num v-model="form.blank_row" :min="0" :max="5" suffix="行空白"></z-num>
              </z-field>

              <z-field label="订正格" tip="每页底部留一行「改错」区，高度从版心里扣，不多占纸张">
                <z-seg v-model="form.fix" :options="[{ v: 0, label: '不要' }, { v: 1, label: '要' }]"></z-seg>
              </z-field>

              <z-field label="页脚" tip="姓名 / 班级 / 日期，交作业要写的那种">
                <z-seg v-model="form.foot" :options="footOptions"></z-seg>
              </z-field>
            </div>

            <div class="card-bd">
              <z-field label="格线色"><z-colors v-model="form.border_color" :palette="borderColors"></z-colors></z-field>
              <z-field label="字色"><z-colors v-model="form.font_color" :palette="inkColors"></z-colors></z-field>
              <z-field label="标题"><input class="input" v-model="form.title" maxlength="30" /></z-field>
            </div>

            <div class="card-bd">
              <button class="btn btn-primary btn-block" @click="generate">生成字帖</button>
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="左边输入汉字，点生成"></z-preview>
      </div>`,
  };
})();
