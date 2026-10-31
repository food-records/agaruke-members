# 商品の日英対応（2026-10-31）

## 現在状態

日本語をストア既定言語に変更済み。英語は両ドメインに追加済みだが未公開。公開3商品の日本語タイトルから英語併記を分離し保存。豚角煮/牛すじ商品へ指定内容量（100g/50g/ほうれん草にんにくナムル15g）を含む日本語説明を作成・保存し公開ページで確認済み。商品ID・handle・価格・在庫・画像は維持。

英語名称・説明6件のCSVはGit外runtime `shopify-bilingual-20261031/products-en.csv`。Translate & Adaptは追加時に標準インストールされたが、2回開いてもiframe空白。標準CSV importへ切替。Chrome拡張のfile URL access無効によりchooser.setFilesが拒否され、ユーザーへ有効化を依頼中。CSVは未送信、英語翻訳未登録、英語未公開。

トップ独自section2件の日英翻訳・英語時のnative商品タイトル/説明を使う変更は実装・Shopify Liquid検査成功。まだ配信していない。ポイント/クーポン/backend/試験modeは変更なし。

## 続き

- Chromeファイルアクセス有効化後、CSV importを再実行しpreview/import結果確認。porkのDefault contentは保存後の日本語説明に合わせて更新する。
- 3商品の英語タイトル/説明をreadback。内容量と現行説明（ミートボールはドフィノア）を照合。
- clean remote master/SHA包含を検査してsection2件をテーマ189917102253へ配信、英語を公開しJP/EN切替を確認。
- 公開トップのmerchant block表示名が日英併記のまま残る場合はJP側もnative item.title優先へ調整。最新index設定は再取得して保持。
- LINEカードの外部LIFF/会員認証ページと既存カート状態文言は日本語のまま。今回の商品対応をそれらの翻訳完了と扱わない。

証跡・snapshot・CSVは保護runtimeに保持。外部送信・注文操作・新しい課金構成はなし。翻訳CSVは商品内容のみ。

## 続報

ユーザーがChrome file URL access有効化。CSV6件のupload/preview/importは完了したが英語商品ページへ反映されず、言語設定は「翻訳なし」のまま。標準翻訳CSVの識別子は通常の商品IDと一致すると仮定できないため推測で再送しない。正式な商品限定・英語CSVを標準exportし、管理者メールからのdownload済みファイル名/パスをユーザーへ依頼。英語は公開済み、Japanで両言語を継承、Dawnのヘッダー/フッター言語切替は有効。商品英訳は未完了。

トップsection2件はclean remote master `d37bafd40e037dc40ae6e90553253c5a4211ac0b`、release guard（既配信23ac619包含）成功後にテーマ189917102253へ反映。2件readback一致。標準日本語タイトルを両言語の商品カードへ表示し、英語では翻訳済み商品descriptionを使う。merchant index/3商品選択/短文は変更なし。既存LINE/カートJSは維持。
