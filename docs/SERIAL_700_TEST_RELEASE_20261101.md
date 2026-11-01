# 700pt個別シリアル テスト配信記録（2026-11-01）

## 本番配信元

- `food-records/agaruke-members`の`master`、SHA `8faff2b88c343092c8faa844c51bf769d30c91b8`。配信直前にremote `master`と一致するclean worktreeを確認し、直前Members API配信SHA `8b13f5edab01dbe0b4d56afa633c0472373c76f9`を包含した。
- Cloud Build `991e9885-6540-41fb-9a07-9ef9708fabd2`はSUCCESS。イメージdigestは`sha256:4174f9e13c29414c81b834fa191234c8633345a7f822ea1cac63227f7c2e853c`。
- Cloud Run `members-api-00075-lof`をdigest指定・Git SHAラベル付きで0%に配信。候補revisionのhealth 200、未認証`POST /qrcode`の`INVALID_TOKEN`拒否を確認後、100%へ切替。公開health 200。
- GitHub Pages workflow `41287049617`はSUCCESS。公開`members.agaruke.com/liff.js`と配信元はSHA256一致。
- Firestore EmulatorでGo全package、同時引換・登録同意・キャンペーン重複・期限・旧テストコードの一度限り化を検査。`go vet ./...`、LIFF/GAS構文、`git diff --check`も通過。
- 共有repository内のShopify appはNode 22で`npm test`・`npm run typecheck`・`npm run build`、Square Sessionは`npm run build`を実施し、いずれも成功。両serviceの本番revisionは変更していない。

## テスト送信

- Firestore `food-records-prod`のorganization配下へ、指定済みテストUID向けの700ptシリアルを**1件だけ**発行。`type=once`、`accumulate=false`、期限は2026-11-24 23:59 JST、発行時`used=false`をreadback。コード原文と個別URLはGit管理外の権限制限付きファイルに保持する。
- 旧UID限定500ptの受取履歴がテストアカウントに存在するため、今回の機能確認用に別の内部キャンペーンID`agaruke-2026-survey-700-test-20261101`を用いた。実回答者用の内部キャンペーンIDは旧受取履歴との二重付与を防ぐため`agaruke-2026-survey-500`を維持する。
- [配布案](POINT_VOUCHERS.md#今回の配布案2026-11-01)の確定文面に`【テスト】`を付け、指定UIDへテキスト1通をPush。LINEプロフィール確認・文面validate・Pushは各HTTP 200。LINE request IDは`59d95f49-964c-4c4c-b189-b290617cf699`。他のUIDへは送信していない。
- LINE API受理は端末表示・リンクタップ・700pt付与を保証しない。実端末で受取後、シリアルの`used`、ポイント履歴、残高と再訪時の二重付与なしを確認する。

## 本配布前の残件

- 実回答者25人向けのシリアルは未発行・未送信。GASの本番シート反映とproject/organization接続先、個別送付先、期限を確認する。
- テストコード・送信証跡は非公開ファイルに保存し、Git・公開資料へ含めない。
