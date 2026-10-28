# 表示ちらつき修正・限定テスト券


## 判定前の表示・限定テストクーポン（2026-10-28）

ヘッダー描画前（head）へ初期化を移し、未判定の連携案内をCSSで非表示にする。確認済みcacheは同期反映し、連携済み利用者に未連携カードを表示しない。判定中のカードは領域を維持して非表示。

指定されたテスト会員へ、商品小計3,000円以上で500円引き・顧客限定・1回限り・7日間のShopify券を無償付与する。UIDとコードはGit外保護runtimeだけに保持。既存正逆リンクとactive会員を照合し、Shopify discountと会員/全体の券台帳2件を登録するoperator tool（dry-run/明示apply/作成条件/復旧plan）を追加。試験modeは維持し、認証済みAPIから返る固定test券ID/金額/条件/available一致の券だけを利用UIに出す。通常券交換・購入ptの停止は維持。Members APIの変更なし。

Node13件、型/build、Admin mutation schema、theme3ファイルのLiquid検査が成功。layoutの既存scheme_classes警告のみ。指定会員の正逆リンクを確認し無償券の付与/readback済み。本番反映・実画面検証を完了。

## 本番配信と実検証

配信元clean remote master `d11f9898180af08987a36669fe135230c4229e56`、Cloud Build `39c22960-3a5b-480c-962c-c0a39cbfb6b2` SUCCESS、image `sha256:0b916f2db3a16215cdf99038de5ce8ba7e55fc87470d7767660dbdbfdb5141d0`。backend `shopify-members-00010-wit` 100%、Git label一致。候補root200/未署名proxy400/未認証purchase-order401。CPU0.08/256Miなど既存構成と試験mode=trueを維持。Members APIとアプリ版は変更しない。revisionは起動成功後の経路準備に時間を要したが、既存版を保持してsmoke後に切替。新revision ERRORログ0件（検査時点）。

Rise188803907757へlayout/asset/snippetの3ファイルだけをpush。直前取得との差分なしと配信後readback完全一致。同期初期化がhead内に一度だけあることを検査。実カートの初期表示でヘッダー案内非表示、Home遷移直後もstate=linked/案内非表示を確認した。

Admin readbackでACTIVE、usageLimit1、対象が正しい顧客1名、最低小計JPY3,000、注文全体JPY500引き（商品毎ではない）を確認。指定会員のクーポンページ→テスト券適用→カートを実操作。小計2,400円では値引き0、小計3,600円で500円引き/3,100円を確認した。検証に伴う数量変更は元の2点各1へ復元。クーポンは未消費で、決済・注文確定・ポイント交換は行っていない。11月4日17:12 JSTまで有効、通知送信なし。

UID/券コード/復旧plan/発行結果/独立検証結果/theme snapshot・SHA256 manifest/画面画像はGit外保護runtime `shopify-test-coupon-20261028/` に保存。カート上では券コードが表示される場合があるため、公開用の証跡画像はコードの映らない購入特典部分までとする。


## テスト券の名称・自動適用（2026-10-28）

カートのAMTEST個別コードを「テストクーポン：500円引き」へ置換するLiquid snippetを追加。対象prefix/長さだけを変換し、他の割引名は維持。checkoutの標準コードと既存discount/台帳は変更しない。

試験券の適用ボタンをカートと会員ページから撤去し、カートの本人確認済み応答だけに自動設定用の券コードを返す。Ajax cart/update.js discountで設定し、最低金額/顧客/有効期限/回数はShopifyで判定する。別のコード/自動割引がある場合は上書きせず、登録済みコードは再送しない。コードは表示cacheに保持しない。通常ページでは従来どおり追加照会なし。Node14件/型/buildを確認、配信・実画面確認は進行中。
