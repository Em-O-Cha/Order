#!/usr/bin/env python3
# แตกไฟล์ที่ดาวน์โหลดจาก Google Drive (exportMimeType application/vnd.google-apps.script+json) ออกเป็นไฟล์ .gs/.html
# python3 unpack_gas.py <ไฟล์ผลดาวน์โหลด.json หรือ .txt> <โฟลเดอร์ปลายทาง>
import json, base64, os, sys
src, out = sys.argv[1], sys.argv[2]
d = json.load(open(src))
c = d.get('content', d)
try:
    j = json.loads(base64.b64decode(c)) if isinstance(c, str) else c
except Exception:
    j = json.loads(c)
os.makedirs(out, exist_ok=True)
for f in j['files']:
    ext = {'server_js': '.gs', 'html': '.html', 'json': '.json'}[f['type']]
    open(os.path.join(out, f['name'] + ext), 'w', encoding='utf-8').write(f['source'])
    print(f['name'] + ext)
