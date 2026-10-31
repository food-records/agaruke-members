#!/usr/bin/env python3
"""DawnヘッダーのCompanyリンクをPC・ドロワー共通で別タブ化する。ローカル処理のみ。"""
import argparse
from pathlib import Path


FILES = ['header-dropdown-menu.liquid', 'header-mega-menu.liquid', 'header-drawer.liquid']
HREF = 'href="{{ link.url }}"'
ATTRIBUTES = '''{% if link.url == 'https://food-records.com/' or link.url == 'https://food-records.com' %}
              target="_blank" rel="noopener noreferrer"
            {% endif %}'''


def prepare(directory):
    changes = {}
    for name in FILES:
        path = directory / 'snippets' / name
        content = path.read_text()
        if ATTRIBUTES in content:
            continue
        if content.count(HREF) != 1:
            raise ValueError(f'{name}: 想定しているトップ階層のリンクを1件確認できません')
        changes[path] = content.replace(HREF, HREF + '\n            ' + ATTRIBUTES)
    for path, content in changes.items():
        path.write_text(content)
    print(f'Company別タブ化: {len(changes)}ファイルをローカル更新（外部送信なし）')


if __name__ == '__main__':
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument('--theme-directory', type=Path, required=True)
    prepare(parser.parse_args().theme_directory)
