#!/usr/bin/env python3
"""取得済みテーマのトップ文言を、日英の管理画面入力欄へ一度だけ移行する。"""
import argparse
import json
import shutil
from pathlib import Path


SOURCE = Path(__file__).resolve().parents[1] / 'theme-entry'
FILES = [
    'sections/agaruke-home-content.liquid',
    'sections/agaruke-home-hero.liquid',
    'snippets/agaruke-copy.liquid',
]


def schema(filename):
    return json.loads((SOURCE / filename).read_text().split('{% schema %}')[1].split('{% endschema %}')[0])


def defaults(settings):
    return {item['id']: item['default'] for item in settings if 'id' in item and 'default' in item}


def prepare(directory):
    path = directory / 'templates/index.json'
    raw = path.read_text()
    data = json.loads(raw[raw.index('{'):])
    content = [s for s in data['sections'].values() if s['type'] == 'agaruke-home-content']
    hero = [s for s in data['sections'].values() if s['type'] == 'agaruke-home-hero']
    if len(content) != 1 or len(hero) != 1:
        raise ValueError('AGARUKEの既存トップsectionを各1件確認できません')
    section = content[0]
    definition = schema(FILES[0])
    types = {item['type']: item for item in definition['blocks']}
    existing_types = {b['type'] for b in section.get('blocks', {}).values()}
    editable_types = set(types) - {'product', 'delivery'}
    if existing_types & editable_types:
        if not editable_types.issubset(existing_types):
            raise ValueError('一部だけ移行済みです。手動確認が必要です')
        print('移行済みの文言・商品設定を保持します')
    else:
        if existing_types - {'product'}:
            raise ValueError('未知の既存blockがあります。上書きしません')
        products = list(section.get('block_order', []))
        if set(products) != set(section.get('blocks', {})):
            raise ValueError('商品blockと順序の整合性を確認できません')
        new_order = []
        faq_number = 0
        for block in definition['presets'][0]['blocks']:
            block_type = block['type']
            if block_type == 'faq':
                faq_number += 1
                block_id = f'ag_faq_{faq_number}'
            else:
                block_id = f'ag_{block_type}'
            if block_id in section.get('blocks', {}):
                raise ValueError(f'追加先のblock IDが既に存在します: {block_id}')
            values = defaults(types[block_type]['settings']) | block.get('settings', {})
            section.setdefault('blocks', {})[block_id] = {'type': block_type, 'settings': values}
            new_order.append(block_id)
            if block_type == 'menu':
                new_order.extend(products)
        for product_id in products:
            values = section['blocks'][product_id]['settings']
            if values.get('title'):
                raise ValueError('未使用の旧商品表示名に値があります。移行内容を確認してください')
            values.pop('title', None)
        section['block_order'] = new_order
    for key, value in defaults(schema(FILES[1])['settings']).items():
        hero[0].setdefault('settings', {}).setdefault(key, value)
    for filename in FILES:
        destination = directory / filename
        destination.parent.mkdir(parents=True, exist_ok=True)
        shutil.copyfile(SOURCE / filename, destination)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + '\n')
    print('日英入力欄をローカルへ準備しました。ストアへの送信は実行していません。')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', type=Path, required=True)
    prepare(parser.parse_args().theme_directory)
