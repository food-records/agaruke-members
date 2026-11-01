import base64
import json
import os
import sqlite3
import tempfile
import unittest
from pathlib import Path
from unittest.mock import patch

import send


class FakeResponse:
    def raise_for_status(self):
        pass

    def json(self):
        return {"id": "gmail-123"}


class FakeSession:
    def __init__(self):
        self.calls = []

    def post(self, url, json, timeout):
        self.calls.append((url, json, timeout))
        return FakeResponse()


class SenderTest(unittest.TestCase):
    def setUp(self):
        self.tmp = tempfile.TemporaryDirectory()
        self.addCleanup(self.tmp.cleanup)
        self.root = Path(self.tmp.name) / "private"
        self.root.mkdir(mode=0o700)
        self.manifest = self.root / "messages.json"
        self.ledger = self.root / "ledger.sqlite3"
        self.item = {"id": "survey-row-06", "to": "person@example.com", "subject": "ご案内", "body": "700pt\nhttps://example.com/claim"}
        self.manifest.write_text(json.dumps({"from": send.FROM, "messages": [self.item]}))
        os.chmod(self.manifest, 0o600)

    def test_dry_run_never_sends(self):
        self.assertEqual(send.main(["--manifest", str(self.manifest), "--ledger", str(self.ledger)]), 0)
        self.assertEqual(sqlite3.connect(self.ledger).execute("SELECT COUNT(*) FROM sends").fetchone()[0], 0)

    def test_mime_and_duplicate_ledger(self):
        raw = base64.urlsafe_b64decode(send.raw_message(self.item))
        self.assertIn(b"agaruke@food-records.com", raw)
        self.assertIn(b"person@example.com", raw)
        con = send.connect_ledger(self.ledger)
        con.execute("INSERT INTO sends VALUES (?,?,?,?,?)", (self.item["id"], send.fingerprint(self.item), "sent", "gmail-123", "now"))
        con.commit()
        con.close()
        self.assertEqual(send.main(["--manifest", str(self.manifest), "--ledger", str(self.ledger)]), 0)
        self.item["body"] = "changed"
        self.manifest.write_text(json.dumps({"from": send.FROM, "messages": [self.item]}))
        with self.assertRaises(ValueError):
            send.main(["--manifest", str(self.manifest), "--ledger", str(self.ledger)])

    def test_api_payload(self):
        session = FakeSession()
        self.assertEqual(send.send_one(session, self.item), "gmail-123")
        self.assertEqual(len(session.calls), 1)
        self.assertEqual(session.calls[0][2], 30)

    def test_insecure_manifest_rejected(self):
        os.chmod(self.manifest, 0o644)
        with self.assertRaises(ValueError):
            send.load_manifest(self.manifest)


if __name__ == "__main__":
    unittest.main()
