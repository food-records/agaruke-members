#!/usr/bin/env python3
"""既存Dawnのポイントカード機能に触れず、提案したトップ構成をローカルへ適用。"""
import argparse,json,shutil
from pathlib import Path

def prepare(directory):
    p=directory/'templates/index.json';raw=p.read_text();data=json.loads(raw[raw.index('{'):])
    active=[data['sections'][i] for i in data['order'] if not data['sections'][i].get('disabled')]
    if [s['type'] for s in active]!=['image-banner','featured-collection']:
        raise ValueError('トップの既存構成が変わっています。設定を確認してください。')
    image=active[0]['settings'].get('image')
    if not image:raise ValueError('既存のバナー画像を確認できません')
    source=Path(__file__).resolve().parents[1]/'theme-entry'
    for name in ['sections/agaruke-home-hero.liquid','sections/agaruke-home-content.liquid','assets/agaruke-home-content.css']:
        (directory/name).parent.mkdir(parents=True,exist_ok=True);shutil.copyfile(source/name,directory/name)
    curry='チキンオーバースパイスカレー-chicken-over-spice-curry'
    meat='肉汁ミートボール-トマトソース-meatball-with-tomato-sauce'
    data={'sections':{
      'agaruke_hero':{'type':'agaruke-home-hero','settings':{'image':image,'cta_label':'VIEW ITEM'}},
      'agaruke_content':{'type':'agaruke-home-content','settings':{'feature_product':curry,'moment_product':meat,'contact_url':'shopify://pages/contact'},'blocks':{
        'curry':{'type':'product','settings':{'product':curry,'title':'チキンオーバー\nスパイスカレー','description':'スパイスチキンに、まろやかなホワイトソース。紫キャベツのピクルスが彩る、香り豊かな一皿。'}},
        'meatball':{'type':'product','settings':{'product':meat,'title':'肉汁ミートボール\nトマトソース','description':'肉の旨みを楽しむミートボールと、酸味とコクのトマトソース。マッシュポテトとブロッコリーを添えて。'}}
      },'block_order':['curry','meatball']}
    },'order':['agaruke_hero','agaruke_content']}
    p.write_text(json.dumps(data,ensure_ascii=False,indent=2)+'\n')
    print('トップ構成・3ファイルをローカル更新。会員連携/クーポン/他ページ/バックエンドは変更なし。')
if __name__=='__main__':
    p=argparse.ArgumentParser(description=__doc__);p.add_argument('--theme-directory',type=Path,required=True);a=p.parse_args();prepare(a.theme_directory)
