# ECセット価格・交換条件・冷凍送料（2026-10-31）

ユーザー指示により3種セット3,980円（通常4,040円）、200pt券の最低額を税込商品合計3,800円、関東近郊送料990円と地域加算を確定。現行仕様はSHOPIFY_DIRECT_ENTRY.md。

API ecTiersとbackend購入画面を3,800円へ変更。交換停止の試験mode、既発行テスト券、本人連携/注文/ポイントの処理は維持する。

検証: Go全packageテスト/vet、Node14件、型検査・build成功。隔離Firestore Emulator/race検査と本番照合を継続中。

本番反映状況は追記する。Secretary記録先orderec、Driveイベント公開は未承認で保留。
