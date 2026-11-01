# LIFFポイントカードの通販チケット（2026-11-01）

## 現在状態

実装・ローカル検証済み。本番未反映、配信承認待ち。作業branchは`feat/liff-shopify-tickets-20261101`、origin master `7ea7783`を基点とする。ユーザーが開いていた`.work/point-vouchers-20261101`のポイント配布作業は変更しない。

## 利用者の流れ

「獲得済みの特典」「ポイントを使う」を主タブとし、その下の「利用先」フィルターで「店頭・モバイルオーダー」「AGARUKE EC」を絞り込む。主タブは大きいセグメント、利用先は小さいチップで優先順位を示し、二重のタブにはしない。利用先の選択は主タブ切替時にも維持する。主タブは矢印/Home/Endキーにも対応する。店舗券の交換・QR・モバイル注文・手動使用は従来のまま。通販券には店舗用操作を出さない。

| 消費pt | 通販割引 | 最低商品合計（税込） |
|---|---|---|
| 200 | 200円OFF | 3,800円 |
| 500 | 500円OFF | 7,000円 |
| 1,000 | 1,000円OFF | 12,000円 |

送料別、1回限り、併用不可、交換から3か月有効。交換前に消費ptと条件を確認し、残高不足はボタン無効。一般配布AGARUKE500は交換対象に含めない。

LINE本人の`shopify_coupons`を読み、Shopify画面で既に取得した券も所持欄へ表示する。使用済み・期限切れは利用不可。旧Customer限定券は発行時のShopifyアカウントへのログインが必要と明記する。旧券の発行条件・顧客制限は書き換えない。今回のLIFF交換券は既存のゲスト対応1回限りコードを発行し、Shopifyログインは要求しない。

「AGARUKEで使用する」はShopify標準`/discount/{code}?redirect=...`でショップトップへ遷移し、`utm_source=line&utm_medium=pointcard&utm_campaign=point_exchange`を付ける。クリックでは使用済みや追加ポイント消費にしない。最終適用条件/1回制限はShopify、支払後の使用済み同期は既存Webhookが担当。LINE購入ポイントの条件・購入前連携の導線は従来どおりで、この遷移だけで購入セッションを作らない。

## 実装と境界

- Node appに`POST /api/liff-coupons`（status/exchange/retry）を追加。Originは`https://members.agaruke.com`だけ。OPTIONS、Content-Type、本文サイズ、Bearer、機能フラグを検査。顧客ID・UID・割引node ID等のブラウザー指定値は転送しない。
- Go内部`POST /shopify/liff/action`は既存service keyが必要。受け取ったLINE tokenのChannel/期限/Profileを検証して本人を特定し、既存会員/退会状態を確認。未登録会員を自動作成しない。本人以外の券は取得・有効化できない。
- 本人専用の内部LIFFフラグはJSONから設定不可。発行スコープ`liff:{hash(uid)}`を使って既存の原子的残高減算・券/履歴作成・Admin発行・pending再開を再利用する。購入カートの認証条件を緩めるものではない。
- 同じrequest_idの並行/再送は同じ券へ収束。Admin応答不明時に返金/新コードを作らずpendingを再開する。LIFF以外で始めた旧pendingは既存ショップの発行再開画面へ案内する。
- 一覧/交換の読取が競合した場合、古い状態で残高を巻き戻さない。API応答やtokenは永続cacheに保存せず、Service Workerも版更新する。LINE tokenはヘッダーだけで扱い、UID/鍵/コードを画面に出さない。
- 新scope・有料アプリ・index・定期polling・常時instanceは追加しない。既存service内にLINE認証と本人の券読取を利用時だけ追加。インフラ設定は維持する計画で、大幅な費用増を伴う構成変更なし。

## 検証

- Node41 tests成功、型検査/production build成功。
- Go全package tests/vet成功。隔離Firestore Emulatorで既存全package回帰成功。
- LIFF追加回帰: 同一request3並列で減算1回/券1件、3種の最低額、残高不足、不正token/未登録/退会、別会員の取得/有効化拒否、既存券と使用済み/期限切れの一覧、paid通知2回で使用済み・残高不変、service keyなし拒否。
- 既存Admin GraphQLを2026-07 schemaで検証成功、read_discounts/write_discountsの既存scopeのみ。
- build済みReact RouterでCORS OPTIONS204、不許可Origin403、Bearerなし401確認。
- localhostの合成データ画面で利用先タブ/3種/残高不足/交換後所持欄/600pt/発行再開/使用済み無効/店舗券への復帰を確認。実LINE認証・実Shopify発券・注文・ポイント消費・配信は未実施。

## 本番反映（承認後）

1. master最新をfetchし、直前のGo/Node本番SHAと今回配信元の包含、既配信機能、clean tree/remote SHA一致を確認する。Go API→Node app→LIFF Pagesの順で更新し、途中でUIだけ先行させない。
2. GoとNodeの現在resource/secret/機能フラグを保持し、候補revisionで認証境界/既存購入・発券回帰を確認する。追加secret/scope不要。
3. 各revisionのSHA/digest、traffic100%、ERROR logを照合。masterへのmembers-site変更pushはPages自動公開を起動するので、backend切替後に行う。
4. LINE実端末で既存券表示→交換確認→減算1回→発行→使用ボタン→トップへ適用を確認する。実会員のポイント消費・注文は事前承認を得る。LINE告知は行わない。

公式参照: https://shopify.dev/docs/api/admin-graphql/2026-07/mutations/discountCodeBasicCreate 、 https://shopify.dev/changelog/posts/scannable-discount-codes
