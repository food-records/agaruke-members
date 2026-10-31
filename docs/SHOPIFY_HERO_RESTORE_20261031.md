# ヘッダー画像復元・VIEW ITEM CTA（2026-10-31）

ユーザー指示で元の `agaruke_header.png` をPC/スマートフォン共通の全幅バナーへ戻す。分割hero、追加のeyebrow/見出し/説明文、mobile用商品写真を撤去し、画像上にはVIEW ITEMと細い右矢印のCTAだけを残す。添付参考に合わせ、塗り/枠/丸みのない文字＋矢印、文字間隔広め。商品エリアへの既存アンカーを維持。透明headerとバナー下の追加コンテンツ・LINE/カート機能は維持。

変更はhero section/CSS/index JSONの3ファイルと将来のローカル準備tool。画像は元のストア画像をそのまま使用し、追加生成/画像編集なし。snapshot/候補/証跡はGit外保護runtime `shopify-hero-restore-20261031/`。Liquid3ファイル検査成功。公開テーマへ反映・表示確認完了。

配信元clean remote master `bd1c91711063d0adcf167a551acbb68a753627df`、直前fetch/remote SHA一致と既配信12c36e4包含を検査。公開Dawn189917102253へ3ファイルのみpush。対象3ファイルは直前取得で変更なし、readback一致、manifest保存。元画像/desktop560px/mobile340px、追加コピーなし、VIEW ITEMと細線矢印/背景枠丸みなしをPCと390px幅で実確認。クリックで#ag-productsへ移動し商品見出しを確認。viewportを復元し通常トップtabを保持、PC/mobile画像を保護runtimeへ保存。

商品/カート/LINE会員状態asset/backend/台帳/試験modeは変更なし。既存のhero下コンテンツも維持。新規画像・課金構成・通知送信・注文操作はなし。
