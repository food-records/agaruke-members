# クーポン画面の再設計とヘッダーバナー（2026-10-31）

ユーザーから、適用状況のバナー表示の提案と選択/解除画面が見づらいとの指摘を受けた。固定の右下小窓を廃し、ヘッダー直前の通常フローのコンパクトなバナーへ変更する。適用中/条件未達/未選択と選択/変更/解除を表示。商品/検索から選択画面へ進んだ場合は、お買い物を続けると元の商品/検索へ戻る（安全なstore内pathだけを許可）。トップの透明/stickyヘッダーは追加バナーの高さを動的に再計測する。

選択画面は見出し・利用可能ポイント・現在の選択・所持券・折りたたみの交換・買い物へ戻る、の順に整理。所持券は金額/最低額/期限/使うボタンのカードとし、選択中の券を枠/状態badgeで強調。現在選択の解除は現在欄へまとめる。交換はdetails内に3レートを並べ、残高不足は無効化し、選択/解除と残高消費を伴う交換を分離する。認証の説明とLINE再認証は末尾へ折りたたむ。試験中の案内は補足として下部へ置く。

コードのセキュリティ境界、交換条件/実残高減算、個別券、期限、試験mode/交換のみ公開、購入pt/paid/返金の停止は維持。追加API/権限/定期Job/ポーリング・LINE配信はない。テーマ3assetとbackend UIが反映対象。Node20件（セクション構成/残高不足/戻り先の回帰を更新）、型/buildを確認。公開と実機検証は後記する。


## 本番反映と実機検証

実装beafe02をmasterへpush/SHA一致・release guardで検査し初回build9cdc0a77-25b1-45af-bf23-0d49309276e5はSUCCESS。ただし配信直前に別タスクの写真変更cbd14acが進んだためguardで停止し、このimageは未使用。clean cloneをcbd14ac57a1aa08875dfc074e226d2aada448824へffして再検査・build528ae137-59a0-4fbc-9b9a-82d4438c70c6（SUCCESS）、digest sha256:27a8d572752604dba2d0d27e61d8c189d3318f739526da1941bfb9c045570df0を使用した。

backend shopify-members-coupon-ui-cbd14acを候補0%で疎通確認後100%へ切替。Git label/digest、CPU0.08/256Mi/concurrency1、SHOPIFY_LINK_TEST_ONLY=true/SHOPIFY_COUPON_EXCHANGE_ENABLED=trueを確認。候補/公開の架空Customer status200/未連携交換400、新revisionのERROR標本0件。既存API/権限/リソース上限/購入pt・paid・返金停止を維持。

公開Dawn189917102253へcoupon JS/CSS・home header JSの3assetだけを配信。開始時と直前の原本一致、配信後readback一致を確認した。テーマ側のタップ領域を0de89db、Dawn app proxyの幅が内容に合わせて縮む問題を7577b7fで補正。実画面でトップ透明headerのtop:autoが新バナーへ重なることを検出し、ce2ec58で総バナー高さを計測してPC非sticky時のtopへ設定。sticky時の既存可視高さ、スマホの通常フローは維持。各補正も先にmasterへpush/SHA一致・Liquid/JS/CSS検査後、対象assetの直前一致/更新/readbackを照合した。他作業の写真・文章・商品・価格には触れていない。

ローカルの架空データプレビューでPC/390pxの構成、カード/バナー同期、解除後も残高不足が無効であることを先行確認。公開後は実際の既存200円券で、現在欄から解除→カードから再選択→バナー/選択中カードの同期を確認。検索→バナーの変更→同じカレー検索へ戻ることを確認。トップのbanner bottom45px/header top45pxで重なりなし。公開スマホ幅390pxではページ幅390px、横はみ出しなし。交換detailsを開き1,000pt不足ボタンが無効、選択済券も二重操作不可。PCは幅900pxで読込前後の幅を固定した。

検証前の200円券適用中へ復元、残高800pt・カート4点を維持。ポイント交換/注文/決済/LINE配信は行っていない。通常購入pt/paid/返金の開始、LINE内交換一覧への統合は従来どおり未対応。公開画面を残し、viewportを標準へ復元、local preview serverを停止した。

証跡と最終manifestはGit外runtime/shopify-coupon-ui-20261031/（coupon-ui-mobile.png、coupon-ui-desktop.png、home-banner.png、theme-sha256.json）。Secretary記録先orderec、Driveイベント公開は未承認保留。既存.workは保持・追加なし。前回検査で生成した自分のpycache1件だけを除去し、snapshot/clone/build logはruntimeへ保持。
