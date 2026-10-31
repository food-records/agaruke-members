#!/usr/bin/env python3
"""取得済みテーマへ発送目安を日英で追加する。外部送信はしない。"""
import argparse
import json
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'theme-entry'
RENDER = "{% render 'agaruke-shipping-note' %}"


def read_config(path):
    raw = path.read_text()
    start = raw.index('{')
    return raw[:start], json.loads(raw[start:])


def prepare(directory):
    changes = {}
    for name in ['templates/product.json', 'templates/cart.json', 'templates/index.json']:
        path = directory / name
        prefix, data = read_config(path)
        sections = data['sections']
        if name.endswith('product.json'):
            targets = [s for s in sections.values() if s['type'] == 'main-product']
            if len(targets) != 1:
                raise ValueError('main-productを1件確認できません')
            section = targets[0]
            key = 'agaruke_shipping_note'
            blocks = section['blocks']
            if key in blocks and blocks[key]['type'] != 'custom_liquid':
                raise ValueError('商品発送案内のblock IDが競合しています')
            blocks[key] = {'type': 'custom_liquid', 'settings': {'custom_liquid': RENDER}}
            order = [k for k in section['block_order'] if k != key]
            position = next(i for i, k in enumerate(order) if blocks[k]['type'] == 'buy_buttons')
            section['block_order'] = order[:position] + [key] + order[position:]
        elif name.endswith('cart.json'):
            key = 'agaruke_shipping_note'
            if key in sections and sections[key]['type'] != 'custom-liquid':
                raise ValueError('カート発送案内のsection IDが競合しています')
            sections[key] = {'type': 'custom-liquid', 'settings': {'custom_liquid': '<div class="page-width">' + RENDER + '</div>', 'color_scheme': 'scheme-1', 'padding_top': 0, 'padding_bottom': 16}}
            order = [k for k in data['order'] if k != key]
            position = next(i for i, k in enumerate(order) if sections[k]['type'] == 'main-cart-footer')
            data['order'] = order[:position] + [key] + order[position:]
        else:
            targets = [b for s in sections.values() for b in s.get('blocks', {}).values() if b['type'] == 'faq' and b.get('settings', {}).get('question') == '送料やお届け日は確認できますか？']
            if len(targets) != 1:
                raise ValueError('配送FAQを1件確認できません')
            settings = targets[0]['settings']
            ja = json.loads((SOURCE / 'locales/ja.json').read_text())['agaruke_shipping']
            en = json.loads((SOURCE / 'locales/en.default.json').read_text())['agaruke_shipping']
            settings['answer'] = ja['dispatch'] + ja['arrival'] + '送料は、お届け先やご注文内容に応じて会計画面でご確認いただけます。'
            settings['answer_en'] = en['dispatch'] + ' ' + en['arrival'] + ' Shipping is calculated at checkout based on your address and order.'
        changes[path] = prefix + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    for name in ['ja.json', 'en.default.json']:
        path = directory / 'locales' / name
        prefix, data = read_config(path)
        data['agaruke_shipping'] = json.loads((SOURCE / 'locales' / name).read_text())['agaruke_shipping']
        changes[path] = prefix + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    changes[directory / 'snippets/agaruke-shipping-note.liquid'] = (SOURCE / 'snippets/agaruke-shipping-note.liquid').read_text()
    for path, content in changes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(content)
    print(f'発送目安: {len(changes)}ファイルをローカル更新（外部送信なし）')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', required=True, type=Path)
    prepare(parser.parse_args().theme_directory)
