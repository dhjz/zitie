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
    trace: 1,           // 1 实心 2 空心 3 细虚线 4 描点
    cols: 12,           // 每行格数
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

      const digitCount = Vue.computed(() => String(form.content || '').replace(/[^0-9]/g, '').length);
      // 描点那一档就是原站的「圆点画」，顺手把话说清楚
      const traceTip = Vue.computed(() =>
        Number(form.trace) === 4 ? '描点：一串点沿运笔线摆出来，点的粗细跟着笔画肥瘦走，照着点连起来就是字形' : '');

      return {
        ...gen, form, doc, pages, items, generate, print, pageCount,
        digitCount, traceTip,
        numFonts: Z.NUM_FONTS.map((f) => ({ v: f.key, label: f.name })), guideOptions: Z.GUIDE_OPTIONS,
        // 第四档在原站叫「圆点画」，这里直接叫描点 —— 用户就是这么说的
        traceOptions: [{ v: 1, label: '实心' }, { v: 2, label: '空心' }, { v: 3, label: '细虚线' }, { v: 4, label: '描点' }],
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

              <z-field label="每行格数"><z-num v-model="form.cols" :min="4" :max="20" suffix="格"></z-num></z-field>

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
              所以能空心、能虚线、能描点，放大到 A3 也不糊。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="左边输入数字，点生成"></z-preview>
      </div>`,
  };
})();
