#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
《嘟豪》构建脚本：把 src/ 下的 HTML/CSS/JS 与图片/音频/字体全部内联，
产出可离线双击运行的单文件 dist/嘟豪.html
用法：python3 build.py
"""
import base64, json, os, re, sys, mimetypes

ROOT = os.path.dirname(os.path.abspath(__file__))
os.chdir(ROOT)
SRC = 'src'
DIST = 'dist'
OUT_NAME = '嘟豪.html'

def read(p):
    with open(p, 'rb') as f:
        return f.read()

def b64(p):
    return base64.b64encode(read(p)).decode('ascii')

def data_uri(p):
    ext = os.path.splitext(p)[1].lower()
    mime = {'.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg',
            '.webp':'image/webp', '.woff2':'font/woff2', '.woff':'font/woff',
            '.ttf':'font/ttf', '.ogg':'audio/ogg', '.mp3':'audio/mpeg',
            '.wav':'audio/wav', '.m4a':'audio/mp4'}.get(ext)
    if not mime:
        mime = mimetypes.guess_type(p)[0] or 'application/octet-stream'
    return 'data:%s;base64,%s' % (mime, b64(p))

def main():
    os.makedirs(DIST, exist_ok=True)
    html = read(os.path.join(SRC, 'index.html')).decode('utf-8')

    # ---------- 1. 资源字典 ----------
    img_dir = 'assets/images'
    images = {}
    if os.path.isdir(img_dir):
        for fn in sorted(os.listdir(img_dir)):
            if fn.lower().endswith('.png'):
                name = os.path.splitext(fn)[0]
                images[name] = data_uri(os.path.join(img_dir, fn))
    print('images:', len(images), 'total base64 %.2f MB' % (sum(len(v) for v in images.values())/1048576))

    audio_data = {}
    manifest_path = 'assets/audio/manifest.json'
    if os.path.exists(manifest_path):
        manifest = json.loads(read(manifest_path).decode('utf-8'))
        for name, fn in manifest.items():
            p = os.path.join('assets/audio', fn)
            if os.path.exists(p):
                audio_data[name] = data_uri(p)
        print('audio:', len(audio_data), 'total base64 %.2f MB' % (sum(len(v) for v in audio_data.values())/1048576))

    # ---------- 2. CSS ----------
    css = read(os.path.join(SRC, 'css/style.css')).decode('utf-8')
    def css_url(m):
        rel = m.group(1)
        if rel.startswith('data:'):
            return m.group(0)
        p = os.path.normpath(os.path.join(SRC, 'css', rel))
        if os.path.exists(p):
            return 'url("%s")' % data_uri(p)
        print('WARN css asset missing:', p)
        return m.group(0)
    css = re.sub(r'url\("([^"]+)"\)', css_url, css)
    css = re.sub(r'url\(\'([^\']+)\'\)', css_url, css)
    html = html.replace('<link rel="stylesheet" href="css/style.css">', '<style>\n' + css + '\n</style>')

    # ---------- 3. 字体（index.html 里的 @font-face） ----------
    font_path = 'assets/font/DHFont.woff2'
    if os.path.exists(font_path):
        font_uri = data_uri(font_path)
        html = html.replace('../assets/font/DHFont.woff2', font_uri)
        print('font: %.1f KB' % (len(font_uri)/1024))
    else:
        print('WARN 字体子集不存在，使用系统字体回退')

    # ---------- 4. 数据注入 ----------
    payload = 'window.DH_ASSETS=' + json.dumps(images, ensure_ascii=False) + ';\n'
    payload += 'window.DH_AUDIO_DATA=' + json.dumps(audio_data, ensure_ascii=False) + ';\n'
    payload = '<script>\n' + payload + '</script>\n'

    # ---------- 5. 内联 JS ----------
    def inline_script(m):
        src = m.group(1)
        p = os.path.normpath(os.path.join(SRC, src))
        if not os.path.exists(p):
            print('WARN script missing:', p)
            return '<!-- missing: %s -->' % src
        code = read(p).decode('utf-8')
        if '</script' in code.lower():
            print('WARN script contains </script:', src)
        return '<script>\n/* ==== %s ==== */\n%s\n</script>' % (src, code)

    html = re.sub(r'<script src="([^"]+)"></script>', inline_script, html)

    # 数据脚本插到第一个内联脚本之前
    idx = html.find('<script>')
    if idx >= 0:
        html = html[:idx] + payload + html[idx:]

    # ---------- 6. favicon ----------
    favicon = ('<link rel="icon" href="data:image/svg+xml;utf8,'
               '%3Csvg xmlns=%27http://www.w3.org/2000/svg%27 viewBox=%270 0 100 100%27%3E'
               '%3Crect width=%27100%27 height=%27100%27 rx=%2718%27 fill=%27%23d73b52%27/%3E'
               '%3Ctext x=%2750%27 y=%2768%27 font-size=%2752%27 font-family=%27sans-serif%27 '
               'font-weight=%27bold%27 fill=%27white%27 text-anchor=%27middle%27%3E%E5%96%B5%3C/text%3E'
               '%3C/svg%3E">')
    html = html.replace('</title>', '</title>\n' + favicon)

    # ---------- 7. 输出 ----------
    out = os.path.join(DIST, OUT_NAME)
    with open(out, 'w', encoding='utf-8') as f:
        f.write(html)
    with open(os.path.join(DIST, 'index.html'), 'w', encoding='utf-8') as f:
        f.write(html)
    print('OK ->', out, '%.2f MB' % (os.path.getsize(out)/1048576))

if __name__ == '__main__':
    main()
