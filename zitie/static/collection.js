/* 合集：小学一到六年级生字 + 国学经典
   数据在 data/collections.js（从 zivip/download 那批下载页里抽出来的正文）。
   弹窗只是一本参考书，不跟字帖页面搭线：正文摊成一个个小方格，
   点一下选中、再点取消，凑齐了按「一键复制」把选中的字和标点拿走。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;
  const LIST = window.ZITIE_COLLECTIONS || [];
  // 页签顺序不跟着数据走：数据里一、二年级各两条，顺序得是年级而不是文件顺序
  const TABS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '国学'];

  G.CollectionDialog = {
    name: 'CollectionDialog',
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const tab = Vue.ref(TABS[0]);
      // list：挑素材；grid：摊开方格挑字
      const view = Vue.ref('list');
      const item = Vue.ref(null);
      const picked = Vue.reactive(new Set());
      // 弹窗只有一个滚动区，切页签/开条目都回到顶部，别让人以为下面没东西了
      const body = Vue.ref(null);

      const list = Vue.computed(() => LIST.filter((it) => it.tab === tab.value));
      // 每行一个 flex，字符带上全文序号 —— 选中集合只记序号，跟排版无关
      const lines = Vue.computed(() => {
        if (!item.value) return [];
        let n = 0;
        return String(item.value.text).split('\n')
          .filter((line) => line.trim())
          .map((line) => Array.from(line).map((ch) => ({ ch, i: n++ })));
      });
      // 选中的字按原样的行拼回去：国学那种一句一行的，复制出来还是一句一行
      const text = Vue.computed(() => {
        if (!item.value) return '';
        let n = 0;
        const out = [];
        for (const line of String(item.value.text).split('\n')) {
          const keep = [];
          for (const ch of Array.from(line)) {
            const i = n++;
            if (!picked.size || picked.has(i)) keep.push(ch);
          }
          if (keep.join('').trim()) out.push(keep.join(''));
        }
        return out.join('\n');
      });

      const close = () => emit('update:modelValue', false);
      const toTop = () => { if (body.value) body.value.scrollTop = 0; };

      const useTab = (t) => {
        tab.value = t;
        view.value = 'list';
        toTop();
      };
      const open = (it) => {
        item.value = it;
        picked.clear();
        view.value = 'grid';
        toTop();
      };
      const back = () => {
        view.value = 'list';
        toTop();
      };
      const toggle = (i) => { picked.has(i) ? picked.delete(i) : picked.add(i); };
      const clear = () => picked.clear();

      const copy = () => {
        const s = text.value;
        if (!s) { Z.toast('先点几个字', 'warn'); return; }
        const ok = () => {
          Z.toast(picked.size ? `已复制 ${picked.size} 个字符` : `已复制「${item.value.name}」全文`, 'info');
        };
        // 双击 index.html 打开是 file://，不算安全上下文，clipboard API 用不了，
        // 得退回老办法：藏一个 textarea，选中再 execCommand
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(s).then(ok, () => fallback(s) && ok());
        } else if (fallback(s)) ok();
        else Z.toast('这台浏览器不让复制，手动选中吧', 'warn');
      };
      const fallback = (s) => {
        const ta = document.createElement('textarea');
        ta.value = s;
        ta.style.cssText = 'position:fixed;top:-9999px;opacity:0';
        document.body.appendChild(ta);
        ta.select();
        let ok = false;
        try { ok = document.execCommand('copy'); } catch {}
        ta.remove();
        return ok;
      };

      const onKey = (e) => { if (e.key === 'Escape') close(); };
      Vue.watch(() => props.modelValue, (v) => {
        // 每次打开都从列表第一页开始；关掉就把键盘监听摘了，别叠着加
        window.removeEventListener('keydown', onKey);
        if (!v) return;
        view.value = 'list';
        item.value = null;
        picked.clear();
        window.addEventListener('keydown', onKey);
      });
      Vue.onUnmounted(() => window.removeEventListener('keydown', onKey));

      return {
        tab, tabs: TABS, view, item, list, lines, picked, body,
        close, useTab, open, back, toggle, clear, copy,
      };
    },
    template: `
      <div v-if="modelValue" class="modal no-print" @click.self="close">
        <div class="modal-panel" role="dialog" aria-label="素材合集">
          <div class="modal-hd">
            <div>
              <div class="modal-title">{{ view === 'grid' && item ? item.name : '素材合集' }}</div>
              <div class="hint">{{ view === 'grid'
                ? '点方格选中或取消，再点「一键复制」带走；一个都不选就是整篇'
                : '小学一到六年级生字表、国学经典全文，随便看看，复制走想要的' }}</div>
            </div>
            <button class="icon-btn" title="关闭" @click="close">✕</button>
          </div>

          <div v-if="view === 'list'" class="modal-tabs">
            <button v-for="t in tabs" :key="t" class="modal-tab" :class="{ on: tab === t }"
              @click="useTab(t)">{{ t }}</button>
          </div>

          <div v-if="view === 'list'" class="modal-body" ref="body">
            <button v-for="it in list" :key="it.id" class="col-item" @click="open(it)">
              <div class="col-item-hd">
                <b>{{ it.name }}</b>
                <span class="col-tag">{{ it.kind === 'chars' ? it.count + ' 字' : '全文' }}</span>
              </div>
              <div class="col-item-desc">{{ it.desc }}</div>
              <div class="col-item-text">{{ it.text.slice(0, 34) }}{{ it.text.length > 34 ? '…' : '' }}</div>
            </button>
          </div>

          <div v-else class="modal-body grid-view" ref="body">
            <button class="gx-back" @click="back">← 回到{{ tab }}</button>
            <div v-for="(ln, li) in lines" :key="li" class="gx-line">
              <button v-for="c in ln" :key="c.i" class="gx-cell" :class="{ on: picked.has(c.i) }"
                @click="toggle(c.i)">{{ c.ch }}</button>
            </div>
          </div>

          <div class="modal-ft">
            <span class="hint">{{ view === 'grid'
              ? (picked.size ? '已选 ' + picked.size + ' 个字符' : '整篇 ' + (item ? item.count : 0) + ' 字')
              : '共 ' + list.length + ' 份素材' }}</span>
            <div class="row-between" style="gap:8px">
              <button v-if="view === 'grid'" class="btn" :disabled="!picked.size" @click="clear">清空</button>
              <button v-if="view === 'grid'" class="btn btn-primary" @click="copy">一键复制</button>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
