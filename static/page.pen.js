/* 控笔练习：把 PenControl 字体里的 32 个线条图形铺成 A4 练习页
   学前和低年级写不好字，多半不是不会写，是手不稳。控笔练习就是
   沿着图形描线：直线、折线、螺旋、波浪 —— 从直来直去到收放自如。
   用法参考在线工具那套：上面输入框随便编辑，下面点图形插到光标处，
   一行一个图形，一行格子印满，回车留一行空白自己画。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '控笔练习',
    // 一行一个图形，顺序就是纸上的顺序；回车 = 一整行空白
    content: '1\n2\n3\n4\nL\nM\nJ',
    size: 10,
    gap: 0,
    trace: 0,                       // 0 = 整行铺满；其它值是每行印几格
    foot: 0,
    border_color: 'rgb(148, 160, 176)',
    trace_color: 'rgb(150, 180, 215)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('pen', { label: '控笔练习', defaults: DEFAULTS, inputs: ['content'] });

  // 早版本存的是「选中的图形串 + 描红格数」，跟现在的输入框不是一套，
  // 留着会让老用户还看到半行空白，直接丢掉，用新默认值重来。
  if (Z.load('pen', {}).picks != null) Z.save('pen', {});

  // 输入框清空时要让预览跟着空掉，别留着上一版纸 —— 所以不做前置校验，
  // 交给 genPen 返回 null，useGen 会清页面并提示。
  // 行数统计跟 genPen 对齐：空行算一行，末尾那个换行不算。
  const rowCount = (text) => {
    const lines = String(text || '').toUpperCase().split('\n').map((l) => l.replace(/[^0-9A-W]/g, ''));
    while (lines.length > 1 && !lines[lines.length - 1]) lines.pop();
    return lines.reduce((n, l) => n + (l.length || 1), 0);
  };

  // 图形选择器：按钮直接用字体画线条，一眼知道是什么；点一下就插到光标处
  const ZPenPicks = {
    name: 'ZPenPicks',
    emits: ['pick'],
    setup() {
      return { patterns: Z.PEN_PATTERNS };
    },
    template: `
      <div class="pen-picks">
        <button v-for="p in patterns" :key="p.ch" type="button" class="pen-pick"
          :title="p.name" @click="$emit('pick', p.ch)">
          <span class="pen-pick-g">{{ p.ch }}</span>
          <span class="pen-pick-n">{{ p.name }}</span>
        </button>
      </div>`,
  };

  G.ZPenPicks = ZPenPicks;

  G.PenPage = {
    name: 'PenPage',
    setup() {
      const gen = G.useGen('pen', DEFAULTS, Z.genPen);
      const { form, doc, pages, generate, pageCount } = gen;

      // 点图形按钮时输入框会失焦，selectionStart 有时归零。
      // 所以光标位置自己记着，没记过（从没点进输入框）就插到末尾。
      const ta = Vue.ref(null);
      const caret = Vue.ref(null);
      const remember = () => {
        const el = ta.value;
        if (el && el.selectionStart != null) caret.value = { at: el.selectionStart, to: el.selectionEnd };
      };
      // 纯文本插入：选中的一段会被替换，跟平时打字一个手感。
      // 一行里写几个图形就是几行纸，所以插完不用管换行。
      const insert = (ch) => {
        const cur = String(form.content || '');
        const sel = caret.value || { at: cur.length, to: cur.length };
        form.content = cur.slice(0, sel.at) + ch + cur.slice(sel.to);
        const at = sel.at + ch.length;
        caret.value = { at, to: at };
        Vue.nextTick(() => {
          const el = ta.value;
          if (!el) return;
          el.focus();
          el.setSelectionRange(at, at);
        });
      };
      const newline = () => insert('\n');
      const all = () => { form.content = Z.PEN_CHARS.split('').join('\n'); caret.value = null; };
      const clear = () => { form.content = ''; caret.value = null; };

      const rows = Vue.computed(() => rowCount(form.content));

      // 输入框里混进来的中文、标点不会印出来，得说一声，别让人以为是 bug
      const dropped = Vue.computed(() =>
        String(form.content || '').toUpperCase().replace(/\s/g, '').split('')
          .filter((c) => Z.PEN_CHARS.indexOf(c) < 0).length);

      return {
        ...gen, form, doc, pages, generate, pageCount, ta, remember,
        insert, newline, all, clear, rows, dropped,
        colsNow: Vue.computed(() => (doc.value ? doc.value.cols : 0)),
        borderColors: Z.BORDER_COLORS,
        traceColors: Z.PEN_TRACE_COLORS,
        footOptions: Z.FOOT_OPTIONS,
      };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd">
              <h3>控笔练习</h3>
              <span class="hint">{{ rows }} 行<template v-if="colsNow"> · 每行 {{ colsNow }} 格</template></span>
            </div>

            <div class="card-bd">
              <z-field label="内容" tip="一行一个图形；点下面的图形会插到光标所在位置，回车留一行空白">
                <textarea class="input pen-input" ref="ta" v-model="form.content" rows="7"
                  @blur="remember" @keyup="remember" @click="remember" @select="remember" @input="remember"
                  placeholder="点下面的图形，插到光标这里；一行一个"></textarea>
                <div class="hint" style="display:flex;gap:12px;margin-top:6px">
                  <a href="javascript:;" @click="newline">插入空行</a>
                  <a href="javascript:;" @click="all">全部图形</a>
                  <a href="javascript:;" @click="clear">清空</a>
                </div>
                <div class="hint" v-if="dropped">有 {{ dropped }} 个字符不是控笔图形，不会印到纸上</div>
              </z-field>
            </div>

            <div class="card-bd">
              <div class="hint" style="margin-bottom:8px">点一下插到光标处</div>
              <z-pen-picks @pick="insert"></z-pen-picks>
            </div>

            <div class="card-bd">
              <z-field label="格子边长" tip="格子越大，一页放的越少；列数行数按它反算，每行都铺满整页宽">
                <z-num v-model="form.size" :min="5" :max="40" suffix="mm"></z-num>
              </z-field>
              <z-field label="行间距">
                <z-num v-model="form.gap" :min="0" :max="10" suffix="mm"></z-num>
              </z-field>
              <z-field label="描红格数" tip="0 是整行都印；填 6 就是前 6 格印线，剩下的留白自己画">
                <z-num v-model="form.trace" :min="0" :max="40" suffix="格"></z-num>
              </z-field>
              <z-field label="页脚" tip="姓名和日期在顶栏齿轮里统一设，这儿只挑印哪几栏">
                <z-seg v-model="form.foot" :options="footOptions"></z-seg>
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
          empty-text="左边点几个图形"></z-preview>

        <z-mbar></z-mbar>
      </div>`,
  };
})();
