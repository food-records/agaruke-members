# お届けイメージ（2026-10-31）

## 状態：実装・検査済み、本番未反映

ユーザー添付の箱入りミールキット写真を使う依頼。サービス紹介の直後・食べ方の前にお届けイメージを追加する。PCは画像左/説明右、mobileは画像上/説明下。元画像の透過や構図を保ち、object-fit:containと自然な縦横比で表示。現在の配色に合わせた淡いベージュ背景。画像・見出し・本文・注記・代替テキストはテーマ編集画面の日英欄から変更可能。

コピーは冷凍の箱配送/冷凍庫保存/温めて盛り付ける案内に限定。「写真はお届けイメージです。内容はご注文の商品によって異なります。」を日英で明記。箱サイズ、配送日数、調理時間、同梱数、真空包装等は推測で追加しない。送料/価格/在庫/バンドル/クーポン/LINE/バックエンドは変更しない。

## 画像の受取待ち

会話の添付画像は見えるが、アップロード可能な元ファイルのパスは提供されていない。Downloads直下の直近画像とShopify Filesの既存11件を確認したが、添付の箱写真は確認できず。新しい3meals-setは盛付3皿の写真であり別画像。代用品は使わない。ユーザーへ元画像のファイル名/保存先を依頼中。

Shopify Files画面は正常に開く。ファイル選択経由で登録し、観測した実ファイル名をimage_pickerへ設定する予定。元画像を変更/生成しない。新しい権限の追加は不要。現在、画像アップロードとテーマ配信は実行していない。

## コード・検証

- agaruke-home-content.liquidにdeliveryブロックを追加（limit1）。画像が未設定なら表示しない。
- agaruke-home-content.cssへPC/mobile用の見た目を追加。
- theme-delivery-section.pyが既存データを保持し、about直後に1ブロックを追加。画像が異なる既存deliveryを上書きしない。
- 旧theme-editable-content.pyは任意deliveryブロックを移行必須項目にしない。
- 既存17ブロックの内容/順序/section設定を保持、再実行の冪等性をローカル確認。Liquid/CSS/index JSONの3件をShopify validatorで確認済み。

保護runtimeはshopify-delivery-section-20261031。beforeは公開Dawn189917102253を取得。candidateは画像名agaruke-delivery.pngを仮設定したローカル検査用で、実際には未登録。これをそのまま配信しない。元画像受領後に最新テーマを再取得し、既存の編集を保持して実ファイル名でcandidateを再作成する。

配信時は既配信機能を含むremote masterを確認（開始時HEAD49fcca9、3種3980円Bundlesの公開確認まで含む）。現行index/section/CSSの変更を直前比較し、clean/pushed SHA・包含関係をrelease guardで検査してからsection/CSS/indexのみ反映。日英/実画像/既存商品と導線/画像編集欄を確認し、readbackとPC/mobile証跡を保存する。
