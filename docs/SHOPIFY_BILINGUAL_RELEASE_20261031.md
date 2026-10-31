# 商品の日英対応（2026-10-31）

## 現在状態：反映・確認完了

日本語を既定言語、英語を切替先として両domainに公開。Japanは両言語を継承。Dawnのヘッダー/フッターから切替可能。3商品を複製せず、native product翻訳として名称・body_html計6件を登録。日本語側から英語併記を分離。商品ID/handle/価格/在庫/画像を維持。

- カレー：Spice Curry with Juicy Chicken。チキン120g/カレー150g/ソース40g/ピクルス20gの現行説明を翻訳。
- ミートボール：Meatball with Tomato Sauce。約100g（3個）/ソース80g/ドフィノア60g/ブロッコリー50g。旧マッシュポテト説明は使わず現行原文に対応。
- 豚角煮：Braised Pork Belly and Stewed Beef Tendon。豚角煮100g/牛すじ煮込み50g/ほうれん草にんにくナムル15gの日本語説明を作成し英訳。加熱時間・原材料・アレルゲン・保存期限は推測追加なし。

トップ独自section2件を日英化。商品カードはnative item.titleを使い、英語ではnative翻訳descriptionを表示。merchant index/3商品選択/順序/短い紹介文設定は保持。元バナー/VIEW ITEM/透明header/3列配置維持。

## 配信・検証

clean remote master d37bafd40e037dc40ae6e90553253c5a4211ac0b、release guard（既配信23ac619包含）成功。公開Dawn189917102253へsection2件のみ反映・readback一致。Shopify Liquid2件検査成功。3商品の英語タイトル・説明・内容量と価格を公開ページで確認。日本語切替で元商品に戻ること、トップ英語見出し/3商品英語タイトル、標準の言語切替を実確認。注文/決済操作なし。

LINE/カート/backend/台帳/試験modeは変更なし。外部LIFF/会員認証ページや購入特典JSの独自文言は日本語のまま。本対応は商品とトップの翻訳であり、それらの英語化完了は意味しない。

## 作業経緯・運用

Translate & Adaptは標準言語追加時にインストールされたがiframe空白。標準CSVへ切替。Chrome file URL accessはユーザーが有効化。最初の手製CSVはTypeをProductsとし、登録されなかった。正式exportではTypeはPRODUCT、Identificationは先頭apostrophe付きの商品IDだった。「通常商品IDとは異なる」と先に説明したのは未確認の推測で誤り。ユーザーがDownloadsへ保存した公式CSVの識別子/Type/原文をそのまま維持して6件を記入、再import後に公開readback成功。

保護runtime shopify-bilingual-20261031に変更前snapshot、公式export、英訳CSV、公開JP/EN証跡を保持。商品実データをGitへ保存せず、翻訳用商品権限の追加なし。新規課金構成なし。Secretary eventのDrive公開は未承認で保留。
