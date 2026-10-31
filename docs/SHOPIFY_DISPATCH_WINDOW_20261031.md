# 発送目安の表示（2026-10-31）

ご入金確認後、通常3〜5日以内に発送します。お届け日は、地域や配送状況により異なります。

商品ページは購入ボタン前、カートは合計/購入手続き前、トップFAQは既存配送回答へ追記する。日英対応。3〜5日は暦日であり、到着日保証や3〜5営業日の設定ではない。配送日指定/自動到着予定/Shop Promise/送料設定は変更しない。土日祝を除く希望があれば営業日へ改訂する。既存shipping-policyは公開URL404で確認。今回は新規ポリシー全文の制定ではなく、購入前の発送目安表示。

再生成はtools/theme-dispatch-window.pyで取得済みテーマをローカル更新。商品/カートJSONにagaruke-shipping-noteを追加し、トップFAQと発送案内翻訳だけを変更。theme-entry/localesは追加キーのマージ元で、全localeファイルへ直接上書きしない。

## 遅延に関する公式情報の確認

- 確認したShopify公式資料では、発送が1件遅れるごとに機械的な罰金/点数ペナルティが付く規定は見つからない。ペナルティが一切ないという保証ではない。
- Shopifyは購入前の履行日程の明示と、注文変更/遅延時の顧客への連絡を求める。https://help.shopify.com/en/manual/compliance/legal/consumer-protection
- Shopify Paymentsは約束と実際の発送期間、顧客対応、チャージバック等をリスク評価する。高リスクと判断されると入金保留/遅延/準備金/決済機能停止等の可能性がある。https://help.shopify.com/en/manual/payments/shopify-payments/onboarding/acceptable-business-practices
- 日本のShopify Paymentsのチャージバック手数料は1,300円。紛争額が差し引かれ、異議申立てで勝った場合は手数料が返る。遅延そのものの自動罰金とは区別する。https://help.shopify.com/en/manual/payments/shopify-payments/supported-countries/japan/payouts
- Shop Promiseは米国ストア向けの別制度。今回有効化しない。https://help.shopify.com/en/manual/fulfillment/setup/shop-promise

通常3〜5日で処理できる運用を前提とする。5日を超える見込みが判明した時点で、理由と新しい発送目安を顧客へ連絡し、キャンセル/返金希望へ対応する運用を推奨。これは今回自動実装/配信する通知ではない。
