# AGARUKEトップコンテンツ（2026-10-30）

提案mockupをもとに、透明headerを維持したhero/商品へのCTA、サービス紹介、冷凍→温める→盛付の3step、実商品の説明/価格付き2カード、食卓の提案、配送/保存/加熱/アレルギーFAQ、問い合わせ、LINEカード確認、末尾の商品CTAを追加する。

既存バナーと商品写真だけを使う。包装の生成写真や架空reviewは使用しない。紹介文は公開products.jsonの冷凍・内容量・付け合わせ・味の説明から作成。価格はLiquidの商品価格を表示。包装/調理分数/送料額/発送日/賞味期限/返品条件/ポイント数など未確認情報を断定しない。contactページ200確認、shipping/refund/legal-notice policyは404のため架空のpolicyを作らず、送料はcheckout/不明点は既存問い合わせへ案内する。

変更はhome用2section/1CSS/index JSONのみ。既存のheader・Members状態asset/snippet・商品/カート/checkout・API/台帳/試験modeは変更しない。旧home2sectionだけを認識するローカル準備toolを追加し、想定外構成で停止する。

Liquid4ファイル＋CSS改訂検査、全theme check error0（上流warning9）、既存Node14件、変更範囲4ファイルの検査を実施。未公開previewでPC/mobile幅を確認してから公開する。全snapshot/生成theme/公開商品データ/画面はGit外保護runtime `shopify-home-content-20261030/`。公開反映・確認完了。

## 配信と確認結果

配信元clean remote master `12c36e45e307713a0f1958158da882ef509d3ddf`（7132d66、64ad136、1e7e37b、12c36e4）。旧Dawn189911072941の全snapshotを公開直前に再取得し変更0を確認。未公開Dawn189917102253でpreviewし、role guard/source guard後に公開。旧DawnとRiseは未公開で復元用に保持。新テーマ353ファイルをreadbackしcandidateと意味一致、保護runtimeへmanifestを保存した。バックエンド/アプリ/台帳の配信・変更はなし。

PC/390px幅でhero、紹介、step、2商品、FAQ/LINE案内の表示を確認。hero内CTAから商品エリアへ移動、FAQ開閉、mobile menu開閉、横幅390/390（横はみ出しなし）、画像5件の読込を確認。mobile heroは実商品の写真をpicture sourceで使用し、desktopは既存ワイド写真のロゴが入り込まない切り取りを使用。商品表示名は読みやすく改行し、アンカーはsticky header下に余白を確保。

プレビューのカートでも連携済み・試験中0pt/通常100pt・テスト券500円引き/合計3,100円、数量ミートボール1/カレー2を保持。商品追加/決済/注文確定は行っていない。通常公開URLへ戻しpreviewを終了、viewportを元へ戻してトップtabを保持。PC/mobile/全体の公開画面を保護runtimeに保存。

正確な加熱方法、発送目安、賞味期限/アレルゲン詳細、配送/返品/法定表記の整備は商品・運用情報の確定後に別途対応する。今回それらを推測で埋めていない。顧客への通知送信なし、既存の追加課金構成なし。


## トップコピー差替（2026-10-31）

ユーザー指定に従い、サービス見出しを「温めて盛り付けるだけの、簡単ミールキット。」、説明をココロ/冷凍ミールキット/日常「ケ」と「アガる」の文面へ差替。紹介CTAは「商品を見る」→#ag-productsへ変更。商品見出しを「気分が上がる一皿を選ぶ。」へ、食卓提案の見出し・説明を「日常の中のひと時」「me time」の指定文面へ差替。変更はcontent section1ファイル。元画像/VIEW ITEM・他機能は維持。Liquid検査成功、公開反映・PC/mobile確認完了。

コピー配信元はclean remote master `4498bcaa7f24251d9e1d331aca0d6f2d573febcc`（文言5b8e680、長い見出しのresponsive文字サイズ4498bca）。直前fetch/remote一致と既配信bd1c917包含を確認、live189917102253へsection1件だけをpush。直前差分なし/readback一致。指定文面、me timeの引用符、PC/390px幅の改行/横はみ出しなし（390/390）、紹介CTA→#ag-productsと新商品見出しを確認。viewport復元、PC/mobile/食卓copy画面を保護runtimeへ保存し紹介部分のtabを保持。画像・価格・LINE/カート・API/台帳/試験modeは変更なし。


## おすすめ3商品へのレイアウト対応（2026-10-31）

ユーザーがストアで3商品に変更した設定を取得。商品順序/選択/表示名/説明/価格は変更しない。表示可能な商品数が3件の時だけ専用classを付け、PC990px以上は正方形写真の縦型カードを3列に配置。コピーをflexで伸ばして価格/CTAを下揃え。750〜989pxは写真＋説明の横型1列、mobileは既存の縦並びを維持。2/4商品では従来レイアウトへ戻る。section/CSSの2ファイルだけを変更、index JSONのストア編集を上書きしない。Liquid2件検査成功、配信/画面確認は進行中。
