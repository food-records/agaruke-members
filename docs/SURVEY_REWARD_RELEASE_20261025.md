# アンケート回答特典500pt 本番配信記録（2026-10-25）

## 配信元

- Repository: `food-records/agaruke-members`の`master`
- 配信元SHA: `680e4592ac0ff639ac838c644395049346a95240`。配信直前にremote `master`と一致し、直前本番SHA `6d48ef7d36256187e15c7231ea820db927d0b67e`を包含するclean commitと検査した。
- API image: `gcr.io/fr-agaruke/members-api@sha256:7664fb2b0bb31cb450fe07d8b9bc0850ce6453bf100bd8b4ab9235e010440780`
- Cloud Build: `23e18ec3-32ea-4338-aad1-62fc10c461d8` SUCCESS。ローカル鍵・認証ファイルをアップロード対象から除外した。
- Cloud Run: `fr-agaruke/us-central1/members-api-00052-bor`。候補tagでtraffic 0%のhealth 200、未認証の特典claim 403 `INVALID_TOKEN`を確認後、100%へ切替。revision labelのGit SHA・image digest一致を確認。
- GitHub Pages: `master` pushのworkflow run `40171568700` SUCCESS。公開`members.agaruke.com/liff.js`はGit管理原本とSHA256一致。

## 受取対象とテスト送信

- Firestore正本は`food-records-prod/organizations/35095fe0-1efc-40ff-bd13-9720c6d09e0f/point_campaigns/agaruke-2026-survey-500`。`enabled=true`、期限は2026-11-24 23:59 JST、`phase=test_only`。
- 回答者照合シートの26 UIDを確認し、実回答者25件とテスト用1件を区別。現在の`eligible`は`test_account=true`のテスト用1件のみで、指定されたテストUIDと一致することをreadbackした。実回答者25件はまだ追加していない。UID原文はGitへ記録しない。
- 共通LIFFリンクを指定テストUIDだけへ、テキスト1オブジェクトのPushで送信。事前プロフィール・Push形式validateはHTTP 200、Push APIもHTTP 200。送信先は1件で、他のUIDへのPushは行っていない。再送キーと送信証跡は権限制限付きのGit管理外ファイルに保存。
- API受理は実端末への表示・リンクタップ・会員登録・ポイント受取の成功を保証しない。受取履歴・残高はユーザーの実操作後に照合する。

## 検査と残作業

- Go全体テスト、Firestore Emulatorでの同時受取・対象外拒否・同意・再送の回帰、`go vet ./...`、サイトJS構文、`git diff --check`を実施。
- 実回答者への付与を開始する前に、テスト用アカウントの実操作と500pt履歴を確認し、実回答者25件の許可リスト登録と案内対象を別途確認する。
