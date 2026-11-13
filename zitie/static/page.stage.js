/* 词语文章字帖：整段文字铺格子
   不画 SVG 笔画，直接用字体整字渲染 —— 长段落才能保持可读与轻量。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '课文抄写',
    content: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。',
    font_key: 'kaiti',
    pinyin: 0,
    py_style: 'grid',
    guide: 'tian',
    trace: 1,
    fix: 0,
    foot: 1,
    cols: 12,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(84, 92, 104)',
  };

  const validate = (f) => (String(f.content || '').trim() ? '' : '先输入一段文字');

  G.StagePage = {
    name: 'StagePage',
    setup() {
      const gen = G.useGen('stage', DEFAULTS, Z.genStage, validate);
      const { form, doc, pages, items, generate, print } = gen;
      const charCount = Vue.computed(() => String(form.content || '').replace(/\s/g, '').length);
      const colOptions = [{ v: 8, label: '8 列' }, { v: 10, label: '10 列' }, { v: 12, label: '12 列' }, { v: 14, label: '14 列' }];
      const guideOptions = Z.GUIDE_OPTIONS;
      const traceOptions = Z.TRACE_OPTIONS;
      const footOptions = Z.FOOT_OPTIONS;
      const pyStyles = Z.PY_STYLES;

      // 一年级课本里的常用篇目，点一下直接填进去
      const presets = [
        { name: '静夜思', text: '床前明月光，疑是地上霜。\n举头望明月，低头思故乡。' },
        { name: '春晓', text: '春眠不觉晓，处处闻啼鸟。\n夜来风雨声，花落知多少。' },
        { name: '咏鹅', text: '鹅鹅鹅，曲项向天歌。\n白毛浮绿水，红掌拨清波。' },
        { name: '悯农', text: '锄禾日当午，汗滴禾下土。\n谁知盘中餐，粒粒皆辛苦。' },
      ];
      const usePreset = (p) => { form.content = p.text; generate(); };

      return { ...gen, form, doc, pages, items, generate, print,
        charCount, colOptions, guideOptions, traceOptions, footOptions, pyStyles,
        presets, usePreset,
        fonts: Z.ZH_FONTS, borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>词语文章</h3><span class="hint">{{ charCount }} 字</span></div>
            <div class="card-bd">
              <z-field label="正文">
                <textarea class="input" v-model="form.content" rows="5" style="letter-spacing:0"
                  placeholder="课文、古诗、词语表都行；敲回车就是换行"></textarea>
                <div class="hint">一行最多 {{ form.cols }} 格，超了自动折行；回车换行不会被拆。</div>
                <div class="hint">想留一行空白自己写，就单起一行填 <b>□</b>，填几个空几行。</div>
                <div class="chip-list">
                  <button v-for="p in presets" :key="p.name" class="chip" @click="usePreset(p)">{{ p.name }}</button>
                </div>
              </z-field>
              <z-field label="列数"><z-seg v-model="form.cols" :options="colOptions"></z-seg></z-field>
              <z-field label="格型"><z-seg v-model="form.guide" :options="guideOptions"></z-seg></z-field>
              <z-field label="字体"><z-fonts v-model="form.font_key" :fonts="fonts" sample="春眠不觉"></z-fonts></z-field>
              <z-field label="拼音">
                <z-seg v-model="form.pinyin" :options="[{ v: 1, label: '有拼音' }, { v: 0, label: '无拼音' }]"></z-seg>
              </z-field>
              <z-field v-if="Number(form.pinyin)" label="拼音格">
                <z-seg v-model="form.py_style" :options="pyStyles"></z-seg>
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
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="输入一段文字"></z-preview>
      </div>`,
  };
})();
