import io
import time
from datetime import datetime, timezone

import boto3
from botocore.client import Config as BotoConfig
from botocore.exceptions import (
    EndpointConnectionError,
    ConnectionClosedError,
    ConnectTimeoutError,
    ReadTimeoutError,
)
import smbclient


class StorageError(Exception):
    pass


def _norm(path: str) -> str:
    return (path or "").strip("/")


def _looks_like_conn_error(exc: Exception) -> bool:
    name = exc.__class__.__name__.lower()
    keywords = ("connection", "timeout", "closed", "broken", "reset", "pipe", "transport", "negotiate", "unreachable")
    return any(k in name for k in keywords)


class S3Backend:
    CONN_ERRORS = (EndpointConnectionError, ConnectionClosedError, ConnectTimeoutError, ReadTimeoutError)

    def __init__(self, cfg: dict):
        self._cfg = cfg
        self.bucket = cfg["bucket"]
        self.reconnected = False
        self._build_client()

    def _build_client(self):
        cfg = self._cfg
        client_kwargs = dict(
            aws_access_key_id=cfg.get("access_key"),
            aws_secret_access_key=cfg.get("secret_key"),
            region_name=cfg.get("region") or "us-east-1",
        )
        common = dict(connect_timeout=10, read_timeout=20, retries={"max_attempts": 3, "mode": "standard"})
        if cfg.get("endpoint"):
            client_kwargs["endpoint_url"] = cfg["endpoint"]
            boto_config = BotoConfig(signature_version="s3v4", s3={"addressing_style": "path"}, **common)
        else:
            boto_config = BotoConfig(**common)
        client_kwargs["config"] = boto_config
        self.client = boto3.client("s3", **client_kwargs)

    def _attempt(self, fn, tries=3):
        last = None
        for i in range(tries):
            try:
                return fn()
            except self.CONN_ERRORS as e:
                last = e
                self.reconnected = True
                self._build_client()
                time.sleep(0.4 * (i + 1))
        raise last

    def test(self) -> bool:
        self._attempt(lambda: self.client.head_bucket(Bucket=self.bucket))
        return True

    def list(self, path: str):
        prefix = _norm(path)
        if prefix:
            prefix += "/"

        def op():
            resp = self.client.list_objects_v2(Bucket=self.bucket, Prefix=prefix, Delimiter="/")
            items = []
            for cp in resp.get("CommonPrefixes", []):
                full = cp["Prefix"].rstrip("/")
                name = full[len(prefix):] if prefix else full
                items.append({"name": name, "path": full, "is_dir": True, "size": 0, "modified": None})
            for obj in resp.get("Contents", []):
                key = obj["Key"]
                if key == prefix:
                    continue
                name = key[len(prefix):]
                if not name:
                    continue
                items.append({"name": name, "path": key, "is_dir": False, "size": obj["Size"], "modified": obj["LastModified"].isoformat()})
            return items

        return self._attempt(op)

    def upload(self, path: str, fileobj, filename: str):
        base = _norm(path)
        key = f"{base}/{filename}" if base else filename
        self._attempt(lambda: self.client.upload_fileobj(fileobj, self.bucket, key))
        return key

    def download(self, path: str):
        obj = self._attempt(lambda: self.client.get_object(Bucket=self.bucket, Key=_norm(path)))
        return obj["Body"], obj.get("ContentLength")

    def delete(self, path: str, is_dir: bool = False):
        key = _norm(path)
        if is_dir:
            prefix = key + "/"

            def op():
                paginator = self.client.get_paginator("list_objects_v2")
                for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                    objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
                    if objs:
                        self.client.delete_objects(Bucket=self.bucket, Delete={"Objects": objs})

            self._attempt(op)
        else:
            self._attempt(lambda: self.client.delete_object(Bucket=self.bucket, Key=key))

    def mkdir(self, path: str, name: str):
        base = _norm(path)
        key = f"{base}/{name}/" if base else f"{name}/"
        self._attempt(lambda: self.client.put_object(Bucket=self.bucket, Key=key))


class SambaBackend:
    def __init__(self, cfg: dict):
        raw_host = (cfg.get("host") or "").strip()
        # Be forgiving: accept "smb://host", "\\host", "//host", "host/share", "host:port".
        for prefix in ("smb://", "SMB://", "cifs://"):
            if raw_host.startswith(prefix):
                raw_host = raw_host[len(prefix):]
        raw_host = raw_host.strip("\\/").strip()
        # If a share path was included in the host, keep only the first segment as host.
        raw_host = raw_host.replace("\\", "/").split("/")[0].strip()

        port = cfg.get("port")
        # Split an embedded "host:port" (ignore IPv6 in brackets).
        if ":" in raw_host and not raw_host.startswith("["):
            h, _, p = raw_host.rpartition(":")
            if p.isdigit():
                raw_host = h
                if not port:
                    port = p

        self.server = raw_host
        self.share = (cfg.get("share") or "").strip().strip("\\/")
        self.username = cfg.get("username")
        self.password = cfg.get("password")
        self.domain = cfg.get("domain") or ""
        try:
            self.port = int(port or 445)
        except (TypeError, ValueError):
            self.port = 445
        self.reconnected = False

    def _full_user(self):
        return f"{self.domain}\\{self.username}" if self.domain else self.username

    def _register(self):
        smbclient.register_session(
            self.server, username=self._full_user(), password=self.password, port=self.port
        )

    def _unc(self, path: str) -> str:
        base = f"\\\\{self.server}\\{self.share}"
        p = _norm(path).replace("/", "\\")
        return f"{base}\\{p}" if p else base

    def _attempt(self, fn, tries=3):
        last = None
        for i in range(tries):
            try:
                if i > 0:
                    try:
                        smbclient.reset_connection_cache()
                    except Exception:
                        pass
                    self.reconnected = True
                self._register()
                return fn()
            except Exception as e:
                last = e
                if not _looks_like_conn_error(e):
                    raise
                time.sleep(0.4 * (i + 1))
        raise last

    def test(self) -> bool:
        self._attempt(lambda: smbclient.listdir(self._unc("")))
        return True

    def list(self, path: str):
        rel = _norm(path)

        def op():
            items = []
            for entry in smbclient.scandir(self._unc(path)):
                st = entry.stat()
                is_dir = entry.is_dir()
                full = f"{rel}/{entry.name}" if rel else entry.name
                items.append({
                    "name": entry.name,
                    "path": full,
                    "is_dir": is_dir,
                    "size": 0 if is_dir else st.st_size,
                    "modified": datetime.fromtimestamp(st.st_mtime, timezone.utc).isoformat(),
                })
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            return items

        return self._attempt(op)

    def upload(self, path: str, fileobj, filename: str):
        base = _norm(path)
        target = f"{base}/{filename}" if base else filename
        data = fileobj.read()

        def op():
            with smbclient.open_file(self._unc(target), mode="wb") as f:
                f.write(data)

        self._attempt(op)
        return target

    def download(self, path: str):
        def op():
            buf = io.BytesIO()
            with smbclient.open_file(self._unc(path), mode="rb") as f:
                buf.write(f.read())
            buf.seek(0)
            return buf

        buf = self._attempt(op)
        size = buf.getbuffer().nbytes
        return buf, size

    def delete(self, path: str, is_dir: bool = False):
        if is_dir:
            self._attempt(lambda: self._rmtree(path))
        else:
            self._attempt(lambda: smbclient.remove(self._unc(path)))

    def _rmtree(self, path: str):
        rel = _norm(path)
        for entry in smbclient.scandir(self._unc(path)):
            child = f"{rel}/{entry.name}" if rel else entry.name
            if entry.is_dir():
                self._rmtree(child)
            else:
                smbclient.remove(self._unc(child))
        smbclient.rmdir(self._unc(path))

    def mkdir(self, path: str, name: str):
        base = _norm(path)
        target = f"{base}/{name}" if base else name
        self._attempt(lambda: smbclient.mkdir(self._unc(target)))


def humanize_storage_error(exc: Exception) -> str:
    s = str(exc)
    low = s.lower()
    if any(k in low for k in ("name or service not known", "getaddrinfo", "nodename nor servname", "failed to connect")):
        if "timed out" not in low:
            return ("Host not found / unreachable. Check the IP or hostname "
                    "(each part must be 0-255, e.g. 192.168.2.8) and that the server is on.")
    if "timed out" in low or "timeout" in low:
        return "Connection timed out. Check the port (SMB uses 445) and firewall/network reachability."
    if "refused" in low:
        return "Connection refused. The port is closed on the server — SMB usually uses port 445."
    if any(k in low for k in ("logon_failure", "access_denied", "access is denied", "authentication", "credential", "password")):
        return "Authentication failed. Check the username, password and domain (often WORKGROUP)."
    if "bad_network_name" in low or ("share" in low and "not found" in low):
        return "Share not found. Check the share name (the shared folder name, not a sub-path)."
    if "nosuchbucket" in low or "does not exist" in low:
        return "Bucket/share not found. Check the name."
    if "signaturedoesnotmatch" in low or "invalidaccesskey" in low or "403" in low or "forbidden" in low:
        return "Access denied. Check the access key / secret (S3) or credentials."
    return s


def build_backend(storage_type: str, cfg: dict):
    if storage_type == "s3":
        return S3Backend(cfg)
    if storage_type == "samba":
        return SambaBackend(cfg)
    raise StorageError(f"Unknown storage type: {storage_type}")
