# 未ログイン時のアカウント入口（2026-10-31）

ユーザー依頼: ログインパネル下部のOrders/Profile/LINEポイントカードは未ログイン時に出さない。

Shopify標準shopify-accountは未ログイン時にもメニューを表示する仕様で、メニュー用の公開CSS part/slot/表示条件はない。Shadow DOMへの非公開依存を避け、未ログイン時はヘッダーアイコンからroutes.account_login_urlへ進む。ログイン済みは標準コンポーネントと既存customer-account-main-menuを維持。Liquid customerで判定し、LINE連携状態やバナーとは独立する。全ページ/日英/PC/スマホで同じ入口を使う。ログイン方式・アカウント側のメニュー・認可は変更しない。

変更はsections/header.liquidの既存アカウント部分を新規snippets/agaruke-account-entry.liquidのrenderへ置換するだけ。他のヘッダー/写真/配置変更を維持。未ログイン時はストア内パネルではなくShopifyログイン画面へ遷移する。

原典: https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component 、https://shopify.dev/docs/api/storefront-web-components/components/shopify-account 。

## 公開確認

実装a78fea06c53876a8b985e166c3870b8586b167a5をmaster/origin一致・clean・直前6807ab8包含で確認。Shopify Liquid検証2ファイル成功、直前headerの変更なしを確認してDawn 189917102253へ対象2ファイルだけ公開。ブラウザーの未ログイン状態でアイコンがlogin linkになり、Shopifyのログイン画面へ遷移し3メニューがないことを確認。メール/Shopログインの選択は維持。ログイン実行・個人情報入力・LINE送信なし。ログイン済み分岐は従来markup維持を確認、実ログイン後の操作試験は未実施。Cloud Run/app versionの変更なし。.work追加削除なし。Secretary orderec/Drive event公開未承認保留。
