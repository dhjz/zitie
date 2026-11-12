/* 空白练习纸：田字格 / 米字格 / 拼音格 / 四线三格
   就是不想写字，只想打印一叠格子的时候用。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '练习纸',
    type: 1,
    num: 2,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(84, 92, 104)',
  };

  G.BlankPage = {
    name: 'BlankPage',
    setup() {
      const gen = G.useGen('blank', DEFAULTS, Z.genBlank, null);
      const { form, doc, pages, items, generate, print } = gen;
      const typeOptions = [
        { v: 1, label: '田字格' }, { v: 2, label: '田+拼音' },
        { v: 3, label: '米字格' }, { v: 4, label: '米+拼音' },
        { v: 5, label: '英文纸' },
      ];
      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, borderColors: Z.BORDER_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>空白练习纸</h3></div>
            <div class="card-bd">
              <z-field label="纸张"><z-seg v-model="form.type" :options="typeOptions"></z-seg></z-field>
              <z-field label="页数"><z-num v-model="form.num" :min="1" :max="30" suffix="张"></z-num></z-field>
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
            <div class="card-bd hint">一份 A4 满页格子：无拼音 12 列 × 16 行，有拼音 12 列 × 11 行。</div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="选纸张类型"></z-preview>
      </div>`,
  };
})();
