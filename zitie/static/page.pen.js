/* 控笔练习：把 PenControl 字体里的 32 个线条图形铺成 A4 练习页
   学前和低年级写不好字，多半不是不会写，是手不稳。控笔练习就是
   沿着图形描线：直线、折线、螺旋、波浪 —— 从直来直到收放自如。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '控笔练习',
    // 默认这批按「直线 → 折线 → 曲线」排，就是控笔由易到难的顺序
    picks: '12LM34HJK569FSU',

    size: 12,                       // 格子边长 mm
    gap: 0,                         // 行间距 mm
    trace: 6,                       // 每行描红格数
    lines: 1,                       // 每个图形练几行
    blank_row: 0,                   // 每组补几行空白
    border_color: 'rgb(148, 160, 176)',
    trace_color: 'rgb(150, 180, 215)',
  };

  // 图案选择器：每个按钮直接用字体画出来，一眼知道是什么线
  const ZPenPicks = {
    name: 'ZPenPicks',
    props: { modelValue: String },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const picked = (ch) => String(props.modelValue || '').indexOf(ch) >= 0;
      const toggle = (ch) => {
        const cur = String(props.modelValue || '');
        emit('update:modelValue', picked(ch) ? cur.replace(ch, '') : cur + ch);
      };
      return { picked, toggle, patterns: Z.PEN_PATTERNS };
    },
    template: `
      <div class="pen-picks">
        <button v-for="p in patterns" :key="p.ch" type="button" class="pen-pick"
          :class="{ on: picked(p.ch) }" :title="p.name" @click="toggle(p.ch)">
          <span class="pen-pick-g">{{ p.ch }}</span>
          <span class="pen-pick-n">{{ p.name }}</span>
        </button>
      </div>`,
  };

  G.ZPenPicks = ZPenPicks;

  G.PenPage = {
    name: 'PenPage',
    setup() {
      const validate = (f) => (String(f.picks || '').length ? '' : '先挑一个图形再生成');
      const gen = G.useGen('pen', DEFAULTS, Z.genPen, validate);
      const { form, doc, pages, generate } = gen;

      // 选中一串图案之后「全选/清空」用得着
      const all = () => { form.picks = Z.PEN_CHARS; };
      const clear = () => { form.picks = ''; };
      const count = Vue.computed(() => String(form.picks || '').length);
      const pageCount = Vue.computed(() => pages.value.length);

      return {
        ...gen, form, doc, pages, generate, all, clear, count, pageCount,
        borderColors: Z.BORDER_COLORS,
        traceColors: Z.PEN_TRACE_COLORS,
      };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd">
              <h3>控笔练习</h3>
              <span class="hint">已选 {{ count }} 种</span>
            </div>
            <div class="card-bd">
              <z-field label="图形" tip="点一下选中，再点一下取消；打印顺序就是选中顺序">
                <z-pen-picks v-model="form.picks"></z-pen-picks>
                <div class="hint" style="display:flex;gap:10px;margin-top:6px">
                  <a href="javascript:;" @click="all">全选</a>
                  <a href="javascript:;" @click="clear">清空</a>
                </div>
              </z-field>
            </div>

            <div class="card-bd">
              <z-field label="格子边长" tip="格子越大，一页放的越少，适合刚开始练的孩子">
                <z-num v-model="form.size" :min="5" :max="40" suffix="mm"></z-num>
              </z-field>
              <z-field label="行间距">
                <z-num v-model="form.gap" :min="0" :max="10" suffix="mm"></z-num>
              </z-field>
              <z-field label="描红" tip="每一行前面几格印浅色线条描，剩下的空格自己写">
                <z-num v-model="form.trace" :min="0" :max="24" suffix="格"></z-num>
              </z-field>
              <z-field label="练习行数" tip="每个图形练几行；每组之后再补几行整行空白">
                <z-num v-model="form.lines" :min="1" :max="12" suffix="行"></z-num>
                <z-num v-model="form.blank_row" :min="0" :max="12" suffix="行空白"></z-num>
              </z-field>
            </div>

            <div class="card-bd">
              <z-field label="格线色"><z-colors v-model="form.border_color" :palette="borderColors"></z-colors></z-field>
              <z-field label="描红色"><z-colors v-model="form.trace_color" :palette="traceColors"></z-colors></z-field>
              <z-field label="标题"><input class="input" v-model="form.title" maxlength="30" /></z-field>
            </div>

            <div class="card-bd">
              <button class="btn btn-primary btn-block" @click="generate">生成练习纸</button>
            </div>
          </div>

          <div class="card">
            <div class="card-bd hint">
              控笔是写字的前置功课：先练手稳、手眼配合，再谈笔画和结构。
              建议从横线、竖线、折线开始，螺旋和波浪放到后面。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="[]" @print="print" @regen="generate"
          empty-text="左边挑几个图形"></z-preview>
      </div>`,
  };
})();
