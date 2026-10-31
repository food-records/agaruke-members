# ポイント交換の一時公開（2026-10-31）

ユーザーがポイント交換もテストするため一時公開を指示し、配信しないよう指定。試験mode全解除では購入ポイント/返金処理も開始するため、交換だけの独立フラグSHOPIFY_COUPON_EXCHANGE_ENABLEDを追加した。既存SHOPIFY_LINK_TEST_ONLY=trueを維持し、追加フラグtrueで交換/発行再開・交換3種と通常券の表示を有効にする。app proxy/Customer APIの両方で同じ判定を用いる。未認証からの交換は従来の認証/会員/残高検査で拒否する。

200pt/500pt/1,000pt、最低商品額3,800/7,000/12,000円、実残高減算、個別1回券/暦3か月/併用不可は維持。共通券や仮ポイントは追加しない。LINE送信/配布・顧客への通知なし。自動停止時刻は設定せず、停止は追加envをfalseに戻す。購入ポイント付与・決済後のMembers券使用済み同期・返金処理は試験modeで停止したままなので、今回は交換/発券/割引適用までの試験。Shopify nativeの総利用1回制限は有効。

追加service/定期job/権限/スキャンなし。CPU0.08/256Mi/max1/min0/concurrency1を維持し、既承認の試験利用範囲。Node17件（交換だけの有効化・ブラウザUI3種/通常券表示含む）/型/build成功。Go全package回帰も成功。公開反映は下記へ追記する。

## 配信準備と検証

配信元f4c07e311603c4ab50798dbbe2a116056adbac66を承認済みorigin/masterへpushし、release guardでHEAD/remote SHA一致・直前API/backend本番cc6cc7bの包含を検査。途中で別タスクの未commitテーマ差分が生じたため、元worktreeには触れずGit外runtimeのclean cloneからbuildした。build bf14e642-c9b0-410f-88a4-280febfd1f51はSUCCESS、image digest sha256:31831c2f0400d98be7c41a2165afd37aed94753654e0f71e861de496688cba15。build中にmasterはテーマ変更bdc2b6eへ進んだが、配信元f4c07e3の子孫であり、当該テーマの公開操作は今回行わない。API/backendの直前本番SHAはcc6cc7bで変化なし。

短期署名付き・意図的に実在しないCustomerで旧backendのstatus200/linked=false/link_test_only=true、交換403を確認。この試験では実会員の連携/残高/券を変更しない。公開後の本人LINE認証と実交換はユーザーが行う。


## 一時公開完了

backend shopify-members-exchange-f4c07e3へ100%切替済み。SHOPIFY_COUPON_EXCHANGE_ENABLED=true / SHOPIFY_LINK_TEST_ONLY=true / SHOPIFY_MEMBERS_ENABLED=trueを読み戻し確認し、CPU0.08/256Mi/concurrency1/max1/min0を維持。候補と公開URLで署名付き架空Customerのstatus200/linked=false/試験mode=true/交換enabled=true、未連携exchange400を確認。未認証Customer API401、未署名proxy400を確認し、実会員を作成・変更していない。公開app proxyのHTML内で新しい交換UI scriptを照合、ブラウザーの入口表示も確認。新revisionのERROR標本は0件。API/Shopify拡張/テーマの配信はなし。

入口 https://shop.agaruke.com/apps/members 。本人LINE認証後に交換する。実交換・実残高減算・Shopify割引発行のE2Eはユーザー本人テスト待ち。実会員での成功は未確認。交換のみの一時公開であり、paid停止のため購入pt/会員券の使用済み同期・返金処理は未開始。LINE配信/通知なし。

停止する場合はbackendのSHOPIFY_COUPON_EXCHANGE_ENABLED=falseに戻す（SHOPIFY_LINK_TEST_ONLY=trueを保持）。復旧先はshopify-members-pricing-cc6cc7b。既発行券/残高/注文は削除しない。証跡は共有workspaceのGit外runtime/shopify-exchange-20261031/published-entry.png。Secretary記録先orderec、Driveイベント公開は未承認保留。clean clone/build log/smokeはGit外runtimeへ保持、.work追加/削除なし。
