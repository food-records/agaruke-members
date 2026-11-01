# AGARUKE SEO技術改善（2026-11-01）

## 対象

新しい商品情報を必要としないSEO改善。セットから単品3商品、単品からセットへのリンクはShopifyの商品説明だけを変更する。商品説明原本はGit外の/tmp/agaruke-seo-improvements-20261101へ保全する。

テーマ対象はDawn 189917102253のsections/agaruke-home-content.liquidとsections/header.liquidのみ。画像の構図・CSS・商品条件・会員/クーポン/決済は維持する。

- 画像srcsetに650px（ABOUT/セット/CRAFT）と320px（単品カード）を追加。Moto G Power・低速4Gの計測で表示に必要な約644pxに対し750pxを取得していた箇所を、解像度不足にせず軽量化する。
- Organization.sameAsから空のSNS設定を除外する。登録済みのURLと順序を保持し、複数/1件/0件でもカンマが正しいJSONを生成する。
- JPEG固定化は、実ブラウザ相当のAcceptでは168638bytesのWebPに対し267580bytesのJPEGとなり逆効果のため採用しない。Shopifyの自動形式選択を維持する。

## 配信前確認

本番コードエディタから取得した2ファイルはorigin/master cb63fd3の原本とbyte一致。既配信性能版43179e9・トップセット版2baaeabはいずれもorigin/masterに包含。ソースは隔離worktreeで管理する。

Liquid検証：home-contentはテーマ文脈で成功。headerのテーマ全体検査は疎な管理コピーにDawn標準依存ファイル・翻訳がないため失敗し、変更したheader全文をstatelessで再検証して成功。アプリ既存Node53件成功（Node22、既存依存を参照）。

初回PageSpeed（2026-11-01 20:51 JST）：mobile performance65 / accessibility96 / best-practices100 / SEO100、FCP1.9s、LCP17.7s、TBT10ms、CLS0、SI9.7s。実ユーザーデータなし。URL：https://pagespeed.web.dev/analysis/https-shop-agaruke-com/olgky84d7w?form_factor=mobile 。単発ラボ値で、改善の因果や実環境速度の保証とは区別する。

Schema.orgでセットのOrganization/Productを取得し、エラー0・警告0。Google Rich Results TestはreCAPTCHAサービスに接続できず未完了。送料・返品の構造化データは、新たな到着日数や返品条件を作らない。既存のProduct出力は置換・重複追加しない。

## 本番反映

source 56f7766633aaac29f44873a7d4fa9815dc068687をorigin/masterへpushしSHA一致・cleanを確認後、原本一致を照合して2ファイルだけをブラウザコードエディタで保存。保存前に編集全文がcandidateと一致することをclipboardで確認し、公開HTMLで650/320px候補・空値のないsameAsを確認した。公開900px表示と商品リンクを確認。保存後のコードエディタ再読込が完了せず、再読込後の全文readbackは未実施。viewport指定がChromeに反映されず独立390px実表示は未完了。

再計測21:00 JST：mobile62 / accessibility96 / best100 / SEO100、FCP2.0s、LCP17.6s、TBT210ms、CLS0、SI9.1s。https://pagespeed.web.dev/analysis/https-shop-agaruke-com/005niev6o8?form_factor=mobile 。明確な速度改善は確認できず、LCPは継続課題。Google検証の接続不可と390px検証制約を未完了として残す。

商品4ページの相互リンクも公開確認済み。Merchant Centerは無料アカウント作成まで完了、住所/配送/返品の新情報と商品連携は保留。詳細正本は共有workspaceのAGARUKE SEO監査記録。注文/決済/会員機能やその他テーマファイルは変更しない。
