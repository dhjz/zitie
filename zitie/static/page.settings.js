/* 设置弹窗：配置的出口和入口
   导出 JSON（下载一份文件）/ 导入 JSON（覆盖本机配置）/ 恢复默认（清空后刷新）。
   弹窗挂在壳上，任何页面都能点开；导入和恢复都会整页刷新 ——
   已经挂载的页面各自持有一份 form，逐页去改反而容易留下半新半旧的中间态。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;

  G.SettingsDialog = {
    name: 'SettingsDialog',
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const pages = Vue.ref([]);
      const fileInput = Vue.ref(null);
      const stats = Vue.computed(() => {
        const base = Z.settings.dump();
        return Object.keys(base.pages).reduce((n, k) => n + Object.keys(base.pages[k]).length, 0);
      });

      const close = () => emit('update:modelValue', false);

      // 文件名带日期，导几次能分清哪份新
      const stamp = () => {
        const d = new Date();
        const p = (n) => String(n).padStart(2, '0');
        return `${d.getFullYear()}${p(d.getMonth() + 1)}${p(d.getDate())}-${p(d.getHours())}${p(d.getMinutes())}`;
      };

      const exportJson = () => {
        const text = JSON.stringify(Z.settings.dump(), null, 2);
        const url = URL.createObjectURL(new Blob([text], { type: 'application/json' }));
        const a = document.createElement('a');
        a.href = url;
        a.download = `zitie-配置-${stamp()}.json`;
        document.body.appendChild(a);
        a.click();
        a.remove();
        setTimeout(() => URL.revokeObjectURL(url), 0);
        Z.toast('已导出配置文件', 'info');
      };

      const pick = () => { if (fileInput.value) fileInput.value.click(); };

      // 覆盖前先问一句：本机现有配置会被整份替换，不做合并
      const onFile = (e) => {
        const f = e.target.files && e.target.files[0];
        e.target.value = '';
        if (!f) return;
        const reader = new FileReader();
        reader.onload = () => {
          let json = null;
          try { json = JSON.parse(String(reader.result || '')); } catch { Z.toast('文件不是合法的 JSON', 'warn'); return; }
          if (!confirm('导入会覆盖本机现有的配置，确定？')) return;
          try {
            const n = Z.settings.load(json);
            Z.toast(`导入了 ${n} 个页面的配置，正在刷新`, 'info');
            setTimeout(() => location.reload(), 700);
          } catch (err) { Z.toast(err.message || '导入失败', 'warn'); }
        };
        reader.readAsText(f);
      };

      const reset = () => {
        if (!confirm('清空本机保存的所有配置，恢复成出厂默认？会刷新页面。')) return;
        Z.settings.reset();
        location.reload();
      };

      Vue.watch(() => props.modelValue, (v) => {
        if (v) pages.value = Z.settings.list();
      });

      return { pages, fileInput, stats, close, exportJson, pick, onFile, reset };
    },
    template: `
      <div v-if="modelValue" class="modal no-print" @click.self="close">
        <div class="modal-panel set-panel" role="dialog" aria-label="设置">
          <div class="modal-hd">
            <div>
              <div class="modal-title">设置</div>
              <div class="hint">参数改完自动保存，刷新还在。正文、逐字注音这类输入内容不保存。</div>
            </div>
            <button class="icon-btn" title="关闭" @click="close">✕</button>
          </div>

          <div class="modal-body set-body">
            <div class="set-list">
              <div v-for="p in pages" :key="p.key" class="set-row">
                <span>{{ p.label }}</span>
                <span class="hint">{{ p.count }} 项</span>
              </div>
            </div>
            <p class="hint">导出会把这 {{ pages.length }} 个页面的配置和亮暗主题打包成一份 JSON，换台机器导入就还原。</p>
          </div>

          <div class="modal-ft">
            <span class="hint">共 {{ stats }} 项配置</span>
            <div class="row-between" style="gap:8px">
              <button class="btn btn-sm" @click="reset">恢复默认</button>
              <button class="btn btn-sm" @click="pick">导入 JSON</button>
              <button class="btn btn-sm btn-primary" @click="exportJson">导出 JSON</button>
            </div>
          </div>
          <input ref="fileInput" type="file" accept="application/json,.json" style="display:none" @change="onFile" />
        </div>
      </div>`,
  };
})();
