# AGARUKE Members Shopifyアプリ

Shopifyへの直接来店から、LINEポイントカードの本人連携、EC専用券のポイント交換・適用、支払済み注文100ptをつなぐアプリ。2026-10-28時点はローカル実装・検証済み、実ストアへの導入・本番配信は未実施。

対象: `stxmu0-ef.myshopify.com`、公開先 `https://shop.agaruke.com`。新しいお客様アカウントを利用する。

詳細な[現行仕様・設定・検証手順](../../docs/SHOPIFY_DIRECT_ENTRY.md)を正本とする。環境変数名は`runtime.env.example`。`shopify.app.toml`の配信先URLは未確定のため、仮URLのままdeployしない。

- Customer Accountの専用ページ: `extensions/members-shopify-link`。
- 商品／カートの入口block: `extensions/members-storefront`。
- Nodeバックエンド: Shopify公式認証ライブラリでsession tokenを検証し、aud・shop・Customerを照合する。認証済みCustomerだけをMembers APIへ転送する。
- 注文: paid通知で基礎100ptとEC券利用を原子的に確定。取消／全額返金通知は現在の注文をAdmin APIで再取得してから取消依頼する。
- OAuth session: AES-256-GCMで暗号化し、Members API経由でFirestoreへ永続化する。ローカルSQLite・Cloud SQLを使わない。`prisma/`は未使用のテンプレート履歴。
- `SHOPIFY_MEMBERS_ENABLED`は通常無効。service key、アプリsecret、session暗号化キーはバックエンドのSecret Managerへ保持する。

## ローカル検証

Node 22.12以上。

```bash
npm ci --ignore-scripts
npm test
npm run typecheck
npx tsc -p extensions/members-shopify-link/tsconfig.json
npm run build
shopify app config validate --json
shopify app build
```

`shopify app dev`は開発ストアへの設定変更・tunnel公開を伴う。対象・コマンド・送信情報を提示して承認後に実行する。本番アプリ導入、権限追加、deploy、webhook登録、割引・注文の実操作も個別承認後に行う。ローカルのbuild成功はストアへの公開・結合試験成功を意味しない。
