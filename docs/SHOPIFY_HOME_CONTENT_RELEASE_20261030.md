# AGARUKEトップコンテンツ（2026-10-30）

提案mockupをもとに、透明headerを維持したhero/商品へのCTA、サービス紹介、冷凍→温める→盛付の3step、実商品の説明/価格付き2カード、食卓の提案、配送/保存/加熱/アレルギーFAQ、問い合わせ、LINEカード確認、末尾の商品CTAを追加する。

既存バナーと商品写真だけを使う。包装の生成写真や架空reviewは使用しない。紹介文は公開products.jsonの冷凍・内容量・付け合わせ・味の説明から作成。価格はLiquidの商品価格を表示。包装/調理分数/送料額/発送日/賞味期限/返品条件/ポイント数など未確認情報を断定しない。contactページ200確認、shipping/refund/legal-notice policyは404のため架空のpolicyを作らず、送料はcheckout/不明点は既存問い合わせへ案内する。

変更はhome用2section/1CSS/index JSONのみ。既存のheader・Members状態asset/snippet・商品/カート/checkout・API/台帳/試験modeは変更しない。旧home2sectionだけを認識するローカル準備toolを追加し、想定外構成で停止する。

Liquid4ファイル＋CSS改訂検査、全theme check error0（上流warning9）、既存Node14件、変更範囲4ファイルの検査を実施。未公開previewでPC/mobile幅を確認してから公開する。全snapshot/生成theme/公開商品データ/画面はGit外保護runtime `shopify-home-content-20261030/`。進行中。
