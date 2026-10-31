# agaruke-members

**Shopifyの現行仕様と実アカウント受入チェックリスト:** [顧客・LINE連携・全クーポン・ポイント条件](docs/SHOPIFY_DIRECT_ENTRY.md)（2026-10-31照合）。購入pt/交換/返金は本番有効、LINE配信未実施。旧報告の試験停止記述と区別する。

Organization顧客台帳への会員状態投影は`LINE_PROVIDER_ID=food-records-line`を設定した場合だけ有効です。`POST /members/register`成功時に会員フラグを更新し、退会申請時に解除します。顧客台帳の失敗で会員登録・ポイント処理は取り消しません。

FOOD RECORDS メンバーズ ポイントシステム

2026-10-31: EC200pt券の最低額を税込3,800円へ本番反映。地域別冷凍送料990〜2,200円をShopifyへ保存。公式Bundlesはユーザーの権限承認後に導入済み。表示復旧後に3種各1個の在庫連動セット3,980円を公開し、カート追加まで確認済み。通常交換は後述の一時テスト公開へ移行。[反映記録](docs/SHOPIFY_PRICING_RELEASE_20261031.md)。

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

2026-10-31: ヘッダーCompany（food-records.com）をPC/dropdown/megaとmobile drawer共通で別タブ化するローカルpatch toolを追加。公開Dawn189917102253へ反映済み。日英のPC/drawer属性と英語クリックで別タブが開き元画面が残ることを確認。

2026-10-31: お届けイメージをユーザー指定box-image.pngで公開反映。日英・画像編集対応、公開画像/文章・既存導線とreadbackを確認済み。[状態・継続手順](docs/SHOPIFY_DELIVERY_SECTION_20261031.md)。

2026-10-31: HOW TO ENJOYの冷凍配送アイコンを箱＋複数の密封パックの線画へ変更。トップの独立お届けセクションは画像・文章を保持して非表示。公開日英表示を確認済み。

トップの通知バナーとモバイル画像・SVGアイコンの表示仕様は[記録](docs/SHOPIFY_BANNER_MOBILE_20261031.md)を参照。

2026-10-31: LINE初回500円券`AGARUKE500`を11月30日23:59 JSTまで・商品税込3,800円以上で作成済み。ポイント交換3種は既存の個別発行設定を確認、通常交換は試験modeで停止中。LINE配信未実施。[条件と状態](docs/SHOPIFY_PRICING_RELEASE_20261031.md)。

2026-10-31: ユーザー指示で交換だけを一時公開する独立フラグを追加。購入pt/paid/返金は試験停止を維持、配信なし。[交換テスト反映記録](docs/SHOPIFY_EXCHANGE_TEST_RELEASE_20261031.md)。

2026-10-31: おすすめ商品を紹介直後へ移し、日英の「おいしさの理由」3項目と料理別紹介、専用スマホ画像設定を追加。[現行仕様](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: ABOUTの写真をユーザー指定moritsuke-image.pngへ変更し、ABOUTブロックに専用画像設定と日英altを追加。[記録](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: おいしさの理由にユーザー指定house-meal.pngを追加し、PC見出し横/スマホ見出し下の画像と日英altを設定。[記録](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: おいしさの理由の余白を修正し、見出しの下に写真左/3理由右をまとめた配置へ変更。[現行配置](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: おいしさの理由のタイトルをPCの写真右側・説明上へ移動。スマホはタイトル→写真→説明を維持。[配置](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: クーポン選択/解除・各ページの適用状態欄と交換券名称を改善。テスト券の自動適用を撤去。[状態と検証](docs/SHOPIFY_COUPON_CONTROLS_RELEASE_20261031.md)。

2026-10-31公開確認: backend coupons-6ee7ebb、theme補正6f08a71。既存200円券の選択・検索中の適用表示・解除/非再適用を実確認。追加交換/決済・LINE配信なし。[記録](docs/SHOPIFY_COUPON_CONTROLS_RELEASE_20261031.md)。

2026-10-31: クーポンの適用状況をヘッダーのバナーへ移し、現在選択/所持券/折りたたみ交換のUIへ再設計。[状態](docs/SHOPIFY_COUPON_UI_RELEASE_20261031.md)。

2026-10-31: YOUR OWN LITTLE TREATにユーザー指定me-time-wide.pngを設定し、トップの最終デザインをレビュー。[現行仕様/確認](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31公開確認: クーポンのヘッダーバナーとカード型選択画面を反映。backend coupon-ui-cbd14ac、theme最終ce2ec58。PC/スマホ・選択解除・検索へ戻る・トップ重なりなしを実確認。200円券適用と残高を維持、LINE配信なし。[記録](docs/SHOPIFY_COUPON_UI_RELEASE_20261031.md)。

2026-10-31: ユーザー指定でスマホも透明ヘッダーとVIEW ITEMをメイン画像へ重ねる配置へ変更。[現行配置](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: 全クーポンのLINE条件・3状態バナーを検討中。未公開draftはfeature branch edce008。Shopifyログインなしの利用フローを説明し、本人限定の範囲は確認中。[未確定事項](docs/SHOPIFY_LINE_BENEFITS_PLAN_20261031.md)。

2026-10-31: スマホVIEW ITEMをアイボリー背景・読みやすい文字と矢印・48px操作高へ調整。[仕様](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31確定: 500円券を購入歴不問・1人1回へ変更、LINEは任意・購入後案内。バナーは券優先→未連携案内→非表示。[状態](docs/SHOPIFY_PUBLIC_COUPON_RELEASE_20261031.md)。

2026-10-31: 未ログイン時のヘッダーアカウントはShopifyログイン画面への直接リンクに変更。ログイン済みだけ標準アカウントメニューを表示する。LINE認証状態とは別にLiquid customerで判定。[仕様](docs/SHOPIFY_ACCOUNT_ENTRY_20261031.md)。

2026-10-31: 商品/カートの特典カードを統一し、同画面の券選択・解除と購入ポイント付与の開始を実装。[現行仕様・公開状態](docs/SHOPIFY_INLINE_BENEFITS_20261031.md)。

2026-10-31: PCメイン画像を横幅100%・高さ自動の全体表示へ変更し、狭い横幅での画像内ロゴ切れを解消。[仕様](docs/SHOPIFY_TASTE_MOBILE_20261031.md)。

2026-10-31: 一般500円券を「AGARUKEオープン記念！500円OFF」へ改称し、会員ページの所持クーポン一覧にも追加（未LINE認証でも選択可）。条件/コード/期限/ポイントは維持。

2026-10-31: 商品/カートの未連携カードは上部の購入pt欄を非表示とし、登録・連携リンクの下へ「購入前の連携で注文ごと100pt、支払完了後付与」の案内を移動。連携解除UIは未実装。

2026-10-31: マイページの「LINE認証をやり直す」と同じ認証詳細内へ「LINE連携を解除する」を追加。本人・カート照合/旧セッション失効/会員資産保持/再連携/既存注文の遅延支払・返金を実装。[現在仕様](docs/SHOPIFY_DIRECT_ENTRY.md#line連携解除2026-10-31追加)。

2026-10-31: LINE再認証と同じアカウント詳細内へ「LINE連携を解除する」を本番公開（source 8b13f5e）。残高・取得済み券・既存注文を保持し、旧セッションの復活を防止。検査・配信結果と実アカウント受入の残件は[現行仕様](docs/SHOPIFY_DIRECT_ENTRY.md#line連携解除2026-10-31追加)を参照。

2026-10-31購入導線: 商品ページのbuy_buttons.show_dynamic_checkoutをfalseにして「今すぐ購入」を非表示にし、カートを経由する導線へ統一する。テーマ再生成時にも同設定を適用。Shopify未ログイン・LINE連携済みの恒常入口は、Shopifyアカウントのログインと分離したメニュー「ポイントカード・クーポン」→/apps/membersを推奨。後者は提案で未実装。
