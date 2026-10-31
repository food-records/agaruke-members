#!/usr/bin/env python3
"""最新トップのABOUT画像だけを指定写真へ差し替える。"""
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
about=next(b for b in section['blocks'].values() if b['type']=='about')
about['settings'].update(image='shopify://shop_images/moritsuke-image.png',image_alt='ミートボールと付け合わせを、お気に入りの器に盛り付けるひととき。',image_alt_en='Plating meatballs and accompaniments on a favorite dish.')
print('ABOUT: moritsuke-image.png + JA/EN alt')
if args.apply:
    path.write_text(raw[:raw.index('{')]+json.dumps(data,ensure_ascii=False,indent=2)+'\n')
