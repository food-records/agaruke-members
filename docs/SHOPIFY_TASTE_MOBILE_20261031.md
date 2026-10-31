# トップの商品導線・おいしさの理由・スマホ用画像

2026-10-31。競合比較後のユーザー指定2/3/5を実装する。メイン画像とCTA、ABOUTを維持し、紹介→おすすめ商品→おいしさの理由→HOW TO ENJOY→me time→FAQの順へ変更。独立お届け画像は引き続き非表示。

「おいしさの理由」は実店舗の人気メニューを冷凍でも楽しめる工夫、個別の真空パックによるおいしさ/冷凍保存性への配慮、主菜と付け合わせの彩り/皿盛りまでの設計の3項目。各商品の紹介も7種のスパイス/オーブンチキン、ミートボール/ドフィノア、豚角煮/2日間煮込んだ牛すじ/ほうれん草にんにくナムルを日英で記述する。未確認の製法、具体的な賞味期限延長、栄養効果は追加しない。

スマホ画像はユーザー添付と一致するDownloads/header-image-sp.png（941×1672）を加工せずShopify Filesへ登録（MediaImage46900137328813）。メインビジュアルのmobile_image設定とpicture/sourceで749px以下だけ切替。PC元画像、スマホの画像全体、VIEW ITEM、SVGアイコンと会員判定を保持する。画像未設定時は従来画像へfallback。日英コピーはテーマの「AGARUKE サービス紹介→おいしさの理由」と各商品ブロック、画像は「AGARUKE メインビジュアル→スマートフォン用画像」で編集する。

適用ツール: shopify-app/agaruke-members/tools/theme-taste-mobile.py。取得した最新テーマへ実行し、既存設定保持の差分を確認する。配信対象はcontent/hero section、content CSS、indexの4件だけ。LINE/クーポン/注文/backendは変更しない。

## 本番反映・検証

公開Dawn189917102253へclean remote master bdc2b6e760adb0b4db16ec91f0a42e73b51a0c61から4件のみ反映。fetch/local・remote SHA一致と既配信1f63e60/直前base d03871d包含guard成功（並行記録f4c07e3もmasterで包含）。配信直前対象4件に変更なし。取得済み最新indexから指定箇所だけ変更し、その他設定/順序/商品/配送非表示を保持した。配信後section2/CSS完全一致・index意味一致。Shopify検査4件、アプリtest17件成功。

公開JA/ENの順序about→products→craft→how、商品3件の日英の説明・価格・リンク、FAQ4/Company別タブ/linked告知非表示を確認。PC1352pxは従来agaruke_header.png/560px、390pxスマホはheader-image-sp.png/全体390×692.96px、双方横はみ出しなし。VIEW ITEMクリックで商品欄へ移動、craft3列/スマホ1列と全文章を確認し、viewportを復元した。証跡craft-live.png/mobile-live.pngは保護runtime shopify-taste-mobile-20261031へ保持。管理画面での新しい設定欄のUI保存操作は未確認、schema・readback・公開表示は確認済み。注文/決済操作なし。

## ABOUT画像の差し替え（2026-10-31）

ユーザー添付と一致するDownloads/moritsuke-image.png（1254×1254、未加工）をShopify Files46900562526381へ登録。ABOUTは商品の写真参照から専用image_pickerの写真へ変更し、日英の代替テキストを追加した。専用画像が未設定の場合は従来のfeature_product画像/タイトルへfallbackする。メイン/メニュー/下部の画像や文章・商品・会員導線は保持する。「AGARUKE サービス紹介→ABOUTブロック→ABOUTの画像」で変更可能。適用ツールtheme-about-photo.py、配信対象section/indexの2件。indexはABOUTのimage/image_alt/image_alt_enだけ変更し、その他設定一致を確認。Liquid2件検査成功。

ABOUT写真の本番反映: clean remote master75a5fa77209ec2740bdaa76b5b5f27cf2e61f91a、remote fetch/SHA一致と既配信bdc2b6e/b2b8453包含guard成功。公開189917102253へsection/index2件を反映。初回readbackで新規画像/alt設定だけ未保存だったため、schema反映後に同clean SHAからindexのみ再送。最終section完全一致/index意味一致、公開写真の読込と日英altを確認。PC1352px/スマホ390px（横幅=scroll幅）で手元/真空パック/料理が見えることを確認しviewport復元。ABOUT以外の画像/商品/設定を保持。証跡about-pc.pngは保護runtime shopify-about-photo-20261031へ保存。管理画面の新設定欄でのUI保存操作は未実施。注文/決済操作なし。

## おいしさの理由セクションの写真（2026-10-31）

ユーザー指定の添付と一致するDownloads/house-meal.pngを加工せずFiles46900611678381へ登録。「お店のおいしさを、あなたの一皿へ。」の見出し右側に最大400pxの写真を配置し、スマホは見出し下へ1列で表示する。写真の自然な縦横比で全体を見せ、既存の3理由は下に保持する。craftブロックにimage_pickerと日英altを追加し、画像なしでは従来の見出しだけの表示を保つ。他セクション/画像/商品/会員導線は変更しない。

管理場所は「AGARUKE サービス紹介→おいしさの理由→おいしさの理由の画像」。適用ツールtheme-craft-photo.py。indexの変更はcraft画像/日英altの3設定のみ、それ以外の設定一致を確認。Liquid/CSS/index3件検査成功。schemaの反映後にindexを設定する2段階の配信とする。

craft写真の本番反映: clean remote master189fffc90cd23d93b045959eb1059a446c967e4b、fetch/remote SHA一致と既配信75a5fa7/720b48e包含guard成功。直前3件変更なし。公開Dawn189917102253へsection/CSS→indexの順に反映し、readbackはsection/CSS完全一致、index意味一致。公開PC1352px（画像400×400）/スマホ390px（画像346×346）で写真全体と3理由・横はみ出しなしを確認。英語alt確認、viewport復元。証跡craft-pc.pngは保護runtime shopify-craft-photo-20261031。注文/決済操作なし。管理画面で新しい設定欄のUI保存操作は未実施、schema/readback/公開表示を検証した。

## craft配置余白の見直し（2026-10-31）

ユーザー指摘の見出し周囲の空白を解消するため、見出しを上段に独立させ、下段は写真左（最大460px）/3理由を縦に右へ並べる2列へ変更。写真と説明の上端を揃え、上下paddingを96→72px、スマホ48pxへ調整。989px以下は写真→理由の1列とし、写真全体と既存文章を保持。画像なしは従来の3理由グリッド。変更はsection/CSSのみでschema/設定値/画像/日英コピー/他セクションを維持する。

余白修正の本番反映: clean remote master6e757665ebfa1a63b32f1a03a8a48a12bef0e084から公開Dawn189917102253へsection/CSS2件のみ配信。remote fetch/SHA一致・既配信189fffc/d5af54a包含guard成功、直前差分なし、2件readback一致、index変更なし、Liquid2件成功。公開1352pxで写真/説明の上端267.3px一致、PC72px/スマホ48px padding、390pxの1列・日英文章/写真/横はみ出しなしを確認しviewport復元。証跡spacing-pc.pngは保護runtime shopify-craft-spacing-20261031へ保存。注文/決済操作なし。

## craftタイトル右寄せ配置（2026-10-31）

ユーザー指定でPCのタイトルを写真の右、3理由の上へ移動。画像を左列の2行にまたがせ、右列に見出し→説明を24px間隔で配置。989px以下は見出し→写真→説明の順を維持する。文言/写真/設定値は変更せず、section/CSSの2件のみ変更。

タイトル位置の本番反映: clean remote master6920c41312d93ec4fd33bd891ce3f7c37dffcf14から公開Dawn189917102253へsection/CSS2件。fetch/remote一致・直前本番6e75766/3f7a555包含guard成功、直前差分なし、Liquid2件/readback一致、index変更なし。公開PC1352pxで写真と右タイトル上端73.1px一致、スマホ390pxでタイトル→写真→3説明と横はみ出しなし、英語タイトル確認。viewport復元、証跡title-pc.pngを保護runtime shopify-craft-title-right-20261031へ保存。注文操作なし。
