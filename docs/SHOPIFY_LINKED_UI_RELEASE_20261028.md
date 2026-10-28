# Shopify連携済み表示の配信記録（2026-10-28）

## 依頼と実装

連携済みの場合、ヘッダーの連携案内を隠し、カートの再連携ボタンを獲得予定ポイントとECクーポン案内へ変更する。署名済みapp proxyからLINE会員/購入セッションの状態を照合し、ブラウザの表示フラグだけで連携済みと判断しない。

`storefront_status` は、カート限定の有効な一時認証または認証済みCustomerの継続連携を確認する。連携済みCustomerが新しいカートを開いた場合は、正逆リンクと有効会員をTransactionで再確認して24時間購入セッションを作り、カートへ設定する。ヘッダーの読取だけでは新セッションを作らない。別Customerへ切り替わったブラウザは前の会員情報を表示せず、未連携の場合は自前の期限切れ/不適合tokenとポイント注記だけをクリアする。

## Basicプランのチェックアウト表示

実管理画面でBasicを確認。情報/配送/支払画面のCheckout UI ExtensionはPlus限定のため、新しい決済画面blockは追加しない。通常のAjax cart APIで最初の商品明細の公開補足情報 `獲得予定ポイント（注文全体）` に注文全体で一度の予定ptを記載し、標準のチェックアウトの商品サマリーへ表示する。

商品・価格・数量・販売プランを変えない。他の既存propertiesは全件保持し、自前の補足欄だけを追加/空文字で解除する。数量は取得済みの同じ値を明示し、処理中だけカートの数量操作とcheckoutボタンを停止する。Riseのcart-updateイベントで明細を再描画し、通常の数量変更/商品追加後も予定表示を再確認する。自前イベントを再処理せず、定期ポーリングは行わない。補足欄は表示用であり、ポイント付与の根拠には一切使わない。

`SHOPIFY_LINK_TEST_ONLY=true` は維持する。現在の表示は「今回0pt（連携試験中・通常100pt）」とし、停止中なのに100ptを今回付与すると案内しない。ECクーポンがある場合だけ案内し、試験中は利用開始前/確認のみと記載する。解除後は同じUIが100ptとクーポン適用案内へ切り替わる。プラン変更/追加service/定期job/スキャンはない。

## 検証・現在状態

本番反映と実表示確認を完了。Go Emulator/race/vet、Node10件（予定ptの試験/通常/未連携/空カート/外貨、補足欄の他properties/数量保持/冪等更新）、型検査、app/config/build、取得済みの実テーマ全体を使ったLiquid検証を実施し成功。部分取得テーマでの初回検証は参照asset/locale不足で不成立、全体の読取コピーを用意して再検査し成功。

## 公式仕様

- [チェックアウトのプラン別カスタマイズ](https://help.shopify.com/en/manual/checkout-settings/checkout-customization)
- [Ajax cart APIとpropertiesの更新](https://shopify.dev/docs/api/ajax/reference/cart)

実機のヘッダー/カート/チェックアウト表示と、対象themeの直前remote一致・反映後readbackを配信後に記録する。実決済/注文確定は行わず、既存カートの数量と総額を照合する。

## 配信結果

- 実装 `a9bb8bc`、生成manifest除外 `6c7fde8`、空カートでのヘッダー状態取得 `f7df96b` を承認済みorigin/masterへpush。API/backendのビルド元はclean remote master `6c7fde8a63f70ea8a31fd346b9b3d75ee793ca45`。既配信f6a2377の包含・remote SHA一致・release guardを確認して配信した。
- API `members-api-00061-ven`、image `gcr.io/fr-agaruke/members-api@sha256:dd48da3fbb2d118ad693386c9fba6c919e409a7bb22e4327bf9e67c08019207f`、build `fdddfe4b-c9f8-4931-8541-8be623093d10` SUCCESS。
- backend `shopify-members-00006-maf`、image `gcr.io/fr-agaruke/shopify-members@sha256:1d0cd04186d9b295e0f0efb8bad2f7c1365d0f7bb22c1603ffbf81e3cda8d5db`、build `21d17658-9823-40df-832e-471b18cf3f38` SUCCESS。両方100%へ切り替え、旧revision/tagは保持。
- Shopify版 `linked-ui-6c7fde8` / `1184646692865` を公開。scope追加なし。Basicプランはread-onlyで確認し、プラン変更はしていない。
- theme反映直前に別作業の `a46b18d`（店頭クーポン文言）がremote masterへ進んだため、初回release guardで停止。fast-forwardで取り込み、全Go packageのEmulator/race/vetを再検査して成功。themeはcleanなa46b18dから、今回の対象5ファイルだけを配信した。別作業のGoコードをこのtheme操作で変更/配信せず、その作業の候補revisionも操作しない。
- theme188803907757: `layout/theme.liquid`、追加snippet/JS、商品/カートJSONの5ファイルを限定push（nodelete）。header-groupは変更せず、JSで対象の連携案内だけを非表示。直前remote一致と、6ファイル（header含む）のreadback・checksumを保護runtimeに保存した。

## 実画面と安全性の確認

- 実連携済みブラウザでカートを再読込し、ヘッダー案内/カートのLINEボタンがどちらも非表示、購入特典の案内が表示されることを確認した。
- 既存カレー1点、商品小計1,200円を保持。数量1をDOMでも再確認。既存の商品明細に予定ptの表示用補足欄だけを追加した。ポイント/クーポン交換/注文確定/決済は行っていない。
- チェックアウトへ進み、商品サマリーに「獲得予定ポイント（注文全体）: 0pt（連携試験中・通常100pt）」が表示されることを確認。商品小計1,200円、既存配送設定の送料870円、合計2,070円。支払操作はしていない。個人情報を含まない商品サマリーだけの画像を保護runtimeへ保存した。
- トップでも非表示を確認し、カートへ戻って購入特典の表示が維持されることを確認した。ブラウザにはカートを残す。
- 所有EC券がある場合の案内と、試験/通常・空カート・外貨・未連携の予定ptはNode10検査で確認。実会員へテスト券を発行したり、交換ポイントを減らす操作はしない。
- API候補root200/private403、backend root200/未署名proxy400、実proxyの匿名状態200（未連携/0pt）を確認。今回のShopify連携経路でERRORなし。07:20 UTCにGET /coupons 500がAPI61と別coupon候補で各1件記録されている。今回のShopify経路とは別パスであり、原因はこの表示変更では調査していない。全サービスERROR0とは記載しない。

## 保持/ロールバック

保護runtimeは `agaruke-members/.runtime/shopify-linked-ui-20261028/`。取得テーマやカート/認証状態をGitへ含めない。復元時はtheme-beforeの対象既存ファイルを使い、今回追加したlayout includeを外す。追加asset/snippetは参照を外せば動作しない。API/backendを戻す場合は、今回以外の後続配信SHAがあるかを確認し、別作業の本番変更を巻き戻さない。表示用propertiesは付与の根拠ではないため、復元時にもポイント台帳の補正は不要。

最終照合時、別作業がAPIを `members-api-coupon-a46b18d` / SHA `a46b18d54431aeb11fa3e1cd7750c52711af41c7` / image `sha256:18008c416c04dd6f22048419b97c2f511f734fc5c6ce6602076edcb7ec375a18` へ100%切替済みだった。a46b18dは今回の6c7fde8/f7df96bを包含し、Shopify adapter部分の差分はないことを照合。こちらからその後続配信やtrafficを巻き戻していない。backendは00006-maf/6c7fde8で100%。今回のShopify API/proxy経路のERROR件数は最終照会時0。

最終のJS補強 `87c4eb6` は、新しいタブでサーバー確認済みのカートtokenをsessionStorageへ引き継ぐもの。追加のNode回帰検査を通し、asset1件だけをclean remote masterから再反映してreadback一致を確認。実ブラウザでもカート→クーポン確認ページへLINE再認証なしで進み、「Shopifyアカウントと連携済み」の表示を確認してカートへ戻した。通常のNode既存7件と表示/補足欄/新タブの3件を検査済み。後続で取り込んだed4eb60はcoupontextだけの変更で、当該packageのunit testも成功。
