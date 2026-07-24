"""Nexus Storage Manager - backend regression tests.

Note: pytest.ini forces -n 2 --dist loadscope which pins classes to workers.
Each class is self-contained: creates its own resources and cleans up.
"""
import os
import time
import uuid
import requests
import pytest

BASE_URL = os.environ.get("REACT_APP_BACKEND_URL")
if not BASE_URL:
    from pathlib import Path
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


def _admin_token():
    r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
    assert r.status_code == 200
    return r.json()["access_token"]


def _admin_headers():
    return {"Authorization": f"Bearer {_admin_token()}"}


def _create_user(headers, email, password, role="user"):
    r = requests.post(f"{API}/users", json={"email": email, "password": password, "name": "TEST", "role": role}, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _create_s3_storage(headers, name):
    r = requests.post(f"{API}/storages", json={
        "name": name, "type": "s3",
        "config": {"bucket": "b", "region": "us-east-1", "access_key": "AK", "secret_key": "sekret"},
    }, headers=headers)
    assert r.status_code == 200, r.text
    return r.json()


def _login(email, password):
    r = requests.post(f"{API}/auth/login", json={"email": email, "password": password})
    assert r.status_code == 200, r.text
    return {"Authorization": f"Bearer {r.json()['access_token']}"}


def _cleanup_user(headers, uid):
    if uid:
        requests.delete(f"{API}/users/{uid}", headers=headers)


def _cleanup_storage(headers, sid):
    if sid:
        requests.delete(f"{API}/storages/{sid}", headers=headers)


# ============ AUTH ============
class TestAuth:
    def test_login_success(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": ADMIN_PASSWORD})
        assert r.status_code == 200
        d = r.json()
        assert "access_token" in d
        assert d["user"]["email"] == ADMIN_EMAIL
        assert d["user"]["role"] == "admin"

    def test_login_invalid_password(self):
        r = requests.post(f"{API}/auth/login", json={"email": ADMIN_EMAIL, "password": "wrong"})
        assert r.status_code == 401

    def test_login_bad_email(self):
        r = requests.post(f"{API}/auth/login", json={"email": "nope@example.com", "password": "x"})
        assert r.status_code == 401

    def test_me_requires_auth(self):
        r = requests.get(f"{API}/auth/me")
        assert r.status_code == 401

    def test_me_returns_user(self):
        h = _admin_headers()
        r = requests.get(f"{API}/auth/me", headers=h)
        assert r.status_code == 200
        assert r.json()["email"] == ADMIN_EMAIL
        assert r.json()["role"] == "admin"


# ============ DASHBOARD ============
class TestDashboard:
    def test_stats_admin(self):
        r = requests.get(f"{API}/dashboard/stats", headers=_admin_headers())
        assert r.status_code == 200
        d = r.json()
        for k in ("total_storages", "s3_count", "samba_count", "total_users", "admin_count"):
            assert k in d
            assert isinstance(d[k], int)
        assert d["admin_count"] >= 1

    def test_stats_requires_admin(self):
        r = requests.get(f"{API}/dashboard/stats")
        assert r.status_code == 401


# ============ USERS ============
class TestUsers:
    def test_list_users_requires_admin(self):
        r = requests.get(f"{API}/users")
        assert r.status_code == 401

    def test_user_crud_flow(self):
        h = _admin_headers()
        email = f"test_user_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        # CREATE
        u = _create_user(h, email, pw)
        assert u["email"] == email
        assert u["role"] == "user"
        assert "password_hash" not in u
        uid = u["id"]

        try:
            # LIST verifies persistence
            r = requests.get(f"{API}/users", headers=h)
            assert r.status_code == 200
            assert any(x["email"] == email for x in r.json())

            # DUPLICATE
            r = requests.post(f"{API}/users", json={"email": email, "password": "x", "name": "", "role": "user"}, headers=h)
            assert r.status_code == 400

            # Non-admin cannot create/list
            uh = _login(email, pw)
            r = requests.post(f"{API}/users", json={"email": "a@b.c", "password": "p", "name": "", "role": "user"}, headers=uh)
            assert r.status_code == 403
            r = requests.get(f"{API}/users", headers=uh)
            assert r.status_code == 403
        finally:
            _cleanup_user(h, uid)


# ============ STORAGES ============
class TestStorages:
    def test_non_admin_cannot_create_storage(self):
        h = _admin_headers()
        email = f"test_deny_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        try:
            uh = _login(email, pw)
            r = requests.post(f"{API}/storages", json={"name": "x", "type": "s3", "config": {}}, headers=uh)
            assert r.status_code == 403
        finally:
            _cleanup_user(h, u["id"])

    def test_s3_crud_and_no_secrets_returned(self):
        h = _admin_headers()
        name = f"TEST_s3_{uuid.uuid4().hex[:6]}"
        s = _create_s3_storage(h, name)
        sid = s["id"]
        try:
            assert s["type"] == "s3"
            assert s["config"]["bucket"] == "b"
            assert "secret_key" not in s["config"], "secret_key leaked in create response"

            # LIST does not include secret
            r = requests.get(f"{API}/storages", headers=h)
            assert r.status_code == 200
            for st in r.json():
                assert "secret_key" not in st["config"]
                assert "password" not in st["config"]

            # UPDATE with empty secret_key preserves existing
            r = requests.put(f"{API}/storages/{sid}", json={
                "name": name + "_updated", "type": "s3",
                "config": {"bucket": "b2", "region": "us-west-2", "access_key": "AK2", "secret_key": ""},
            }, headers=h)
            assert r.status_code == 200
            assert r.json()["name"] == name + "_updated"
            assert r.json()["config"]["bucket"] == "b2"
            assert "secret_key" not in r.json()["config"]
        finally:
            _cleanup_storage(h, sid)

    def test_samba_storage_no_password_returned(self):
        h = _admin_headers()
        name = f"TEST_samba_{uuid.uuid4().hex[:6]}"
        r = requests.post(f"{API}/storages", json={
            "name": name, "type": "samba",
            "config": {"host": "1.2.3.4", "share": "s", "username": "u", "password": "pw", "domain": ""},
        }, headers=h)
        assert r.status_code == 200
        sid = r.json()["id"]
        try:
            assert r.json()["type"] == "samba"
            assert "password" not in r.json()["config"]
        finally:
            _cleanup_storage(h, sid)

    def test_test_connection_graceful_failure(self):
        h = _admin_headers()
        r = requests.post(f"{API}/storages/test", json={
            "name": "t", "type": "s3",
            "config": {"bucket": "nope", "region": "us-east-1", "access_key": "AK", "secret_key": "sk"},
        }, headers=h)
        assert r.status_code == 200
        assert r.json()["success"] is False
        assert "message" in r.json()

    def test_reject_bad_type(self):
        h = _admin_headers()
        r = requests.post(f"{API}/storages", json={"name": "x", "type": "ftp", "config": {}}, headers=h)
        assert r.status_code == 400


# ============ ACCESS + PERMISSION ENFORCEMENT ============
class TestAccessAndPermissions:
    def test_full_permission_flow(self):
        h = _admin_headers()
        email = f"test_perm_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        uid = u["id"]
        s = _create_s3_storage(h, f"TEST_perm_{uuid.uuid4().hex[:6]}")
        sid = s["id"]
        try:
            uh = _login(email, pw)

            # No access -> empty list
            r = requests.get(f"{API}/storages", headers=uh)
            assert r.status_code == 200
            assert r.json() == []

            # No access -> 403 listing files
            r = requests.get(f"{API}/storages/{sid}/files", headers=uh)
            assert r.status_code == 403

            # Grant read
            r = requests.put(f"{API}/users/{uid}/access", json={
                "access": [{"storage_id": sid, "permission": "read"}]
            }, headers=h)
            assert r.status_code == 200
            assert len(r.json()["access"]) == 1
            assert r.json()["access"][0]["permission"] == "read"

            # Now user sees it
            r = requests.get(f"{API}/storages", headers=uh)
            assert r.status_code == 200
            got = r.json()
            assert len(got) == 1
            assert got[0]["id"] == sid
            assert got[0]["permission"] == "read"

            # Read-only user: upload/delete/mkdir -> 403
            files = {"file": ("f.txt", b"hi", "text/plain")}
            r = requests.post(f"{API}/storages/{sid}/files/upload", data={"path": ""}, files=files, headers=uh)
            assert r.status_code == 403

            r = requests.delete(f"{API}/storages/{sid}/files", params={"path": "x"}, headers=uh)
            assert r.status_code == 403

            r = requests.post(f"{API}/storages/{sid}/files/folder", json={"path": "", "name": "n"}, headers=uh)
            assert r.status_code == 403

            # Grant write
            r = requests.put(f"{API}/users/{uid}/access", json={
                "access": [{"storage_id": sid, "permission": "write"}]
            }, headers=h)
            assert r.status_code == 200
            r = requests.get(f"{API}/storages", headers=uh)
            assert r.json()[0]["permission"] == "write"

            # With write, upload/delete/mkdir won't return 403 (backend will attempt S3 with fake creds -> 400)
            r = requests.post(f"{API}/storages/{sid}/files/folder", json={"path": "", "name": "n"}, headers=uh)
            assert r.status_code == 400  # storage error, not permission

            # Revoke and confirm empty again
            r = requests.put(f"{API}/users/{uid}/access", json={"access": []}, headers=h)
            assert r.status_code == 200
            r = requests.get(f"{API}/storages", headers=uh)
            assert r.json() == []
        finally:
            _cleanup_storage(h, sid)
            _cleanup_user(h, uid)

    def test_delete_storage_cleans_access(self):
        h = _admin_headers()
        email = f"test_clean_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        uid = u["id"]
        s = _create_s3_storage(h, f"TEST_clean_{uuid.uuid4().hex[:6]}")
        sid = s["id"]
        try:
            requests.put(f"{API}/users/{uid}/access", json={
                "access": [{"storage_id": sid, "permission": "read"}]
            }, headers=h)
            # Delete storage
            r = requests.delete(f"{API}/storages/{sid}", headers=h)
            assert r.status_code == 200
            sid = None  # already deleted
            # User's access should be pulled
            r = requests.get(f"{API}/users", headers=h)
            u2 = next(x for x in r.json() if x["id"] == uid)
            assert u2["access"] == []
        finally:
            _cleanup_storage(h, sid)
            _cleanup_user(h, uid)



# ============ ACTIVITY LOGS ============
class TestLogs:
    def test_logs_requires_auth(self):
        r = requests.get(f"{API}/logs")
        assert r.status_code == 401

    def test_logs_admin_only(self):
        h = _admin_headers()
        email = f"test_logs_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        try:
            uh = _login(email, pw)
            r = requests.get(f"{API}/logs", headers=uh)
            assert r.status_code == 403
        finally:
            _cleanup_user(h, u["id"])

    def test_logs_admin_returns_array(self):
        h = _admin_headers()
        r = requests.get(f"{API}/logs", headers=h)
        assert r.status_code == 200
        data = r.json()
        assert isinstance(data, list)
        # Validate schema on any existing entries
        for entry in data:
            for k in ("id", "user_email", "action", "storage_name", "path", "timestamp"):
                assert k in entry, f"log entry missing key {k}: {entry}"
