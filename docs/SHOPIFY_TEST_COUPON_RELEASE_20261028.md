# 表示ちらつき修正・限定テスト券


## 判定前の表示・限定テストクーポン（2026-10-28）

ヘッダー描画前（head）へ初期化を移し、未判定の連携案内をCSSで非表示にする。確認済みcacheは同期反映し、連携済み利用者に未連携カードを表示しない。判定中のカードは領域を維持して非表示。通信失敗時は案内を誤表示せずカードに再読込案内を出す。

指定されたテスト会員へ、商品小計3,000円以上で500円引き・顧客限定・1回限り・7日間のShopify券を無償付与する。UIDとコードはGit外保護runtimeだけに保持。既存正逆リンクとactive会員を照合し、Shopify discountと会員/全体の券台帳2件を登録するoperator tool（dry-run/明示apply/作成条件/復旧plan）を追加。試験modeは維持し、認証済みAPIから返る固定test券ID/金額/条件/available一致の券だけを利用UIに出す。通常券交換・購入ptの停止は維持。Members APIの変更なし。

Node13件、型/build、Admin mutation schema、theme3ファイルのLiquid検査が成功。layoutの既存scheme_classes警告のみ。指定会員の正逆リンクを確認し無償券の付与/readback済み。配信と実画面確認は進行中。
