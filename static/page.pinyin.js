/* 拼音字帖：声母表 / 韵母表 / 整体认读 / 自选音节 / 汉字注音
   汉字注音用 pinyin-pro，整段一起判，多音字不会读错。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '拼音练习本',
    type: 1,
    font_key: 'pinyinok',
    content: '春眠不觉晓', // 汉字注音的正文
    custom: 'b p m f',    // 自选音节，空格或逗号隔开
    cols: 8,            // 每行格数：8 常规 / 10 密排，见 Z.PY_COLS_OPTIONS
    tail_blank: 0,      // 每行末尾留几格空着，学生自己写（最多就是每行格数）
    repeat_times: 6,
    blank_row: 1,
    foot: 0,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(255, 120, 120)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('pinyin', { label: '拼音字帖', defaults: DEFAULTS, inputs: ['content', 'custom'] });

  const validate = (f) => {
    const type = Number(f.type);
    if (type === 4 && !Z.chars(f.content).length) return '切到「汉字注音」得先输入汉字';
    if (type === 5 && !Z.pinyinItems(f.custom).length) return '先输入要练的音节，用空格或逗号隔开';
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
        { v: 5, label: '自选' },
      ];
      const charCount = Vue.computed(() => Z.chars(form.content).length);
      const itemCount = Vue.computed(() => Z.pinyinItems(form.custom).length);
      // 粘进来的汉字标点会被剔掉，点出来免得以为字帖吞了内容
      const dropped = Vue.computed(() =>
        Z.splitItems(form.custom).join('').length - Z.pinyinItems(form.custom).join('').length);
      // 从整套里删掉不练的，比一个一个手打快
      const presets = [
        { name: '全套声母', text: Z.PINYIN_SETS[1].join(' ') },
        { name: '全套韵母', text: Z.PINYIN_SETS[2].join(' ') },
        { name: '整体认读', text: Z.PINYIN_SETS[3].join(' ') },
      ];
      const usePreset = (p) => { form.custom = p.text; };
      // 拼音也是字体整字，只有描边那几档能用
      const traceOptions = Z.EN_TRACE_OPTIONS;
      const colOptions = Z.PY_COLS_OPTIONS;
      // 「每行空数」的上限就是每行格数；格数换档时把越界的收回来
      const tailMax = Vue.computed(() => Z.pyColsOf(form.cols));
      Vue.watch(tailMax, (n) => { if (Number(form.tail_blank) > n) form.tail_blank = n; }, { immediate: true });

      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, charCount, itemCount, dropped, presets, usePreset,
        traceOptions, colOptions, tailMax, fonts: Z.PY_FONTS, footOptions: Z.FOOT_OPTIONS,
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

              <z-field v-if="Number(form.type) === 5" label="音节" tip="空格、逗号、竖线或换行隔开，写什么练什么；只想练几个就只填几个">
                <textarea class="input" v-model="form.custom" rows="3" placeholder="例：b p zh ang ying"></textarea>
                <div class="hint">{{ itemCount }} 个音节<span v-if="dropped"> · 有 {{ dropped }} 个非拼音字符会略过</span></div>
                <div class="chip-list" style="margin-top:8px">
                  <button v-for="p in presets" :key="p.name" type="button" class="chip" @click="usePreset(p)">{{ p.name }}</button>
                </div>
              </z-field>

              <z-field label="字体">
                <z-fonts v-model="form.font_key" :fonts="fonts"></z-fonts>
              </z-field>

              <z-field label="描字" tip="示范格永远实心深色，只改后面的练习格">
                <z-seg v-model="form.trace" :options="traceOptions"></z-seg>
              </z-field>

              <z-field label="每行格数" tip="8 格一个音节占 22mm，10 格占 17.6mm；长音节（zhuang、ying）会自动缩一点塞进去">
                <z-seg v-model="form.cols" :options="colOptions"></z-seg>
              </z-field>

              <z-field label="每行空数"
                tip="一行最后留几格不印字，让孩子自己写。上限就是每行格数，格子线照样在，只腾出字的位置">
                <z-num v-model="form.tail_blank" :min="0" :max="tailMax" suffix="格空着"></z-num>
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
              只想练其中几个就切到「自选」，填 b p m 即可，也能一键填入整套再删。
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
