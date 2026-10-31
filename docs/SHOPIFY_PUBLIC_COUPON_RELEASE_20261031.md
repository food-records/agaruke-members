# 公開記念500円券と任意LINE登録の導線（2026-10-31）

ユーザー確定: 500円券は購入歴を問わず1人1回とし、初回にポイント交換券を使った方も次回以降に使える。LINEは購入条件にせず、初回購入後の任意案内へ。バナーはクーポン選択/適用状況を最優先、次にLINE未連携への任意登録案内、それ以外は非表示。

native AGARUKE500（1497005162669）のcontextを未購入segmentからALL（DiscountBuyerSelectionAll）へ変更し、titleを公開記念500円OFFへ変更済み。dry-run/readbackで金額500円・商品小計税込3,800円以上・1人1回・合計回数上限なし・併用不可・2026-11-30 23:59 JSTを保持した。期限/金額/コード/利用履歴/他条件は変更せず、LINE送信なし。Shopify/LINE登録・購入歴条件なし。共通リンクと既存UTMを保持。

edce008の未公開branchを統合するが、全券LINE必須ガードは採用しない。クーポン選択中はLINE状態より優先して表示（条件未達は適用中と区別）。未連携の一般券はカート確認/解除を案内し、LINE連携へ強制転送しない。連携済み・券なしはバナー非表示。従来の連携announcementを統合し、二重表示を防ぐ。バナーを隠しても商品/カートの会員カードに会員ページへの導線を残す。会員状態は既存cache/認証応答から受け取り、全ページ照会やpollを増やさない。

注文完了の既存blockに、未連携の初回購入者向け任意LINE登録リンクを追加。注文に既存購入セッションがある場合の署名付き連携同期は保持する。登録しない購入は可能。過去注文へのポイント遡及付与を案内・実行しない。購入pt/paid/返金停止と交換だけ公開のflagsは維持。

Node21件/型/backend build/注文完了extension型/2026-07 UI schema・Admin query/mutationを検証。theme検査はpartial snapshotに既存CSSが欠けていたため現行CSSを追加取得して再検査。Shopify scope追加・費用構成変更なし。公開・実操作は後記。

## 公開・確認結果

配信元master 6807ab8e476c83a45a06409280bb2c726fef50a6を承認済みoriginへpushし、remote一致・直前本番SHA包含・clean treeを確認。Cloud Build 1ad249ff-569b-4195-b4a5-1145d224b7a4成功、image sha256:037f9aca12a28c2d7962e40a907a0e0707338472c6aa284daae844788d475cfd、Cloud Run shopify-members-public-6807ab8へ100% traffic。試験停止/交換有効flagsとリソース構成を保持。候補/公開の未連携status=200、交換=400を確認。

Shopifyアプリpublic-coupon-6807ab8（version 1189197414401）を公開。既存thank-you block配置を確認。Dawn 189917102253には対象4ファイルのみ反映し、readbackのbyte/SHA一致を確認。他作業の写真/レイアウトは含めない。

新規匿名cart・Shopifyログインなし・LINEセッションなしで商品3,840円→500円引き→3,340円を確認。テストcartだけ空に戻し、注文/決済/券消費なし。実ブラウザーでも一般500円券の適用バナー、連携済み券なしの非表示、既存200円券の再選択を確認。最後は元の200円券選択/800ptへ復元。実決済後の初回LINE案内表示は未検証（editor previewが空白、配置と公開versionまで確認）。

LINE配信なし。購入ポイント/paid/返金同期は試験停止のまま。Secretary記録先orderec、Driveイベント公開は未承認保留。.work追加・削除なし。
