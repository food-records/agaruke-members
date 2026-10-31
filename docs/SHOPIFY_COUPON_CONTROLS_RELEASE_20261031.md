# ECクーポンの選択・解除・適用状態表示（2026-10-31）

ユーザー依頼: 顧客が券を自由に選択/解除し、商品検索時などでも適用状態を確認する。交換券のタイトルからシリアルを除いて分かりやすくする。配信はしない。

各ページにコンパクトなクーポン状態欄を追加。未選択/適用中/利用条件未達をShopify cartのdiscount_codes/applicability/割引額に基づき表示し、選択・変更からEC会員画面へ進む。解除はその場で行える。会員画面にはテスト券を含む各未使用券の「使う」と「使わない」を用意。Ajax cart/update.jsのdiscountへ選択コード1つ、解除は空文字を送る。数量・商品・既存会員属性は変更せず、券の交換や追加ポイント消費は行わない。テスト券の自動適用を撤去し、解除後や再訪時に自動で戻さない。

表示補助のtitle/hash（コードそのものではない）をcart attributesへ保持し、SHA256照合で一致するコードだけに名称を使う。コードは表示cacheへ保存しない。表示欄はcart.jsをページ開始/カート更新/復帰時に読むだけで、定期ポーリングや全ページFirestore照会は追加しない。各ページ1回程度のShopify Ajax読取のみ。既存の会員表示cacheは維持する。

新規交換券のShopify管理タイトルは「EC 200円OFFクーポン（商品合計3,800円以上）」などに変更。既存のAGARUKE Members＋金額＋64桁ID形式だけを検出してtitleのみ変更するoperator toolを追加。既発行の200円券1枚をdry-runで確認。コード/額/条件/期限/残高は変更しない。カートの通常表示もLiquidでコードを名称へ変換。Shopify標準checkoutのコード欄はテーマ編集の範囲外で、コード自体の表示が残る場合がある。

検査: Node20件、型検査、backend build成功。GraphQL query/mutationは2026-07でschema検証成功。Liquid/JS/CSS5ファイル検査成功。API変更なし、交換のみ公開/購入pt・paid・返金停止を維持する。本番反映と実画面検証は下へ追記。


## 配信元・名称変更・テーマ反映

clean remote master6ee7ebbdc5b73d3e979d83b1bc6088b689389ebcをpush/SHA一致・release guardで検査。直前backend f4c07e3と既配信API/他作業を包含。Git外clean cloneからCloud Build f3b80f08-9c21-417a-90bd-56b046eb8be8、SUCCESS。digest sha256:b7170b011345102899de461343639765d22669c401bc493c692d6002d0eadb2b。

operatorのdry-runで既存200円券1枚だけを確認し、titleのみ更新・応答読み戻し成功。元の個別コード/残高/金額/最低額/期限は保持、通知なし。管理API2操作を2026-07で検証済み。今後の発行も金額と条件付きのtitleになる。

公開テーマDawn189917102253（role=live）で更新対象の直前取得と開始時snapshotが一致、新規asset2件に競合がないことを照合。asset3/snippet2の5ファイルだけをallow-live/nodeleteで配信しreadback完全一致。SHA256 manifestをruntimeへ保存。既存のcart2sectionはlabel snippet呼出し済みで変更不要。PCと390x844の実ブラウザーで一覧の未選択状態・状態欄の収まりを確認。viewportは元へ復元。

再適用toolが新規asset2件も出力するよう更新。ポーリング、service/権限追加、LINE配信なし。CPU0.08/256Mi/max1/min0/concurrency1と交換のみ公開のflagsを維持する。


## 公開・実操作検証完了

backend shopify-members-coupons-6ee7ebbへ100%切替。候補/公開で架空Customerのstatus200・未連携exchange400、候補未認証API401を確認。Git label/digest・CPU0.08/256Mi/concurrency1・SHOPIFY_LINK_TEST_ONLY=true/SHOPIFY_COUPON_EXCHANGE_ENABLED=trueを読み戻した。新revisionのERROR標本0件。

複数コードが残る場合に、先頭の条件未達コードではなく実際にapplicableなコードの名称を使う回帰を追加（最終Node20件）。theme専用修正6f08a71c3d4b51fc779d96bbac7ce3e24c0984f6をmasterへpush/SHA一致後、直前のasset一致を再確認して該当JSだけを配信・readback一致。backend配信元は6ee7ebbのままで追加backend変更なし。

本人の既存購入セッション/既発行200円券で、使うボタン→EC 200円OFFクーポン適用中→商品一覧→カレー検索結果でも適用中を確認。カートのコードが金額付き名称となり、200円引き/4,920円を確認した。解除ボタンで5,120円へ戻り、一覧へ再訪しても未選択を保持（テスト券の再適用なし）。開始時の4点（カレー3/ミートボール1、3行）と残高800ptは変更していない。カートの開始時未選択へ復元。新しいポイント交換/注文確定/支払なし。LINE配信なし。

証跡: Git外runtime/shopify-coupon-controls-20261031/search-applied.png、catalog-cleared.png、theme-sha256.json。本人セッションを含む情報をGitへ複製しない。Secretary記録先orderec、Driveイベント公開は未承認保留。追加の.work領域なし、既存.workは保持。clone/snapshot/build・検査ログはruntimeへ保持。通常購入pt/paid/返金処理の開始とLINE内交換一覧への統合は未対応のまま。
