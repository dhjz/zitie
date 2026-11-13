/* 英文字帖：字母表 / 单词
   四线三格用虚线画，字体自带手写感，不依赖系统装了什么。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: 'English Practice',
    type: 'alphabet',
    content: 'apple banana orange',
    font_key: 'shouxieti',
    trace: 1,           // 描字类型；四线三格的字细，只能用描边那一类
    repeat_times: 10,
    blank_row: 1,
    foot: 0,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(255, 120, 120)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('eletter', { label: '英文字帖', defaults: DEFAULTS, inputs: ['content'] });

  const validate = (f) => {
    if (f.type !== 'word') return '';
    if (!String(f.content || '').trim()) return '先输入单词，用空格或竖线隔开';
    if (/[^\sa-zA-Z\-|,，]/.test(String(f.content))) return '只能输入英文单词';
    return '';
  };

  G.LetterPage = {
    name: 'LetterPage',
    setup() {
      const gen = G.useGen('eletter', DEFAULTS, Z.genEnglish, validate);
      const { form, doc, pages, items, generate, print } = gen;
      const typeOptions = [{ v: 'alphabet', label: '字母表' }, { v: 'word', label: '单词' }];
      // 四线三格的字本来就只有 2~3mm 粗，描边一加粗就糊；能用的只有描边那几档
      const traceOptions = Z.EN_TRACE_OPTIONS;
      const wordCount = Vue.computed(() =>
        (String(form.content || '').trim() ? String(form.content).split(/[\s,，|]+/).filter(Boolean).length : 0));
      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, wordCount, traceOptions, fonts: Z.EN_FONTS, footOptions: Z.FOOT_OPTIONS, borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>英文字帖</h3></div>
            <div class="card-bd">
              <z-field label="类型"><z-seg v-model="form.type" :options="typeOptions"></z-seg></z-field>

              <z-field v-if="form.type === 'word'" label="单词" tip="空格或竖线分隔">
                <textarea class="input" v-model="form.content" rows="3" placeholder="apple banana orange"></textarea>
                <div class="hint">{{ wordCount }} 个词</div>
              </z-field>

              <z-field label="字体">
                <z-fonts v-model="form.font_key" :fonts="fonts" sample="Aa Bb"></z-fonts>
              </z-field>

              <z-field label="描字" tip="示范格永远实心深色，只改后面的练习格">
                <z-seg v-model="form.trace" :options="traceOptions"></z-seg>
              </z-field>

              <z-field label="重复"><z-num v-model="form.repeat_times" :min="1" :max="20" suffix="格"></z-num></z-field>
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
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选类型，点生成"></z-preview>

        <z-mbar></z-mbar>
      </div>`,
  };
})();
