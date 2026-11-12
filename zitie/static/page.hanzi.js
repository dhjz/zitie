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
    font_type: 2,       // 1 描字 2 笔顺
    pinyin: 1,
    guide: 'tian',      // tian / mi / hui
    fill_row: 1,        // 每个字几行描字格
    blank_row: 1,       // 每个字几行空格
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
      const gen = G.useGen('hanzi', DEFAULTS, Z.genHanzi, validate);
      const { form, doc, pages, items, generate, print, pageCount } = gen;

      const fontOptions = Z.ZH_FONTS;
      const guideOptions = [
        { v: 'tian', label: '田字格' },
        { v: 'mi', label: '米字格' },
        { v: 'hui', label: '回宫格' },
      ];
      // 输入框里非汉字会被点出来，不静默吞掉
      const dropped = Vue.computed(() => {
        const raw = String(form.content || '').replace(/[\u4e00-\u9fa5\s，。、；：！？,.;:!?]/g, '');
        return raw.length;
      });
      const charCount = Vue.computed(() => Z.chars(form.content).length);

      // 笔顺只对楷体有意义（其它字体的字形跟笔顺数据不配套）
      const strokeDisabled = Vue.computed(() => form.font_key !== 'kaiti');
      Vue.watch(strokeDisabled, (v) => { if (v && form.font_type === 2) form.font_type = 1; });

      return {
        ...gen, form, doc, pages, items, generate, print, pageCount,
        fontOptions, guideOptions, charCount, dropped, strokeDisabled,
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

              <z-field label="格式">
                <z-seg v-model="form.font_type" :options="[
                  { v: 1, label: '描字' },
                  { v: 2, label: '笔顺', tip: strokeDisabled ? '笔顺只支持楷体' : '逐笔演示笔顺' }
                ]"></z-seg>
              </z-field>

              <z-field label="格线">
                <z-seg v-model="form.guide" :options="guideOptions"></z-seg>
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
