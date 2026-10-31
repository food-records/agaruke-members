# Dawn移行・トップ透明ヘッダー（2026-10-30）

ユーザー依頼で既存RiseからDawnへ切替。公式Shopify/dawn v16.0.0、commit `bc39a7d2024f1e5c14c42f855bd3552b4913e204`を固定。旧themeのコードをDawnへ上書きせず、設定/JSONテンプレート/section groupだけを引き継ぎ、Members管理patchを適用する。上流commit照合・非対応設定/section検出・先頭画像バナー確認を備えたローカル移行toolを追加。

現行の画像バナー/ロゴ/メニュー/色/font/商品/フッターと、LINE連携入口・署名付きproxy・連携済み案内非表示・5分cache/ちらつき対策・購入特典・テスト券自動適用/名称・checkout注記撤去を維持する。バックエンド/アプリ/顧客/注文/ポイント/クーポン台帳と試験modeは変更しない。

トップで実画像バナーが先頭にある時だけheaderをabsoluteで重ね、背景と罫線を透明化。スクロール復帰時のsticky headerやメニュー展開中は背景を戻す。その他のページはDawn標準headerを維持。

実ストアsnapshot/生成theme/上流checkout/画面証跡はGit外 `.runtime/shopify-dawn-20261030/`。既存Rise188803907757は切替後も保持してrollback可能にする。追加有料theme/Cloud Runリソース/定期jobなし。

事前検査: Node14件成功。Liquid14ファイル検査成功、theme check全体error0/warning9（上流の変数名/未使用/複雑度等）。Members管理asset/snippetの一致、トップ/フッター設定の一致、head内の状態初期化を照合。未公開previewと公開切替、公開後の表示確認を完了。

## 公開結果

配信元clean remote master `5a3fb589608992505879d918d21ebc971a8e9c34`（初回d0ce5d6、mobile切り抜き位置5a3fb58）。直前fetch/remote一致と既配信c1c9de9の包含を検査。Dawn `189911072941`を未公開作成しpreview確認後publish、role=liveを照合。Rise `188803907757`はrole=unpublishedで保持。公開直前にRise全体を再取得し、開始時snapshotから変更0を確認。Dawn350ファイルのreadbackがcandidateと一致（JSONはコメント等を除いた意味比較）、SHA256 manifestを保存。

公開後PCと390px幅の画像バナー/透明header、mobile menu開閉時の背景復帰・リンク表示、商品ページの購入特典とAdd to cart、公開カートの連携案内非表示・0pt/通常100pt・テスト券自動適用案内と名称/500円引き/合計3,100円を確認。初期化asset/snippetは既存コードと同一。現在のミートボール1/カレー2を維持、追加購入/注文確定/決済なし。previewを終了し通常URLでも確認、viewportを元へ戻しトップtabを成果として保持した。

mobileは既存ワイド画像のブランド文字を切らないよう左寄せ。トップの先頭画像がなくなればCSS条件が外れ通常headerへ戻る。その他のページは背景付きの通常header。PC/mobile/cartの個人情報や券コードが映らない画像を保護runtimeへ保存。

rollbackは保持したRise188803907757の再publish。バックエンド/API/アプリ版/checkout extension/試験mode/台帳は今回操作していない。支払い後のポイント付与とゲスト実注文など前回までの未完了結合試験は継続する。


## Companyの別タブ化（2026-10-31）

ユーザー指示でCompany（現行メニューURL http://food-records.com/）だけをtarget=_blank/rel=noopener noreferrerにする。https表記にも対応。トップ階層のCompanyリンクに限定し、Home/Itemなどの内部導線を維持。dropdown/mega/drawerの3snippetsをローカルpatch tool theme-company-link.pyで更新。取得テーマと生成物は保護runtime shopify-company-tab-20261031。

公開189917102253、clean remote master6b36d0aa655c0e031f1a97db925f4cbfea6ec9f9、直前配信60234c7包含guardを確認し3件のみ配信。Liquid3件成功（drawerのsection参照warningは既存）。日英の公開DOMでdesktop/drawerに属性があること、Home/Itemにないことを確認。英語ページのCompanyをクリックし、FOOD RECORDSの新しいタブが開いて元のshop/enが残ることを実確認。現行メニューはhttpで、最初のhttps限定条件では一致せず、公開検証で検出して最終条件へ修正。デザイン/日英編集欄/商品/LINE/カート/backend/台帳に変更なし。
