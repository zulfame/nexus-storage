import io
from datetime import datetime, timezone

import boto3
from botocore.client import Config as BotoConfig
import smbclient


class StorageError(Exception):
    pass


def _norm(path: str) -> str:
    return (path or "").strip("/")


class S3Backend:
    def __init__(self, cfg: dict):
        client_kwargs = dict(
            aws_access_key_id=cfg.get("access_key"),
            aws_secret_access_key=cfg.get("secret_key"),
            region_name=cfg.get("region") or "us-east-1",
        )
        if cfg.get("endpoint"):
            client_kwargs["endpoint_url"] = cfg["endpoint"]
            client_kwargs["config"] = BotoConfig(
                signature_version="s3v4", s3={"addressing_style": "path"}
            )
        self.bucket = cfg["bucket"]
        self.client = boto3.client("s3", **client_kwargs)

    def test(self) -> bool:
        self.client.head_bucket(Bucket=self.bucket)
        return True

    def list(self, path: str):
        prefix = _norm(path)
        if prefix:
            prefix += "/"
        resp = self.client.list_objects_v2(
            Bucket=self.bucket, Prefix=prefix, Delimiter="/"
        )
        items = []
        for cp in resp.get("CommonPrefixes", []):
            full = cp["Prefix"].rstrip("/")
            name = full[len(prefix):] if prefix else full
            items.append(
                {"name": name, "path": full, "is_dir": True, "size": 0, "modified": None}
            )
        for obj in resp.get("Contents", []):
            key = obj["Key"]
            if key == prefix:
                continue
            name = key[len(prefix):]
            if not name:
                continue
            items.append(
                {
                    "name": name,
                    "path": key,
                    "is_dir": False,
                    "size": obj["Size"],
                    "modified": obj["LastModified"].isoformat(),
                }
            )
        return items

    def upload(self, path: str, fileobj, filename: str):
        base = _norm(path)
        key = f"{base}/{filename}" if base else filename
        self.client.upload_fileobj(fileobj, self.bucket, key)
        return key

    def download(self, path: str):
        obj = self.client.get_object(Bucket=self.bucket, Key=_norm(path))
        return obj["Body"], obj.get("ContentLength")

    def delete(self, path: str, is_dir: bool = False):
        key = _norm(path)
        if is_dir:
            prefix = key + "/"
            paginator = self.client.get_paginator("list_objects_v2")
            for page in paginator.paginate(Bucket=self.bucket, Prefix=prefix):
                objs = [{"Key": o["Key"]} for o in page.get("Contents", [])]
                if objs:
                    self.client.delete_objects(
                        Bucket=self.bucket, Delete={"Objects": objs}
                    )
        else:
            self.client.delete_object(Bucket=self.bucket, Key=key)

    def mkdir(self, path: str, name: str):
        base = _norm(path)
        key = f"{base}/{name}/" if base else f"{name}/"
        self.client.put_object(Bucket=self.bucket, Key=key)


class SambaBackend:
    def __init__(self, cfg: dict):
        self.server = cfg["host"]
        self.share = cfg["share"]
        self.username = cfg.get("username")
        self.password = cfg.get("password")
        self.domain = cfg.get("domain") or ""

    def _full_user(self):
        return f"{self.domain}\\{self.username}" if self.domain else self.username

    def _register(self):
        smbclient.register_session(
            self.server, username=self._full_user(), password=self.password
        )

    def _unc(self, path: str) -> str:
        base = f"\\\\{self.server}\\{self.share}"
        p = _norm(path).replace("/", "\\")
        return f"{base}\\{p}" if p else base

    def test(self) -> bool:
        self._register()
        smbclient.listdir(self._unc(""))
        return True

    def list(self, path: str):
        self._register()
        items = []
        rel = _norm(path)
        for entry in smbclient.scandir(self._unc(path)):
            st = entry.stat()
            is_dir = entry.is_dir()
            full = f"{rel}/{entry.name}" if rel else entry.name
            items.append(
                {
                    "name": entry.name,
                    "path": full,
                    "is_dir": is_dir,
                    "size": 0 if is_dir else st.st_size,
                    "modified": datetime.fromtimestamp(
                        st.st_mtime, timezone.utc
                    ).isoformat(),
                }
            )
        items.sort(key=lambda x: (not x["is_dir"], x["name"].lower()))
        return items

    def upload(self, path: str, fileobj, filename: str):
        self._register()
        base = _norm(path)
        target = f"{base}/{filename}" if base else filename
        with smbclient.open_file(self._unc(target), mode="wb") as f:
            f.write(fileobj.read())
        return target

    def download(self, path: str):
        self._register()
        buf = io.BytesIO()
        with smbclient.open_file(self._unc(path), mode="rb") as f:
            buf.write(f.read())
        size = buf.tell()
        buf.seek(0)
        return buf, size

    def delete(self, path: str, is_dir: bool = False):
        self._register()
        if is_dir:
            self._rmtree(path)
        else:
            smbclient.remove(self._unc(path))

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
        self._register()
        base = _norm(path)
        target = f"{base}/{name}" if base else name
        smbclient.mkdir(self._unc(target))


def build_backend(storage_type: str, cfg: dict):
    if storage_type == "s3":
        return S3Backend(cfg)
    if storage_type == "samba":
        return SambaBackend(cfg)
    raise StorageError(f"Unknown storage type: {storage_type}")
