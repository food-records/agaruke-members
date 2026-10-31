#!/usr/bin/env python3
"""ポイントカードへの常設メニューとログイン別マイページ入口をローカルテーマへ反映する。"""
import argparse
import json
from pathlib import Path

SOURCE = Path(__file__).resolve().parents[1] / 'theme-entry'
NAVIGATION = ['header-dropdown-menu.liquid', 'header-mega-menu.liquid', 'header-drawer.liquid']


def prepare(directory):
    directory = Path(directory)
    changes = {}
    for name in NAVIGATION:
        path = directory / 'snippets' / name
        text = path.read_text()
        if "render 'agaruke-member-menu-link'" not in text:
            drawer = name == 'header-drawer.liquid'
            indent = '              ' if drawer else '    '
            needle = indent + '{%- endfor -%}\n' + indent[:-2] + '</ul>'
            if text.count(needle) != 1:
                raise ValueError(f'{name}: トップ階層のメニュー終端が1件ではありません')
            render = "{% render 'agaruke-member-menu-link'" + (', drawer: true' if drawer else '') + ' %}'
            text = text.replace(needle, indent + '{%- endfor -%}\n' + indent + render + '\n' + indent[:-2] + '</ul>')
        changes[path] = text
    for name in ['agaruke-account-entry.liquid', 'agaruke-member-menu-link.liquid']:
        changes[directory / 'snippets' / name] = (SOURCE / 'snippets' / name).read_text()
    for name in ['ja.json', 'en.default.json']:
        path = directory / 'locales' / name
        raw = path.read_text()
        start = raw.index('{')
        data = json.loads(raw[start:])
        updates = json.loads((SOURCE / 'locales' / name).read_text())
        data.setdefault('agaruke_members', {}).setdefault('navigation', {}).update(updates['agaruke_members']['navigation'])
        changes[path] = raw[:start] + json.dumps(data, ensure_ascii=False, indent=2) + '\n'
    for path, text in changes.items():
        path.parent.mkdir(parents=True, exist_ok=True)
        path.write_text(text)
    print(f'会員メニュー: {len(changes)}ファイルをローカル更新（外部送信なし）')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', type=Path, required=True)
    prepare(parser.parse_args().theme_directory)
