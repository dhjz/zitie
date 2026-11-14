/* 空白练习纸：写字格、四线三格，外加中小学常用的作业纸
   （作文稿纸 / 横线笔记 / 竖式计算 / 数学方格 / 坐标纸）。
   就是不想写字，只想打印一叠纸的时候用。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '练习纸',
    guide: 'tian',   // 格型，跟汉字字帖同一套，另加 en 与一批作业纸
    pinyin: 0,
    py_style: 'grid',
    num: 2,
    cols: 12,        // 每行格数：12 常规 / 13 密排
    density: 1,      // 作业纸的格线疏密：0 密 / 1 中 / 2 疏
    foot: 0,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(84, 92, 104)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('blank', { label: '空白练习纸', defaults: DEFAULTS, inputs: [] });

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
      const guideGroups = Z.BLANK_GROUPS;
      const footOptions = Z.FOOT_OPTIONS;
      const pyStyles = Z.PY_STYLES;
      const colOptions = Z.COLS_OPTIONS;
      const densityOptions = [{ v: 0, label: '密' }, { v: 1, label: '中' }, { v: 2, label: '疏' }];
      const isPaper = Vue.computed(() => Z.BLANK_PAPER_SET.has(form.guide));
      const isEn = Vue.computed(() => form.guide === 'en');
      const isCn = Vue.computed(() => !isPaper.value && !isEn.value);
      const currentTip = Vue.computed(() =>
        (Z.BLANK_GUIDES.find((o) => o.v === form.guide) || {}).tip || '');
      const densityTip = Vue.computed(() => ({
        zuowen: '每行 16 / 20 / 24 字，右侧标累计字数',
        heng: '行距 8 / 10 / 12mm',
        shushi: '行距 12 / 14 / 16mm',
        xiaoge: '细格 4 / 5 / 6mm，每 5 格一条粗线',
        zuobiao: '细格 4 / 5 / 6mm，中心带坐标轴',
      })[form.guide] || '格线疏密');
      return { ...gen, form, doc, pages, items, generate, print,
        guideGroups, footOptions, pyStyles, colOptions, densityOptions,
        isPaper, isEn, isCn, currentTip, densityTip, borderColors: Z.BORDER_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>空白练习纸</h3></div>
            <div class="card-bd">
              <z-field v-for="g in guideGroups" :key="g.label" :label="g.label">
                <z-seg v-model="form.guide" :options="g.options"></z-seg>
              </z-field>
              <z-field v-if="!isPaper" label="每行格数" tip="12 格是常规密度（格子 15mm）；13 格密排，左右页边距收窄到 10mm，格子 14.46mm">
                <z-seg v-model="form.cols" :options="colOptions"></z-seg>
              </z-field>
              <z-field v-if="isPaper" label="格线疏密" :tip="densityTip">
                <z-seg v-model="form.density" :options="densityOptions"></z-seg>
              </z-field>
              <z-field v-if="isCn" label="拼音">
                <z-seg v-model="form.pinyin" :options="[{ v: 1, label: '加拼音行' }, { v: 0, label: '不加' }]"></z-seg>
              </z-field>
              <z-field v-if="isCn && Number(form.pinyin)" label="拼音格">
                <z-seg v-model="form.py_style" :options="pyStyles"></z-seg>
              </z-field>
              <z-field label="页数"><z-num v-model="form.num" :min="1" :max="30" suffix="张"></z-num></z-field>
              <z-field label="页脚" tip="姓名和日期在顶栏齿轮里统一设，这儿只挑印哪几栏">
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
              <div v-if="currentTip">{{ currentTip }}</div>
              <div>汉字格默认 12 列 × 16 行，切到 13 列是 13 × 16（左右页边距收到 10mm，格子仍是 14.46mm）；加了拼音行是 12 × 11。四线三格也认这两档。
              作业纸（作文稿纸、横线笔记、竖式计算、数学方格、坐标纸）按「格线疏密」调格子大小，横竖都铺满整页，格线色、页数、页脚照常可用。</div>
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选纸张类型"></z-preview>

        <z-mbar></z-mbar>
      </div>`,
  };
})();
