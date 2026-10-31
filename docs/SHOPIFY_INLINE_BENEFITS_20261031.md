# 商品・カート共通特典UIと購入ポイント開始（2026-10-31）

ユーザー依頼: 商品/カートの特典表示を統一し、その場で券選択、購入ポイントも有効化。

既存のカード設置位置は維持し、共通renderer/stylesheetで「お買い物の特典」→購入pt→現在のクーポン/実適用状態→折りたたみ券一覧→任意LINE/会員ページの順に統一する。一般500円券はLINEなしで期限まで選択可能。利用条件/1人1回はShopify nativeの判定が正本。LINE連携済み本人のavailable券は既存の認証済storefront_status応答から必要な表示項目とcodeだけを渡し、UID/顧客ID/会員番号は渡さない。codeはメモリだけに置き、表示cacheへ保存しない。クリック時のみ再照合、poll/定期jobなし。選択・解除は既存Ajax API、カートでは値引き合計更新のため同ページを再読込。追加ポイント交換は会員ページで行い、選択ではポイントを消費しない。日英ラベル、スマホ、section差替えに対応。

購入ptは既存SHOPIFY_LINK_TEST_ONLY=falseへ変更し、paid/使用済み券同期/取消・全額返金処理を開始する。1注文100pt、購入前LINE購入セッション必須、支払確定/JPY/正額/実注文のみ、再送・並行・連携付替えによる重複付与は注文台帳で抑止。ゲスト購入も事前LINE認証すれば対象。未連携購入後の案内は任意で、過去購入への遡及付与なし。一部返金は100pt維持、全額返金/取消は一度取消。

既存Cloud Run/Firestore/同一リソース構成を維持。新service/スキャン/定期Job/権限なし。既存イベント処理と操作時の本人限定照会のみで、大幅な課金増につながる構成変更なし。LINE配信・実注文作成/決済なし。

検査: Node24件/型/build、隔離Firestore Emulator全Go package race（注文/クーポン/返金/ゲスト/継続連携）、theme4ファイルschema成功。公開結果は後記。

## 公開結果

実装f98c5b0、配信元c6f070816170b5722523bf9fcd4533dfea057ef8をmaster/origin一致・clean・直前公開6807ab8包含で確認。Cloud Build 78df00f8-6674-4dca-836c-1a48bfb65fcd成功、image sha256:a4c48a7b9ede7c4eb0bcb90a286c8d10bf9fee5e1d9a568cd64a665debc4ddfd。Cloud Run shopify-members-benefits-c6f0708へ100% traffic、git-shaラベル一致。SHOPIFY_MEMBERS_ENABLED=true / SHOPIFY_LINK_TEST_ONLY=false / SHOPIFY_COUPON_EXCHANGE_ENABLED=trueを確認。CPU0.08/256Mi/concurrency1/max1/min0維持。Members API pricing-cc6cc7bはsource差分なしのため再配信不要。アプリextension/権限/バージョン変更なし。

候補・公開の架空未連携Customer status200/live modefalse/交換有効、未連携交換400。公開revision ERROR標本0。過去注文の再送や付与の遡及は行っていない。

Dawn189917102253の対象4ファイルのみ公開しreadback byte一致。最終確認メッセージを位置に依存しない文言へ補正したtheme source6cc081fもorigin/clean/ancestor照合・Liquid再検証後に新JSだけ公開。

実ブラウザーで商品/カートの共通カード、券一覧、500円券への切替、解除、200円交換券への復元を確認。カート合計5,120→4,620→5,120→4,920円。追加交換/ポイント消費なし、残高800ptと元の200円券選択を保持。スマホ390pxで両画面のoverflowなし、支払い完了後100ptの表示を確認。証跡は共有workspace Git外.runtime/shopify-benefits-20261031/cart-mobile.png、product-mobile.png。実注文/決済は行っていないため、本番支払い後の実残高増加は未検証。付与/重複/返金動作は隔離Emulatorで検証済み。

Secretary記録先orderec、Driveイベント公開未承認保留。.work追加/削除なし。
