import io
import stat as stat_module
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
import paramiko


class StorageError(Exception):
    pass


def _norm(path: str) -> str:
    return (path or "").strip("/")


def _looks_like_conn_error(exc: Exception) -> bool:
    name = exc.__class__.__name__.lower()
    text = str(exc).lower()
    keywords = ("connection", "timeout", "closed", "broken", "reset", "pipe",
                "transport", "negotiate", "unreachable", "eof", "socket", "dropped")
    return any(k in name or k in text for k in keywords)


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

    def _copy_key(self, src: str, dst: str):
        self.client.copy_object(Bucket=self.bucket, CopySource={"Bucket": self.bucket, "Key": src}, Key=dst)

    def copy(self, src: str, dst: str, is_dir: bool = False):
        src = _norm(src)
        dst = _norm(dst)

        def op():
            if is_dir:
                sp = src + "/"
                dp = dst + "/"
                paginator = self.client.get_paginator("list_objects_v2")
                found = False
                for page in paginator.paginate(Bucket=self.bucket, Prefix=sp):
                    for o in page.get("Contents", []):
                        found = True
                        self._copy_key(o["Key"], dp + o["Key"][len(sp):])
                if not found:
                    self.client.put_object(Bucket=self.bucket, Key=dp)
            else:
                self._copy_key(src, dst)

        self._attempt(op)

    def move(self, src: str, dst: str, is_dir: bool = False):
        self.copy(src, dst, is_dir)
        self.delete(src, is_dir)

    def usage(self):
        def op():
            total = 0
            files = 0
            folders = 0
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket):
                for o in page.get("Contents", []):
                    if o["Key"].endswith("/"):
                        folders += 1
                    else:
                        total += o.get("Size", 0)
                        files += 1
            return {"total_size": total, "file_count": files, "folder_count": folders}

        return self._attempt(op)


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

    def move(self, src: str, dst: str, is_dir: bool = False):
        self._attempt(lambda: smbclient.rename(self._unc(src), self._unc(dst)))

    def _copyfile(self, src: str, dst: str):
        with smbclient.open_file(self._unc(src), mode="rb") as f:
            data = f.read()
        with smbclient.open_file(self._unc(dst), mode="wb") as f:
            f.write(data)

    def _copytree(self, src: str, dst: str):
        smbclient.mkdir(self._unc(dst))
        rel = _norm(src)
        reld = _norm(dst)
        for entry in smbclient.scandir(self._unc(src)):
            s = f"{rel}/{entry.name}" if rel else entry.name
            d = f"{reld}/{entry.name}" if reld else entry.name
            if entry.is_dir():
                self._copytree(s, d)
            else:
                self._copyfile(s, d)

    def copy(self, src: str, dst: str, is_dir: bool = False):
        if is_dir:
            self._attempt(lambda: self._copytree(src, dst))
        else:
            self._attempt(lambda: self._copyfile(src, dst))

    def usage(self):
        def walk(path):
            total = files = folders = 0
            rel = _norm(path)
            for entry in smbclient.scandir(self._unc(path)):
                child = f"{rel}/{entry.name}" if rel else entry.name
                if entry.is_dir():
                    folders += 1
                    t, f, d = walk(child)
                    total += t; files += f; folders += d
                else:
                    total += entry.stat().st_size
                    files += 1
            return total, files, folders

        def op():
            t, f, d = walk("")
            return {"total_size": t, "file_count": f, "folder_count": d}

        return self._attempt(op)


class SFTPBackend:
    def __init__(self, cfg: dict):
        raw_host = (cfg.get("host") or "").strip()
        for prefix in ("sftp://", "ssh://", "SFTP://", "SSH://"):
            if raw_host.startswith(prefix):
                raw_host = raw_host[len(prefix):]
        raw_host = raw_host.strip("\\/").strip().replace("\\", "/").split("/")[0].strip()

        port = cfg.get("port")
        if ":" in raw_host and not raw_host.startswith("["):
            h, _, p = raw_host.rpartition(":")
            if p.isdigit():
                raw_host = h
                if not port:
                    port = p

        self.host = raw_host
        try:
            self.port = int(port or 2222)
        except (TypeError, ValueError):
            self.port = 2222
        self.username = cfg.get("username")
        self.password = cfg.get("password")
        base_raw = (cfg.get("base_path") or "").strip()
        self._base_absolute = base_raw.startswith("/")
        self.base = base_raw.strip("/")
        self.reconnected = False
        self._client = None
        self._sftp = None

    def _connect(self):
        self._close()
        client = paramiko.SSHClient()
        client.set_missing_host_key_policy(paramiko.AutoAddPolicy())
        client.connect(
            hostname=self.host,
            port=self.port,
            username=self.username,
            password=self.password,
            timeout=15,
            banner_timeout=15,
            auth_timeout=15,
            look_for_keys=False,
            allow_agent=False,
        )
        self._client = client
        self._sftp = client.open_sftp()
        self._sftp.get_channel().settimeout(60)

    def _close(self):
        for obj in (self._sftp, self._client):
            try:
                if obj is not None:
                    obj.close()
            except Exception:
                pass
        self._sftp = None
        self._client = None

    def _remote(self, path: str) -> str:
        p = _norm(path)
        parts = [seg for seg in (self.base, p) if seg]
        joined = "/".join(parts)
        if self._base_absolute:
            return "/" + joined if joined else "/"
        return joined or "."

    def _attempt(self, fn, tries=3):
        last = None
        for i in range(tries):
            try:
                if self._sftp is None or i > 0:
                    if i > 0:
                        self.reconnected = True
                    self._connect()
                return fn()
            except Exception as e:
                last = e
                self._close()
                if not _looks_like_conn_error(e):
                    raise
                time.sleep(0.4 * (i + 1))
        raise last

    def test(self) -> bool:
        self._attempt(lambda: self._sftp.listdir(self._remote("")))
        return True

    def list(self, path: str):
        rel = _norm(path)

        def op():
            items = []
            for attr in self._sftp.listdir_attr(self._remote(path)):
                name = attr.filename
                if name in (".", ".."):
                    continue
                is_dir = stat_module.S_ISDIR(attr.st_mode)
                full = f"{rel}/{name}" if rel else name
                items.append({
                    "name": name,
                    "path": full,
                    "is_dir": is_dir,
                    "size": 0 if is_dir else (attr.st_size or 0),
                    "modified": datetime.fromtimestamp(attr.st_mtime, timezone.utc).isoformat() if attr.st_mtime else None,
                })
            items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
            return items

        return self._attempt(op)

    def upload(self, path: str, fileobj, filename: str):
        base = _norm(path)
        target = f"{base}/{filename}" if base else filename

        def op():
            try:
                fileobj.seek(0)
            except Exception:
                pass
            self._sftp.putfo(fileobj, self._remote(target))

        self._attempt(op)
        return target

    def download(self, path: str):
        def op():
            buf = io.BytesIO()
            self._sftp.getfo(self._remote(path), buf)
            buf.seek(0)
            return buf

        buf = self._attempt(op)
        return buf, buf.getbuffer().nbytes

    def delete(self, path: str, is_dir: bool = False):
        if is_dir:
            self._attempt(lambda: self._rmtree(path))
        else:
            self._attempt(lambda: self._sftp.remove(self._remote(path)))

    def _rmtree(self, path: str):
        rel = _norm(path)
        for attr in self._sftp.listdir_attr(self._remote(path)):
            name = attr.filename
            if name in (".", ".."):
                continue
            child = f"{rel}/{name}" if rel else name
            if stat_module.S_ISDIR(attr.st_mode):
                self._rmtree(child)
            else:
                self._sftp.remove(self._remote(child))
        self._sftp.rmdir(self._remote(path))

    def mkdir(self, path: str, name: str):
        base = _norm(path)
        target = f"{base}/{name}" if base else name
        self._attempt(lambda: self._sftp.mkdir(self._remote(target)))

    def move(self, src: str, dst: str, is_dir: bool = False):
        def op():
            rs, rd = self._remote(src), self._remote(dst)
            try:
                self._sftp.posix_rename(rs, rd)
            except (AttributeError, IOError):
                self._sftp.rename(rs, rd)
        self._attempt(op)

    def _copyfile(self, src: str, dst: str):
        buf = io.BytesIO()
        self._sftp.getfo(self._remote(src), buf)
        buf.seek(0)
        self._sftp.putfo(buf, self._remote(dst))

    def _copytree(self, src: str, dst: str):
        self._sftp.mkdir(self._remote(dst))
        rel, reld = _norm(src), _norm(dst)
        for attr in self._sftp.listdir_attr(self._remote(src)):
            name = attr.filename
            if name in (".", ".."):
                continue
            s = f"{rel}/{name}" if rel else name
            d = f"{reld}/{name}" if reld else name
            if stat_module.S_ISDIR(attr.st_mode):
                self._copytree(s, d)
            else:
                self._copyfile(s, d)

    def copy(self, src: str, dst: str, is_dir: bool = False):
        if is_dir:
            self._attempt(lambda: self._copytree(src, dst))
        else:
            self._attempt(lambda: self._copyfile(src, dst))

    def usage(self):
        def walk(path):
            total = files = folders = 0
            rel = _norm(path)
            for attr in self._sftp.listdir_attr(self._remote(path)):
                name = attr.filename
                if name in (".", ".."):
                    continue
                child = f"{rel}/{name}" if rel else name
                if stat_module.S_ISDIR(attr.st_mode):
                    folders += 1
                    t, f, d = walk(child)
                    total += t; files += f; folders += d
                else:
                    total += attr.st_size or 0
                    files += 1
            return total, files, folders

        def op():
            t, f, d = walk("")
            return {"total_size": t, "file_count": f, "folder_count": d}

        return self._attempt(op)


def humanize_storage_error(exc: Exception) -> str:
    s = str(exc)
    low = s.lower()
    if any(k in low for k in ("name or service not known", "getaddrinfo", "nodename nor servname", "failed to connect")):
        if "timed out" not in low:
            return ("Host not found / unreachable. Check the IP or hostname "
                    "(each part must be 0-255, e.g. 192.168.2.8) and that the server is on.")
    if "timed out" in low or "timeout" in low:
        return "Connection timed out. Check the host, port and firewall/network reachability (SMB=445, SFTP often=2222)."
    if "refused" in low:
        return "Connection refused. The port is closed on the server (SMB usually 445, SFTP often 2222). Enable the service on the NAS."
    if "no authentication methods" in low or "authentication failed" in low or any(
        k in low for k in ("logon_failure", "access_denied", "access is denied", "authentication", "credential")):
        return "Authentication failed. Check the username and password (and domain for SMB, often WORKGROUP)."
    if "bad_network_name" in low or ("share" in low and "not found" in low):
        return "Share not found. Check the share name (the shared folder name, not a sub-path)."
    if "no such file" in low or "not found" in low:
        return "Path not found. Check the folder / base path exists on the server."
    if "nosuchbucket" in low or "does not exist" in low:
        return "Bucket/share not found. Check the name."
    if "signaturedoesnotmatch" in low or "invalidaccesskey" in low or "403" in low or "forbidden" in low:
        return "Access denied. Check the access key / secret (S3) or credentials."
    if "permission denied" in low:
        return "Permission denied. The user lacks access to this folder on the server."
    return s


def build_backend(storage_type: str, cfg: dict):
    if storage_type == "s3":
        return S3Backend(cfg)
    if storage_type == "samba":
        return SambaBackend(cfg)
    if storage_type == "sftp":
        return SFTPBackend(cfg)
    raise StorageError(f"Unknown storage type: {storage_type}")
