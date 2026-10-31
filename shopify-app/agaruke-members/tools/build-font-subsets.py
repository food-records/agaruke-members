#!/usr/bin/env python3
"""現在の書体と全文字fallbackを維持して、先に使う文字のWOFF2を生成する。"""
import argparse
import hashlib
from pathlib import Path
from fontTools import subset
from fontTools.ttLib import TTFont
from fontTools.pens.recordingPen import DecomposingRecordingPen

p=argparse.ArgumentParser()
p.add_argument('--source-dir',type=Path,required=True)
p.add_argument('--theme',type=Path,required=True)
p.add_argument('--public-copy',type=Path,required=True)
p.add_argument('--output',type=Path,required=True)
a=p.parse_args()
project=Path(__file__).resolve().parents[1]
texts=[a.public_copy.read_text()]
for root in [project/'theme-entry',a.theme/'locales']:
 for path in root.rglob('*'):
  if root==a.theme/'locales' and path.name not in ['ja.json','en.default.json','en.json']:continue
  if path.suffix in ['.liquid','.js','.json']:texts.append(path.read_text())
texts.append((project/'app/purchase-client.js').read_text())
text=''.join(texts)
requested=set(map(ord,text))|set(range(0x20,0x100))|set(range(0x3000,0x3100))|set(range(0xff00,0xfff0))
def ranges(values):
 values=sorted(values);result=[]
 if not values:return ''
 start=last=values[0]
 for value in values[1:]:
  if value==last+1:last=value;continue
  result.append(f'U+{start:X}'+(f'-{last:X}' if last!=start else ''));start=last=value
 result.append(f'U+{start:X}'+(f'-{last:X}' if last!=start else ''))
 return ','.join(result)
faces=[]
for weight in [400,700]:
 source=a.source_dir/f'noto-{weight}.woff2'
 expected={400:'7f892cb32993de086024ebb21865679a33aba169e46668e95002327e974ecb2f',700:'170c9e0c93d85ac02701da321b9af029ba17c14631d14b27903c11e6254dc019'}
 assert hashlib.sha256(source.read_bytes()).hexdigest()==expected[weight], '元フォントが変更されています'
 font=TTFont(source)
 cmap=font.getBestCmap();common=set(cmap)&requested;rest=set(cmap)-common
 metrics={c:font['hmtx'].metrics[g][0] for c,g in cmap.items() if c in common}
 options=subset.Options();options.flavor='woff2';options.hinting=True;options.layout_features=['*'];options.name_IDs=['*'];options.name_legacy=True;options.name_languages=['*']
 sub=subset.Subsetter(options=options);sub.populate(unicodes=common);sub.subset(font)
 for record in font['name'].names:
  if record.nameID in [1,4,6]:
   name={1:'AGARUKE Sans',4:f'AGARUKE Sans {weight}',6:f'AGARUKESans-{weight}'}[record.nameID]
   record.string=name.encode(record.getEncoding())
 out=a.output/'assets'/f'agaruke-sans-{weight}-common.woff2';out.parent.mkdir(parents=True,exist_ok=True);font.recalcTimestamp=False;font.save(out)
 check=TTFont(out);assert set(check.getBestCmap())==common
 original=TTFont(source);original_glyphs=original.getGlyphSet();new_glyphs=check.getGlyphSet();original_cmap=original.getBestCmap()
 for c,g in check.getBestCmap().items():
  assert check['hmtx'].metrics[g][0]==metrics[c]
  before=DecomposingRecordingPen(original_glyphs);original_glyphs[original_cmap[c]].draw(before)
  after=DecomposingRecordingPen(new_glyphs);new_glyphs[g].draw(after)
  assert before.value==after.value, f'字形差分: U+{c:X}'
 assert common|rest==set(cmap) and not common&rest
 faces.extend([f'''@font-face{{font-family:"Noto Sans Japanese";font-style:normal;font-weight:{weight};font-display:swap;src:url("{{{{ 'agaruke-sans-{weight}-common.woff2' | asset_url }}}}") format("woff2");unicode-range:{ranges(common)}}}''',f'''@font-face{{font-family:"Noto Sans Japanese";font-style:normal;font-weight:{weight};font-display:swap;src:url("{{{{ {'regular_url' if weight==400 else 'bold_url'} }}}}") format("woff2");unicode-range:{ranges(rest)}}}'''])
 print(f'{weight}: common={len(common)} glyphs/{out.stat().st_size} bytes; fallback={len(rest)}; source sha256={hashlib.sha256(source.read_bytes()).hexdigest()}')
(a.output/'snippets').mkdir(exist_ok=True)
(a.output/'snippets/agaruke-font-faces.liquid').write_text('''{% doc %}
  現行Noto Sans Japaneseを同じ文字幅のsubsetと全文字fallbackで配信する。
  @param {string} regular_url - Shopifyの元400フォントURL
  @param {string} bold_url - Shopifyの元700フォントURL
{% enddoc %}
'''+ '\n'.join(faces)+'\n')
(a.output/'assets/agaruke-font-OFL.txt').write_text((a.source_dir/'OFL.txt').read_text())
