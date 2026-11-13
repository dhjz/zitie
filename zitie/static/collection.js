/* 合集：小学一到六年级生字 + 国学经典 + 课文生字
   数据在 data/collections.js（从 zivip/download 那批下载页里抽出来的正文）
   与 data/lessons.js（统编版各册识字表，按课分组）。
   弹窗只是一本参考书，不跟字帖页面搭线：正文摊成一个个小方格，
   点一下选中、再点取消，凑齐了按「一键复制」把选中的字和标点拿走。
   课文生字不再一层层点进去：一个年级一页，上册下册一换，
   整册每课的生字方块全摊在眼前，跨课跨册一起挑。 */
(function () {
  const G = (window.myComponents = window.myComponents || {});
  const Z = window.Zu;
  const LIST = window.ZITIE_COLLECTIONS || [];
  // 课文生字按册分组，册名「三年级上册」归到「三年级」页签下
  const BOOKS = (window.ZITIE_LESSONS || []).map((b) => ({
    ...b,
    grade: String(b.book).replace(/[上下]册$/, ''),
    chars: b.lessons.reduce((n, l) => n + l.c.length, 0),
  }));
  // 页签顺序不跟着数据走：数据里一、二年级各两条，顺序得是年级而不是文件顺序
  const TABS = ['一年级', '二年级', '三年级', '四年级', '五年级', '六年级', '国学'];

  G.CollectionDialog = {
    name: 'CollectionDialog',
    props: { modelValue: Boolean },
    emits: ['update:modelValue'],
    setup(props, { emit }) {
      const tab = Vue.ref(TABS[0]);
      // list：年级页（素材卡片 + 课文平铺）；grid：摊开一篇素材挑字
      const view = Vue.ref('list');
      const item = Vue.ref(null);
      // 课文区当前翻到哪一册（上册/下册），一个年级一页只换册不换页
      const curBook = Vue.ref(null);
      // 选中集合的键：素材是字序号 "12"，课文是 "册|课|字" —— 跨册混选也不会撞
      const picked = Vue.reactive(new Set());
      // 弹窗只有一个滚动区，换页签/换册都回到顶部，别让人以为下面没东西了
      const body = Vue.ref(null);

      // 这个年级的现成素材（整册生字表那种纯字串）
      const materials = Vue.computed(() => LIST.filter((it) => it.tab === tab.value));
      // 这个年级有课文生字的册：上册、下册
      const books = Vue.computed(() => BOOKS.filter((b) => b.grade === tab.value));
      const shortName = (book) => String(book).replace(tab.value, '');
      // 当前册每课都预算成字符数组，模板里就不用反复 Array.from
      const lessons = Vue.computed(() => {
        if (!curBook.value) return [];
        const name = curBook.value.book;
        return curBook.value.lessons.map((l, li) => ({
          t: l.t, chars: Array.from(l.c), key: name + '|' + li,
        }));
      });
      // 每行一个 flex，字符带上全文序号 —— 选中集合只记序号，跟排版无关
      const lines = Vue.computed(() => {
        if (!item.value) return [];
        let n = 0;
        return String(item.value.text).split('\n')
          .filter((line) => line.trim())
          .map((line) => Array.from(line).map((ch) => ({ ch, i: String(n++) })));
      });
      // 选中的字按原样的行拼回去：国学那种一句一行的，复制出来还是一句一行
      const text = Vue.computed(() => {
        if (!item.value) return '';
        let n = 0;
        const out = [];
        for (const line of String(item.value.text).split('\n')) {
          const keep = [];
          for (const ch of Array.from(line)) {
            const i = String(n++);
            if (!picked.size || picked.has(i)) keep.push(ch);
          }
          if (keep.join('').trim()) out.push(keep.join(''));
        }
        return out.join('\n');
      });
      // 课文：挑过的字按课一行一行拼，跨册挑的按册顺序排；
      // 一个字都没挑，就是当前这一册从头到尾（一键搬走整册）
      const bookText = Vue.computed(() => {
        if (!books.value.length) return '';
        const out = [];
        for (const b of books.value) {
          b.lessons.forEach((l, li) => {
            const keep = Array.from(l.c).filter((ch, ci) => picked.has(b.book + '|' + li + '|' + ci));
            if (keep.length) out.push(keep.join(''));
          });
        }
        if (out.length) return out.join('\n');
        return curBook.value ? curBook.value.lessons.map((l) => l.c).join('\n') : '';
      });
      // 挑了几课：用来在册切换上标个小红点似的计数
      const bookPicked = Vue.computed(() => {
        if (!curBook.value) return 0;
        const name = curBook.value.book;
        let n = 0;
        curBook.value.lessons.forEach((l, li) => {
          if (Array.from(l.c).some((ch, ci) => picked.has(name + '|' + li + '|' + ci))) n++;
        });
        return n;
      });

      const close = () => emit('update:modelValue', false);
      const toTop = () => { if (body.value) body.value.scrollTop = 0; };

      const useTab = (t) => {
        tab.value = t;
        view.value = 'list';
        item.value = null;
        // 换年级清空：选中键带册名，留着上一册的计数会跟页脚对不上
        picked.clear();
        const own = BOOKS.filter((b) => b.grade === t);
        curBook.value = own[0] || null;
        toTop();
      };
      // 换册不清空已选：上册挑一半、翻到下册接着挑，最后一起复制走
      const useBook = (b) => { curBook.value = b; toTop(); };
      const open = (it) => {
        picked.clear();
        item.value = it;
        view.value = 'grid';
        toTop();
      };
      const back = () => { view.value = 'list'; item.value = null; toTop(); };
      // 素材方格：键就是字序号；课文方格：键是「册|课|字」，所以分两个入口
      const toggleAt = (key) => {
        picked.has(key) ? picked.delete(key) : picked.add(key);
      };
      // 点课名整课选中 / 整课取消 —— 想按课挑的时候不用一个字一个字点
      const doneCount = (l) => l.chars.filter((ch, ci) => picked.has(l.key + '|' + ci)).length;
      const toggleLesson = (l) => {
        const all = l.chars.every((ch, ci) => picked.has(l.key + '|' + ci));
        l.chars.forEach((ch, ci) => {
          const key = l.key + '|' + ci;
          if (all) picked.delete(key); else picked.add(key);
        });
      };
      const clear = () => picked.clear();

      const put = (s, said) => {
        const ok = () => Z.toast(said, 'info');
        // 双击 index.html 打开是 file://，不算安全上下文，clipboard API 用不了，
        // 得退回老办法：藏一个 textarea，选中再 execCommand
        if (navigator.clipboard && window.isSecureContext) {
          navigator.clipboard.writeText(s).then(ok, () => fallback(s) && ok());
        } else if (fallback(s)) ok();
        else Z.toast('这台浏览器不让复制，手动选中吧', 'warn');
      };
      const copy = () => {
        if (view.value === 'list') {
          const s = bookText.value;
          if (!s) { Z.toast('这一册还没有生字', 'warn'); return; }
          put(s, picked.size
            ? `已复制 ${picked.size} 个字`
            : `已复制「${curBook.value.book}」全册 ${curBook.value.chars} 字`);
          return;
        }
        const s = text.value;
        if (!s) { Z.toast('先点几个字', 'warn'); return; }
        put(s, picked.size ? `已复制 ${picked.size} 个字符` : `已复制「${item.value.name}」全文`);
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
        // 每次打开都从第一页开始；关掉就把键盘监听摘了，别叠着加
        window.removeEventListener('keydown', onKey);
        if (!v) return;
        view.value = 'list';
        item.value = null;
        picked.clear();
        useTab(tab.value);
        window.addEventListener('keydown', onKey);
      });
      Vue.onUnmounted(() => window.removeEventListener('keydown', onKey));

      return {
        tab, tabs: TABS, view, item, materials, books, lessons, curBook, shortName,
        lines, picked, bookPicked, body,
        close, useTab, useBook, open, back, toggleAt, toggleLesson, doneCount, clear, copy,
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
                : '课文生字按册全摊开，点方格挑字、点课名整课选中，可以跨课跨册一起挑' }}</div>
            </div>
            <button class="icon-btn" title="关闭" @click="close">✕</button>
          </div>

          <div v-if="view === 'list'" class="modal-tabs">
            <button v-for="t in tabs" :key="t" class="modal-tab" :class="{ on: tab === t }"
              @click="useTab(t)">{{ t }}</button>
          </div>

          <div v-if="view === 'list'" class="modal-body list-view" ref="body">
            <template v-if="books.length">
              <div class="bk-bar">
                <button v-for="b in books" :key="b.book" class="bk-chip"
                  :class="{ on: curBook && curBook.book === b.book }" @click="useBook(b)">
                  {{ shortName(b.book) }}<span class="bk-num">{{ b.lessons.length }} 课 · {{ b.chars }} 字</span>
                </button>
                <span v-if="bookPicked" class="bk-picked">本册已挑 {{ bookPicked }} 课</span>
              </div>
              <div class="lesson-grid">
                <section v-for="l in lessons" :key="l.key" class="lesson-block">
                  <button class="lesson-hd" :class="{ on: doneCount(l) && doneCount(l) === l.chars.length }"
                    :title="'点一下整课选中 / 取消'" @click="toggleLesson(l)">
                    <span class="lesson-name">{{ l.t }}</span>
                    <span class="lesson-cnt">{{ doneCount(l) }}/{{ l.chars.length }}</span>
                  </button>
                  <div class="gx-line">
                    <button v-for="(ch, ci) in l.chars" :key="ci" class="gx-cell"
                      :class="{ on: picked.has(l.key + '|' + ci) }"
                      @click="toggleAt(l.key + '|' + ci)">{{ ch }}</button>
                  </div>
                </section>
              </div>
            </template>

            <template v-if="materials.length">
              <div class="sec-title" v-if="books.length">整册生字与国学</div>
              <div class="col-grid">
                <button v-for="it in materials" :key="it.id" class="col-item" @click="open(it)">
                  <div class="col-item-hd">
                    <b>{{ it.name }}</b>
                    <span class="col-tag">{{ it.kind === 'text' ? '全文' : it.count + ' 字' }}</span>
                  </div>
                  <div class="col-item-desc">{{ it.desc }}</div>
                  <div class="col-item-text">{{ it.text.slice(0, 34) }}{{ it.text.length > 34 ? '…' : '' }}</div>
                </button>
              </div>
            </template>

            <div v-if="!books.length && !materials.length" class="hint">这一类还没收东西</div>
          </div>

          <div v-else class="modal-body grid-view" ref="body">
            <button class="gx-back" @click="back">← 回到{{ tab }}</button>
            <div v-for="(ln, li) in lines" :key="li" class="gx-line">
              <button v-for="c in ln" :key="c.i" class="gx-cell" :class="{ on: picked.has(c.i) }"
                @click="toggleAt(c.i)">{{ c.ch }}</button>
            </div>
          </div>

          <div class="modal-ft">
            <span class="hint">{{ view === 'grid'
              ? (picked.size ? '已选 ' + picked.size + ' 个字符' : '整篇 ' + (item ? item.count : 0) + ' 字')
              : (picked.size
                  ? '已选 ' + picked.size + ' 个字'
                  : curBook
                    ? '当前 ' + curBook.book + ' 共 ' + curBook.chars + ' 字'
                    : '共 ' + materials.length + ' 份素材，点开挑字') }}</span>
            <div class="row-between" style="gap:8px" v-if="view === 'grid' || books.length">
              <button class="btn" :disabled="!picked.size" @click="clear">清空</button>
              <button class="btn btn-primary" @click="copy">
                {{ view === 'grid' ? '一键复制' : (picked.size ? '复制选中的 ' + picked.size + ' 字' : '整册复制') }}
              </button>
            </div>
          </div>
        </div>
      </div>`,
  };
})();
