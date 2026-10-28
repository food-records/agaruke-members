# agaruke-members TODO

- [ ] LIFF SDK 2.31.2のポイントカード公開後、LINE内ブラウザと外部ブラウザでログイン・カード表示・QR導線を実機確認する。

## 2026年アンケート500pt

- [x] LIFFから会員登録・同意を経て、検証済みLINE UIDの回答者だけへ500ptを原子的に一回限り付与するコードを実装。テストUIDを除く25件のTSV検査と同時受取のEmulator検査を追加（2026-10-25）。
- [x] APIとサイトを本番配信し、テスト用UIDだけを受取対象として有効化して指定先へリンク1通をテストPushする（2026-10-25、LINE API 200）。
- [ ] 指定テスト端末でリンク表示、登録・同意、500ptの一回付与と再訪時の二重付与なしを確認する。
- [ ] 実回答者25件の対象UIDと期限を再確認して許可リストへ追加する。対象者へのLINE・メール送信は別途実施する。

## 会員登録同意

- [x] モバイルオーダー用`POST /members/register`で規約・プライバシーポリシー同意を保存し、通常GETによる未登録会員の自動作成を停止する
- [x] members-siteの新規会員導線も既存`terms.html`確認後に`POST /members/register`を呼ぶ方式へ変更してからmembers APIを本番反映する（2026-09-05、規約・プライバシーポリシーへの明示同意UIを追加し、members API revision `members-api-00037-9dd`を本番反映）

## モバイルオーダークーポン連携

- [x] organization／LINE会員認証付きモバイル注文で、注文UUIDによるクーポンの冪等利用と同時利用防止を保証する
- [x] モバイル注文の決済失敗・店舗却下・期限内キャンセル・Square返金時に、使用済みまたは予約中クーポンを安全に利用可能へ戻す
- [x] 予約注文を含む注文確定・復元をモバイル注文ライフサイクル内のTransactionで処理する
- [ ] クーポンの詳細定義（特定商品・特定オプションなどの条件指定と管理UI）をKioskとモバイルオーダーへ同時実装する

## 購入ポイント共通化

- [x] Kiosk・モバイルを横断し、クーポン値引前500円以上の購入へ100ポイントを日本時間の購入日ごとに1回だけ付与する共通台帳へ統一する
- [ ] 本番実注文でKiosk→モバイル、モバイル→Kiosk、500円未満、500円ちょうど、翌日購入を確認する

## Shopify購入ポイント連携

- [/] Shopify CustomerとLINE Membersを明示連携し、`orders/paid` webhookでShopify注文ごとに基礎100ptを冪等付与するMembers APIを実装した。Shopify Customer Account extension、custom appのscope／webhook登録、Secret Manager設定、テストストア／本番実注文の結合試験は未実施。
- [ ] Shopify注文の全額返金・取消時に基礎ptを戻すか、失効済み／使用済みポイントの扱いを含めたルールを決めて実装する。
- [ ] 商品・金額別の傾斜は基礎100ptと独立する`bonus` point logとして、判定時の商品・金額スナップショットとrule versionを保存して追加する。

## 本番Firestore統合

- [ ] 本番会員カードの`fr-agaruke`とモバイルオーダーの`food-records-prod`を統合する移行方針を確定する
- [x] `fr-agaruke`のmembers、member_numbers、coupons、point_logs、reward_catalog、serials、Squareクーポンプール、Kiosk会員連携データの全件数と参照関係を棚卸しする（2026-09-05、collection groupパス正規化修正後に永続データ320文書、会員クーポン21件、ポイント履歴13件、QR利用履歴1件を確認）
- [x] 移行先を`food-records-prod/organizations/35095fe0-1efc-40ff-bd13-9720c6d09e0f/...`として、読み取り専用の事前検査と再実行可能な本番マイグレーションを実装し、本番コピー・独立verifyを完了する（2026-09-05、漏れていたサブコレクション35件をmissing-onlyで追加。クーポン21件は欠損・余分・内容不一致0）
- [x] LINE User ID、会員番号、ポイント残高、累積ポイント、ランク、クーポン状態、有効期限、冪等付与履歴が移行前後で一致する検証レポートを出力する（2026-09-05、最新285文書を再コピーし、独立verifyで欠損・余分・内容不一致0。レポートはGit管理外に保存）
- [ ] 移行中の更新を取りこぼさない差分同期または短時間の書込停止手順を決定する
- [/] members APIとモバイルオーダーAPIを`food-records-prod`のorganization配下へ切り替える手順、Secret Manager、IAM、Firestore index・TTLを整備する（2026-09-05、members APIのIAM・接続先・organization layout切替まで完了。モバイルオーダーAPI、index・TTLの最終確認は未実施）
- [ ] 切替後に会員カード、Kiosk連携、ポイント付与、クーポン利用、モバイル注文、注文履歴、LINE通知を本番相当環境で結合試験する
- [/] 問題発生時に`fr-agaruke`へ戻せるロールバック条件・手順・切替前バックアップを準備する（手順・判定条件を文書化し、2026-08-28に30日保持の本番export取得済み。復元リハーサル待ち）
- [/] 検証完了後にのみ`MEMBERS_DATA_LAYOUT=organization`を本番で有効化し、旧プロジェクトの停止・保管時期を決定する（2026-09-05、members APIで有効化済み。旧プロジェクトはロールバック用に保持し、停止時期は未決定）

## Kiosk SDK購読通知（2026-10-13）

- [x] 会員リンクとUID限定signal更新を同一Transactionで実行し、abort/秘密なし/所有者保持をEmulator検証、Members API00048-hedへ本番配信
- [ ] Kiosk1.0.20(21)実機で会員QR→連携・クーポン反映を業務確認する

## Shopify直接来店連携（2026-10-28）

- [x] 直接来店→Shopify認証→LINE本人同意・確認コード→双方向一対一連携を実装する。
- [x] 既存提案の200/500/1,000pt EC専用交換券、Customer制限・最低額・一回限り・併用不可・発行再開を実装する。
- [x] 支払済み注文ごと100pt・注文台帳・券消込の原子更新、取消/全額返金の冪等取消と遅延通知防止を実装し、Emulatorで検査する。
- [x] アプリのOAuth sessionを暗号化して既存Firestoreへ永続化し、Cloud RunローカルSQLite依存を除去する。
- [ ] 交換条件・返金時の負残高と券再発行方針、アプリ配信先・費用・実ストア/開発ストアの導入と権限を確認する。
- [ ] 承認後にSecret・URL・Customer保護対象データ・webhook・テーマ入口・専用ページを設定し、実ストア相当環境で結合検証してから本番配信する。
- [ ] 第2段階としてLINEからShopifyを直接開く購入導線を構築する。

- [x] 本番反映と専用backend追加費用の承認を取得（2026-10-28）。本人連携だけを先行する`SHOPIFY_LINK_TEST_ONLY`とwebhook段階反映を準備。
- [ ] 初回本番反映のrevision・SHA・URL・権限を照合し、実Shopifyログイン→LINE同意→確認コードで本人連携を試験する。
