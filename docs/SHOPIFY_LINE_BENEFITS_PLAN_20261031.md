# LINE連携条件と統合バナーの準備（2026-10-31）

状態: 未公開ドラフト。ユーザーは初回500円券を含む全クーポンのLINE連携必須を希望。Shopifyログインの要否を確認したところ「必須にしない場合のフローは」と質問されたため、下記の方式差を説明し、利用時の本人限定の強度/ゲスト導線の選択は未確定。

## 表示要件とドラフト

LINE未連携→LINE連携案内。連携済み・クーポン未選択→バナーなし。連携済み・クーポン選択/適用中→クーポン状態と獲得予定ptを同じバナーへ表示。試験mode中は0pt/付与停止中とし100ptを誤案内しない。従来の連携announcementは統合バナーへ一本化。会員表示の既存cache/検証済み応答をイベントで共有し、追加の全ページAPI読取やpollを加えない。画面の選択操作もLINE連携状態で制限するが、これは決済側の資格制限とは別。

コードは承認済みremoteのfeature branch feat/shopify-line-benefits-20261031、edce008aceb70abbd33d34e08e746f2a3dd4c493へpush済み・remote SHA一致。Node21件/型/build・Liquid/JS3件検査成功。元worktreeの自分の対象7ファイルだけをpatch一致確認後に戻し、別作業のhome-content/header CSS変更は保持した。masterへ未統合・デプロイ/テーマ更新なし。Git外runtime/shopify-line-benefits-20261031/sourceに継続用cloneとpatch/検査ログ。

## Shopifyログインを必須にしないフロー案

LINEからストアの配布リンク/ポイントカード入口を開く→LINE本人認証→本人の所持券を選択（初回500円券は共通AGARUKE500を配布せず、認証後に1人1回の個別コードを発行）→カート適用→メール/住所を入力してゲスト購入。交換券は既存の実ポイント消費/個別1回券を維持。初回券の最低3,800円/500円/初回購入/1人1回/併用不可/11月30日期限は維持する設計だが、新規個別配布機構は未実装。

この方式で必須にするのは発行・選択時のLINE認証。現行guest個別券はnative context=ALLのコード保有者向け1回券なので、発行済みコードを転送された場合まで未連携の利用を完全には拒否できない。画面だけのチェックを決済側の厳密な本人制限と説明しない。

決済側で連携済みShopify顧客だけに限定するなら、LINEとShopify顧客の対応付けが必要。初回券をLINE連携tag＋注文0件のsegmentで制限する案ではwrite_customers scopeが追加で必要になる。現行scopeにないため、実際の追加権限は別途確認が必要。ゲスト導線を維持したままの厳密な決済制御は別方式の検討が必要で、Basicのcustom appにFunctionsを導入できると仮定しない（公式docs: public appsは全plan、custom FunctionsはPlus）。追加アプリ/プラン変更/権限追加は実施していない。

現在の共通500円券・既発行交換券の条件は変更していない。LINE配信なし。Secretary記録先orderec、Driveイベント公開は未承認保留。.work追加/削除なし。方針決定後にfeature branchを再確認し、500円券の発行/適格性と既発行券の扱いを具体化してから統合・公開する。


## 一般クーポンとLINE特典の併用案・初回セグメントの訂正（2026-10-31）

ユーザーから、万人受け/外国人対応・CRM・任意LINE連携特典を比較した推奨を求められた。提案は「一般向け公開記念500円券＋任意のLINE会員特典」。購入/一般券はLINE・Shopifyログイン不要、LINEはポイント交換/継続利用特典の入口とする。メール配信同意を得たShopify顧客へのメールCRMも併用する。追加の登録ボーナス額は決めていない。ユーザーの採用決定ではなく提案段階なので、設定/コード/配布は変更していない。

一般券の提案条件: 税込商品3,800円以上・500円引き・1人1回・他券併用不可・2026-11-30 23:59 JSTまで。初回注文限定より「公開記念/1人1回」を推奨する。これならLINE未使用者にも同じ条件で案内でき、既存来店客のEC利用にも使える。バナーは一般券の適用状態を未連携者にも表示し、連携者だけポイント情報を加える案になる。edce008の全coupon LINE選択ガード/未連携なら常に案内、のドラフトはそのまま採用しない。

重要な訂正: Shopify公式Discount codes FAQは、顧客segment指定の割引は既存顧客向けで、まだprofileのない初回購入者は初回注文完了までsegmentに含まれないと明記している。現在AGARUKE500に設定したCustomers who haven't purchasedでは、顧客未登録の新規購入者を取りこぼす。以前の「初回購入限定をこのsegmentだけで実現できた」とした案内は不十分だった。LINE配布前に適格性を修正・新規guestで検証する必要がある。実注文テストは未実施、今回native条件の変更なし。

原典: https://help.shopify.com/en/manual/discounts/discounts-faq 、メール同意: https://help.shopify.com/en/manual/promoting-marketing/create-marketing/shopify-messaging/email/subscriber-list-management 。Secretary orderec/Drive event公開は未承認保留、.work変更なし。

2026-10-31ユーザー確定: 一般向け500円券/1人1回＋任意LINE案内を採用。全クーポンLINE必須/個別500円券発行/Shopifyログイン必須の案は採用しない。edce008は表示統合だけ再利用。[正本](SHOPIFY_PUBLIC_COUPON_RELEASE_20261031.md)。
