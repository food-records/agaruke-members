# gas

交換特典の同期では`coupon_sync.gs`を使用する。2026-11-01以降の「おかずチケット」は`750_side_dish`、700pt、説明文「780円以下のおかず1点無料」。対象カテゴリ・780円上限はFirestoreの別フィールドで管理する。運用中のApps Scriptと交換特典シートの説明文を更新するまでは、旧スクリプトの同期を実行しない。修正済みスクリプトは同期対象の8フィールドだけを書き、価格上限とカテゴリ制限を保持する。

Google Apps Script によるシリアルナンバー生成・QRコード出力スクリプト。

## セットアップ

### 1. GAS プロジェクト作成

Google スプレッドシートを開き、「拡張機能 > Apps Script」から新規プロジェクトを作成し、`serial_generator.gs` の内容を貼り付ける。

### 2. スクリプトプロパティの設定

「プロジェクトの設定 > スクリプト プロパティ」に以下を追加する。

| キー | 値 |
|---|---|
| `FIREBASE_PROJECT_ID` | Firebase プロジェクト ID（例: `fr-agaruke`） |
| `SERVICE_ACCOUNT_JSON` | Firestore 書き込み権限を持つサービスアカウントの JSON キー（全文） |
| `ORGANIZATION_UUID` | organization配下で運用する場合に設定。本番は`35095fe0-1efc-40ff-bd13-9720c6d09e0f`。未設定なら従来のroot `serials`へ書き込む |
| `LIFF_ID` | 受取に使うLIFF ID |

## 使い方

### シリアルナンバー生成

1. スプレッドシートのアクティブシートに以下の形式で入力する（1行目はヘッダー）

   | A: count | B: point | C: type | D: accumulate | E: campaign_id | F: expires_at |
   |---|---|
   | 25 | 700 | once | FALSE | agaruke-2026-survey-500 | 2026-11-24T23:59:00+09:00 |

2. メニュー「シリアル管理 > シリアルナンバー生成」を実行

3. 「生成結果」シートに以下が出力される

   | A: シリアルナンバー | B: ポイント | C: タイプ | D: 累積対象 | E: 生成日時 | F: QRコード |
   |---|---|---|---|---|---|
   | FRABCD1234 | 700 | once | FALSE | 2026/11/01 | （画像） |

### 生成されるデータ

- シリアルナンバーは `FR` + 英数字8文字（例: `FRABCD1234`）
- Firestore の `serials` コレクションに`point`、`used:false`、任意の`campaign_id`・`expires_at`等を保存する。既存コードの上書きは拒否する
- QRコードには`?code=FR...`のLIFF URLをエンコードする
- `once`はLINE会員の登録・同意後に原子的に1回だけ引き換える。`campaign_id`が同じ場合は1会員1回まで

## 注意

- スプレッドシートの「生成結果」シートは自動作成される
- 1行の発行上限は400枚。多い場合は行を分ける
- QR画像の生成にはQuickChartを利用し、同サービスへ個別コードを含むURLが渡る
