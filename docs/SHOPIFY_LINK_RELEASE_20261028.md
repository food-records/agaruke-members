# Shopify本人連携・本番結合試験用の反映（2026-10-28）

## 現在状態

ユーザーは顧客未公開のため本番反映を承認し、本人連携の結合試験を先行する指示を出した。Cloud Run追加費用と、Shopifyインストール画面の4 scopeも個別承認済み。以下の反映・技術smoke testを完了した。実ユーザーのShopifyログイン→LINE同意→8文字コード→連携確定は本人操作待ちであり、結合試験成功とはまだ扱わない。

試験URL: `https://shopify.com/83950534829/account/pages/01a180f6-0c09-7f88-b2c5-4b366055735b`

- 公開URLからAGARUKEのログイン画面へ遷移することを確認。
- `SHOPIFY_LINK_TEST_ONLY=true`。クーポン交換はUIを隠し、APIも403で拒否。
- 購入・返金webhookは未登録。注文ポイント・クーポン利用の本番試験は本人連携の確認後に進める。
- 専用アカウントページを作成・保存し、`backend_url`を本番URLへ設定。メニューへのnative app page追加は保存後の反映を確認できなかったため、今回の試験入口は上記の専用URLとする。商品/カートのテーマblockは未配置。顧客向け導線の配置は連携試験後に確認する。

## 配信照合

承認済みremoteは`git@github.com:food-records/agaruke-members.git`、base branchは`master`。各配信元を先にpushし、release guard・remote SHA照合・直前本番SHAの包含を確認。以下のコードはすべて現行masterに含まれる。

| コンポーネント | 配信元SHA | 配信識別子 |
| --- | --- | --- |
| Members API | `847d1d15624dec4b8f9a797415b3434c1c8fb069` | `members-api-00054-soq`、us-central1、100% |
| Shopify backend | `43c4eecfcd0101c9bbf34086f8ff9b908facb69c` | `shopify-members-00001-f9h`、us-central1、100% |
| Shopify拡張 | `33d287326cc4fc690487b8f02ee1c0ca59092b8b` | `members-link-33d2873`、version `1184551305217` |
| Members site | `847d1d15624dec4b8f9a797415b3434c1c8fb069` | GitHub Pages workflow SUCCESS |

- API image: `gcr.io/fr-agaruke/members-api@sha256:7b4ebe7f88952b30935244f2b66790f5bf24aa03c51eec8bbe4f181a5204a24b`
- Backend image: `gcr.io/fr-agaruke/shopify-members@sha256:4ba042046ba3b5ec62a9bc6c0e736084a63a998a61c3766607ede6c7189ba6ea`
- API build: `8887c5b8-bb70-47d4-b1f7-564dcbd23605` SUCCESS。
- Backend build: `3749b2eb-e499-4410-bfa5-29e1262e4561` SUCCESS。先行`fcd77db2-84a6-4eac-a007-19bdc6f06035`はnpm取得停滞によりcancel。workspace metadataの事前copy・audit停止・取得timeout設定を加えて再buildした。停滞原因の詳細までは確定していない。
- API旧revision `members-api-00052-bor`（SHA `680e4592ac0ff639ac838c644395049346a95240`）を包含し、既存tagも保持。

## Shopifyとruntime

- ストア: `stxmu0-ef.myshopify.com`／`shop.agaruke.com`。
- App: AGARUKE Members、app ID `430763966465`、client ID `8ce868e1bc1ba44e2b07896c89c05631`。管理画面でインストールとアプリの起動を確認。
- App URL: `https://shopify-members-438247672947.us-central1.run.app`。
- Customer Account page ID: `01a180f6-0c09-7f88-b2c5-4b366055735b`。Shopifyが生成した実IDを使用し、extension uidを推測していない。
- Cloud Run: 最小0、最大1（revision）、CPU 0.08、256MiB、concurrency 1、request-based、gen1。待機常駐・定期スキャン・Cloud SQLは追加していない。
- 専用SA `shopify-members-runtime@fr-agaruke.iam.gserviceaccount.com`は、app secret・session暗号化キー・既存Members service keyに対応する3 SecretだけにsecretAccessorを付与。値はGit・image・ログへ入れていない。
- 料金は通常月1万request・backend平均2秒/既存API平均1秒等で増分0〜200円、10倍利用と応答遅延/再試行時に約3,000円、1USD=150円仮定・税別・無料枠なしでも試算として承認済み。実為替・無料枠・利用量で変動する。初回buildは数十円程度の範囲。想定超過時は再見積もり。

## 検証結果と限界

- Go全package test/vet、Node 5 test、app/extension型検査、build、Shopify TOMLとUI schema検証に成功。変更前のFirestore Emulator/race testも成功済み。
- API候補root 200、private customer action 403、未認証LINE propose 403。旧/新の未認証membersはともに400で一致。CORSも照合。
- Backend root 200、ブラウザー相当の未認証requestは401。curl既定UAは公式ライブラリのbot判定により410となるため、401試験には通常のbrowser UAを使用した。
- 実在しないCustomer IDの短期署名付きread-only sessionで、backend→Members API→Firestoreのstatusが200/未連携/試験modeを返し、交換が403となることを確認。実会員・連携記録・ポイントは作成していない。この技術試験を実Shopify Customer認証の代用としない。
- Shopify adminからの実アプリ起動により、公式admin認証・暗号化session永続化の経路も確認。
- 05:24 UTC以降の対象2serviceのERROR記録を照会し0件を確認。実ユーザー試験後の再確認は別途必要。
- 顧客の実メール/LINEログイン、登録同意、確認コード入力、再訪時の連携維持は本人操作で試験する。

## 本人による試験

1. 専用URLを開き、Shopifyのお客様アカウントへログインする。
2. 「LINEとの連携を始める」→「LINEでポイントカードを確認する」。PCなら表示QRをスマートフォンで読む。
3. LINEで登録/規約同意が必要なら完了し、連携へ同意する。
4. LINEに表示された8文字を控え、元のShopify画面へ戻る。
5. 「LINEでの確認結果を表示」でFRから始まる会員番号を照合し、8文字を入力して確定。
6. 連携済み・同じ会員番号/残高の表示と、再読み込み後の維持を確認する。注文・交換はまだ行わない。

## 保留・復旧

- 実ユーザーの本人連携試験、注文/クーポン/返金試験と運用条件、storefront入口配置、メニュー保存反映確認が残る。
- API復旧先は旧`members-api-00052-bor`。旧APIへ戻すと新アプリの連携/session保存は使えなくなるため、Shopify試験を停止してからtrafficを戻す。会員・ポイントデータの削除はしない。
- ローカル認証設定・証跡はGit管理外の保護runtimeへ保持。Secretary eventのDrive公開は未承認のまま。
