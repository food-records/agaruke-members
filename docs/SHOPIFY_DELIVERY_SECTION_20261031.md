# お届けイメージ（2026-10-31）

## 状態：公開反映・日英表示確認済み

ユーザー指定のDownloads/box-image.pngをShopify Filesへ登録し、公開Dawn189917102253のサービス紹介直後・食べ方の前へ追加。元画像は960×956の透過PNGで、画像生成・加工はせずそのまま使用。画像参照はshopify://shop_images/box-image.png。淡いベージュの背景、PCは画像左/説明右、mobile用CSSは画像上/説明下。自然な縦横比とobject-fit:containで箱全体を見せる。

画像・見出し・本文・注記・代替テキストは「AGARUKE サービス紹介 → お届けイメージ」の日英欄から変更する。コピーは冷凍配送/冷凍庫保存/温めて盛付の案内に限定し、「写真はお届けイメージです。内容はご注文の商品によって異なります。」を日英で付記。箱サイズ/配送日数/同梱数等は推測追加なし。

## 配信・検証

配信元はclean remote master e4d985eeb71d606f87186ecf74a24f16f6262ebb（実装b85518bを包含、最新の3種3980円Bundles/商品一覧設定の記録も保持）。release guardでremote SHA一致・開始時49fcca9包含を検査。最新テーマを取得し、既存17ブロック/商品選択/順序/文言/画像設定/section順を保持したままdelivery1件を追加。section/CSS/index JSONの3ファイルだけを反映、3件readback一致。

Shopify validatorでLiquid/CSS/index3件を確認。公開日英ページで実画像のロード・見出し/説明/注記/代替テキストを確認。PC1352pxで横はみ出しなし、画像と本文は横並び。DOM順はabout→delivery→how。商品3件/FAQ4件、Company target=_blankと/apps/members導線も維持。元の送料・価格・在庫・バンドル・クーポン・LINE・バックエンドには変更なし。注文/決済操作なし。

viewport overrideは390px指定後も実幅1352pxのままでmobile実表示の新規検証はできていない。responsive CSSは追加・検査済み。テーマ編集アプリのiframeは引き続き読込途中で白画面になるため、管理画面での入力/保存操作は未確認。画像登録のFiles画面は正常に動作した。未確認事項を公開表示確認と混同しない。

## 実装・継続運用

- agaruke-home-content.liquidのdeliveryブロックはlimit1、画像未設定なら非表示。
- theme-delivery-section.pyは取得済みテーマをローカル変更する。既存データを保持し、同じ画像での再実行は文言を初期化しない。異なる既存画像は上書きせず停止。
- 旧theme-editable-content.pyではdeliveryを任意ブロックとして扱い、既存の編集文言の移行判定を壊さない。
- snapshot/元画像コピー/公開JP・EN画面/readback/manifestはGit外保護runtime shopify-delivery-section-20261031へ保持。
- runtime candidateは初回の仮画像名検査用で配信しない。実配信物はrelease、配信後はreadbackを参照する。

当初は会話添付の元画像パスが取得できず未配信だったが、ユーザーからbox-image.pngの保存先を受領して登録・反映を完了。追加権限・新規課金構成なし。Secretary eventのDrive公開は未承認で保留。

## HOW TO ENJOYへの集約（2026-10-31、配信準備）

ユーザーの代替案に従い、冷凍配送の既存アイコンを開いた箱＋3つの密封パックのSVG線画へ差替。既存の2・3番の線画と調和させる。独立deliveryセクションはshow_on_home=falseでトップ非表示とし、登録画像・日英文章は保持。「トップページに表示する」チェックで再表示できる。商品ページへの新規移植は今回行わない。変更はsectionとindexの2ファイル、既存設定は表示フラグ以外すべて保持。
