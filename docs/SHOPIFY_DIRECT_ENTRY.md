# Shopify直接来店・LINEポイントカード連携

確認日: 2026-10-28。API・Shopify backend・アプリと専用ページを本番反映済み。本人連携の結合試験専用モードで、実ユーザーによる試験待ち。現在状態と実際のSHA/URLは[配信記録](SHOPIFY_LINK_RELEASE_20261028.md)を優先する。

## 対象・現況

- ストア: `stxmu0-ef.myshopify.com`（ユーザー指定）。公開先は `https://shop.agaruke.com`。管理画面でmyshopify.comからのリダイレクトを読取確認。
- お客様アカウント有効・ログインリンク表示ON。管理画面のアカウントURLは `https://shopify.com/83950534829/account`。
- 第1段階はShopifyへの直接来店。LINEからショップを開く購入トークン方式は第2段階。ここでのLIFF利用は本人連携だけ。
- アプリ導入・Secret・API接続先・専用ページを設定済み。トップ上部・商品購入直前・カート会計前の入口を本番配置済み。購入/返金webhookと交換は結合試験後に有効化する。

## お客様の導線

1. 商品ページ／カートの「連携状態を確認・クーポンを使う」を押す。
2. Shopifyのお客様アカウントへログイン。専用ポイントカードページで連携状態を判定。
3. 未連携なら「LINEとの連携を始める」。LINEへ移動するかPCのQRをスマートフォンで読む。
4. LINEで会員登録・規約同意を済ませ、本人が開始した連携であることに同意。8文字の確認コードを受け取る。
5. 元のShopify画面へ戻り、会員番号を確認し、LINEだけに表示された確認コードを入力して連携確定。
6. 残高・EC専用交換券を表示。交換確認後、個別のShopifyコードを発行。「クーポンを適用してカートへ戻る」で元のカートへ戻る。
7. Shopifyで配送先・決済情報を入力して注文。支払い完了後の署名済み通知で100ptを一度だけ付与し、使用券を確定。

LINEから戻ったことだけでは連携を確定しない。期限10分・一回限り・確認コード誤入力5回でロック。Shopify側には本人確認済みCustomer ID、LINE側には検証済みUIDを使用。メールアドレスの推測照合、LINE UIDのShopifyへの送信、ブラウザからのCustomer ID指定は禁止。確認コードをShopify側のポーリングで取得できないため、第三者へ連携URLを送ってそのカードを奪う攻撃も防ぐ。

## 初期実装の交換条件（本番有効化前に運用確認）

10/2の既存提案を実装の初期値とした。新しいキャンペーンを承認済み・公開済みとは扱わない。

| 消費ポイント | 税送料を除く商品小計の最低額 | 値引き |
| ---: | ---: | ---: |
| 200pt | 4,000円 | 200円 |
| 500pt | 7,000円 | 500円 |
| 1,000pt | 12,000円 | 1,000円 |

- 交換時にポイントを減算。有効期限3か月。JPY専用。
- 券ごとのランダムコード、対象Customer限定、総利用1回。他の金額・商品・送料割引と併用不可。
- 店頭/Mobile券と同じ残高を使うが、**発行済みの店頭券をECでも使う機能は含まない**。EC専用券は別コレクションに隔離し、店頭APIから列挙・利用できない。
- 交換要求IDを会員・Customer・shopで固定。同じIDの再送は同じ券を返す。Admin APIの応答が失われても、同じコードを照合して発行再開する。新規に減算しない。
- `pending`中はコードを顧客へ適用表示しない。長期失敗は管理者が同じコードの有無を調査する。結果不明のままポイントを払い戻さない。

## 注文・返金

- 基礎100pt: 連携済みCustomer、JPY、支払済み、支払総額が正の注文。1注文1回、日次上限なし。test注文は通常対象外。テスト環境でだけ`SHOPIFY_ALLOW_TEST_ORDERS=true`を使用。
- shop単位の注文台帳・会員ポイント履歴・EC券の利用済み化を同じTransactionで更新する。通知再送・並行処理・将来の連携変更でも同じ注文は再付与しない。
- `orders/cancelled`／`refunds/create`はアプリ側でHMAC確認後、Admin APIから現在の注文を再取得する。
- 初期実装は取消／全額返金で基礎100ptを一度だけ取消。一部返金は1注文分の100ptを維持。既にポイントを消費した場合は残高が負になることがある。累積ランク値は減らさない。
- 取消通知が先に来ても終端台帳を作り、遅延したpaid通知で再加算しない。交換券はvoidとして保持し、自動再発行・交換ポイント自動返却はしない。これらの運用条件は本番開始前に確認する。
- 未連携注文への後日付与・LINEからの購入トークン・定期照合jobは今回対象外。障害時は署名付きwebhook再配信で同じ注文を再処理できる。自動ポーリング・定期jobは追加していない。

## 実装境界

- `shopify-app/agaruke-members/extensions/members-storefront`: 商品／カートへ追加するテーマアプリblock。ログイン・連携済みと推測せず、認証画面で状態確認する入口。
- `extensions/members-shopify-link`: `customer-account.page.render`の専用ページ。プロフィールblockの雛形を置換。
- `app/routes/api.members.tsx`: Shopify公式`authenticate.public.customerAccount`で署名・有効期限を検証し、audience・shop・Customer GIDも照合。ブラウザ指定のCustomer IDやUIDを転送しない。
- Go `/shopify/customer/action`: service keyで保護した状態取得・連携intent・連携確定・交換・割引紐付け。
- Go `/shopify/link-intents/propose`: LINEアクセストークンのchannel・期限・本人を検証して候補カードを設定。
- Go `/shopify/webhooks/orders/paid`: raw body HMAC／shop／topicを検証。決済画面への遷移だけでは付与・券消込しない。
- `MembersSessionStorage`: 公式SessionStorage契約を実装。OAuth sessionはAES-256-GCM暗号化後、Members API経由で既存Firestoreに永続化。Cloud RunローカルSQLiteへの依存を削除。暗号化キーはShopifyアプリ側だけに保持。
- `SHOPIFY_MEMBERS_ENABLED=true`を明示した環境だけ新機能を有効化。既存店頭・Mobile・Square webhookの契約は変更しない。

## 設定と配信前の手順

1. アプリの配信先HTTPS URL、実ストアと開発ストア、Secret Manager、最小権限service accountを確定する。アプリruntimeの環境変数例は`shopify-app/agaruke-members/runtime.env.example`。値入りenvはGit・image・ログへ入れない。
2. Go側に`SHOPIFY_MEMBERS_ENABLED`・`SHOPIFY_SHOP_DOMAIN`・`SHOPIFY_WEBHOOK_SECRET`（アプリsecret）・`SHOPIFY_LINK_LIFF_URL`・既存`MEMBERS_SERVICE_KEY`を設定。アプリとMembers APIのshop・service keyを一致させる。
3. Shopifyアプリ側は`read_orders,read_customers,read_discounts,write_discounts`、保護対象顧客データのCustomer ID利用を設定。アプリインストール／権限追加／deploy／webhook作成は明示承認の対象。
4. `shopify.app.toml`の`application_url`と`auth.redirect_urls`は本番backend URLと`/auth/callback`へ設定し、Shopifyの公開versionで一致を確認済み。今後の変更時も実runtime URLと照合する。
5. 専用アカウントページを有効化し、extension設定`backend_url`へアプリURLを設定。メニューとテーマblockの`page_id`には実際に発行されたページIDを入れる。handleやuidをページIDと推測しない。
6. 商品ページ／カートに案内blockを配置。「今すぐ購入」・カートdrawer等の迂回経路も実テーマで確認。チェックアウト途中のblock追加は今回行わない。
7. テストストアで本人連携・新規同意・再訪・他人への付替え拒否・端末を跨ぐ確認コード・クーポン発行/適用/Customer制限/期限/最低額/他割引/並行交換・決済失敗・paid再送・取消/一部/全額返金を結合確認。
8. 本番配信は現行base branchへ統合したclean commit・remote SHA一致・既配信SHA包含・回帰検査後。shopify app devもストアへの外部変更を伴うため、コマンドと対象を提示して承認後に行う。

常時稼働・min instances・Cloud SQL・AI API・定期スキャンは追加しない構成。初回ローカル実装後、2026-10-28にユーザーの本番反映・費用承認を得て専用backendを追加した。実際の配信・リソース・試算条件は配信記録を参照。

## ローカル検証

Node 22.12以上。Goテストは必ずローカルEmulatorを指定する。

```bash
cd members-api
FIRESTORE_EMULATOR_HOST=127.0.0.1:18889 go test -race ./... -count=1
go vet ./...
cd ../shopify-app/agaruke-members
npm ci --ignore-scripts
npm test
npm run typecheck
npx tsc -p extensions/members-shopify-link/tsconfig.json
npm run build
shopify app config validate --json
shopify app build
```

Shopify AI ToolkitによるGraphQL操作・割引input・Customer Account画面・Liquid blockのschema検証も実施。実ストアを変更する開発サーバーの起動や本番E2Eは、このローカル検証には含まれない。

## 本番連携試験の準備（2026-10-28・ユーザー承認）

ユーザーから顧客未公開のため本番反映し、本人連携の結合試験を先行する指示を受けた。Cloud Run専用backendの追加も、最小0/最大1、CPU 0.08/256MiB、通常増分月0〜200円・10倍利用/遅延/再試行時月約3,000円、1USD=150円仮定・税別、無料枠なしでも試算という条件で承認された。

初回は`SHOPIFY_LINK_TEST_ONLY=true`で交換操作をサーバー側で拒否し、専用ページの交換UIを隠す。`shopify.app.toml`では購入/返金webhookを登録しない。本人連携成功後に、それぞれの試験へ進む。Shopify app URL候補は`https://shopify-members-438247672947.us-central1.run.app`。実サービスURLとの一致を配信時に検証する。
