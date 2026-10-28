# Checkout注記撤去・連携表示キャッシュ（2026-10-28）

## 現行方針

ユーザー指示でcheckoutの商品補足欄への予定pt表示を撤回する。購入特典の表示はカートで行う。以前追加した `獲得予定ポイント（注文全体）` の値だけを既存カートから空にし、商品・数量・価格・他のpropertiesを保持する。新規注記の生成処理を削除。backendは旧JS向けのstandard_pointsを0にして、以前から開いているタブも次の照会で注記を再追加しないようにする。expected_pointsと実際の付与ルールは変更しない。

## 表示用キャッシュ

sessionStorageへ5分間、連携有無・購入準備・予定pt・試験mode・EC券枚数だけを保持する。購入token/UID/会員番号/ポイント残高/券コードは表示キャッシュへ入れない。Customer ID・カートtoken・数量・金額・通貨・購入tokenをLiquid側でSHA256化したキーで、別アカウント/別カート/内容変更時にキャッシュを使い回さない。

- 通常ページ: 有効キャッシュを即時表示し、cart.jsとMembers状態の追加照会を省く。
- カート入場/カート内容変更: 表示はキャッシュから先に出し、サーバーで再確認・今回注文の購入セッション準備を行う。
- 期限切れ/キー不一致: 新たに照会する。定期ポーリングなし。
- 連携開始/確定/クーポン画面の状態更新: キャッシュを破棄する。専用ページは自分の認証済みAPIで状態取得し、グローバル表示用の重複照会を行わない。
- 既存注記が残る通常ページでは、自前注記の削除に必要なカート読取/更新だけを行う。

表示キャッシュは認証や付与可否の根拠ではない。クーポン交換/利用・注文ポイントは従来どおりサーバー検証し、SHOPIFY_LINK_TEST_ONLY=trueも維持する。既存リソースを維持し、追加サービス/プラン変更/スキャン/定期jobはない。

## 検証・配信

Node12件（通常ページの通信0件、カート強制照会、5分期限、別キー拒否、秘密値をcacheへ含めないこと、旧注記だけの削除と数量/他props保持、既存認証/券/暗号化）、typecheck/build、実themeのLiquid検査を実施。本番反映済み。実カートで旧注記の消去、連携済み購入特典への切替、商品2点各1・小計2,400円保持を確認。checkout遷移後にブラウザー接続がタイムアウトし、checkout画像・通常ページ遷移の実機通信確認は未完了。通常ページ通信0件は自動検査で確認済み。支払い・注文確定なし。

配信元はclean remote master `e42bff0efdcd92f59f18e1aa54838ffd36d88e42`。Cloud Build `b28bcbb9-9483-4831-afc9-1dc137e9ba3d` SUCCESS、image digest `sha256:72fdfb4ab3f24d4acf843a5570253f8c38ce5fb072791f6b855f14ea251c3bba`。backend `shopify-members-00008-gow` 100%。候補root200/未署名proxy400/未認証purchase-order401を確認。公開proxyでstandard_points=0、checkout_annotation_enabled=falseを照合。Rise188803907757へasset/snippetの2ファイルだけを配信し、直前差分なし・readback完全一致。CPU0.08/256Mi維持、Members APIとアプリ版は変更なし。保護snapshotはGit外 `.runtime/shopify-display-cache-20261028/`。
