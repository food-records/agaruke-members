# LINE先行認証の配信記録（2026-10-28）

## 現在状態

LINE認証後、Shopifyログインを確認できた場合は継続連携、ゲスト購入なら一注文だけの連携とするユーザー指示で、現行仕様を更新した。旧8文字コードUIを撤去し、既存サービス内へ実装。本番反映と技術smoke testを完了。本人の実機認証は未実施。

追加scopeは `write_app_proxy`。既存 `read_customers/read_orders/read_discounts/write_discounts` を維持する。proxyは `/apps/members` → backend `/proxy/members`。ユーザーから追加権限の更新承認を取得し、Shopifyの更新画面で確定済み。注文完了ページへ `members-order-link` を追加し、backend URLを設定して保存。再読込後の「追加済み2」と保存無効状態を確認した。

`SHOPIFY_LINK_TEST_ONLY=true` を維持し、本人連携を先に試験する。交換/paid/返金処理の本番利用を検証済みとは扱わない。既存リソース上限と承認済み費用条件を維持する。

## 検証

Go全package Emulator/race とvet、Node 7件、appと両拡張の型検査、Shopify config validate、app build、UI/Liquid schemaを検査。ゲストの継続リンクなし、一回のポイント付与、別カート拒否、開始ブラウザのverifier不一致拒否、一回コード再利用拒否、注文Customer不一致拒否、返金再送を確認する。

## 実機確認手順

1. `/apps/members` でLINE認証し、手動コードなしでショップへ戻ることを確認する。
2. ログインして購入する分岐で連携済み表示になることを確認する。
3. 別の未連携テスト会員・ブラウザでゲスト購入を行い、顧客情報が作られても継続リンクを作らないことを確認する。
4. チェックアウト内で初めてログインした場合は、注文完了ページで連携が確定することを確認する。注文通知が未到着なら「連携を再確認」を押す。
5. 連携確認後、試験モード解除とクーポン/ポイント付与/返金の結合試験へ進む。実決済・注文は本人操作で行う。

新導線のクーポンはゲスト対応の一回限りコードであり、コードの共有先による先行利用を技術的に禁止しない。同一ブラウザでの認証復帰を基本とし、端末を跨ぐQR認証は対象外。

## 配信照合

承認済みremoteは `git@github.com:food-records/agaruke-members.git` / master。実装a7e70d9、購入セッションの注文作成時予約8228376、app proxy内JavaScriptのLiquid解釈を避ける修正f6a2377を統合。API/backendの最終配信元はともに `f6a237713b774ef83f0151e0c914472ecdd0b6d7`。fetch、clean tree、remote SHA一致、旧本番847d1d1/43c4eec/e04b6d3と既配信a7e70d9の包含をrelease guardで確認。

| 対象 | 最終revision/version | 状態 |
| --- | --- | --- |
| Members API | members-api-00059-ges | 100%、SHA f6a2377 |
| Shopify backend | shopify-members-00004-huq | 100%、SHA f6a2377 |
| Shopify app/拡張 | line-first-a7e70d9 / 1184603176961 | 公開済み |
| Members site | GitHub Pages / a7e70d9 | workflow成功・配信JSを確認 |
| Rise theme | 188803907757 | 上部/商品購入前/カート会計前の3入口を `/apps/members` へ変更 |

- API image: `gcr.io/fr-agaruke/members-api@sha256:15d2d996bac8a16e226d00c2fa32d9f6bcbc1c738b3b158740a53c51e2fd8130`、build `658eae31-2543-4c64-95ff-52a423954651` SUCCESS。
- backend image: `gcr.io/fr-agaruke/shopify-members@sha256:c03c90444639b88764ef549fb4bad8fed55a802aa8f0e9498a4eaaf6bacf89ce`、build `d6f78c2c-f8ec-4596-8796-94a3f01dbf21` SUCCESS。
- 初回a7e70d9のAPI/backendも成功したが、予約処理/表示修正後の上記最終revisionへ置換。8228376のAPI候補00058-didは0%のまま最終版へ置換。途中候補と旧revisionは削除していない。
- API: SHOPIFY_LINE_FIRST_ENABLED=true。webhook HMAC用app secretを既存API実行SAへ該当Secret1件に限定して付与し、version1を参照。secret値は出力/Gitに保存しない。既存resourceとtagを保持。
- backend: SHOPIFY_LINK_TEST_ONLY=true、scope5件。CPU0.08/256MiB/max1/concurrency1/min0/gen1を維持。既存APIは1CPU/512MiB/max20を維持。
- root200、未認証LINE authorize/private purchase403、checkout401、未署名proxy400を確認。curlのbot UAでは公式SDKが410を返すため、checkout試験には通常browser UAを使用。
- Shopify proxyの実応答200、購入前UI表示、実商品・既存カートの案内位置/URL、商品CTAから新ページへの遷移、そこからLINEログイン画面への遷移を確認。既存カートの数量・商品・支払いは変更していない。
- theme3設定は直前remote一致、patch再実行差分なし、push後readbackのJSON一致とchecksumを保護runtimeに記録。実テーマJSONやLINE grantをGitに含めない。
- 新方式はブラウザに開始proofが必要。PCのLINE QRログイン機能を同じPCブラウザへ戻すことは可能だが、ショップと会員カードを別端末で開く手動連携QRフローは実装対象外。

06:40 UTC以降の対象2serviceのERROR記録は照会時0件。実LINE/Shopify本人操作での両分岐、購入/クーポン/返金のE2E成功とは扱わない。現時点ではLINEログイン画面までの技術確認に留まる。

## ロールバック

連携試験を停止したうえでbackendは00001-f9h、APIは00054-soqへtrafficを戻し、themeは保護runtimeのtheme-beforeを対象3設定だけ復元する。Shopify版は旧members-link-e04b6d3、Pagesは旧a7以前の配信元へ戻す。新データを削除しない。新方式の注文が発生した後は、旧APIへ戻す前に未処理注文と券の整合を確認する。

## 本人認証後の確認（2026-10-28 15:52 JST）

ユーザーから「認証したが表示が変わらない」と連絡。Cloud Runの時刻/パス/HTTP結果とFirestoreの最近30分の購入セッションを読取確認した。15:52:04のLINE authorizeは200、15:52:09に購入セッションを作成し、その後の状態取得/認証済みCustomerの継続連携も200。セッション1件が有効で、Customerあり、Customer→LINEとLINE→Customerの両参照が同じ組に一致することを確認。注文はまだ記録されていない。会員UID、Customer ID、トークンは出力/記録していない。

この結果によりログイン側の実本人連携の保存を確認できた。ゲスト購入、実注文/交換/返金は未確認であり試験モードを維持する。入口ボタンは固定表示のため、トップ/商品/カートの表示は連携後も変わらない。購入用専用ページ内の状態表示はsessionStorageの購入トークンから取得するため、表示不変と指摘された対象画面・端末をユーザーへ確認中。
