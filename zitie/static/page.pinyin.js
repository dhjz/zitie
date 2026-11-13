/* 拼音字帖：声母表 / 韵母表 / 整体认读 / 汉字注音
   汉字注音用 pinyin-pro，整段一起判，多音字不会读错。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '拼音练习本',
    type: 1,
    font_key: 'pinyinok',
    content: '春眠不觉晓',
    cols: 8,            // 每行格数：8 常规 / 10 密排，见 Z.PY_COLS_OPTIONS
    repeat_times: 6,
    blank_row: 1,
    foot: 0,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(255, 120, 120)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('pinyin', { label: '拼音字帖', defaults: DEFAULTS, inputs: ['content'] });

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
      // 拼音也是字体整字，只有描边那几档能用
      const traceOptions = Z.EN_TRACE_OPTIONS;
      const colOptions = Z.PY_COLS_OPTIONS;

      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, charCount, traceOptions, colOptions, fonts: Z.PY_FONTS, footOptions: Z.FOOT_OPTIONS,
        borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS };
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

              <z-field label="字体">
                <z-fonts v-model="form.font_key" :fonts="fonts" sample="b p m f"></z-fonts>
              </z-field>

              <z-field label="描字" tip="示范格永远实心深色，只改后面的练习格">
                <z-seg v-model="form.trace" :options="traceOptions"></z-seg>
              </z-field>

              <z-field label="每行格数" tip="8 格一个音节占 22mm，10 格占 17.6mm；长音节（zhuang、ying）会自动缩一点塞进去">
                <z-seg v-model="form.cols" :options="colOptions"></z-seg>
              </z-field>

              <z-field label="重复" tip="同一行铺几遍，铺满自动换行">
                <z-num v-model="form.repeat_times" :min="1" :max="20" suffix="次"></z-num>
              </z-field>

              <z-field label="空行"><z-num v-model="form.blank_row" :min="0" :max="5" suffix="行空白"></z-num></z-field>
              <z-field label="页脚" tip="姓名和日期在顶栏齿轮里统一设，这儿只挑印哪几栏">
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
          <div class="card">
            <div class="card-bd hint">
              声母表 23 个、韵母表 24 个、整体认读 16 个，每个音节占两行：第一格深色示范，其余同一音节可描。
              汉字注音按整段判多音字，「长大了」读 zhǎng 不读 cháng。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选个类型，点生成"></z-preview>

        <z-mbar></z-mbar>
      </div>`,
  };
})();
