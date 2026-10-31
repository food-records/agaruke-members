# 未ログイン時のアカウント入口（2026-10-31）

現在仕様: 後続のユーザー承認により、未ログイン時もマイページの軽いメニューを表示し、ログイン・新規登録とポイントカード・クーポンのみ案内する。ログイン済みは注文履歴/プロフィール/会員入口。PC/スマホの常設メニューにも会員入口を追加。以下は変更前の経緯。[最新仕様](SHOPIFY_DIRECT_ENTRY.md)を優先する。

ユーザー依頼: ログインパネル下部のOrders/Profile/LINEポイントカードは未ログイン時に出さない。

Shopify標準shopify-accountは未ログイン時にもメニューを表示する仕様で、メニュー用の公開CSS part/slot/表示条件はない。Shadow DOMへの非公開依存を避け、未ログイン時はヘッダーアイコンからroutes.account_login_urlへ進む。ログイン済みは標準コンポーネントと既存customer-account-main-menuを維持。Liquid customerで判定し、LINE連携状態やバナーとは独立する。全ページ/日英/PC/スマホで同じ入口を使う。ログイン方式・アカウント側のメニュー・認可は変更しない。

変更はsections/header.liquidの既存アカウント部分を新規snippets/agaruke-account-entry.liquidのrenderへ置換するだけ。他のヘッダー/写真/配置変更を維持。未ログイン時はストア内パネルではなくShopifyログイン画面へ遷移する。

原典: https://shopify.dev/docs/storefronts/themes/customer-engagement/account-component 、https://shopify.dev/docs/api/storefront-web-components/components/shopify-account 。

## 公開確認

実装a78fea06c53876a8b985e166c3870b8586b167a5をmaster/origin一致・clean・直前6807ab8包含で確認。Shopify Liquid検証2ファイル成功、直前headerの変更なしを確認してDawn 189917102253へ対象2ファイルだけ公開。ブラウザーの未ログイン状態でアイコンがlogin linkになり、Shopifyのログイン画面へ遷移し3メニューがないことを確認。メール/Shopログインの選択は維持。ログイン実行・個人情報入力・LINE送信なし。ログイン済み分岐は従来markup維持を確認、実ログイン後の操作試験は未実施。Cloud Run/app versionの変更なし。.work追加削除なし。Secretary orderec/Drive event公開未承認保留。


2026-10-31常設会員導線の公開結果: Members master 0a2dee9/f5d4fd5をorigin/masterへpushし、clean/remote一致と直前配信8b13f5e・既配信メニュー0a2dee9の包含をrelease_guardで確認。Dawn189917102253へ対象7ファイルを限定反映、直前既存原本6ファイル一致・新規snippet競合なし、最終公開readback7/7 byte一致。Liquid検査7ファイル成功（既存drawerのsection文脈警告のみ）、最終自作snippet2ファイル警告なし、JS/Python構文・パッチ冪等性・翻訳追加キー以外不変を確認。PC常設リンク/マイページ3項目、390pxスマホの常設ドロワーとマイページ、Escapeで閉じる、日英の会員入口と/apps/members・/en/apps/membersの実遷移をブラウザー確認。証跡は共有workspace Git外.runtime/shopify-member-navigation-20261031/{desktop-account,mobile-account,mobile-menu}.jpg。ブラウザーはShopifyログイン済みで、未ログイン実端末の確認は残す。匿名HTTP照合は端末証明書設定/サイト429により未取得。ログアウト・実LINE認証・解除・発券・ポイント消費・注文・決済・LINE配信は行わない。Cloud Runとapp拡張、割引設定、権限は変更なし。Secretary orderec/Driveイベント公開未承認保留。.work追加削除なし。
