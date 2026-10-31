# トップデザイン確定・表示速度の簡易調査

2026-10-31、ユーザーがトップデザインfixを明示。今後の速度改善は見た目・既存のLINE/クーポン/ポイント/購入導線を維持して行う。今回の作業は読取調査と記録のみで、速度改善コードやインフラ変更・本番配信は実施しない。

## 確認した事実

公開ブラウザDOMと現行theme-entryを確認。トップはメイン1枚（eager/high）、下部6枚（lazy）。PCメインの表示URLはwidth2000、夜の写真width1600。CDNへブラウザ相当のAccept（AVIF/WebP等）でGETし、PCメインはWebP184,076 bytes、夜の写真96,346 bytes、スマホ用画像width390はWebP70,066 bytes、すべて200。元PNG約2MBをそのまま転送しているわけではない。これらは指定した画像バリアントの単発取得で、DPR/端末/選択srcsetによって容量は変わる。

HTMLへの簡易curlは429であったためHTML応答時間は性能評価へ採用しない。通常Chromeではページ表示を確認できており、429をサイト一般の障害とは断定しない。画像単発取得のTTFB/totalはブラウザのLCP/体感速度に置き換えない。Lighthouse、PageSpeed実機値やLCP/INP/CLSの実測は未実施。

現行coupon JSは各ページでcart.jsを取得する。members-statusは5分の表示キャッシュを使用するが、キャッシュなしの連携確認時に別途cart.js→署名付きproxyを呼ぶ。したがって初回/期限切れ等では同じカート読取が重なる余地がある。確認処理は非同期で、これだけでメイン画像の表示遅延原因と断定しない。バナー/特典の確認待ちと画面初回表示を分けて測る必要がある。

DOM上はDawn/Shopify標準と会員関連のJS/CSSが多数あるが、多くのJSはdefer/module/asyncであり、件数だけで描画阻害とは判定しない。全ページに読み込むbenefits UI等を、必要なページに限定する余地はある。メイン画像のeager/highと下部のlazyは既存の適切な設定として保持する。

## 推奨順

1. モバイルの初回/再訪でLCP・INP・CLS、商品遷移、会員/クーポン確認待ちを分けて計測する。
2. cart.jsの取得を同一画面内で共通化し、既存表示キャッシュを利用する。カート更新/券選択/解除時は無効化、購入前は最新の状態で照合する。
3. benefits UIなど画面で使わない処理/スタイルの読込を整理する。Shopify標準の決済/同意/計測機能は依存確認のうえ扱う。
4. 画像は配信実寸/srcsetの適正化を補助的に検討する。既にWebP化されており、画質を大きく落とす一括圧縮を優先しない。

追加課金を伴う最小稼働台数/CPU増加等は提案採否・費用見積が別途必要で、今回は行わない。元デザインの視覚回帰、連携/クーポン選択/解除/ポイント/購入前照合の回帰を、最適化実装時に確認する。証拠は保護runtime shopify-performance-review-20261031へ保持。

## 実行・変更前のPageSpeed測定

ユーザーが実行を明示承認。2026-10-31 19:45 JST、PageSpeed Insightsのモバイル（Moto G Power/低速4G/Lighthouse13.6.0/初回）でパフォーマンス64、FCP1.9s、LCP25.5s、TBT30ms、CLS0、Speed Index13.3s、総転送6,906KiB。実ユーザーのCrUXデータなし。単発のラボ値であり端末/回線/試行で変動する。変更前レポート https://pagespeed.web.dev/analysis/https-shop-agaruke-com/7gfhhnjzg6?form_factor=mobile 。

実測でNoto Sans Japaneseの400/700が合計4,187,024 bytesと判明。前回の画像だけの簡易調査では未確認だった主要な転送要因である。書体変更は行わず、Shopifyの同じ元フォントをsubset化する。よく使う1,064字を124,812/126,920 bytes（計251,732）へ分け、残り14,317字はunicode-rangeで必要な場合だけ元フォントを読む。全元glyphのcoverageを保持し、含まれる全glyphの輪郭と文字幅の一致をFontToolsで検査した。フォントがShopify側で更新された場合や設定変更時は元のfont_faceへ自動fallbackする。OFLを同梱、内部派生名AGARUKE Sans。通常の読み込み対象は約94%削減となるが、含まれない文字が表示されるページでは元フォントも必要となる。

## 軽量化実装

- layout/theme.liquidの原フォントpreload/faceを条件付きsubsetへ置換。公開layoutの他部分は保持する。
- 商品3件のsizesを実表示幅に合わせ、200/350/500/600/750/1000wを用意。ABOUTのスマホ余白を反映し、mobile heroに750wを追加。画像の構図・表示サイズ・元写真は変更しない。
- agaruke-cart.jsで同一画面内の読取を共通化。並行する同一世代の要求を一つにまとめ、通常表示だけ最長1秒のメモリ内snapshotを利用する。カート画面/強制再確認はfreshでsnapshotを使わず、更新/解除の前後・履歴復元・再表示・連携イベントで無効化。更新前に始まった古い要求は新しいcartを取り直す。失敗結果は保存しない。cart/トークン/券コードの永続保存を追加しない。APIの検証境界は変更なし。
- benefitsの操作UIはproduct/cartだけで読み込む。トップで不要な8,160bytes（非圧縮）のJSと初期化を除く。共通カートmoduleはversion付きURLを両利用元で統一する。

Node34件と型検査成功。並行読取2→1、fresh、更新と読取の競合、失敗後の再取得、クーポン選択/解除/会員状態/購入pt表示を回帰確認。Shopify Liquid/JS8件検査成功（layoutの既存scheme_classesとpreload表記のwarningあり）。バックエンド/課金構成/権限/定期処理は変更せず、テーマのみ反映する。ビルド用fonttools4.68.0/brotli1.2.1は保護runtime venvへ隔離。再生成はtools/build-font-subsets.pyとrequirementsを参照。元font hashを固定し、異なる元ファイルでは生成を止める。

## 本番反映・変更後の確認

本番テーマ189917102253へclean/push済みmasterの43179e9af086b5678a9f72e400fa4901eb08b37cから11ファイルを配信。直前の配信8186830と発送目安更新bf59383の包含、remote SHA一致をrelease_guardで検査。readback11ファイルは候補とbyte一致、templates/index.json/config/settings_data.jsonは配信直前と一致。既配信の発送目安3〜5日も保持。

2026-10-31 20:03 JSTの同条件PageSpeedはスコア70、FCP2.0s、LCP7.2s、TBT30ms、CLS0、Speed Index5.5s。変更前64/1.9s/25.5s/30ms/0/13.3s。LCP約72%短縮だが7.2sは改善余地が残る。単発ラボ測定で、実ユーザーの速度保証やINP評価ではない。変更後 https://pagespeed.web.dev/analysis/https-shop-agaruke-com/n0wwbwzci4?form_factor=mobile 。画像削減見込みは1,020KiB→188KiB。変更後の総転送量は採録していない。

公開トップのフォント・画像・ヘッダー/CTA、商品/カート特典表示、支払い完了後100pt表示を確認。所持200円券の選択でShopifyの合計5,120円→4,920円、解除と再選択を確認。商品数量は4のまま、注文/決済/ポイント交換は行わない。開始時の公開AGARUKE500選択へ戻したが、再検証では条件未達となる。既存の未購入者セグメント問題との照合が必要で、今回の速度改善では資格条件を変更しない。所持券と公開券の適用可否を混同しない。

証跡は保護runtime shopify-performance-20261031のpsi-before/after.txt/png、store-before/after.png、tests/typecheck/validate2.log、candidate/readback。Secretaryはagarukeのローカル承認待ちdraftへ記録し、Driveへ未公開。
