#!/usr/bin/env python3
"""おいしさの理由ブロックへユーザー指定の食卓写真を設定する。"""
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
craft=next(b for b in section['blocks'].values() if b['type']=='craft')
craft['settings'].update(image='shopify://shop_images/house-meal.png',image_alt='豚角煮と牛すじ煮込み、ほうれん草を器に盛り付けた食卓。',image_alt_en='Braised pork belly, stewed beef tendon and spinach plated at the dining table.')
print('craft: house-meal.png + JA/EN alt')
if args.apply:
    path.write_text(raw[:raw.index('{')]+json.dumps(data,ensure_ascii=False,indent=2)+'\n')
