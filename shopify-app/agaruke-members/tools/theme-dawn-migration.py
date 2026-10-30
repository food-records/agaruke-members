#!/usr/bin/env python3
"""Pinned official Dawn + existing store settings + managed Members theme patches.
Only local files are read/written. Store snapshots and generated themes stay outside Git.
"""
import argparse
import importlib.util
import json
import shutil
import sys
import subprocess
from pathlib import Path

DAWN_SHA = 'bc39a7d2024f1e5c14c42f855bd3552b4913e204'
DAWN_TAG = 'v16.0.0'

def read_json(path):
    raw=path.read_text()
    return json.loads(raw[raw.index('{'):])

def write_json(path,value):
    path.parent.mkdir(parents=True,exist_ok=True)
    path.write_text(json.dumps(value,ensure_ascii=False,indent=2)+'\n')

def migrate(previous,upstream,target):
    if target.exists():
        raise ValueError('出力先は新しいディレクトリを指定してください')
    actual=subprocess.check_output(['git','-C',str(upstream),'rev-parse','HEAD'],text=True).strip()
    if actual!=DAWN_SHA:
        raise ValueError('固定した公式Dawn commitと一致しません')
    if json.loads((upstream/'config/settings_schema.json').read_text())[0]['theme_name']!='Dawn':
        raise ValueError('公式Dawnの取得先を指定してください')
    for directory in ['assets','blocks','config','layout','locales','sections','snippets','templates']:
        if (upstream/directory).exists():
            shutil.copytree(upstream/directory,target/directory)
    # Keep configured storefront content, menus and product/cart blocks; do not copy Rise code.
    for path in (previous/'templates').glob('*.json'):
        write_json(target/'templates'/path.name,read_json(path))
    for path in (previous/'sections').glob('*.json'):
        write_json(target/'sections'/path.name,read_json(path))
    settings=read_json(previous/'config/settings_data.json')
    schema=json.loads((target/'config/settings_schema.json').read_text())
    supported={s['id'] for group in schema for s in group.get('settings',[]) if 'id' in s}
    special={'sections','content_for_index','blocks'}
    old=settings['current']
    unknown=set(old)-supported-special
    if unknown:
        raise ValueError('Dawn非対応の設定を確認してください: '+','.join(sorted(unknown)))
    write_json(target/'config/settings_data.json',settings)
    index=read_json(target/'templates/index.json')
    first=index['sections'][index['order'][0]]
    if first['type']!='image-banner' or not first['settings'].get('image'):
        raise ValueError('先頭の既存画像バナーを確認できません')
    # Verify all transferred section types exist, including app/custom Liquid blocks.
    for path in [*(target/'templates').glob('*.json'),*(target/'sections').glob('*.json')]:
        for section in read_json(path).get('sections',{}).values():
            if not (target/'sections'/(section['type']+'.liquid')).exists():
                raise ValueError('未対応section: '+section['type'])
    sys.dont_write_bytecode=True
    spec=importlib.util.spec_from_file_location('members_theme',Path(__file__).with_name('theme-members-entry.py'))
    module=importlib.util.module_from_spec(spec);spec.loader.exec_module(module)
    for name,text in module.prepare(target,'https://shop.agaruke.com/apps/members').items():
        p=target/name;p.parent.mkdir(parents=True,exist_ok=True);p.write_text(text)
    source=Path(__file__).resolve().parents[1]/'theme-entry'
    for name in ['assets/agaruke-home-header.css','snippets/agaruke-home-header.liquid']:
        shutil.copyfile(source/name,target/name)
    p=target/'layout/theme.liquid';text=p.read_text()
    text=text.replace('</head>',"{% render 'agaruke-home-header' %}\n  </head>")
    needle='<body class="'
    if text.count(needle)!=1:
        raise ValueError('body classを確認できません')
    text=text.replace(needle,needle+"{% if request.page_type == 'index' %}agaruke-home-banner {% endif %}")
    p.write_text(text)
    return {'upstream_tag':DAWN_TAG,'upstream_sha':DAWN_SHA,'templates':len(list((target/'templates').glob('*.json'))),'previous_theme':'Rise','new_theme':'Dawn'}

if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__)
    p.add_argument('--previous',required=True,type=Path)
    p.add_argument('--upstream',required=True,type=Path)
    p.add_argument('--target',required=True,type=Path)
    args=p.parse_args()
    print(json.dumps(migrate(args.previous,args.upstream,args.target),ensure_ascii=False))
