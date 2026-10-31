#!/usr/bin/env python3
"""取得済みトップにお届けイメージを追加する。既存の商品・編集文言は保持し、外部送信しない。"""
import argparse
import json
import shutil
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / 'theme-entry'
FILES = ['sections/agaruke-home-content.liquid', 'assets/agaruke-home-content.css']


def prepare(directory, image, hide_on_home=False):
    if not image.startswith('shopify://shop_images/') or '..' in image:
        raise ValueError('Shopifyに登録済みの画像を指定してください')
    path = directory / 'templates/index.json'
    raw = path.read_text()
    data = json.loads(raw[raw.index('{'):])
    sections = [s for s in data['sections'].values() if s['type'] == 'agaruke-home-content']
    if len(sections) != 1:
        raise ValueError('サービス紹介sectionを1件確認できません')
    section = sections[0]
    blocks = section.setdefault('blocks', {})
    existing = [key for key, value in blocks.items() if value['type'] == 'delivery']
    if len(existing) > 1:
        raise ValueError('お届けイメージが複数あります。上書きしません')
    if existing:
        current = blocks[existing[0]]['settings'].get('image')
        if current != image:
            raise ValueError('既存のお届け画像は変更せず停止しました')
    else:
        if 'ag_delivery' in blocks:
            raise ValueError('追加先のIDが既に使われています')
        order = section.get('block_order', [])
        if set(order) != set(blocks):
            raise ValueError('既存blockと順序が一致しません')
        about = [key for key in order if blocks[key]['type'] == 'about']
        if len(about) != 1:
            raise ValueError('サービス紹介ブロックを1件確認できません')
        definition = json.loads((SOURCE / FILES[0]).read_text().split('{% schema %}')[1].split('{% endschema %}')[0])
        delivery = next(b for b in definition['blocks'] if b['type'] == 'delivery')
        values = {s['id']: s['default'] for s in delivery['settings'] if 'id' in s and 'default' in s}
        values['image'] = image
        blocks['ag_delivery'] = {'type': 'delivery', 'settings': values}
        order.insert(order.index(about[0]) + 1, 'ag_delivery')
        if len(order) > definition['max_blocks']:
            raise ValueError('block数の上限を超えます')
    if hide_on_home:
        delivery_id = existing[0] if existing else 'ag_delivery'
        blocks[delivery_id]['settings']['show_on_home'] = False
    for filename in FILES:
        destination = directory / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / filename, destination)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('お届け画像と日英入力欄をローカルへ追加しました（外部送信なし）')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', type=Path, required=True)
    parser.add_argument('--image', required=True)
    parser.add_argument('--hide-on-home', action='store_true', help='画像・文言を保持しトップの独立案内だけを非表示にする')
    args = parser.parse_args()
    prepare(args.theme_directory, args.image, args.hide_on_home)
