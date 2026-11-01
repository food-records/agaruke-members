# トップページのセット先行表示（2026-11-01）

ユーザーが提案を承認。既存OUR MENU内で公開Bundles商品15335693648045（agaruke-3種セット-1）を横長カードで先に案内し、その下に単品3件を保持。PCは写真と説明を横並び、スマホは縦並び。商品情報を参照し、税込価格・比較価格・内容各1個・商品詳細CTAを表示。価格/割引を固定しない。日英の紹介文とCTAは「AGARUKE サービス紹介→おすすめセット」から編集。通常商品を数える際はproduct型のみを対象にし、既存3件レイアウト/画像sizesを維持する。

公開前に現行3ファイルをpullし、既存section/CSSの一致を確認。index.jsonはその時点の公開設定を基におすすめセットblockだけ追加。他セクションや管理画面の文言は保持する。今回から配信対象のindex.jsonもGitへ保存するが、次回は再pullで編集競合を確認する。追加JS/サービス/課金構成なし。画像はlazy・responsive。Liquid/CSS/JSONの3件検査成功。

## 2026-11-01 トップのセット先行表示

本番テーマ189917102253へmaster 2baaeab13073547d5400a026917d019c4c721973からsection/CSS/index.jsonの3ファイルを配信。remoteへpush・release_guard・直前性能版43179e9/キャンセル済み利用履歴版26bf1d6の包含を確認。既存テスト38件/テーマ3件成功。readbackはLiquid/CSS byte一致、JSON意味一致、featured_set block以外の全設定が配信前と意味一致。

PC/390pxスマホでセット写真3皿・内容各1個・税込3,980円/比較4,040円・単品3件への順序を確認。商品詳細CTAの遷移成功。カート4点を変更せず注文/決済なし。日英紹介文/CTAはテーマ管理で編集できる。英語の商品名は商品翻訳未登録で日本語のまま（商品管理の翻訳追加が残る）。会員/券/pt/APIは変更なし。追加課金なし。証跡runtime home-set-20261101/home-set-desktop.png、home-set-mobile.png。Secretaryはagarukeへローカルdraft、Drive未公開。.workは保持する。
