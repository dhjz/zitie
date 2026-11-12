/* 拼音字帖：声母表 / 韵母表 / 整体认读 / 汉字注音
   汉字注音用 pinyin-pro，整段一起判，多音字不会读错。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '拼音练习本',
    type: 1,
    content: '春眠不觉晓',
    repeat_times: 6,
    blank_row: 1,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(255, 120, 120)',
  };

  const validate = (f) => {
    if (Number(f.type) !== 4) return '';
    if (!Z.chars(f.content).length) return '切到「汉字注音」得先输入汉字';
    return '';
  };

  G.PinyinPage = {
    name: 'PinyinPage',
    setup() {
      const gen = G.useGen('pinyin', DEFAULTS, Z.genPinyin, validate);
      const { form, doc, pages, items, generate, print } = gen;

      const typeOptions = [
        { v: 1, label: '声母表' },
        { v: 2, label: '韵母表' },
        { v: 3, label: '整体认读' },
        { v: 4, label: '汉字注音' },
      ];
      const charCount = Vue.computed(() => Z.chars(form.content).length);

      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, charCount, borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>拼音字帖</h3></div>
            <div class="card-bd">
              <z-field label="类型"><z-seg v-model="form.type" :options="typeOptions"></z-seg></z-field>

              <z-field v-if="Number(form.type) === 4" label="汉字" tip="每个字一个音节，铺成一行一行描">
                <textarea class="input" v-model="form.content" rows="3" placeholder="输入汉字，自动注音"></textarea>
                <div class="hint">{{ charCount }} 字</div>
              </z-field>

              <z-field label="重复" tip="同一行铺几遍，铺满自动换行">
                <z-num v-model="form.repeat_times" :min="1" :max="20" suffix="次"></z-num>
              </z-field>

              <z-field label="空行"><z-num v-model="form.blank_row" :min="0" :max="5" suffix="行空白"></z-num></z-field>
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
          <div class="card">
            <div class="card-bd hint">
              声母表 23 个、韵母表 24 个、整体认读 16 个，每个音节占两行：第一格深色示范，其余同一音节可描。
              汉字注音按整段判多音字，「长大了」读 zhǎng 不读 cháng。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选个类型，点生成"></z-preview>
      </div>`,
  };
})();
