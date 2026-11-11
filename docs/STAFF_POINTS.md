# Staff・CRMのポイント操作（2026-11-11、本番反映済み）

## 対象と本番状態

ユーザーの追加指示「3,4も実装」に対応。モバイル会計送信の新版は前段の実装を保持し、実機検証待ち・既定無効のまま。今回は会員カード連携/付与ポイントの常時表示、予定付与数の変更、付与済み数の差分調整、一時QR、Admin CRMの追加/減算と履歴を実装した。2026-11-11、ユーザー承認により本番反映済み。API `3d8e392`（対象7系統）、Members `f16e1f8`、Staff `978b2db` / Hosting `8a7848952bedd8ed`、Admin `4391bd6` / App Engine `staff-points-4391bd6`を配信。Cloud Run全8系統100%、Rules配信元一致、認証/CORS・実行設定・公開画面を照合した。Staffは`VITE_STAFF_POINTS=true`、`VITE_STAFF_TERMINAL_V2=false`。実Kiosk通信・LINE QR受取・実ポイント変更・実決済は未検証。

## Staff

通常Kiosk/テーブル/Mobileの会計カードと詳細・会計履歴へポイント欄を置く。会員番号・名前・残高・通算・付与予定/済み/取消と最終確認時刻を表示する。連携前は連携後の予定数を表示し、変更操作は本人が紐づいた会計に限る。取得は初回・会計状態/会員番号/金額変更・手動更新だけ。heartbeatや1秒時計では再取得しない。通常Kioskの会員番号は認証済みMembers予約からpublicセッションへ反映し、クライアントが上書きできないようにする。

未払い時は組織のpoint_award_settingsへ予定数を記録し、支払確定時の共通付与処理で利用する。値引前金額で通常500円以上100pt、手動変更は0〜10,000pt。変更理由必須。付与後は残高/通算へ差分だけ反映し、元の付与amountは保持する。effective_amountと有効残高用の期限projectionを更新し、不変の変更履歴を追加する。Mobileの全額返金・取消は変更後の実効ポイントを一度だけ取り消す。部分返金の既存方針は変えない。通常付与処理の途中は手動変更を待機させる。

操作IDと期待versionを使う。応答不明時の同内容再送は保存済み結果を返し、内容の異なるID再利用と古いversionを拒否する。操作者・理由・前後の数を組織のpoint_operationsと会員point_logsへ記録する。Member UID/組織/店舗/支払状態は正本から解決し、ブラウザ申告を信用しない。

テーブル完了後にlive sessionを消す既存仕様を保持し、認証済み完了処理がserver-onlyのstaff_point_resourcesへ会計/会員の参照を保存する。新規会計は領収書履歴からポイント確認/QR発行できる。過去に削除済みのテーブルは自動補完しない。

## 一時QR

Staffの全体操作または会計カードから発行する。種類は排他2択。限定ポイントは残高だけ、会計ポイントは残高と通算へ反映する。会計ポイントの発行は支払済み注文に限り、既存の自動付与と共通のpurchase_point_claims/注文別ログで二重取得を防ぐ。会員連携済みなら対象会員にも固定する。

暗号学的乱数24byteをFR+48桁hexにし、5分・1回限りの既存serialsへ保存する。既存GASのFR+8英数字券は変更しない。受取は既存LIFFの?code=...とPOST /qrcode、登録・LINE本人認証・規約同意を必須とする。コードはGit/ログへ保存しない。QRはqrcode.reactで端末内SVG生成し、外部画像サービスへ送らない。発行自体にLINE Push/メール送信を含めない。

コードを含まないstaff_point_vouchersだけを店舗限定で観測し、受取待ち/付与済み/期限切れを表示。背景・受取済み・期限切れで購読を解除し、前景で未受取なら再開する。使用済み/失効後はQRを隠す。発行再送も同じ操作IDで同じQRを返す。

## CRM

Adminの顧客詳細から追加/減算（±10,000pt、0不可）、通算反映の有無、理由を入力する。初期値は通算非反映。所属組織と顧客台帳のLINE会員をサーバーで照合。残高の負数は債務として保持し、通算減算は0を下限にする。直近20件のポイント履歴を表示し、保存後に残高/通算/履歴を更新する。再送IDを維持し、同時送信も一回だけ反映する。

明示的なtotal_earned_point=0を未設定と混同しない。会員画面、QR、Kiosk、Mobile、EC購入の計算で、旧データの項目欠落時だけ残高を代用する。限定ポイントが後から通算へ混ざることを防ぐ。

## APIと権限

- Kiosk API: GET/POST /mobile-orders/staff/points/{mobile|kiosk|table}/{id}
- Kiosk API: POST /mobile-orders/staff/point-vouchers
- Admin API: GET/POST /customers/{id}/points?organization_uuid=...
- Members API: 既存POST /qrcodeと/kiosk/orders/finalizeを拡張。新しい外部API/GraphQL操作は追加しない。

Rulesはstaff_point_vouchersの店舗限定readだけを許可。会員残高、serial、設定、操作、会計claim、発行秘密、private resourceはクライアントから直接操作/閲覧できない。従来generic許可から該当する組織配下・legacy rootを除外する。現行Kiosk/Staff/Mobile/AdminはこれらをサーバーAPI経由で扱う。

## 検査と配信前条件

API/MembersのGo全体・vet、Emulatorの付与/変更/返金/同時再送/別店舗組織/QR二重取得/期限/明示0と欠落の区別、Rules9件、Staff15単体/型/build、StaffとCRM実componentの390px模擬ブラウザ、Admin check51 tests/buildを検査する。実Kiosk/LINE QR/実決済/実データ更新は未実施。

ユーザー承認後、Rules→Members/API→Staff/Adminの順で反映済み。KioskのMEMBERS_LIFF_URLとMembersのFirestore project/organization layout・共有認証の一致を確認。StaffはVITE_STAFF_POINTS=true、VITE_STAFF_TERMINAL_V2=false。実機確認まで端末連携新版は有効化しない。

定期Job、presence周期、定期GET、min instancesは追加しない。本番でも既存のCPU/memory/scaling/IAMを維持。ポイント操作/QR/対象画面の明示的な取得だけが増える構成。大量利用で大幅増が見込まれる場合は、有効化前に実量から見積もり・確認する。

### 支払確定との競合の保護

通常Kioskの支払済み判定には、支払/注文保存成功後にRecordPointSaleで作るserver-only参照、またはサービス認証済みMembers予約のused状態を使う。クライアントのCOMPLETED表示だけでは会計QRを発行しない。既に付与済みの予約は画面の完了反映を待たず実ログの差分調整へ進め、未確定の処理中会計の変更は待機させる。QR受取済み会員は共通の会計claimから解決できる。旧会計でこの証拠がない場合は自動補完せず、確認待ちとして会計QRを拒否する。

## 配信結果

2026-11-11、ユーザー承認により本番反映済み。API `3d8e392`（対象7系統）、Members `f16e1f8`、Staff `978b2db` / Hosting `8a7848952bedd8ed`、Admin `4391bd6` / App Engine `staff-points-4391bd6`を配信。Cloud Run全8系統100%、Rules配信元一致、認証/CORS・実行設定・公開画面を照合した。Staffは`VITE_STAFF_POINTS=true`、`VITE_STAFF_TERMINAL_V2=false`。実Kiosk通信・LINE QR受取・実ポイント変更・実決済は未検証。

全Go/vet・隔離Emulator/race・Rules9件・Staff15単体/ブラウザ・Manager51件/check/build成功。全8候補/本番の起動・権限・CORS検査、公開assetの一致、Cloud Run/Admin ERROR0。初回候補の実行権限不足は0755で再梱包し解消、一般trafficへの失敗版配信なし。
