# agaruke-members

Organization顧客台帳への会員状態投影は`LINE_PROVIDER_ID=food-records-line`を設定した場合だけ有効です。`POST /members/register`成功時に会員フラグを更新し、退会申請時に解除します。顧客台帳の失敗で会員登録・ポイント処理は取り消しません。

FOOD RECORDS メンバーズ ポイントシステム

## 2026年アンケート回答特典（配信前）

回答者向け500ptは、共通LIFF URL `https://liff.line.me/2000938587-06YmdyJ5/?survey_reward=agaruke-2026-survey-500` から受け取る設計。LIFF認証後、未登録者と同意履歴のない既存会員は規約同意を経て登録する。APIは検証済みLINE UIDを、organization配下の`point_campaigns/agaruke-2026-survey-500/eligible/{uid}`と照合する。本人だけが受け取れ、会員残高・ポイント履歴・受取時刻をFirestore Transactionで一度に更新する。特典は累積ランク対象外。共通リンクにUIDやシリアルを含めない。

運用データはGitへ入れない。`members-api/cmd/survey-reward-provision`は照合シートのTSVを検査し、実回答者25件とテスト用1件を区別する。`--include-test`を付けた場合だけテスト用UIDを別扱いの対象文書として追加する。`--apply`なしでは読取検査のみ。`--apply`でキャンペーンと対象文書を作成し、`--activate`を付けた場合だけ受取を有効にする。有効期限は`--expires`で明示する。既存キャンペーンへの再投入は失敗し、受取済み記録を上書きしない。

2026-10-25にAPIとサイトを本番配信し、テスト用UIDの対象文書1件だけを有効化した。実回答者25件の受取対象登録・一斉配信は未実施。指定テストUIDへのリンク1通はLINE APIで受理されたが、実端末表示と受取操作は未確認。詳細は[配信記録](docs/SURVEY_REWARD_RELEASE_20261025.md)を参照する。

## システム概要

LINEミニアプリ（LIFF）を使ったQRコード型ポイント付与システム。
スタッフがスプレッドシートからQRコードを発行し、ユーザーがLINEアプリでスキャンするとポイントが付与される。

## アーキテクチャ

```
[Google Spreadsheet + GAS]
  └─ シリアルナンバー生成・QRコード出力
  └─ Firestore serials コレクションへ書き込み

[ユーザー（LINEアプリ）]
  └─ LIFF URL を開く
  └─ QRコードをスキャン
  └─ ポイント付与結果を表示

[members-site（GitHub Pages）]
  https://members.agaruke.com
  └─ LIFF SDK で LINE 認証
  └─ members-api へリクエスト

[members-api（Cloud Run）]
  https://members-api-438247672947.us-central1.run.app
  └─ LINE API でトークン検証・プロフィール取得
  └─ Firestore でシリアル照合・ポイント更新
```

## ポイント付与フロー

```

1. スタッフ: スプレッドシートに count・point を入力
            → GAS「シリアル管理 > シリアルナンバー生成」を実行
            → Firestore serials/{code} に {point, used: false} で保存
            → 「生成結果」シートにシリアルナンバーと QR コード画像が出力される

2. ユーザー: LINE アプリから LIFF URL を開く
            → LINE ログイン（未ログインの場合）

3. ユーザー: 「QRコードを読み取る」ボタンをタップ
            → liff.scanCodeV2() でカメラ起動・QR スキャン

4. members-site: POST /qrcode { code: "FRXXXXXXXX" } を送信

5. members-api:
   a. Firestore serials/{code} を取得
   b. used: true なら 400 エラー
   c. LINE アクセストークンで /v2/profile を呼び出しユーザー特定
   d. members/{userId} のポイントを加算（未登録なら新規作成）
   e. serials/{code} を used: true にマーク（バッチ書き込み）
   f. 付与後ポイントを返却

6. ユーザー: 画面に「XXX point get!」と現在ポイントが表示される
```

## セルフレジ連携

- kioskが2分有効の`kiosk_token`を含むLIFF URL形式の連携QRを表示し、LIFF内スキャンまたはスマートフォン標準カメラからポイントカードを起動してLINE会員を紐づける。
- kiosk APIはサービス間認証で連携状態を確認し、会員と利用可能クーポンを解決する。QRに会員情報や認証情報は含めない。
- クーポンは会計セッションへ10分予約し、注文確定時に使用済みへ変更する。キャンセル時は利用可能へ戻す。
- 注文確定時に`point`と`total_earned_point`へ100ポイントを冪等加算する。ポイント交換によるクーポン発行は従来どおり利用できる。
- members APIには秘密値`MEMBERS_SERVICE_KEY`を設定し、kiosk APIと同じ値を使用する。

## Firestore コレクション構造

ローカル開発では契約主体である`organization_uuid`をデータ境界とし、
`organizations/{organization_uuid}`配下へ会員カードデータを保存する。
現在の開発対象organizationは`35095fe0-1efc-40ff-bd13-9720c6d09e0f`。
本番は明示的な移行まで従来パスを維持し、`MEMBERS_DATA_LAYOUT=organization`を設定した環境だけ新パスを使用する。

本番Firestoreの棚卸し、再実行可能コピー、検証、切替、ロールバック手順は[`docs/FIRESTORE_MIGRATION.md`](docs/FIRESTORE_MIGRATION.md)を参照する。

| コレクション | ドキュメントID | フィールド |
|---|---|---|
| `serials` | シリアルコード（例: `FRABCD1234`） | `point: int`, `used: bool`, `used_id: string` |
| `members` | LINE UserID | `number: int64`, `name: string`, `point: int` |
| `member_numbers` | 6桁のメンバー番号（例: `000042`） | `user_id: string` |

上表の各コレクションはorganizationレイアウトでは
`organizations/{organization_uuid}/{collection}`として読み替える。

## リポジトリ構成

```
agaruke-members/
├── gas/              Google Apps Script（シリアル生成・QRコード出力）
├── members-site/     LIFF フロントエンド（GitHub Pages）
├── members-api/      Go API サーバー（Cloud Run）
└── square-session/   Square管理画面セッションの補助サービス
```

各ディレクトリの詳細は配下の README を参照。

## GitHub Pages

`master`へ`members-site/**`の変更をpushすると、GitHub Actionsが`members-site/`だけをPagesへ公開する。APIコード、環境変数、認証情報は公開成果物へ含めない。カスタムドメインは`members-site/CNAME`で管理する。

## Shopify直接来店連携（2026-10-28）

[現行仕様](docs/SHOPIFY_DIRECT_ENTRY.md)。LINE認証を共通の入口とし、Shopifyログインを確認できた場合は継続連携、ゲスト購入は今回の注文だけの連携にする。会員番号・手動確認コードの入力を廃止。ゲスト対応EC専用クーポン、一注文100pt、返金取消のコードと回帰検証を追加した。[配信状態・実機試験](docs/SHOPIFY_LINE_FIRST_RELEASE_20261028.md)。LINEからショップを直接開く入口は次段階。

連携済みのお客様向けのヘッダー/カート/チェックアウト表示は[表示仕様・配信記録](docs/SHOPIFY_LINKED_UI_RELEASE_20261028.md)を参照。Basicプランの標準商品補足欄で注文全体の予定ptを案内する。
## 200円無料クーポンの文言（2026-10-27）

会員クーポンAPIとKiosk連携APIが表示用`title`・`description`を返す。上限200円の「商品」クーポンではアイスコーヒー・冷やし掛川茶を価格上限の例外として案内する。割引判定の正本はorderec APIにあり、文言はMembers APIで管理する。旧Kiosk実機の固定サブタイトルは端末更新まで残るため、旧版にも見える`title`で例外を案内する。2026-10-28に文言のオプション対象を補足した`ed4eb60`をrevision `members-api-coupon-ed4eb60`へ100%配信した。
