# LINEポイントカード・リッチメニューからショップへ（2026-11-01）

2026-11-01、本番公開・実アカウントの両導線確認まで完了。既存のLIFF/Shopify購入連携を再利用し、新しいLIFF ID/権限/Go API変更は不要。

## 入口URL

リッチメニューには以下を設定する。リッチメニュー自体の変更・LINE配信は今回行わない。

https://shop.agaruke.com/apps/members?entry=rich_menu&utm_source=line&utm_medium=social&utm_campaign=agaruke_ec&utm_content=rich_menu_shop

チケットの使用リンクは同じ`/apps/members`へ`entry=ticket&coupon={所持券ID}&offer={200|500|1000}`を付ける。UTMは`source=line / medium=social / campaign=point_exchange / content=pointcard_ticket_200|500|1000`。クーポンコード/LINE UID/アクセストークンをURLに含めない。medium=socialはGA4のOrganic Social定義に合わせ、利用先をcontentで区別する。旧pointcard mediumでの過去記録は変更しない。

## 認証と遷移

1. Shopifyの入口で同一ブラウザー用PKCE verifierを作り、entry情報とともに既存の10分有効proofへ保持する。古いShopify購入セッションだけで、現在のポイントカード本人と推定しない。
2. 既存LIFFへ進み、Channel/有効期限を検証したLINE本人の同意を得る。LINE認証が有効なら資格情報の再入力は不要だが、同意確認は維持する。
3. 一度限りcodeと開始ブラウザーのproofを照合し、現在カートの購入セッションへ結ぶ。Shopifyログイン済みなら既存の双方向照合による継続連携、ゲストなら今回の注文用連携。ブラウザー/期限/既存アカウント競合時は拒否して再認証を案内する。
4. 初来店の空カートはGET時のtokenが保存後に変わるため、商品を追加せず一時属性`_agaruke_link_pending=1`でカートを保存してからconsumeする。最後に既存`_agaruke_purchase`へセッションを設定し、一時属性を消す。カート照合条件は緩めない。
5. チケットは本人のstatus応答に含まれる同一ID/金額/available/有効期限の券だけ、既存Ajax選択処理で適用。使用済み・期限切れ・別会員・発行途中では無条件にショップへ進まず説明する。旧Customer限定券には発行時Shopifyログインへの導線を出す。
6. リッチメニューでは既存クーポン選択を変更しない。両入口ともUTMを復元したショップトップへ進む。LINEトークンや認証codeはUTMへ入れない。

一般の会員/クーポンページ、通常のLINE連携、解除、500円一般券、ポイント発行/消費/付与の条件は維持する。チケット使用リンクの差替はNodeの所持券API応答で行うため、古いクライアントも次の一覧再取得で新URLを利用する。旧pendingの発行再開導線は維持する。

## 検査と費用

Node49 tests: 既存機能43件＋入口/同一ブラウザーproof/認証前の他会員セッション不採用/カート属性/本人券選択/不正・使用済み券拒否/rich menuの券維持/UTM復元を確認。型/build、JS構文検査を実行。匿名・空の隔離HTTPセッションで、空GET→属性保存時のtoken変更と、保存後のGET2回のtoken維持を確認。商品追加後の匿名テストは公開商品一覧の429で停止し、追加・注文は行っていない。

既存のstart/LINE認証/consume/statusをユーザー遷移ごとに実行する。新規scope/有料アプリ/定期Job/scan/instance増なし。Nodeの現行0.08CPU/256Mi/concurrency1/max1/min0とGoの構成を維持する。大幅な費用増を伴う構成変更なし。

参照: https://shopify.dev/docs/api/ajax/reference/cart 、 https://support.google.com/analytics/answer/9756891 、 https://developers.line.biz/en/reference/liff/


## 公開記録

- source master `895942bf87183dc372cca80597af3098420cc6bd`、Node revision `shopify-members-entry-895942b`、traffic100%。image digest `sha256:af3a51aec3bad6b8a98b02adc6248cb9113d26a2606bd88f56f5bac80b49d323`、Cloud Build `0c5c6acb-09dd-44ce-9046-155436018e02`。直前Node source7d4c2b0包含、clean/remote一致を候補作成・切替前に検査。既存env/secret/resources/concurrency/maxScale一致、Goは配信せず保持。
- Node49件、型検査/build、JS構文、差分検査成功。候補/公開先のCORS/Origin/Bearer/署名proxy/使用済み500円券照会/交換境界を確認。ERROR標本0。
- LIFF確認文言のPagesはActions `41289526140`（source895942b）成功。リッチメニュー実設定・LINE配信は行っていない。
- 実LINEとShopifyが既に継続連携済みのアカウントで、リッチメニューURL→LINE同意→トップへのUTM復元、4商品/5,120円/クーポン未選択を維持して購入100pt案内を確認。
- 実ポイントカードの既存200円券「使用する」→LINE同意→本人券照合→トップで適用中を確認。最終URLは`/?utm_source=line&utm_medium=social&utm_campaign=point_exchange&utm_content=pointcard_ticket_200`。カート4商品/4,920円/100pt案内を確認後、選択を解除し4商品/5,120円/未選択へ復元。LINE連携は保持。新規交換・発券・実注文・決済・ポイント消費は実施していない。
- 実アカウント確認はログイン済み分岐。新規ゲスト空カートはUnit/匿名HTTPのtoken安定化検査で確認し、ゲスト注文の実決済は行っていない。認証ブラウザーが変わる等でproofを照合できない場合は、既存の再認証案内へ停止する。
