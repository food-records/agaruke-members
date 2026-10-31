#!/usr/bin/env python3
"""YOUR OWN LITTLE TREATへユーザー指定の夜の写真を設定する。"""
import argparse
import json
import re
from pathlib import Path
parser=argparse.ArgumentParser()
parser.add_argument('theme',type=Path)
parser.add_argument('--apply',action='store_true')
args=parser.parse_args()
path=args.theme/'templates/index.json'
raw=path.read_text()
data=json.loads(re.sub(r'/\*.*?\*/','',raw,flags=re.S))
section=next(s for s in data['sections'].values() if s['type']=='agaruke-home-content')
moment=next(b for b in section['blocks'].values() if b['type']=='moment')
moment['settings'].update(image='shopify://shop_images/me-time-wide.png',image_alt='好きな動画と飲み物、スパイスカレーを楽しむ夜のひととき。',image_alt_en='An evening with a favorite show, a drink and a plate of spice curry.')
print('moment: me-time-wide.png + JA/EN alt')
if args.apply:path.write_text(raw[:raw.index('{')]+json.dumps(data,ensure_ascii=False,indent=2)+'\n')
