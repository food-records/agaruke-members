# Dawn移行・トップ透明ヘッダー（2026-10-30）

ユーザー依頼で既存RiseからDawnへ切替。公式Shopify/dawn v16.0.0、commit `bc39a7d2024f1e5c14c42f855bd3552b4913e204`を固定。旧themeのコードをDawnへ上書きせず、設定/JSONテンプレート/section groupだけを引き継ぎ、Members管理patchを適用する。上流commit照合・非対応設定/section検出・先頭画像バナー確認を備えたローカル移行toolを追加。

現行の画像バナー/ロゴ/メニュー/色/font/商品/フッターと、LINE連携入口・署名付きproxy・連携済み案内非表示・5分cache/ちらつき対策・購入特典・テスト券自動適用/名称・checkout注記撤去を維持する。バックエンド/アプリ/顧客/注文/ポイント/クーポン台帳と試験modeは変更しない。

トップで実画像バナーが先頭にある時だけheaderをabsoluteで重ね、背景と罫線を透明化。スクロール復帰時のsticky headerやメニュー展開中は背景を戻す。その他のページはDawn標準headerを維持。

実ストアsnapshot/生成theme/上流checkout/画面証跡はGit外 `.runtime/shopify-dawn-20261030/`。既存Rise188803907757は切替後も保持してrollback可能にする。追加有料theme/Cloud Runリソース/定期jobなし。

事前検査: Node14件成功。Liquid14ファイル検査成功、theme check全体error0/warning9（上流の変数名/未使用/複雑度等）。Members管理asset/snippetの一致、トップ/フッター設定の一致、head内の状態初期化を照合。未公開preview・本番切替と実機確認は進行中。
