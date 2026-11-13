/* 空白练习纸：田字格 / 米字格 / 拼音格 / 四线三格
   就是不想写字，只想打印一叠格子的时候用。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '练习纸',
    guide: 'tian',   // 格型，跟汉字字帖同一套，另加 en（四线三格）
    pinyin: 0,
    py_style: 'grid',
    num: 2,
    foot: 0,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(84, 92, 104)',
  };

  // 老版本存的是 type 1..5（田/田+拼音/米/米+拼音/英文纸），换成新的一套。
  // 不迁移的话老用户进来会看到一张默认田字格，参数像是被清了。
  const OLD_TYPE = { 1: ['tian', 0], 2: ['tian', 1], 3: ['mi', 0], 4: ['mi', 1], 5: ['en', 0] };
  const P = Z.load('blank', {});
  if (P.type != null) {
    const [guide, pinyin] = OLD_TYPE[P.type] || ['tian', 0];
    Z.save('blank', Object.assign({}, P, { guide, pinyin, type: null }));
  }

  G.BlankPage = {
    name: 'BlankPage',
    setup() {
      const gen = G.useGen('blank', DEFAULTS, Z.genBlank, null);
      const { form, doc, pages, items, generate, print } = gen;
      const guideOptions = Z.BLANK_GUIDES;
      const footOptions = Z.FOOT_OPTIONS;
      const pyStyles = Z.PY_STYLES;
      // 四线三格本来就没有「拼音行」这回事，那条选项得藏起来
      const isEn = Vue.computed(() => form.guide === 'en');
      return { ...gen, form, doc, pages, items, generate, print,
        guideOptions, footOptions, pyStyles, isEn, borderColors: Z.BORDER_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>空白练习纸</h3></div>
            <div class="card-bd">
              <z-field label="格型"><z-seg v-model="form.guide" :options="guideOptions"></z-seg></z-field>
              <z-field v-if="!isEn" label="拼音">
                <z-seg v-model="form.pinyin" :options="[{ v: 1, label: '加拼音行' }, { v: 0, label: '不加' }]"></z-seg>
              </z-field>
              <z-field v-if="!isEn && Number(form.pinyin)" label="拼音格">
                <z-seg v-model="form.py_style" :options="pyStyles"></z-seg>
              </z-field>
              <z-field label="页数"><z-num v-model="form.num" :min="1" :max="30" suffix="张"></z-num></z-field>
              <z-field label="页脚" tip="姓名 / 班级 / 日期">
                <z-seg v-model="form.foot" :options="footOptions"></z-seg>
              </z-field>
            </div>
            <div class="card-bd">
              <z-field label="格线色"><z-colors v-model="form.border_color" :palette="borderColors"></z-colors></z-field>
              <z-field label="标题"><input class="input" v-model="form.title" maxlength="30" /></z-field>
            </div>
            <div class="card-bd">
              <button class="btn btn-primary btn-block" @click="generate">生成练习纸</button>
            </div>
          </div>
          <div class="card">
            <div class="card-bd hint">
              汉字格一页 12 列 × 16 行；加了拼音行是 12 列 × 11 行。
              双横线是抄写本那种横线页，横着写下去不断行。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选纸张类型"></z-preview>
      </div>`,
  };
})();
