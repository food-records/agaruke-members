#!/usr/bin/env python3
"""Send reviewed, one-recipient messages with Gmail API and a local send ledger."""
import argparse
import base64
import hashlib
import json
import os
import re
import sqlite3
import sys
from datetime import datetime, timezone
from email.message import EmailMessage
from pathlib import Path

FROM = "agaruke@food-records.com"
SCOPE = "https://www.googleapis.com/auth/gmail.send"
EMAIL = re.compile(r"^[^\s@<>]+@[^\s@<>]+\.[^\s@<>]+$")


def secure_file(path, required=True):
    if not path.exists():
        if required:
            raise ValueError(f"File not found: {path}")
        return
    if not path.is_file() or path.is_symlink() or path.stat().st_mode & 0o077:
        raise ValueError(f"Expected private regular file (mode 0600): {path}")


def load_manifest(path):
    secure_file(path)
    doc = json.loads(path.read_text(encoding="utf-8"))
    if doc.get("from") != FROM or not isinstance(doc.get("messages"), list) or not doc["messages"]:
        raise ValueError("Manifest must specify the verified From address and messages")
    ids = set()
    recipients = set()
    for item in doc["messages"]:
        if not isinstance(item, dict) or set(item) != {"id", "to", "subject", "body"}:
            raise ValueError("Each message needs only id, to, subject, body")
        ident, to, subject, body = (item[k] for k in ("id", "to", "subject", "body"))
        if not all(isinstance(x, str) for x in (ident, to, subject, body)):
            raise ValueError("Message fields must be strings")
        if not re.fullmatch(r"[A-Za-z0-9][A-Za-z0-9_-]{1,99}", ident):
            raise ValueError("Invalid message id")
        if not EMAIL.fullmatch(to) or "\r" in subject or "\n" in subject or not subject.strip() or not body.strip():
            raise ValueError(f"Invalid recipient or content for {ident}")
        if ident in ids or to.lower() in recipients:
            raise ValueError("Duplicate message id or recipient")
        ids.add(ident)
        recipients.add(to.lower())
    return doc


def raw_message(item):
    msg = EmailMessage()
    msg["From"] = f"AGARUKE <{FROM}>"
    msg["To"] = item["to"]
    msg["Subject"] = item["subject"]
    msg.set_content(item["body"].rstrip("\n") + "\n", charset="utf-8")
    return base64.urlsafe_b64encode(msg.as_bytes()).decode("ascii")


def fingerprint(item):
    return hashlib.sha256(json.dumps(item, ensure_ascii=False, sort_keys=True).encode("utf-8")).hexdigest()


def connect_ledger(path):
    if path.is_symlink():
        raise ValueError("Ledger cannot be a symlink")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.stat().st_mode & 0o077:
        raise ValueError("Ledger directory must be private (mode 0700)")
    secure_file(path, required=False)
    con = sqlite3.connect(path)
    os.chmod(path, 0o600)
    con.execute("CREATE TABLE IF NOT EXISTS sends (id TEXT PRIMARY KEY, fingerprint TEXT NOT NULL, status TEXT NOT NULL, gmail_id TEXT, updated_at TEXT NOT NULL)")
    con.commit()
    return con


def credentials(path, client_path):
    from google.auth.transport.requests import Request
    from google.oauth2.credentials import Credentials
    secure_file(path, required=False)
    if path.exists():
        creds = Credentials.from_authorized_user_file(str(path), [SCOPE])
        if SCOPE not in creds.scopes:
            raise ValueError("Token lacks gmail.send scope")
        if creds.expired and creds.refresh_token:
            creds.refresh(Request())
    else:
        from google_auth_oauthlib.flow import InstalledAppFlow
        secure_file(client_path)
        creds = InstalledAppFlow.from_client_secrets_file(str(client_path), [SCOPE]).run_local_server(port=0)
    if not creds.valid:
        raise ValueError("Gmail authorization is invalid")
    path.parent.mkdir(mode=0o700, parents=True, exist_ok=True)
    if path.parent.stat().st_mode & 0o077:
        raise ValueError("Token directory must be private (mode 0700)")
    tmp = path.with_name(path.name + ".tmp")
    fd = os.open(tmp, os.O_WRONLY | os.O_CREAT | os.O_EXCL, 0o600)
    with os.fdopen(fd, "w", encoding="utf-8") as out:
        out.write(creds.to_json())
    os.replace(tmp, path)
    return creds


def send_one(session, item):
    response = session.post("https://gmail.googleapis.com/gmail/v1/users/me/messages/send", json={"raw": raw_message(item)}, timeout=30)
    response.raise_for_status()
    data = response.json()
    if not isinstance(data.get("id"), str) or not data["id"]:
        raise ValueError("Gmail response has no message id; delivery outcome is uncertain")
    return data["id"]


def main(argv=None):
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--manifest", type=Path, required=True)
    parser.add_argument("--ledger", type=Path, required=True)
    parser.add_argument("--token", type=Path)
    parser.add_argument("--client-secret", type=Path)
    parser.add_argument("--send", action="store_true", help="Actually send messages; default is validation only")
    args = parser.parse_args(argv)
    doc = load_manifest(args.manifest)
    con = connect_ledger(args.ledger)
    try:
        for item in doc["messages"]:
            fp = fingerprint(item)
            row = con.execute("SELECT fingerprint, status FROM sends WHERE id=?", (item["id"],)).fetchone()
            if row and row[0] != fp:
                raise ValueError(f"Message {item['id']} differs from ledger; use a new id after review")
            if row and row[1] == "uncertain":
                raise ValueError(f"Message {item['id']} has uncertain delivery; reconcile in Gmail before retry")
        if not args.send:
            print(f"Validated {len(doc['messages'])} messages; no email sent")
            return 0
        if not args.token or not args.client_secret:
            raise ValueError("--token and --client-secret are required for --send")
        from google.auth.transport.requests import AuthorizedSession
        session = AuthorizedSession(credentials(args.token, args.client_secret))
        for item in doc["messages"]:
            ident = item["id"]
            fp = fingerprint(item)
            row = con.execute("SELECT status FROM sends WHERE id=?", (ident,)).fetchone()
            if row and row[0] == "sent":
                print(f"{ident}: already sent; skipped")
                continue
            now = datetime.now(timezone.utc).isoformat()
            con.execute("INSERT INTO sends (id,fingerprint,status,updated_at) VALUES (?,?,?,?)", (ident, fp, "uncertain", now))
            con.commit()
            try:
                gmail_id = send_one(session, item)
            except Exception:
                print(f"{ident}: delivery uncertain; inspect Gmail Sent before any retry", file=sys.stderr)
                raise
            con.execute("UPDATE sends SET status='sent', gmail_id=?, updated_at=? WHERE id=?", (gmail_id, datetime.now(timezone.utc).isoformat(), ident))
            con.commit()
            print(f"{ident}: sent; Gmail message id {gmail_id}")
        return 0
    finally:
        con.close()


if __name__ == "__main__":
    try:
        sys.exit(main())
    except Exception as exc:
        print(f"Error: {exc}", file=sys.stderr)
        sys.exit(1)
