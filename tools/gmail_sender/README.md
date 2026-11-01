# AGARUKE Gmail API 個別送信

`sakuma@food-records.com`のGmailアカウントでOAuth認証し、確認済み送信元`AGARUKE <agaruke@food-records.com>`から個別送信する。Googleグループ自体の認証情報は使用しない。権限は`gmail.send`のみ。送信元は2026-11-01にGmail画面で追加・確認済み。

## 準備

1. Google Cloud ConsoleでDesktop型OAuthクライアントを作り、Gmail APIを有効化する。OAuth同意画面は組織内アプリに設定する。発行したクライアントJSONはGit管理外の権限制限付きディレクトリに`0600`で置く。
2. `python3 -m venv .venv`、`.venv/bin/pip install -r tools/gmail_sender/requirements.txt`を実行する。初回送信時にブラウザで`sakuma@food-records.com`として認証する。トークンもGit管理外に`0600`で保存する。
3. 送信マニフェストを次の形式でGit管理外に作る。`id`は配布ごと・宛先ごとに一意の公開可能な識別子にする。個別の受取リンクを本文に含める。ファイルは`0600`、格納ディレクトリは`0700`。

```json
{
  "from": "agaruke@food-records.com",
  "messages": [
    {"id": "campaign-row-06", "to": "recipient@example.com", "subject": "件名", "body": "本文と個別リンク"}
  ]
}
```

## 実行

```sh
python3 tools/gmail_sender/send.py \
  --manifest /private/path/messages.json \
  --ledger /private/path/sends.sqlite3

python3 tools/gmail_sender/send.py \
  --manifest /private/path/messages.json \
  --ledger /private/path/sends.sqlite3 \
  --client-secret /private/path/oauth-client.json \
  --token /private/path/gmail-token.json \
  --send
```

既定は検証のみ。`--send`を付けた場合だけGmail APIへ送る。1宛先ずつ送信し、成功時はGmail message IDを台帳へ記録して再送をスキップする。送信前に結果不明の状態を台帳へ保存するため、通信エラーや強制終了後の自動再試行はしない。Gmail送信済みを調べてから手動で台帳を修復する。マニフェスト・トークン・台帳・受取リンクはGitに入れない。

このCLIは手動実行専用。定期ジョブやCloud Runは追加しない。今回のアンケート配布では16行目の宛先が未確認のためマニフェストに含めない。回答者メール送信には個別の実行指示が必要。
