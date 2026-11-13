/* 数学练习：加减乘除口算题
   出题保证：范围可调、结果可约束非负与整数、除法必定整除、乘除优先于加减。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  const DEFAULTS = {
    title: '口算练习',
    type: 1,          // 1 整数 2 小数
    max: '10-19',
    cipher: 1,        // 1 加 2 减 3 加减 4 乘 5 除 6 乘除 7 混合
    count: 2,         // 每题的运算数个数
    brackets: 0,
    plus: 1,          // 结果非负
    integer: 1,       // 结果为整数
    total: 60,
    position: 0,      // 0 常规（= 后填） 1 随机挖空
    foot: 1,
    border_color: 'rgb(56, 152, 219)',
    font_color: 'rgb(84, 92, 104)',
  };

  // 参与自动保存与导出；inputs 里的是输入类，不落盘也不导出
  Z.settings.define('math', { label: '数学练习', defaults: DEFAULTS, inputs: [] });

  G.MathPage = {
    name: 'MathPage',
    setup() {
      const gen = G.useGen('math', DEFAULTS, Z.genMath, null);
      const { form, doc, pages, items, generate, print } = gen;

      const typeOptions = [{ v: 1, label: '整数' }, { v: 2, label: '小数' }];
      const rangeOptions = [
        { v: '0-9', label: '0-9' },
        { v: '10-19', label: '10-19' },
        { v: '20-49', label: '20-49' },
        { v: '50-99', label: '50-99' },
        { v: '100-999', label: '100-999' },
      ];
      const cipherOptions = [
        { v: 1, label: '加法' }, { v: 2, label: '减法' }, { v: 3, label: '加减' },
        { v: 4, label: '乘法' }, { v: 5, label: '除法' }, { v: 6, label: '乘除' }, { v: 7, label: '混合' },
      ];
      const countOptions = [{ v: 2, label: '两个数' }, { v: 3, label: '三个数' }, { v: 4, label: '四个数' }];
      const totalOptions = [{ v: 40, label: '40' }, { v: 60, label: '60' }, { v: 80, label: '80' }, { v: 120, label: '120' }];
      const numRangeOptions = [{ v: 2, label: '2 个' }, { v: 3, label: '3 个' }, { v: 4, label: '4 个' }];

      const customRange = Vue.ref(!rangeOptions.some((o) => o.v === form.max));
      const rangeText = Vue.ref(form.max);
      const applyRange = () => {
        const v = String(rangeText.value || '').trim();
        if (!/^\d{1,4}(-\d{1,4})?$/.test(v)) { Z.toast('范围写成 10-19 这样', 'warn'); return; }
        form.max = v;
        customRange.value = true;
        generate();
      };
      Vue.watch(() => form.max, (v) => { customRange.value = !rangeOptions.some((o) => o.v === v); rangeText.value = v; });

      // 减/乘/除都可能出负数或小数，让用户自己决定要不要约束
      const showPlus = Vue.computed(() => [2, 3, 7].includes(Number(form.cipher)));

      return { ...gen, form, doc, pages, items, generate, print,
        typeOptions, rangeOptions, cipherOptions, countOptions, totalOptions, numRangeOptions,
        customRange, rangeText, applyRange, showPlus, footOptions: Z.FOOT_OPTIONS,
        borderColors: Z.BORDER_COLORS, inkColors: Z.INK_COLORS };
    },
    template: `
      <div class="split">
        <aside class="side no-print">
          <div class="card">
            <div class="card-hd"><h3>数学练习</h3><span class="hint">{{ form.total }} 题</span></div>
            <div class="card-bd">
              <z-field label="数值"><z-seg v-model="form.type" :options="typeOptions"></z-seg></z-field>
              <z-field label="范围">
                <z-seg v-model="form.max" :options="rangeOptions"></z-seg>
                <div class="num">
                  <input class="input" v-model="rangeText" style="width:96px" placeholder="10-19" />
                  <button class="btn" @click="applyRange">自定义</button>
                </div>
              </z-field>
              <z-field label="运算"><z-seg v-model="form.cipher" :options="cipherOptions"></z-seg></z-field>
              <z-field label="个数"><z-seg v-model="form.count" :options="countOptions"></z-seg></z-field>
              <z-field label="括号">
                <z-seg v-model="form.brackets" :options="[{ v: 0, label: '不要' }, { v: 1, label: '要' }]"></z-seg>
              </z-field>
              <z-field v-if="showPlus" label="结果">
                <z-seg v-model="form.plus" :options="[{ v: 0, label: '可负' }, { v: 1, label: '非负' }]"></z-seg>
              </z-field>
              <z-field label="整数">
                <z-seg v-model="form.integer" :options="[{ v: 0, label: '随意' }, { v: 1, label: '必须整数' }]"></z-seg>
              </z-field>
              <z-field label="题量"><z-seg v-model="form.total" :options="totalOptions"></z-seg></z-field>
              <z-field label="填空">
                <z-seg v-model="form.position" :options="[{ v: 0, label: '等号后' }, { v: 1, label: '随机' }]"></z-seg>
              </z-field>
              <z-field label="页脚" tip="姓名 / 班级 / 日期">
                <z-seg v-model="form.foot" :options="footOptions"></z-seg>
              </z-field>
            </div>

            <div class="card-bd">
              <z-field label="标题"><input class="input" v-model="form.title" maxlength="30" /></z-field>
            </div>

            <div class="card-bd">
              <button class="btn btn-primary btn-block" @click="generate">换一批题</button>
              <div class="hint" style="margin-top:10px">每次点都会重新随机，题永远不重样。</div>
            </div>
          </div>

          <div class="card">
            <div class="card-bd hint">
              除法先定商和除数再乘回去，保证整除；「结果非负」打开后减法不会出负数。
              三个数以上按先乘除后加减算，括号只包前两个数。
            </div>
          </div>
        </aside>

        <z-preview :doc="doc" :pages="pages" :items="items" @print="print" @regen="generate"
          empty-text="设好范围，点「换一批题」"></z-preview>
      </div>`,
  };
})();
