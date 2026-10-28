#!/usr/bin/env python3
"""Riseの取得済みtheme設定へ購入前の会員連携入口を追加する。外部送信はしない。"""
import argparse
import copy
import html
import json
from pathlib import Path
from urllib.parse import urlparse

TARGETS = ('sections/header-group.json', 'templates/product.json', 'templates/cart.json')


def read_config(path):
    raw = path.read_text()
    prefix, body = raw.split('{', 1)
    return prefix, json.loads('{' + body)


def prepare(directory, page_url):
    parsed = urlparse(page_url)
    if parsed.scheme != 'https' or parsed.hostname != 'shopify.com' or not parsed.path.startswith('/83950534829/account/pages/') or parsed.query or parsed.fragment:
        raise ValueError('対象AGARUKEの公開アカウントページURLを指定してください')
    source = Path(__file__).resolve().parents[1] / 'theme-entry/members-entry.liquid'
    snippet = source.read_text().split('{% enddoc %}', 1)[1].strip()
    snippet = snippet.replace('{{ members_link | escape }}', html.escape(page_url, quote=True))
    configs = {name: read_config(directory / name) for name in TARGETS}
    output = {}
    for name, (prefix, original) in configs.items():
        data = copy.deepcopy(original)
        if name == 'sections/header-group.json':
            bars = [s for s in data['sections'].values() if s['type'] == 'announcement-bar']
            if not bars:
                raise ValueError('既存announcement-barがないため自動変更を停止')
            bar = bars[0]
            blocks = bar.setdefault('blocks', {})
            block_id = next((key for key, block in blocks.items() if block['type'] == 'announcement' and block.get('settings', {}).get('text') == 'Welcome to our store' and not block.get('settings', {}).get('link')), 'agaruke_members_link')
            if 'agaruke_members_link' in blocks:
                block_id = 'agaruke_members_link'
            # Reuse the theme's unedited default welcome block when present.
            # A retry also recognizes the previously managed link.
            matching = next((key for key, block in blocks.items() if block.get('settings', {}).get('text') == 'LINEポイントカードを連携する' and block.get('settings', {}).get('link') == page_url), None)
            block_id = matching or block_id
            if block_id not in blocks and len(blocks) >= 12:
                raise ValueError('announcement-barの上限に達しているため停止')
            blocks[block_id] = {'type': 'announcement', 'settings': {'text': 'LINEポイントカードを連携する', 'link': page_url}}
            bar['block_order'] = [block_id] + [key for key in bar.get('block_order', []) if key != block_id]
        elif name == 'templates/product.json':
            sections = [s for s in data['sections'].values() if s['type'] == 'main-product']
            if len(sections) != 1:
                raise ValueError('main-productの構成を確認できないため停止')
            section = sections[0]
            blocks = section.setdefault('blocks', {})
            block_id = 'agaruke_members_entry'
            if block_id in blocks and blocks[block_id]['type'] != 'custom_liquid':
                raise ValueError('既存block IDと競合')
            blocks[block_id] = {'type': 'custom_liquid', 'settings': {'custom_liquid': snippet}}
            order = [key for key in section.get('block_order', []) if key != block_id]
            before = next((i for i, key in enumerate(order) if blocks[key]['type'] == 'buy_buttons'), len(order))
            section['block_order'] = order[:before] + [block_id] + order[before:]
        else:
            section_id = 'agaruke_members_entry'
            sections = data['sections']
            if section_id in sections and sections[section_id]['type'] != 'custom-liquid':
                raise ValueError('既存section IDと競合')
            sections[section_id] = {'type': 'custom-liquid', 'settings': {'custom_liquid': '<div class="page-width">' + snippet + '</div>', 'color_scheme': 'scheme-1', 'padding_top': 0, 'padding_bottom': 16}}
            order = [key for key in data.get('order', []) if key != section_id]
            before = next((i for i, key in enumerate(order) if sections[key]['type'] == 'main-cart-footer'), len(order))
            data['order'] = order[:before] + [section_id] + order[before:]
        output[name] = prefix + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    return output


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', type=Path, required=True)
    parser.add_argument('--page-url', required=True)
    parser.add_argument('--apply', action='store_true')
    args = parser.parse_args()
    changes = prepare(args.theme_directory, args.page_url)
    for name, content in changes.items():
        path = args.theme_directory / name
        if path.read_text() == content:
            print(name + ': 変更なし')
        elif args.apply:
            temporary = path.with_suffix(path.suffix + '.members-tmp')
            temporary.write_text(content)
            temporary.replace(path)
            print(name + ': ローカル設定を更新')
        else:
            print(name + ': 変更予定（外部送信なし）')


if __name__ == '__main__':
    main()
