#!/usr/bin/env python3
"""既存トップ設定を保持して、おいしさの理由とスマホ画像を追加する。"""
import argparse
import json
import re
from pathlib import Path

parser = argparse.ArgumentParser()
parser.add_argument('theme', type=Path)
parser.add_argument('--apply', action='store_true')
args = parser.parse_args()
path = args.theme / 'templates/index.json'
raw = path.read_text()
header = raw[:raw.index('{')]
data = json.loads(re.sub(r'/\*.*?\*/', '', raw, flags=re.S))
content = next(s for s in data['sections'].values() if s['type'] == 'agaruke-home-content')
hero = next(s for s in data['sections'].values() if s['type'] == 'agaruke-home-hero')
source = (Path(__file__).resolve().parents[1] / 'theme-entry/sections/agaruke-home-content.liquid').read_text()
schema = json.loads(source.split('{% schema %}')[1].split('{% endschema %}')[0])
craft = next(b for b in schema['blocks'] if b['type'] == 'craft')
if not any(b['type'] == 'craft' for b in content['blocks'].values()):
    content['blocks']['ag_craft'] = {'type':'craft','settings':{s['id']:s['default'] for s in craft['settings'] if 'default' in s}}
    content['block_order'].insert(content['block_order'].index('ag_menu') + 1, 'ag_craft')
hero['settings']['mobile_image'] = 'shopify://shop_images/header-image-sp.png'
descriptions = {
 'チキンオーバースパイスカレー-chicken-over-spice-curry': (
 '7種のスパイスを使った濃厚なカレーに、オーブンで焼き上げたジューシーなスパイスチキン。香りと食べ応えを楽しむ、お店の看板メニューです。',
 'A rich curry made with seven spices, topped with juicy oven-roasted spiced chicken. Our signature dish brings together aromatic flavor and a satisfying bite.'),
 '肉汁ミートボール-トマトソース-meatball-with-tomato-sauce': (
 '肉感たっぷりの大きなミートボールを、定番のトマトソースで。付け合わせのドフィノアとともに、お皿の上で一皿が完成します。',
 'Generous, meaty meatballs in a classic tomato sauce. Plate them with the accompanying potato dauphinois to complete the dish.'),
 'トロじゅわ豚角煮と牛すじ煮込み-braised-pork-belly-and-stewed-beef-tendon': (
 'とろりとした豚角煮と、2日間かけて煮込んだやわらかな牛すじ。ほうれん草のにんにくナムルを添え、じっくり仕上げた味わいを楽しむ和の一皿です。',
 'Tender braised pork belly and beef tendon simmered over two days, served with garlic-seasoned spinach namul. A Japanese-style plate to savor slowly.')}
for block in content['blocks'].values():
    if block['type'] == 'product' and block['settings'].get('product') in descriptions:
        block['settings']['description'], block['settings']['description_en'] = descriptions[block['settings']['product']]
result = header + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
print('top: about → products → craft → how; mobile_image + JA/EN copy')
if args.apply:
    path.write_text(result)
