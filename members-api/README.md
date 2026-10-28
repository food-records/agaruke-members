# members-api

## アンケート回答特典（テスト用1件のみ有効）

`POST /members/survey-reward/claim`はLINEアクセストークンでUIDを検証し、`organizations/{organization_uuid}/point_campaigns/agaruke-2026-survey-500/eligible/{uid}`を照合する。キャンペーンが有効期間内で、会員登録と規約同意が済んでいる場合に限り、500ptを会員残高へ一回だけ加算する。ポイント履歴IDはキャンペーンIDで固定し、対象文書の`claimed_at`と同一Transactionで更新する。再送は`already_claimed`を返し、追加加算しない。特典は`total_earned_point`へ加算しない。

対象者登録は`go run ./cmd/survey-reward-provision --file=<非Git管理TSV> --project=<Firestore project> --expires=<RFC3339>`で25件・テスト1件・UID重複を検査する。`--apply`で文書を作成し、`--activate`を併用すると受取可能になる。テストアカウントで本番導線を確認する場合だけ`--include-test`を付け、その対象文書に`test_account=true`を記録する。入力TSVは`UID`列と`区分`列を持つ照合シートの書き出しを使う。現在はテスト用1件のみを本番で有効化し、実回答者25件は未登録。受取期限は2026-11-24 23:59 JST。詳細はrepositoryの配信記録を参照する。

FOOD RECORDS メンバーズの Go API サーバー。Cloud Run で稼働する。

- 本番 URL: https://members-api-438247672947.us-central1.run.app
- ランタイム: Go 1.21
- データストア: Firestore

## API エンドポイント

Kiosk購入ポイントはクーポン値引前500円以上を対象に100ポイントを付与する。会員ごとの`daily_purchase_YYYY-MM-DD`履歴を日本時間で作成し、モバイルオーダーと横断して購入日1日1回に制限する。クーポン確定とポイント判定は同一Firestore Transactionで行う。

### GET /members

LINE アクセストークンでユーザーを特定し、ポイント残高とメンバー番号を返す。
メンバー未登録の場合は`MEMBER_REGISTRATION_REQUIRED`を返し、規約同意後の`POST /members/register`でのみ新規作成する。

**リクエスト**
```
Authorization: Bearer <LINE アクセストークン>
```

**レスポンス**
```json
{
  "data": {
    "number": "FR000042",
    "point": 300
  }
}
```

### POST /qrcode

シリアルナンバーを照合し、ポイントを付与する。

**リクエスト**
```
Authorization: Bearer <LINE アクセストークン>

{ "code": "FRABCD1234" }
```

**レスポンス**
```json
{
  "data": {
    "number": "FR000042",
    "get_point": 100,
    "point": 400
  }
}
```

**エラー**
| ステータス | メッセージ | 原因 |
|---|---|---|
| 400 | `シリアルナンバーが見つかりません` | 存在しないコード |
| 400 | `このシリアルナンバーは既に使われています` | 使用済みコード |
| 403 | `invalid token` | 無効な LINE トークン |

### DELETE /members

LINE認証済み会員を即時退会状態にする。本文に`{"confirmation":"DELETE"}`が必要。会員・ポイント・クーポンは復旧用として内部で30日間保持する。通常の`GET /members`は退会状態を解除せず`ACCOUNT_DELETED`を返し、利用者が明示的に`POST /members/restore`を実行した場合だけ元の会員番号とデータを復旧する。期限到来後の完全削除は、本番導入時に定期ジョブとして有効化する。

### POST /members/register

モバイルオーダーまたはmembers siteの規約画面で明示同意した場合だけ会員を作成する。規約・プライバシーポリシーの現行バージョンと`consent_source`（`mobile_order_liff`または`members_site_liff`）を要求し、会員ドキュメントへバージョン、同意日時、同意元を保存する。退会から30日以内の同じLINE会員は、この操作で既存データを復旧する。通常の`GET /members`は未登録会員を自動作成せず`MEMBER_REGISTRATION_REQUIRED`を返す。

## ローカル開発

### 必要なもの

- Go 1.21+
- Docker

### 起動

orderecのFirebase Emulatorを使う場合：

```bash
make emulator-dev
```

従来のFirebaseプロジェクトへ接続するDocker環境を使う場合：

```bash
# 環境変数ファイルをコピー
cp etc/docker/.env.example etc/docker/.env
# etc/docker/.env の PROJECT_ID を実際の Firebase プロジェクト ID に書き換える

# Firebase 認証用のサービスアカウントキーを配置
cp <サービスアカウントJSON> key.json

# 起動
make ud
```

`.env` の設定項目:

| キー | 説明 |
|---|---|
| `ENV` | `local` を指定すると `key.json` を使って Firebase に接続する |
| `PROJECT_ID` | Firebase プロジェクト ID |
| `MEMBERS_SERVICE_KEY` | kiosk APIとの内部通信に共有する十分に長いランダム秘密値。FirebaseやLINEの既存キーではなく、新規生成する |
| `ORGANIZATION_UUID` | 会員データの契約主体。ローカル既定値は`35095fe0-1efc-40ff-bd13-9720c6d09e0f` |
| `MEMBERS_DATA_LAYOUT` | `organization`で`organizations/{organization_uuid}`配下を使用。未設定時は本番互換の従来パス |
| `LINE_LOGIN_CHANNEL_ID` | organizationに対応するLINE Login Channel ID。アクセストークン検証結果の`client_id`と照合する |
| `LINE_LOGIN_CHANNEL_IDS` | 許可するLINE Login Channel IDをカンマ区切りで指定する。members siteとモバイルオーダーでChannelが異なる場合に使用し、設定時は単数形より優先する |

Firestore Emulatorの従来パスをorganization配下へコピーする場合は次を実行する。旧データは削除しない。このコマンドは`FIRESTORE_EMULATOR_HOST`未設定時には停止する。

```bash
ENV=local PROJECT_ID=demo-orderec \
FIRESTORE_EMULATOR_HOST=127.0.0.1:8085 \
ORGANIZATION_UUID=35095fe0-1efc-40ff-bd13-9720c6d09e0f \
go run ./cmd/migrate-organization
```

本番では会員カードがFirebase／Firestoreプロジェクト`fr-agaruke`、orderec・モバイルオーダーが`food-records-prod`に分かれている。現在の移行コマンドはEmulator専用であり、本番統合には使用しない。本番実装時は件数・ポイント・クーポン・会員番号の整合確認、差分同期、切替、ロールバックを備えた専用マイグレーションを別途実装する。

## セルフレジ連携API

- `POST /kiosk/checkouts/link`: LIFFがLINEアクセストークン付きでKiosk表示QRのトークンを会員へ紐づける。
- `POST /kiosk/members/resolve-line`: orderec内部APIがLINEアクセストークンを検証し、organization内の会員情報を解決する。
- `POST /kiosk/checkout-tokens`: kiosk APIが2分有効の連携トークンを発行する。
- `POST /kiosk/checkouts/resolve`: kiosk APIが連携完了を確認し、会員・利用可能クーポンを取得する。
- クーポン予約・取消・注文確定APIを含む内部APIは`X-Members-Service-Key`で認証する。

## Shopify直接来店・購入ポイント連携

[現行仕様](../docs/SHOPIFY_DIRECT_ENTRY.md)を正本とする。LINE認証先行のログイン/ゲスト2パターンを本番反映した。本人LINE認証後のログイン分岐の連携保存を確認済み。ゲスト・注文は未確認で、アプリの交換/paid/返金処理は連携試験モードで停止中。[配信記録](../docs/SHOPIFY_LINE_FIRST_RELEASE_20261028.md)。

- 公開 `POST /shopify/purchase/authorize` はLINE本人と同意を検証して一回限りコードを返す。service key専用 `POST /shopify/purchase/action` で開始ブラウザのverifierと照合し、カート限定24時間セッションを作る。
- Shopify署名で確認済みCustomerだけを継続連携する。`orders/create`のHMACで注文照合情報を保存し、購入セッションを一注文へ固定する。注文Customerだけでは本人認証とみなさない。
- `orders/paid` は署名・shop・topic・JPY・支払済み・正額を検証し、一注文100ptを冪等付与する。ゲスト対応券の利用事実を先に冪等消込し、ポイント/注文台帳の更新をTransactionで行う。
- 取消/全額返金はservice key専用 `/shopify/orders/reverse` へ、アプリが現在注文を再照合して依頼する。`/shopify/app-sessions` はAES-GCM暗号文だけを保存する。
- `SHOPIFY_MEMBERS_ENABLED=true`、`SHOPIFY_LINE_FIRST_ENABLED=true`、`SHOPIFY_SHOP_DOMAIN`、`SHOPIFY_WEBHOOK_SECRET`、`SHOPIFY_LINK_LIFF_URL`、`MEMBERS_SERVICE_KEY`を使用する。秘密値はSecret Managerで管理する。旧手動コードAPIは互換性のため保持するが、現行UIからは使用しない。

### ローカル API を外部公開（LIFF からのアクセス用）

LIFF はブラウザから動作するため、`localhost` には直接アクセスできない。ngrok 等で公開する。

```bash
ngrok http 8080
```

発行された URL を `members-site/config.js` の `apiUrl` に設定する。

## デプロイ（Cloud Run）

```bash
# イメージをビルドして push
docker build -f etc/docker/api/Dockerfile.prod -t gcr.io/fr-agaruke/members-api .
docker push gcr.io/fr-agaruke/members-api

# Cloud Run にデプロイ
gcloud run deploy members-api \
  --platform managed \
  --image gcr.io/fr-agaruke/members-api \
  --region us-central1 \
  --allow-unauthenticated
```

## パッケージ構成

```
members-api/
├── cmd/api/
│   ├── main.go                   エントリポイント・ルーター定義
│   └── adapter/
│       ├── healthcheck/          GET /
│       ├── member/               GET /members
│       └── qrcode/               POST /qrcode
└── pkg/
    ├── auth/                     JWT ミドルウェア（現在未使用）
    ├── config/                   Firebase / Firestore 初期化
    ├── interpreter/              リクエストボディのデコード
    ├── logger/                   zap ロガー
    ├── presenter/                JSON レスポンス生成
    └── server/                   HTTP サーバー・グレースフルシャットダウン
```

## Kiosk QR連携通知（2026-10-13、本番反映済み）

LINEからQRをリンクするTransactionで、会員token更新と同時にroot `kiosk_member_link_signals/{sha256(token)}`へlinked=trueをmergeする。信号のauth_uidとexpires_atはorderec Kiosk APIのQR発行時に設定され、会員ID/番号/ポイント/クーポンを含めない。Kioskは本人限定信号を直接観測し、連携後のresolve/consumeは従来APIで行う。旧クライアントは従来どおりresolve APIを利用可能。

2026-10-13の明示承認でfr-agarukeのmembers-api-00048-hedへsource60da04c、image digest b88c31860b06…を100%配信した。Firestoreは従来どおりfood-records-prodを利用する。Firestore Emulatorを設定して`go test ./...`を実行すると、abort時に通知されないこと、所有者情報を保持して会員識別子を漏らさないことを検証する。

最終監査で初回ビルドの作業用runtime由来dirtyメタデータを検出したため、コード差分なしのclean remote6d48ef7から再ビルド。members-api-00050-bud、digest sha256:c77e7c08900d3afc5a0349ca0ed79e0347f1b46ed53e3c6ca71dc05f3c1def2a、Git label6d48ef7、vcs.modified=false、traffic100%へ差替済み。

Shopifyの`purchase/action`内 `storefront_status` は、署名済みapp proxyのCustomerまたはカート限定tokenで状態を確認し、継続連携済みCustomerの新カートだけ購入セッションを再開できる。ヘッダー読取では新セッションを作らない。[連携済み表示仕様](../docs/SHOPIFY_LINKED_UI_RELEASE_20261028.md)。
