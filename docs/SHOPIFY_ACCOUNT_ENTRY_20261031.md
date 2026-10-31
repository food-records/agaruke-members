# 未ログイン時のアカウント入口（2026-10-31）

ユーザー依頼: ログインパネル下部のOrders/Profile/LINEポイントカードは未ログイン時に出さない。

Shopify標準shopify-accountは未ログイン時にもメニューを表示する仕様で、メニュー用の公開CSS part/slot/表示条件はない。Shadow DOMへの非公開依存を避け、未ログイン時はヘッダーアイコンからroutes.account_login_urlへ進む。ログイン済みは標準コンポーネントと既存customer-account-main-menuを維持。Liquid customerで判定し、LINE連携状態やバナーとは独立する。全ページ/日英/PC/スマホで同じ入口を使う。ログイン方式・アカウント側のメニュー・認可は変更しない。

変更はsections/header.liquidの既存アカウント部分を新規snippets/agaruke-account-entry.liquidのrenderへ置換するだけ。他のヘッダー/写真/配置変更を維持。未ログイン時はストア内パネルではなくShopifyログイン画面へ遷移する。

原典: https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component 、https://shopify.dev/docs/api/storefront-web-components/components/shopify-account 。
