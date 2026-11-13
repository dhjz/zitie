/* 数字字帖：0-9 描红 / 描点
   字形不是字体文件，是一套矢量数据（轮廓 + 运笔线），所以能空心、能虚线、
   能描点。数据在 static/data/num.js，描点是离线算好的。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '数字练习',
    content: '0123456789',
    num_font: 'plain',  // plain 专用数字 / alpha 字母数字专用
    guide: 'tian',      // 见 Z.GUIDE_OPTIONS
    trace: 1,           // 见 Z.TRACE_OPTIONS，数字是矢量字形，十一档全支持
    cols: 12,           // 每行格数：12 常规 / 13 密排，见 Z.COLS_OPTIONS
    repeat_times: 12,   // 每个数字占几格（含第一个示范格）
    blank_row: 0,       // 每个数字后面留几行空白自己写
    fix: 0,             // 每页尾部订正格
    foot: 1,            // 0 无 / 1 姓名日期 / 2 姓名班级日期
    border_color: 'rgb(82, 166, 172)',
    font_color: 'rgb(120, 128, 140)',
  };

  // 参与自动保存与导出；content 是输入类，不落盘也不导出
  Z.settings.define('num', { label: '数字字帖', defaults: DEFAULTS, inputs: ['content'] });

  const validate = (f) => {
    if (!String(f.content || '').replace(/[^0-9]/g, '')) return '先输入要练的数字';
    return '';
  };

  G.NumPage = {
    name: 'NumPage',
    setup() {
      // 数字是矢量数据，不用预取笔顺分片
      const gen = G.useGen('num', DEFAULTS, Z.genNumber, validate);
      const { form, doc, pages, items, generate, print, pageCount } = gen;
      // 老存档的列数是 4~20 任意值，现在只有 12/13 两档，
      // 进来先归一，免得分段按钮一个都不亮
      form.cols = Z.colsOf(form.cols);

      const digitCount = Vue.computed(() => String(form.content || '').replace(/[^0-9]/g, '').length);
      // 描点那一档就是原站的「圆点画」，顺手把话说清楚
      const TRACE_TIPS = {
        4: '圆点：一串点沿运笔线摆出来，点的粗细跟着笔画肥瘦走，照着点连起来就是字形',
        7: '擦除画：把笔画挖成白线，只剩轮廓和一条白心 —— 练的是笔尖走哪条道',
        11: '浅底擦除：底下留一层很淡的轮廓，擦出来的白线一样清楚，但看得见字形',
        10: '填充虚线：沿笔心线铺一条淡色带再压虚线，字有肉感，不是空架子',
      };
      const traceTip = Vue.computed(() => TRACE_TIPS[Number(form.trace)] || '');

      return {
        ...gen, form, doc, pages, items, generate, print, pageCount,
        digitCount, traceTip,
        numFonts: Z.NUM_FONTS.map((f) => ({ v: f.key, label: f.name })), guideOptions: Z.GUIDE_OPTIONS,
        colOptions: Z.COLS_OPTIONS,
        // 数字是矢量字形，这套表原样搬过来即可
        traceOptions: Z.TRACE_OPTIONS,
        footOptions: Z.FOOT_OPTIONS,
        borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS,
      };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>数字字帖</h3><span class="hint">{{ digitCount }} 个</span></div>
            <div class="card-bd">
              <z-field label="内容" tip="只收 0-9，其它字符会被略过；两位数就当两个数字排">
                <textarea class="input" v-model="form.content" rows="2"
                  placeholder="例：0123456789"></textarea>
              </z-field>

              <z-field label="字体" tip="两套字形粗细不同，专用数字更瘦长，字母数字专用更圆">
                <z-seg v-model="form.num_font" :options="numFonts"></z-seg>
              </z-field>

              <z-field label="格型">
                <z-seg v-model="form.guide" :options="guideOptions"></z-seg>
              </z-field>

              <z-field label="描字" tip="示范格永远实心，只改后面的练习格">
                <z-seg v-model="form.trace" :options="traceOptions"></z-seg>
                <div class="hint" v-if="traceTip">{{ traceTip }}</div>
              </z-field>

              <z-field label="每行格数" tip="12 格常规（15mm）/ 13 格密排（14.46mm，左右页边距收窄到 10mm）">
                <z-seg v-model="form.cols" :options="colOptions"></z-seg>
              </z-field>

              <z-field label="每字格数" tip="含最前面那个深色示范格；填满一行就是一行一个数字">
                <z-num v-model="form.repeat_times" :min="1" :max="60" suffix="格"></z-num>
              </z-field>

              <z-field label="空行" tip="每个数字后面留几行空白，自己写">
                <z-num v-model="form.blank_row" :min="0" :max="5" suffix="行"></z-num>
              </z-field>

              <z-field label="订正格" tip="每页底部留一行「改错」区">
                <z-seg v-model="form.fix" :options="[{ v: 0, label: '不要' }, { v: 1, label: '要' }]"></z-seg>
              </z-field>

              <z-field label="页脚" tip="姓名 / 班级 / 日期">
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
              数字不用字体文件画，走的是矢量字形（轮廓 + 运笔线），
              所以十一档描字全都出得来，放大到 A3 也不糊。
              空心、虚线靠轮廓描边；填充虚线、擦除画靠把笔心线剃进轮廓里。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="左边输入数字，点生成"></z-preview>
      </div>`,
  };
})();
