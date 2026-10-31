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

連携済みのお客様向けのヘッダー/カート/チェックアウト表示は[表示仕様・配信記録](docs/SHOPIFY_LINKED_UI_RELEASE_20261028.md)を参照。checkoutの予定pt表示はユーザー指示で撤回し、カートのみで案内する。通常ページの連携表示は5分保持して再照会を省く。[現行変更記録](docs/SHOPIFY_DISPLAY_CACHE_RELEASE_20261028.md)。
## 200円無料クーポンの文言（2026-10-27）

会員クーポンAPIとKiosk連携APIが表示用`title`・`description`を返す。上限200円の「商品」クーポンではアイスコーヒー・冷やし掛川茶を価格上限の例外として案内する。割引判定の正本はorderec APIにあり、文言はMembers APIで管理する。基本トッピングチケットのタイトルはそのまま、説明文は「200円以下の商品・オプションまたは指定ドリンク1点無料。」と返す。旧Kiosk実機の固定サブタイトルは端末更新まで残る。2026-10-28に文言を指定形へ変更した`15fc0bc`をrevision `members-api-wording-15fc0bc`へ100%配信した。


## 判定前の表示・限定テストクーポン（2026-10-28）

ヘッダー描画前（head）へ初期化を移し、未判定の連携案内をCSSで非表示にする。確認済みcacheは同期反映し、連携済み利用者に未連携カードを表示しない。判定中のカードは領域を維持して非表示。

指定されたテスト会員へ、商品小計3,000円以上で500円引き・顧客限定・1回限り・7日間のShopify券を無償付与する。UIDとコードはGit外保護runtimeだけに保持。既存正逆リンクとactive会員を照合し、Shopify discountと会員/全体の券台帳2件を登録するoperator tool（dry-run/明示apply/作成条件/復旧plan）を追加。試験modeは維持し、認証済みAPIから返る固定test券ID/金額/条件/available一致の券だけを利用UIに出す。通常券交換・購入ptの停止は維持。Members APIの変更なし。


## テスト券の名称・自動適用（2026-10-28）

カートのAMTEST個別コードを「テストクーポン：500円引き」へ置換するLiquid snippetを追加。対象prefix/長さだけを変換し、他の割引名は維持。checkoutの標準コードと既存discount/台帳は変更しない。

試験券の適用ボタンをカートと会員ページから撤去し、カートの本人確認済み応答だけに自動設定用の券コードを返す。Ajax cart/update.js discountで設定し、最低金額/顧客/有効期限/回数はShopifyで判定する。別のコード/自動割引がある場合は上書きせず、登録済みコードは再送しない。コードは表示cacheに保持しない。通常ページでは従来どおり追加照会なし。Node14件/型/buildを確認、本番反映・現行カートと会員ページの実確認完了。


## Dawn移行（2026-10-30）

既存のポイントカード連携/クーポン自動適用を引き継いでDawn16へ移行済み（現公開189917102253、移行時189911072941は復元用に保持）。トップ画像バナー上の透明ヘッダーとPC/mobile幅・商品/カートの状態を確認。旧Riseはrollback用に保持。詳細と現況は[配信記録](docs/SHOPIFY_DAWN_RELEASE_20261030.md)。


## トップのコンテンツ追加（2026-10-30）

提案構成をもとにサービス紹介・食べ方・商品説明・FAQ・LINEカード案内を本番反映済み（189917102253）。PC/mobile幅と既存カートのポイントカード/500円引きを確認。既存料理写真と確認済み商品情報を使用。詳細は[配信記録](docs/SHOPIFY_HOME_CONTENT_RELEASE_20261030.md)。


## ヘッダー画像復元（2026-10-31）

元の全幅画像へ戻し、追加コピーを外してVIEW ITEM＋細い矢印のCTAのみを残す。詳細は[配信記録](docs/SHOPIFY_HERO_RESTORE_20261031.md)。


2026-10-31: トップのサービス/商品/食卓コピーをユーザー指定へ差替し、紹介CTAを商品一覧アンカーへ変更。状態は[トップ配信記録](docs/SHOPIFY_HOME_CONTENT_RELEASE_20261030.md)。

2026-10-31: おすすめ3商品をPC横3列・価格/CTA下揃えへ調整。ストアの商品設定は保持。[配信記録](docs/SHOPIFY_HOME_CONTENT_RELEASE_20261030.md)。


2026-10-31: 商品の日英対応は進行中。日本語既定化・3商品名分離・豚角煮説明保存済み。英語CSV登録はChromeのファイルアクセス設定待ち。トップ翻訳は検査済み未配信。[状態・残作業](docs/SHOPIFY_BILINGUAL_RELEASE_20261031.md)。

2026-10-31続報: ファイルアクセスは解決。CSV importは商品へ紐づかず、正式な商品翻訳exportを管理者メールへ出力しdownloadファイル待ち。英語公開/言語切替とトップ翻訳section2件は反映済み、商品英訳は未完了。配信SHA d37bafd、readback一致。

2026-10-31完了: 正式PRODUCT形式CSVで3商品の英語名/説明6件を登録。日英商品表示・内容量・切替・トップ3商品名を公開確認。初回CSVのType誤りを修正。外部LIFF/購入特典文言は日本語を維持。[現況](docs/SHOPIFY_BILINGUAL_RELEASE_20261031.md)。

2026-10-31: トップの紹介/食べ方/FAQ/CTAをテーマ編集画面の日英入力欄へ移行。現行コピーと商品設定を保持するローカル移行tool、Liquid検査完了。[編集方法・状態](docs/SHOPIFY_EDITABLE_CONTENT_20261031.md)。

2026-10-31: 日英のトップ編集欄を公開テーマへ反映しreadback・公開表示確認済み。管理画面iframeの読込停滞によりUI保存操作のみ未確認。両言語は同じテーマ画面の各入力欄で管理。[詳細](docs/SHOPIFY_EDITABLE_CONTENT_20261031.md)。

2026-10-31: ヘッダーCompany（food-records.com）をPC/dropdown/megaとmobile drawer共通で別タブ化するローカルpatch toolを追加。公開反映を確認する。
