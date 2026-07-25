"""Tests for iteration 16 features: usage metrics, cross-storage transfer, shareable links."""
import os
import io
import uuid
import requests
import pytest
from pathlib import Path

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    env_path = Path("/app/frontend/.env")
    if env_path.exists():
        for line in env_path.read_text().splitlines():
            if line.startswith("REACT_APP_BACKEND_URL="):
                BASE_URL = line.split("=", 1)[1].strip()
                break
BASE_URL = BASE_URL.rstrip("/")
API = f"{BASE_URL}/api"

ADMIN_EMAIL = "admin@example.com"
ADMIN_PASSWORD = "admin123"

SFTP_CFG = {"host": "127.0.0.1", "port": 2222, "username": "sftptest", "password": "testpass123", "base_path": ""}


def _admin_h():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _make_sftp(h, name, base=""):
    cfg = dict(SFTP_CFG, base_path=base)
    r = requests.post(f"{API}/storages", json={"name": name, "type": "sftp", "config": cfg}, headers=h)
    assert r.status_code == 200, r.text
    return r.json()["id"]


def _rm_storage(h, sid):
    if sid:
        requests.delete(f"{API}/storages/{sid}", headers=h)


class TestUsage:
    def test_usage_endpoint_returns_metrics(self):
        h = _admin_h()
        sid = _make_sftp(h, f"TEST_usage_{uuid.uuid4().hex[:6]}")
        try:
            r = requests.get(f"{API}/storages/{sid}/usage?refresh=true", headers=h)
            assert r.status_code == 200, r.text
            d = r.json()
            assert "total_size" in d
            assert "file_count" in d
            assert "folder_count" in d
            assert isinstance(d["total_size"], int)
            assert isinstance(d["file_count"], int)
        finally:
            _rm_storage(h, sid)

    def test_usage_persists_in_storage_doc(self):
        h = _admin_h()
        sid = _make_sftp(h, f"TEST_usage2_{uuid.uuid4().hex[:6]}")
        try:
            requests.get(f"{API}/storages/{sid}/usage?refresh=true", headers=h)
            # storage_public should include usage
            g = requests.get(f"{API}/storages", headers=h).json()
            row = next(x for x in g if x["id"] == sid)
            assert row.get("usage") is not None
            assert "total_size" in row["usage"]
        finally:
            _rm_storage(h, sid)

    def test_dashboard_stats_has_new_fields(self):
        h = _admin_h()
        r = requests.get(f"{API}/dashboard/stats", headers=h)
        assert r.status_code == 200
        d = r.json()
        assert "total_used_bytes" in d
        assert "share_count" in d
        assert isinstance(d["total_used_bytes"], int)
        assert isinstance(d["share_count"], int)


class TestTransfer:
    def test_cross_storage_copy(self):
        h = _admin_h()
        src = _make_sftp(h, f"TEST_tsrc_{uuid.uuid4().hex[:6]}")
        dst = _make_sftp(h, f"TEST_tdst_{uuid.uuid4().hex[:6]}", base="upload")
        try:
            # upload a test file to src root
            fname = f"xfer_{uuid.uuid4().hex[:6]}.txt"
            files = {"file": (fname, b"hello world", "text/plain")}
            r = requests.post(f"{API}/storages/{src}/files/upload", data={"path": ""}, files=files, headers=h)
            assert r.status_code == 200, r.text

            # copy to dst
            r = requests.post(f"{API}/storages/{src}/files/transfer", json={
                "dest_storage_id": dst, "src": fname, "dst": fname, "is_dir": False, "move": False,
            }, headers=h)
            assert r.status_code == 200, r.text

            # verify in dst root
            r = requests.get(f"{API}/storages/{dst}/files", headers=h)
            assert r.status_code == 200
            names = [i["name"] for i in r.json()["items"]]
            assert fname in names

            # source still has it
            r = requests.get(f"{API}/storages/{src}/files", headers=h)
            names_src = [i["name"] for i in r.json()["items"]]
            assert fname in names_src

            # cleanup files
            requests.delete(f"{API}/storages/{src}/files", params={"path": fname}, headers=h)
            requests.delete(f"{API}/storages/{dst}/files", params={"path": fname}, headers=h)
        finally:
            _rm_storage(h, src)
            _rm_storage(h, dst)

    def test_cross_storage_move(self):
        h = _admin_h()
        src = _make_sftp(h, f"TEST_msrc_{uuid.uuid4().hex[:6]}")
        dst = _make_sftp(h, f"TEST_mdst_{uuid.uuid4().hex[:6]}", base="upload")
        try:
            fname = f"mv_{uuid.uuid4().hex[:6]}.txt"
            files = {"file": (fname, b"movedata", "text/plain")}
            requests.post(f"{API}/storages/{src}/files/upload", data={"path": ""}, files=files, headers=h)

            r = requests.post(f"{API}/storages/{src}/files/transfer", json={
                "dest_storage_id": dst, "src": fname, "dst": fname, "is_dir": False, "move": True,
            }, headers=h)
            assert r.status_code == 200, r.text

            r = requests.get(f"{API}/storages/{dst}/files", headers=h)
            assert fname in [i["name"] for i in r.json()["items"]]
            r = requests.get(f"{API}/storages/{src}/files", headers=h)
            assert fname not in [i["name"] for i in r.json()["items"]]

            requests.delete(f"{API}/storages/{dst}/files", params={"path": fname}, headers=h)
        finally:
            _rm_storage(h, src)
            _rm_storage(h, dst)

    def test_transfer_same_storage_rejected(self):
        h = _admin_h()
        sid = _make_sftp(h, f"TEST_sameself_{uuid.uuid4().hex[:6]}")
        try:
            r = requests.post(f"{API}/storages/{sid}/files/transfer", json={
                "dest_storage_id": sid, "src": "a", "dst": "b", "is_dir": False, "move": False,
            }, headers=h)
            assert r.status_code == 400
        finally:
            _rm_storage(h, sid)


class TestShare:
    def test_share_create_list_delete_and_public_download(self):
        h = _admin_h()
        sid = _make_sftp(h, f"TEST_share_{uuid.uuid4().hex[:6]}")
        try:
            fname = f"share_{uuid.uuid4().hex[:6]}.txt"
            content = b"share-me-contents"
            requests.post(f"{API}/storages/{sid}/files/upload", data={"path": ""},
                          files={"file": (fname, content, "text/plain")}, headers=h)

            # create share with password
            r = requests.post(f"{API}/storages/{sid}/files/share", json={
                "path": fname, "expires_days": 7, "password": "p123",
            }, headers=h)
            assert r.status_code == 200, r.text
            share = r.json()
            token = share["token"]
            share_id = share["id"]
            assert share["requires_password"] is True
            assert share["name"] == fname

            # list
            r = requests.get(f"{API}/shares", headers=h)
            assert r.status_code == 200
            assert any(s["token"] == token for s in r.json())

            # public info (no auth)
            r = requests.get(f"{API}/share/{token}")
            assert r.status_code == 200
            assert r.json()["requires_password"] is True
            assert r.json()["name"] == fname

            # download w/o password -> 401
            r = requests.get(f"{API}/share/{token}/download")
            assert r.status_code == 401

            # wrong password -> 401
            r = requests.get(f"{API}/share/{token}/download", params={"password": "wrong"})
            assert r.status_code == 401

            # correct password -> 200 and content
            r = requests.get(f"{API}/share/{token}/download", params={"password": "p123"})
            assert r.status_code == 200
            assert r.content == content

            # delete share
            r = requests.delete(f"{API}/shares/{share_id}", headers=h)
            assert r.status_code == 200
            # public info -> 404
            r = requests.get(f"{API}/share/{token}")
            assert r.status_code == 404

            requests.delete(f"{API}/storages/{sid}/files", params={"path": fname}, headers=h)
        finally:
            _rm_storage(h, sid)

    def test_share_no_password_direct_download(self):
        h = _admin_h()
        sid = _make_sftp(h, f"TEST_shnp_{uuid.uuid4().hex[:6]}")
        try:
            fname = f"shnp_{uuid.uuid4().hex[:6]}.txt"
            content = b"open-share"
            requests.post(f"{API}/storages/{sid}/files/upload", data={"path": ""},
                          files={"file": (fname, content, "text/plain")}, headers=h)
            r = requests.post(f"{API}/storages/{sid}/files/share", json={
                "path": fname, "expires_days": 0, "password": None,
            }, headers=h)
            assert r.status_code == 200
            token = r.json()["token"]
            assert r.json()["requires_password"] is False
            # public info
            r = requests.get(f"{API}/share/{token}")
            assert r.status_code == 200
            assert r.json()["requires_password"] is False
            # download directly (no password)
            r = requests.get(f"{API}/share/{token}/download")
            assert r.status_code == 200
            assert r.content == content
            # cleanup share
            requests.delete(f"{API}/shares/{r.json().get('id', '')}", headers=h) if False else None
            requests.delete(f"{API}/storages/{sid}/files", params={"path": fname}, headers=h)
        finally:
            _rm_storage(h, sid)

    def test_share_public_endpoints_no_auth(self):
        # unknown token
        r = requests.get(f"{API}/share/nonexistent-token-xxxx")
        assert r.status_code == 404
        r = requests.get(f"{API}/share/nonexistent-token-xxxx/download")
        assert r.status_code == 404
