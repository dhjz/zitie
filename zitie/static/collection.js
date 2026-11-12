/* 合集：小学一到六年级生字 + 国学经典
   数据在 data/collections.js（从 zivip/download 那批下载页里抽出来的正文）。
   入口挂在顶栏右上角，弹窗里按年级分页签，选一条就能填进汉字字帖或词语文章。

   填哪页都是同一套做法：改 localStorage 里该页的表单存档 + 发一个 zitie:fill 事件。
   页面已经在场就靠事件立刻生效，不在场就等它挂载时从存档里读到。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;
  const LIST = window.ZITIE_COLLECTIONS || [];
  // 页签顺序不跟着数据走：数据里一、二年级各两条，顺序得是年级而不是文件顺序
  const TABS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '国学'];
  const TARGETS = [
    { key: 'hanzi', label: '汉字字帖' },
    { key: 'stage', label: '词语文章' },
  ];

  G.CollectionDialog = {
    name: 'CollectionDialog',
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const tab = Vue.ref(TABS[0]);
      const picked = Vue.ref('');
      const list = Vue.computed(() => LIST.filter((it) => it.tab === tab.value));
      const current = Vue.computed(() => LIST.find((it) => it.id === picked.value) || null);
      // 弹窗只有一个滚动区，切页签回到顶部，别让人以为下面没东西了
      const body = Vue.ref(null);

      const close = () => emit('update:modelValue', false);

      const useTab = (t) => {
        tab.value = t;
        picked.value = (list.value[0] || {}).id || '';
        if (body.value) body.value.scrollTop = 0;
      };

      const fill = (target) => {
        const it = current.value;
        if (!it) return;
        const patch = { content: it.text, title: it.name };
        // 存档写在前：切页时新挂载的组件正是从这儿读初始值
        Z.save(target, Object.assign({}, Z.load(target, {}), patch));
        location.hash = '#/' + target;
        window.dispatchEvent(new CustomEvent('zitie:fill', { detail: { key: target, patch } }));
        Z.toast(`已填入「${it.name}」`, 'info');
        close();
      };

      const onKey = (e) => { if (e.key === 'Escape') close(); };
      Vue.watch(() => props.modelValue, (v) => {
        // 每次打开都从当前页签第一条开始选中；关掉就把键盘监听摘了，别叠着加
        window.removeEventListener('keydown', onKey);
        if (!v) return;
        picked.value = (list.value[0] || {}).id || '';
        window.addEventListener('keydown', onKey);
      });
      Vue.onUnmounted(() => window.removeEventListener('keydown', onKey));

      return { tab, tabs: TABS, list, current, picked, body, close, useTab, fill, targets: TARGETS };
    },
    template: `
      <div v-if="modelValue" class="modal no-print" @click.self="close">
        <div class="modal-panel" role="dialog" aria-label="素材合集">
          <div class="modal-hd">
            <div>
              <div class="modal-title">素材合集</div>
              <div class="hint">小学一到六年级生字表、国学经典全文，选一条直接填进字帖</div>
            </div>
            <button class="icon-btn" title="关闭" @click="close">✕</button>
          </div>

          <div class="modal-tabs">
            <button v-for="t in tabs" :key="t" class="modal-tab" :class="{ on: tab === t }"
              @click="useTab(t)">{{ t }}</button>
          </div>

          <div class="modal-body" ref="body">
            <button v-for="it in list" :key="it.id" class="col-item" :class="{ on: picked === it.id }"
              @click="picked = it.id">
              <div class="col-item-hd">
                <b>{{ it.name }}</b>
                <span class="col-tag">{{ it.kind === 'chars' ? it.count + ' 字' : '全文' }}</span>
              </div>
              <div class="col-item-desc">{{ it.desc }}</div>
              <div class="col-item-text">{{ it.text.slice(0, 34) }}{{ it.text.length > 34 ? '…' : '' }}</div>
            </button>
          </div>

          <div class="modal-ft">
            <span class="hint">{{ current ? current.name : '选一条合集' }}</span>
            <div class="row-between" style="gap:8px">
              <button v-for="t in targets" :key="t.key" class="btn" :class="{ 'btn-primary': current }"
                :disabled="!current" @click="fill(t.key)">填入{{ t.label }}</button>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
