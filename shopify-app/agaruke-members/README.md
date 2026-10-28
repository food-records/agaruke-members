# AGARUKE Members Shopifyアプリ

LINE認証を先に行い、Shopifyログイン時は継続連携、ゲスト購入時は一注文だけの連携を行う。会員番号・確認コード入力は不要。2026-10-28に本番反映し、本人連携の試験モードで稼働。本人のLINE認証とログイン分岐の連携保存を確認済み。ゲスト・注文の実機試験は未完了。[配信記録](../../docs/SHOPIFY_LINE_FIRST_RELEASE_20261028.md)。

対象は`stxmu0-ef.myshopify.com`／`https://shop.agaruke.com`。現行仕様は[SHOPIFY_DIRECT_ENTRY.md](../../docs/SHOPIFY_DIRECT_ENTRY.md)、envは`runtime.env.example`を参照する。

- `/apps/members` → `/proxy/members`: 公式app proxy認証、購入前のLINE認証入口とクーポンUI。
- `members-order-link`: サンキューページの署名付きCustomerと、署名済みorders/createの注文情報を照合してチェックアウト内のログインを連携する。ゲストのsubなしでは継続連携しない。
- `members-shopify-link`: 既存アカウント専用ページの連携状態とショップへの案内。旧手動コードUIを撤去した。
- `members-storefront`とtheme-entry: トップ・商品・カートの購入前入口。
- `webhooks/orders/purchase`: raw bodyの署名を保持してcreate/paidをMembers APIへ渡す。paid/返金/交換は`SHOPIFY_LINK_TEST_ONLY=true`の間は停止する。
- guest対応の券は総利用1回のコード所持者向け。Customer限定ではないため、コード/適用URLの共有を避ける案内を出す。
- OAuth sessionはAES-256-GCM暗号化し、Members API/既存Firestoreへ永続化。Cloud SQL、定期Job、スキャンは追加しない。

## ローカル検証

Node 22.12以上。

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npx tsc -p extensions/members-shopify-link/tsconfig.json
npx tsc -p extensions/members-order-link/tsconfig.json
npm run build
shopify app config validate --json
shopify app build
```

`shopify app dev`は開発ストアへの設定変更・tunnel公開を伴う。対象・コマンド・送信情報を提示して承認後に実行する。本番アプリ導入、権限追加、deploy、webhook登録、割引・注文の実操作も個別承認後に行う。ローカルのbuild成功はストアへの公開・結合試験成功を意味しない。
