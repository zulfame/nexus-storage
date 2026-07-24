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

    def test_logs_admin_returns_paged_object(self):
        h = _admin_headers()
        r = requests.get(f"{API}/logs", headers=h)
        assert r.status_code == 200
        data = r.json()
        # New shape: {items, total, counts}
        assert isinstance(data, dict)
        assert "items" in data and isinstance(data["items"], list)
        assert "total" in data and isinstance(data["total"], int)
        assert "counts" in data and isinstance(data["counts"], dict)
        for k in ("all", "file", "conn", "reconnect"):
            assert k in data["counts"]
        # default limit 25
        assert len(data["items"]) <= 25
        for entry in data["items"]:
            for k in ("id", "user_email", "action", "storage_name", "path", "timestamp", "detail"):
                assert k in entry, f"log entry missing key {k}: {entry}"

    def test_logs_pagination_skip_limit(self):
        h = _admin_headers()
        r1 = requests.get(f"{API}/logs?skip=0&limit=5", headers=h)
        assert r1.status_code == 200
        d1 = r1.json()
        assert len(d1["items"]) <= 5
        if d1["total"] > 5:
            r2 = requests.get(f"{API}/logs?skip=5&limit=5", headers=h)
            assert r2.status_code == 200
            d2 = r2.json()
            ids1 = {i["id"] for i in d1["items"]}
            ids2 = {i["id"] for i in d2["items"]}
            assert ids1.isdisjoint(ids2), "pagination returned overlapping ids"

    def test_logs_category_filter(self):
        h = _admin_headers()
        r_all = requests.get(f"{API}/logs?category=all&limit=100", headers=h).json()
        r_file = requests.get(f"{API}/logs?category=file&limit=100", headers=h).json()
        r_conn = requests.get(f"{API}/logs?category=conn&limit=100", headers=h).json()
        # NOTE: totals can drift by a few because parallel workers insert logs between calls.
        # Instead validate that returned items respect the filter and totals sum ~== all total.
        assert abs((r_file["total"] + r_conn["total"]) - r_all["total"]) <= 5
        file_actions = {"upload", "delete", "delete_folder", "create_folder"}
        for it in r_file["items"]:
            assert it["action"] in file_actions
        for it in r_conn["items"]:
            assert it["action"] not in file_actions

    def test_delete_logs_by_date_range_no_op(self):
        """Delete with an old date range should not remove anything real."""
        h = _admin_headers()
        r = requests.delete(f"{API}/logs?start=2000-01-01&end=2000-01-02", headers=h)
        assert r.status_code == 200
        assert r.json().get("deleted") == 0

    def test_delete_logs_requires_admin(self):
        h = _admin_headers()
        email = f"test_dellog_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        try:
            uh = _login(email, pw)
            r = requests.delete(f"{API}/logs?start=2000-01-01&end=2000-01-02", headers=uh)
            assert r.status_code == 403
        finally:
            _cleanup_user(h, u["id"])


# ============ APP SETTINGS ============
class TestAppSettings:
    def test_get_settings_public(self):
        r = requests.get(f"{API}/settings")
        assert r.status_code == 200
        d = r.json()
        for k in ("app_name", "tagline", "meta_description", "favicon_url", "logo_url", "primary_color"):
            assert k in d

    def test_put_settings_requires_admin(self):
        r = requests.put(f"{API}/settings", json={"app_name": "X"})
        assert r.status_code == 401
        # non-admin
        h = _admin_headers()
        email = f"test_setu_{uuid.uuid4().hex[:8]}@example.com"
        pw = "pw12345"
        u = _create_user(h, email, pw)
        try:
            uh = _login(email, pw)
            r = requests.put(f"{API}/settings", json={"app_name": "X"}, headers=uh)
            assert r.status_code == 403
        finally:
            _cleanup_user(h, u["id"])

    def test_put_settings_persists_and_restores(self):
        h = _admin_headers()
        # snapshot current
        current = requests.get(f"{API}/settings").json()
        try:
            new_name = f"TEST_APP_{uuid.uuid4().hex[:6]}"
            payload = {
                "app_name": new_name,
                "tagline": "Test tagline",
                "meta_description": "Test meta",
                "favicon_url": "",
                "logo_url": "",
                "primary_color": "#ff0000",
            }
            r = requests.put(f"{API}/settings", json=payload, headers=h)
            assert r.status_code == 200
            assert r.json()["app_name"] == new_name
            # GET reflects update
            r2 = requests.get(f"{API}/settings")
            assert r2.json()["app_name"] == new_name
            assert r2.json()["primary_color"] == "#ff0000"
        finally:
            # restore defaults per test-plan instructions
            restore = {
                "app_name": "Nexus Storage Manager",
                "tagline": "All your storage, one clean workspace.",
                "meta_description": "Manage S3 and Samba storage from one workspace, with per-user access control.",
                "favicon_url": "",
                "logo_url": "",
                "primary_color": "#2563eb",
            }
            requests.put(f"{API}/settings", json=restore, headers=h)


# ============ CONNECTION LIFECYCLE + NON-BLOCKING ============
class TestConnectionLifecycleLogs:
    def test_storage_added_updated_deleted_and_conn_failed_logged(self):
        h = _admin_headers()
        name = f"TEST_lifecycle_{uuid.uuid4().hex[:6]}"
        # CREATE fake s3 -> should log storage_added
        s = _create_s3_storage(h, name)
        sid = s["id"]
        try:
            # UPDATE -> storage_updated
            r = requests.put(f"{API}/storages/{sid}", json={
                "name": name + "_v2", "type": "s3",
                "config": {"bucket": "b2", "region": "us-east-1", "access_key": "AK", "secret_key": ""},
            }, headers=h)
            assert r.status_code == 200

            # Trigger connection_failed via saved-test with fake creds
            t0 = time.time()
            r = requests.post(f"{API}/storages/{sid}/test", headers=h)
            elapsed = time.time() - t0
            assert r.status_code == 200
            body = r.json()
            assert body["success"] is False
            # Non-blocking check: immediately after test, root endpoint responds fast
            r2 = requests.get(f"{API}/", timeout=10)
            assert r2.status_code == 200

            # Fetch logs and verify presence
            r = requests.get(f"{API}/logs?limit=100", headers=h)
            assert r.status_code == 200
            logs = r.json()["items"]
            actions_for_sid = [l for l in logs if (l.get("storage_name") or "").startswith(name)]
            action_set = {l["action"] for l in actions_for_sid}
            assert "storage_added" in action_set, f"missing storage_added: {action_set}"
            assert "storage_updated" in action_set, f"missing storage_updated: {action_set}"
            assert "connection_failed" in action_set, f"missing connection_failed: {action_set}"
            # detail should be non-empty on connection_failed
            failed = [l for l in actions_for_sid if l["action"] == "connection_failed"]
            assert failed and failed[0].get("detail"), "connection_failed detail missing"
        finally:
            _cleanup_storage(h, sid)
        # After delete, verify storage_deleted logged
        r = requests.get(f"{API}/logs?limit=100", headers=h)
        logs = r.json()["items"]
        actions_for_sid = {l["action"] for l in logs if (l.get("storage_name") or "").startswith(name)}
        assert "storage_deleted" in actions_for_sid, f"missing storage_deleted: {actions_for_sid}"

    def test_no_spurious_reconnect_on_normal_list(self):
        """A failed list from bad creds should NOT create a reconnect log (since op raised)."""
        h = _admin_headers()
        # Snapshot reconnect count
        r = requests.get(f"{API}/logs?limit=100", headers=h)
        before = sum(1 for l in r.json()["items"] if l["action"] == "reconnect")
        # Create fake storage, list files (will fail with 400), ensure no reconnect log added
        s = _create_s3_storage(h, f"TEST_norec_{uuid.uuid4().hex[:6]}")
        sid = s["id"]
        try:
            requests.get(f"{API}/storages/{sid}/files", headers=h)
            r = requests.get(f"{API}/logs?limit=100", headers=h)
            after = sum(1 for l in r.json()["items"] if l["action"] == "reconnect")
            assert after == before, "spurious reconnect log created on failing op"
        finally:
            _cleanup_storage(h, sid)


# ============ AUTO-RECONNECT CODE REVIEW ============
class TestReconnectMechanism:
    def test_storage_backends_has_reconnect_wrapper(self):
        src = open("/app/backend/storage_backends.py").read()
        # S3
        assert "class S3Backend" in src
        assert "_build_client" in src
        assert "_attempt" in src
        assert "self.reconnected = True" in src
        assert "CONN_ERRORS" in src
        # Samba
        assert "class SambaBackend" in src
        assert "reset_connection_cache" in src
        # server.py wires reconnect logging
        srv = open("/app/backend/server.py").read()
        assert "_log_reconnect" in srv
        assert "run_in_threadpool" in srv
        assert 'action, "reconnect"' in srv or '"reconnect"' in srv
