#!/usr/bin/env python3
"""把「精简版」离线站点打成一个 zip，给 Tag 发布时挂到 Release 附件。

精简版 = 完整版去掉 static/data/strokes、static/data/medians、static/fonts/zh，
包里再把 config.js 的 IS_LITE 钉成 true —— 前端只读 *_lite 三个目录。
解压后双击 index.html 就能用，不用起服务。

    python3 scripts/pack-lite.py                    # 产物 dist/zitie-lite.zip
    python3 scripts/pack-lite.py --tag v1.2-lite    # 产物 dist/zitie-lite-v1.2-lite.zip
"""
import argparse
import os
import re
import sys
import zipfile

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

# 只有完整版才用的重资源目录，不打包
DROP_DIRS = ('static/data/strokes', 'static/data/medians', 'static/fonts/zh')
# 精简版赖以生存的资源，缺了就别出包了
NEED_DIRS = ('static/data/strokes_lite', 'static/data/medians_lite', 'static/fonts/zh_lite')
# 站点根目录的零散文件
ROOT_FILES = ('index.html', 'favicon.ico', 'LICENSE', 'README.md')
# 不入包：构建产物、依赖、隐藏目录
SKIP_NAMES = {'.git', 'node_modules', 'dist', '__pycache__'}


def collect():
    """按仓库相对路径列出要入包的文件。"""
    files = [f for f in ROOT_FILES if os.path.isfile(os.path.join(ROOT, f))]
    for dirpath, dirnames, filenames in os.walk(os.path.join(ROOT, 'static')):
        rel_dir = os.path.relpath(dirpath, ROOT).replace(os.sep, '/')
        dirnames[:] = sorted(
            d for d in dirnames
            if d not in SKIP_NAMES and f'{rel_dir}/{d}' not in DROP_DIRS
        )
        files += [f'{rel_dir}/{f}' for f in sorted(filenames)]
    return files


def check(files):
    dirs = {os.path.dirname(f) for f in files}
    missing = [d for d in NEED_DIRS if d not in dirs]
    if missing:
        sys.exit('缺精简版资源，先跑 `node scripts/lite.js`：\n  ' + '\n  '.join(missing))
    leaked = [d for d in DROP_DIRS if d in dirs]
    if leaked:
        sys.exit('完整版资源混进来了，检查 DROP_DIRS：' + ', '.join(leaked))


def main():
    ap = argparse.ArgumentParser()
    ap.add_argument('--tag', default='', help='版本号，写进 zip 文件名')
    ap.add_argument('--out', default='', help='zip 输出路径')
    args = ap.parse_args()

    files = collect()
    check(files)
    out = args.out or os.path.join(
        ROOT, 'dist', 'zitie-lite%s.zip' % ('-' + args.tag if args.tag else ''))
    os.makedirs(os.path.dirname(os.path.abspath(out)), exist_ok=True)

    raw = 0
    with zipfile.ZipFile(out, 'w', zipfile.ZIP_DEFLATED, compresslevel=9) as z:
        for rel in files:
            data = open(os.path.join(ROOT, rel), 'rb').read()
            if rel == 'static/config.js':
                # 包里只有 *_lite 目录，开关必须跟着改，否则整站读不到笔顺
                data, n = re.subn(rb'window\.IS_LITE\s*=\s*\w+;', b'window.IS_LITE = true;', data)
                if not n:
                    sys.exit('static/config.js 里没找到 window.IS_LITE 开关')
            raw += len(data)
            z.writestr(rel, data)

    size = os.path.getsize(out)
    print('入包 %d 个文件，原始 %.2fMB → zip %.2fMB' % (len(files), raw / 1048576, size / 1048576))
    print('产物：%s' % out)


if __name__ == '__main__':
    main()
