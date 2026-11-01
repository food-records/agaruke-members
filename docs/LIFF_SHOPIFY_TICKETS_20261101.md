# LIFFポイントカードの通販チケット（2026-11-01）

## 現在状態

2026-11-01、ユーザーの公開承認により本番反映・実会員の読取確認まで完了。最新masterのシリアル配布/受取確認・店頭券仕様も統合して保持した。API配信元はmaster `7d4c2b0`、LIFF初回公開は`cf8478e`、キャッシュ補正を含む最終画面公開は`70a17ac`。元の`.work/point-vouchers-20261101`は保持。

## 利用者の流れ

「獲得済みの特典」「ポイントを使う」を主タブとし、その下の「利用先」フィルターで「店頭・モバイルオーダー」「AGARUKE EC」を絞り込む。主タブは大きいセグメント、利用先は小さいチップで優先順位を示し、二重のタブにはしない。利用先の選択は主タブ切替時にも維持する。主タブは矢印/Home/Endキーにも対応する。店舗券の交換・QR・モバイル注文・手動使用は従来のまま。通販券には店舗用操作を出さない。

| 消費pt | 通販割引 | 最低商品合計（税込） |
|---|---|---|
| 200 | 200円OFF | 3,800円 |
| 500 | 500円OFF | 7,000円 |
| 1,000 | 1,000円OFF | 12,000円 |

送料別、1回限り、併用不可、交換から3か月有効。交換前に消費ptと条件を確認し、残高不足はボタン無効。一般配布AGARUKE500は交換対象に含めない。

LINE本人の`shopify_coupons`を読み、Shopify画面で既に取得した券も所持欄へ表示する。使用済み・期限切れは利用不可。旧Customer限定券は発行時のShopifyアカウントへのログインが必要と明記する。旧券の発行条件・顧客制限は書き換えない。今回のLIFF交換券は既存のゲスト対応1回限りコードを発行し、Shopifyログインは要求しない。

「AGARUKEで使用する」は本人の券IDを持つ`/apps/members?entry=ticket`から既存LINE認証を経て、今回カートの購入セッションを連携し、所持券を照合・適用したショップトップへ遷移する。UTMは`source=line / medium=social / campaign=point_exchange / content=pointcard_ticket_200|500|1000`。クリックでは使用済みや追加ポイント消費にしない。最終適用条件/1回制限はShopify、支払後の使用済み同期は既存Webhookが担当。リッチメニュー入口・認証・最新公開状態は[LINEショップ入口仕様](LINE_SHOP_ENTRY_20261101.md)を正本とする。

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


## 本番反映結果

| 対象 | 配信元/識別子 | 公開状態 |
|---|---|---|
| Go API | `7d4c2b093c06d7e0d0bdb0533a64c49b537260c3` / `members-api-liff-7d4c2b0` | 100% |
| Node app | 同上 / `shopify-members-liff-7d4c2b0` | 100% |
| LIFF Pages | `70a17ac922d6bcd154ce702c77c15501b33cce6f` / Actions run `41288460578` | success |

Go image: `sha256:fe55480c4e9ad82721d16fcf8f88acde3ed70ffe5c0b169b32da5e048c09800f`。Node image: `sha256:fff9e2a7e91079c5442e4a11431fec42bed37fb1fd19e4e43e2d9bfdbc63e74f`。Go build `88682e1e-bf16-4012-a263-fee354485de7`、Node build `1ccc3340-bcac-4420-9eda-bfba0b15260e`。直前の本番Go8faff2b/Node26bf1d6の包含・clean source・remote SHA一致を切替前に検査。追加pushでSHAが変わった2回は候補0%のまま停止し、最新masterから再ビルドした。旧候補は0%で保持。

既存environment/secret参照/resources/concurrency/maxScaleの一致を機械確認。Go 1CPU/512Mi/concurrency80/max20、Node0.08CPU/256Mi/concurrency1/max1を維持、min追加なし。Go→Nodeの順で100%切替後、LIFFをmasterへ統合してPages公開。最終画面commitとAPI sourceのbackendコード差分0を照合した。Shopify拡張・テーマ・GAS本番設定は配信していない。

Go全tests/vet/隔離Emulator、Node43 tests（キャッシュ回帰2件含む）・型/build成功。候補/公開URLでroot/サービス鍵/不正LINE/Origin/CORS/Bearer境界、既存署名proxy/500円使用履歴/交換境界を確認。ERRORログ標本0件。

実LINEログイン済み会員で、既存通販券2件・200円券詳細の使用ボタン・3種の条件/残高不足・主タブを切り替えてもECフィルター維持を確認。新規ポイント消費/発券/使用遷移/注文/配信は実施せず、実交換から注文までの操作は利用者の確認に残す。index.html/index.css/liff.js/config.js/sw.jsの公開bytesを配信元と照合（swのCACHE_NAMEはPagesでSHAに置換）。

### 公開時に検出したキャッシュ混在の補正

旧Service Workerが新HTMLと旧liff.jsを同時に返し、switchTicketChannelが未定義となる実画面を確認。キャッシュ名更新だけでは古いHTTP/CDN応答を新cacheへ格納し得るため、install時はrelease付きURLをreload取得して通常keyに保存。主要HTML/JS/CSS/configはnetwork優先・再検証、失敗時だけ現行cacheへfallbackする。OAuth code/シリアル等のquery付きnavigationはcache保存しない。画像は現行cache内で優先し、API/LINE通信は対象外。回帰テストと実会員で補正後の動作を確認。旧画面を開き続けている場合は閉じて開き直すか再読み込みする。

2026-11-01追記: チケットの使用リンクをLINE購入連携の引継ぎ入口へ差替する。[最新の入口仕様とリッチメニューURL](LINE_SHOP_ENTRY_20261101.md)。公開状態は同資料を参照。
