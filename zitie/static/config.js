/* 全局开关，必须在 utils.js 之前加载（index.html 里排第一）。
   改这一个常量就能切换「完整版 / 精简版」。

   IS_LITE = false  读 static/data/strokes、static/data/medians、static/fonts/zh
                    6763 个 GB2312 字，全量约 23MB
   IS_LITE = true   读 static/data/strokes_lite、static/data/medians_lite、
                    static/fonts/zh_lite —— 常用字 3500 上下，约 9MB

   精简版资源不是手搓的，跑 `node scripts/lite.js` 生成（见 scripts/README 或仓库 README）。
   部署时可以把完整版那几个目录删掉，只留 *_lite 三个目录，
   但 IS_LITE 必须跟目录保持一致 —— 它只决定去哪读，不做存在性探测。 */
window.IS_LITE = false;
