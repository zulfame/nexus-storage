from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
import re
import io
import secrets
import hashlib
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query, Header, Security
from fastapi.responses import StreamingResponse, HTMLResponse
import html as html_lib
from fastapi.security import HTTPBearer
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from crypto_util import encrypt, decrypt
from storage_backends import build_backend, StorageError, humanize_storage_error

# ---------------------------------------------------------------- config
mongo_url = os.environ["MONGO_URL"]
client = AsyncIOMotorClient(mongo_url)
db = client[os.environ["DB_NAME"]]

LOCAL_STORAGE_DIR = os.environ.get("LOCAL_STORAGE_DIR", "/app/data")
os.makedirs(LOCAL_STORAGE_DIR, exist_ok=True)

JWT_ALGORITHM = "HS256"
ACCESS_TOKEN_MINUTES = int(os.environ.get("ACCESS_TOKEN_MINUTES", "1440"))

logging.basicConfig(level=logging.INFO)
logger = logging.getLogger("storage")

app = FastAPI(title="Nexus Storage Manager")
api_router = APIRouter(prefix="/api")
security = HTTPBearer(auto_error=False)

# ---------------------------------------------------------------- helpers
def hash_password(password: str) -> str:
    return bcrypt.hashpw(password.encode("utf-8"), bcrypt.gensalt()).decode("utf-8")


def verify_password(plain: str, hashed: str) -> bool:
    try:
        return bcrypt.checkpw(plain.encode("utf-8"), hashed.encode("utf-8"))
    except Exception:
        return False


def get_jwt_secret() -> str:
    return os.environ.get("JWT_SECRET", "dev-insecure-secret")


def create_access_token(user_id: str, email: str, role: str) -> str:
    payload = {
        "sub": user_id,
        "email": email,
        "role": role,
        "type": "access",
        "exp": datetime.now(timezone.utc) + timedelta(minutes=ACCESS_TOKEN_MINUTES),
    }
    return jwt.encode(payload, get_jwt_secret(), algorithm=JWT_ALGORITHM)


async def get_current_user(request: Request) -> dict:
    auth_header = request.headers.get("Authorization", "")
    token = auth_header[7:] if auth_header.startswith("Bearer ") else None
    if not token:
        token = request.cookies.get("access_token")
    if not token:
        raise HTTPException(status_code=401, detail="Not authenticated")
    try:
        payload = jwt.decode(token, get_jwt_secret(), algorithms=[JWT_ALGORITHM])
    except jwt.ExpiredSignatureError:
        raise HTTPException(status_code=401, detail="Token expired")
    except jwt.InvalidTokenError:
        raise HTTPException(status_code=401, detail="Invalid token")
    user = await db.users.find_one({"_id": ObjectId(payload["sub"])})
    if not user:
        raise HTTPException(status_code=401, detail="User not found")
    return user


async def require_admin(user: dict = Depends(get_current_user)) -> dict:
    if user.get("role") != "admin":
        raise HTTPException(status_code=403, detail="Admin access required")
    return user


async def get_optional_user(request: Request):
    try:
        return await get_current_user(request)
    except HTTPException:
        return None


def user_public(user: dict) -> dict:
    return {
        "id": str(user["_id"]),
        "email": user["email"],
        "name": user.get("name", ""),
        "role": user.get("role", "user"),
        "access": user.get("access", []),
        "created_at": user.get("created_at"),
    }


def storage_public(doc: dict) -> dict:
    cfg = doc.get("config", {})
    safe_cfg = {
        "region": cfg.get("region", ""),
        "endpoint": cfg.get("endpoint", ""),
        "bucket": cfg.get("bucket", ""),
        "host": cfg.get("host", ""),
        "share": cfg.get("share", ""),
        "port": cfg.get("port", ""),
        "username": cfg.get("username", ""),
        "domain": cfg.get("domain", ""),
        "base_path": cfg.get("base_path", ""),
        "access_key": cfg.get("access_key", ""),
        "capacity_gb": cfg.get("capacity_gb"),
    }
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "type": doc["type"],
        "config": safe_cfg,
        "usage": doc.get("usage"),
        "created_at": doc.get("created_at"),
    }


def decrypt_config(doc: dict) -> dict:
    cfg = dict(doc.get("config", {}))
    if doc["type"] == "s3" and cfg.get("secret_key"):
        cfg["secret_key"] = decrypt(cfg["secret_key"])
    if doc["type"] in ("samba", "sftp") and cfg.get("password"):
        cfg["password"] = decrypt(cfg["password"])
    if doc["type"] == "sftp" and cfg.get("private_key"):
        cfg["private_key"] = decrypt(cfg["private_key"])
    if doc["type"] == "sftp" and cfg.get("passphrase"):
        cfg["passphrase"] = decrypt(cfg["passphrase"])
    return cfg


async def log_activity(user: dict, action: str, storage_doc: dict, path: str, detail: str = ""):
    try:
        await db.activity_logs.insert_one(
            {
                "user_email": user.get("email"),
                "action": action,
                "storage_id": str(storage_doc["_id"]),
                "storage_name": storage_doc.get("name"),
                "storage_type": storage_doc.get("type"),
                "path": path,
                "detail": detail,
                "timestamp": datetime.now(timezone.utc).isoformat(),
            }
        )
    except Exception as e:
        logger.warning("Failed to record activity log: %s", e)


async def _log_reconnect(user, backend, sdoc, path=""):
    if getattr(backend, "reconnected", False):
        await log_activity(user, "reconnect", sdoc, path, "Connection dropped and was re-established automatically")


async def _invalidate_usage(storage_id):
    try:
        await db.storages.update_one({"_id": ObjectId(storage_id)}, {"$unset": {"usage": ""}})
    except Exception:
        pass


def user_permission_for(user: dict, storage_id: str) -> Optional[str]:
    if user.get("role") == "admin":
        return "write"
    for a in user.get("access", []):
        if a.get("storage_id") == storage_id:
            return a.get("permission", "read")
    return None


async def get_storage_or_404(storage_id: str) -> dict:
    try:
        doc = await db.storages.find_one({"_id": ObjectId(storage_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Storage not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Storage not found")
    return doc


# ---------------------------------------------------------------- models
class LoginBody(BaseModel):
    email: EmailStr
    password: str


class ChangePasswordBody(BaseModel):
    current_password: str
    new_password: str


class UserCreate(BaseModel):
    email: EmailStr
    password: str
    name: str = ""
    role: str = "user"


class UserUpdate(BaseModel):
    name: Optional[str] = None
    role: Optional[str] = None
    password: Optional[str] = None


class AccessEntry(BaseModel):
    storage_id: str
    permission: str = "read"


class AccessUpdate(BaseModel):
    access: List[AccessEntry]


class StorageBody(BaseModel):
    name: str
    type: str
    config: dict = Field(default_factory=dict)


class FolderBody(BaseModel):
    path: str = ""
    name: str


class MoveBody(BaseModel):
    src: str
    dst: str
    is_dir: bool = False
    copy: bool = False


class TransferBody(BaseModel):
    dest_storage_id: str
    src: str
    dst: str
    is_dir: bool = False
    move: bool = False


class ShareBody(BaseModel):
    path: str
    expires_days: int = 7
    password: Optional[str] = None


MAX_TRANSFER_BYTES = 500 * 1024 * 1024


class SettingsBody(BaseModel):
    app_name: str = ""
    tagline: str = ""
    meta_description: str = ""
    favicon_url: str = ""
    logo_url: str = ""
    primary_color: str = ""


class ClientErrorBody(BaseModel):
    message: str = ""
    stack: str = ""
    path: str = ""


DEFAULT_SETTINGS = {
    "app_name": "Nexus Storage Manager",
    "tagline": "All your storage, one clean workspace.",
    "meta_description": "Manage S3 and Samba storage from one workspace, with per-user access control.",
    "favicon_url": "",
    "logo_url": "",
    "primary_color": "#2563eb",
}

FILE_ACTIONS = ["upload", "delete", "delete_folder", "create_folder", "move", "copy", "transfer", "share"]
API_ACTIONS = ["api_list", "api_download", "api_upload", "api_create_folder", "api_delete"]


async def get_settings() -> dict:
    doc = await db.settings.find_one({"_id": "app"})
    merged = dict(DEFAULT_SETTINGS)
    if doc:
        for k, v in doc.items():
            if k != "_id" and v not in (None, ""):
                merged[k] = v
    return merged


# ---------------------------------------------------------------- auth routes
@api_router.post("/auth/login")
async def login(body: LoginBody):
    user = await db.users.find_one({"email": body.email.lower()})
    if not user or not verify_password(body.password, user["password_hash"]):
        raise HTTPException(status_code=401, detail="Invalid email or password")
    token = create_access_token(str(user["_id"]), user["email"], user.get("role", "user"))
    return {"access_token": token, "token_type": "bearer", "user": user_public(user)}


@api_router.get("/auth/me")
async def me(user: dict = Depends(get_current_user)):
    return user_public(user)


@api_router.post("/auth/change-password")
async def change_password(body: ChangePasswordBody, user: dict = Depends(get_current_user)):
    if len(body.new_password) < 6:
        raise HTTPException(status_code=400, detail="New password must be at least 6 characters")
    if not verify_password(body.current_password, user["password_hash"]):
        raise HTTPException(status_code=400, detail="Current password is incorrect")
    await db.users.update_one(
        {"_id": user["_id"]}, {"$set": {"password_hash": hash_password(body.new_password)}}
    )
    return {"status": "ok"}


# ---------------------------------------------------------------- user routes
@api_router.get("/users")
async def list_users(admin: dict = Depends(require_admin)):
    users = await db.users.find().sort("created_at", 1).to_list(1000)
    return [user_public(u) for u in users]


@api_router.post("/users")
async def create_user(body: UserCreate, admin: dict = Depends(require_admin)):
    email = body.email.lower()
    if await db.users.find_one({"email": email}):
        raise HTTPException(status_code=400, detail="Email already exists")
    doc = {
        "email": email,
        "password_hash": hash_password(body.password),
        "name": body.name,
        "role": body.role if body.role in ("admin", "user") else "user",
        "access": [],
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.users.insert_one(doc)
    doc["_id"] = res.inserted_id
    return user_public(doc)


@api_router.delete("/users/{user_id}")
async def delete_user(user_id: str, admin: dict = Depends(require_admin)):
    if str(admin["_id"]) == user_id:
        raise HTTPException(status_code=400, detail="Cannot delete your own account")
    target = await db.users.find_one({"_id": ObjectId(user_id)})
    if not target:
        raise HTTPException(status_code=404, detail="User not found")
    if target.get("role") == "admin" and await db.users.count_documents({"role": "admin"}) <= 1:
        raise HTTPException(status_code=400, detail="Cannot delete the last admin")
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"status": "deleted"}


@api_router.put("/users/{user_id}")
async def update_user(user_id: str, body: UserUpdate, admin: dict = Depends(require_admin)):
    doc = await db.users.find_one({"_id": ObjectId(user_id)})
    if not doc:
        raise HTTPException(status_code=404, detail="User not found")
    updates = {}
    if body.name is not None:
        updates["name"] = body.name
    if body.role in ("admin", "user"):
        if doc.get("role") == "admin" and body.role == "user":
            if await db.users.count_documents({"role": "admin"}) <= 1:
                raise HTTPException(status_code=400, detail="Cannot demote the last admin")
        updates["role"] = body.role
    if body.password:
        if len(body.password) < 6:
            raise HTTPException(status_code=400, detail="Password must be at least 6 characters")
        updates["password_hash"] = hash_password(body.password)
    if updates:
        await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": updates})
    updated = await db.users.find_one({"_id": ObjectId(user_id)})
    return user_public(updated)


@api_router.put("/users/{user_id}/access")
async def update_access(user_id: str, body: AccessUpdate, admin: dict = Depends(require_admin)):
    access = [a.model_dump() for a in body.access]
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"access": access}})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return user_public(user)


# ---------------------------------------------------------------- storage routes
@api_router.get("/storages")
async def list_storages(include_inaccessible: bool = False, user: dict = Depends(get_current_user)):
    docs = await db.storages.find().sort("created_at", 1).to_list(1000)
    result = []
    for doc in docs:
        perm = user_permission_for(user, str(doc["_id"]))
        if perm is None and not include_inaccessible:
            continue
        pub = storage_public(doc)
        pub["permission"] = perm
        result.append(pub)
    return result


def validate_storage(stype: str, cfg: dict, has_password_secret: bool = False):
    def present(f):
        v = cfg.get(f)
        return v is not None and str(v).strip() != ""
    if stype == "s3":
        missing = [f for f in ("bucket", "access_key", "secret_key") if not present(f)]
    elif stype == "sftp":
        missing = [f for f in ("host", "username") if not present(f)]
        if not present("password") and not present("private_key") and not has_password_secret:
            missing.append("password or private_key")
    elif stype == "samba":
        missing = [f for f in ("host", "share", "username") if not present(f)]
    else:
        raise HTTPException(status_code=400, detail="type must be s3, samba or sftp")
    if missing:
        raise HTTPException(status_code=400, detail=f"Missing required field(s) for {stype.upper()}: {', '.join(missing)}")


@api_router.post("/storages")
async def create_storage(body: StorageBody, admin: dict = Depends(require_admin)):
    if body.type not in ("s3", "samba", "sftp"):
        raise HTTPException(status_code=400, detail="type must be s3, samba or sftp")
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Display name is required")
    cfg = dict(body.config)
    validate_storage(body.type, cfg)
    if body.type == "s3" and cfg.get("secret_key"):
        cfg["secret_key"] = encrypt(cfg["secret_key"])
    if body.type in ("samba", "sftp") and cfg.get("password"):
        cfg["password"] = encrypt(cfg["password"])
    if body.type == "sftp" and cfg.get("private_key"):
        cfg["private_key"] = encrypt(cfg["private_key"])
    if body.type == "sftp" and cfg.get("passphrase"):
        cfg["passphrase"] = encrypt(cfg["passphrase"])
    doc = {
        "name": body.name,
        "type": body.type,
        "config": cfg,
        "created_by": str(admin["_id"]),
        "created_at": datetime.now(timezone.utc).isoformat(),
    }
    res = await db.storages.insert_one(doc)
    doc["_id"] = res.inserted_id
    await log_activity(admin, "storage_added", doc, "", f"Added {body.type.upper()} storage")
    return storage_public(doc)


@api_router.put("/storages/{storage_id}")
async def update_storage(storage_id: str, body: StorageBody, admin: dict = Depends(require_admin)):
    if body.type not in ("s3", "samba", "sftp"):
        raise HTTPException(status_code=400, detail="type must be s3, samba or sftp")
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Display name is required")
    doc = await get_storage_or_404(storage_id)
    existing = dict(doc.get("config", {}))
    cfg = dict(body.config)
    same_type = body.type == doc.get("type")
    # preserve existing secret if not provided (empty) on update of same type
    if body.type == "s3":
        if cfg.get("secret_key"):
            cfg["secret_key"] = encrypt(cfg["secret_key"])
        else:
            cfg["secret_key"] = existing.get("secret_key", "") if same_type else ""
    if body.type in ("samba", "sftp"):
        if cfg.get("password"):
            cfg["password"] = encrypt(cfg["password"])
        else:
            cfg["password"] = existing.get("password", "") if same_type else ""
    if body.type == "sftp":
        if cfg.get("private_key"):
            cfg["private_key"] = encrypt(cfg["private_key"])
        else:
            cfg["private_key"] = existing.get("private_key", "") if same_type else ""
        if cfg.get("passphrase"):
            cfg["passphrase"] = encrypt(cfg["passphrase"])
        else:
            cfg["passphrase"] = existing.get("passphrase", "") if same_type else ""
    has_secret = bool(cfg.get("password") or cfg.get("private_key"))
    validate_storage(body.type, cfg, has_password_secret=has_secret)
    await db.storages.update_one(
        {"_id": ObjectId(storage_id)},
        {"$set": {"name": body.name, "type": body.type, "config": cfg}},
    )
    updated = await db.storages.find_one({"_id": ObjectId(storage_id)})
    await log_activity(admin, "storage_updated", updated, "", "Storage settings updated")
    return storage_public(updated)


@api_router.delete("/storages/{storage_id}")
async def delete_storage(storage_id: str, admin: dict = Depends(require_admin)):
    doc = await get_storage_or_404(storage_id)
    await db.storages.delete_one({"_id": ObjectId(storage_id)})
    await db.users.update_many({}, {"$pull": {"access": {"storage_id": storage_id}}})
    await log_activity(admin, "storage_deleted", doc, "", "Storage connection removed")
    return {"status": "deleted"}


@api_router.post("/storages/test")
async def test_config(body: StorageBody, admin: dict = Depends(require_admin)):
    cfg = dict(body.config)
    # if secrets omitted on test of existing storage, they must be provided by client
    try:
        backend = build_backend(body.type, cfg)
        await run_in_threadpool(backend.test)
        return {"success": True, "message": "Connection successful"}
    except Exception as e:
        return {"success": False, "message": humanize_storage_error(e)}


@api_router.get("/storages/{storage_id}/config")
async def get_storage_config(storage_id: str, admin: dict = Depends(require_admin)):
    doc = await get_storage_or_404(storage_id)
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "type": doc["type"],
        "config": decrypt_config(doc),
    }


@api_router.post("/storages/{storage_id}/test")
async def test_saved(storage_id: str, admin: dict = Depends(require_admin)):
    doc = await get_storage_or_404(storage_id)
    try:
        backend = build_backend(doc["type"], decrypt_config(doc))
        await run_in_threadpool(backend.test)
        await log_activity(admin, "connection_ok", doc, "", "Connection test succeeded")
        return {"success": True, "message": "Connection successful"}
    except Exception as e:
        msg = humanize_storage_error(e)
        await log_activity(admin, "connection_failed", doc, "", f"Connection test failed: {msg}")
        return {"success": False, "message": msg}


# ---------------------------------------------------------------- file routes
async def _resolve_backend(storage_id: str, user: dict, need_write: bool):
    perm = user_permission_for(user, storage_id)
    if perm is None:
        raise HTTPException(status_code=403, detail="No access to this storage")
    if need_write and perm != "write":
        raise HTTPException(status_code=403, detail="Read-only access")
    doc = await get_storage_or_404(storage_id)
    try:
        return build_backend(doc["type"], decrypt_config(doc)), doc
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e))


@api_router.get("/storages/{storage_id}/files")
async def list_files(storage_id: str, path: str = "", user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    try:
        result = await run_in_threadpool(backend.list, path)
        await _log_reconnect(user, backend, sdoc, path)
        return {"path": path, "items": result}
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Failed to list files: {humanize_storage_error(e)}")


@api_router.post("/storages/{storage_id}/files/upload")
async def upload_file(
    storage_id: str,
    path: str = Form(""),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        def do_upload():
            _ensure_dir(backend, path)
            return backend.upload(path, file.file, file.filename)
        key = await run_in_threadpool(do_upload)
        await log_activity(user, "upload", sdoc, key)
        await _invalidate_usage(storage_id)
        await _log_reconnect(user, backend, sdoc, key)
        return {"status": "uploaded", "path": key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {humanize_storage_error(e)}")


@api_router.get("/storages/{storage_id}/files/download")
async def download_file(storage_id: str, path: str, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    try:
        stream, size = await run_in_threadpool(backend.download, path)
        await _log_reconnect(user, backend, sdoc, path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {humanize_storage_error(e)}")
    filename = path.rstrip("/").split("/")[-1]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if size and size > 0:
        headers["Content-Length"] = str(size)
    return StreamingResponse(stream, media_type="application/octet-stream", headers=headers)


@api_router.delete("/storages/{storage_id}/files")
async def delete_file(
    storage_id: str, path: str, is_dir: bool = False, user: dict = Depends(get_current_user)
):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        await run_in_threadpool(backend.delete, path, is_dir)
        await log_activity(user, "delete_folder" if is_dir else "delete", sdoc, path)
        await _invalidate_usage(storage_id)
        await _log_reconnect(user, backend, sdoc, path)
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Delete failed: {humanize_storage_error(e)}")


@api_router.post("/storages/{storage_id}/files/folder")
async def create_folder(storage_id: str, body: FolderBody, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        await run_in_threadpool(backend.mkdir, body.path, body.name)
        target = f"{body.path.rstrip('/')}/{body.name}" if body.path else body.name
        await log_activity(user, "create_folder", sdoc, target)
        await _invalidate_usage(storage_id)
        await _log_reconnect(user, backend, sdoc, target)
        return {"status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Create folder failed: {humanize_storage_error(e)}")


@api_router.post("/storages/{storage_id}/files/move")
async def move_file(storage_id: str, body: MoveBody, user: dict = Depends(get_current_user)):
    src = body.src.strip().strip("/")
    dst = body.dst.strip().strip("/")
    if not src or not dst:
        raise HTTPException(status_code=400, detail="Source and destination are required")
    if src == dst:
        raise HTTPException(status_code=400, detail="Source and destination are the same")
    if body.is_dir and (dst == src or dst.startswith(src + "/")):
        raise HTTPException(status_code=400, detail="Cannot move a folder into itself")
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        if body.copy:
            await run_in_threadpool(backend.copy, src, dst, body.is_dir)
            await log_activity(user, "copy", sdoc, dst, f"Copied from {src}")
        else:
            await run_in_threadpool(backend.move, src, dst, body.is_dir)
            await log_activity(user, "move", sdoc, dst, f"Moved from {src}")
        await _log_reconnect(user, backend, sdoc, dst)
        await _invalidate_usage(storage_id)
        return {"status": "ok", "path": dst}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"{'Copy' if body.copy else 'Move'} failed: {humanize_storage_error(e)}")


# ---------------------------------------------------------------- recursive search
@api_router.get("/storages/{storage_id}/files/search")
async def search_files(storage_id: str, q: str = "", path: str = "", user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    ql = q.strip().lower()
    if not ql:
        return {"items": []}

    def walk():
        results = []
        stack = [path.strip("/")]
        visited = 0
        while stack and len(results) < 500 and visited < 8000:
            cur = stack.pop()
            try:
                items = backend.list(cur)
            except Exception:
                continue
            for it in items:
                visited += 1
                if ql in it["name"].lower():
                    results.append(it)
                if it["is_dir"]:
                    stack.append(it["path"])
        return results

    try:
        items = await run_in_threadpool(walk)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Search failed: {humanize_storage_error(e)}")
    return {"items": items}


# ---------------------------------------------------------------- chunked upload
CHUNK_DIR = os.path.join(LOCAL_STORAGE_DIR, "chunk_uploads")
os.makedirs(CHUNK_DIR, exist_ok=True)


def _ensure_dir(backend, path: str):
    parts = [p for p in (path or "").split("/") if p]
    cur = ""
    for p in parts:
        try:
            backend.mkdir(cur, p)
        except Exception:
            pass
        cur = f"{cur}/{p}" if cur else p


@api_router.post("/storages/{storage_id}/files/chunk")
async def upload_chunk(
    storage_id: str,
    upload_id: str = Form(...),
    index: int = Form(...),
    chunk: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    await _resolve_backend(storage_id, user, need_write=True)
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", upload_id):
        raise HTTPException(status_code=400, detail="Invalid upload id")
    tmp = os.path.join(CHUNK_DIR, f"{storage_id}_{upload_id}")

    def write_chunk():
        mode = "wb" if index == 0 else "ab"
        with open(tmp, mode) as f:
            f.write(chunk.file.read())

    await run_in_threadpool(write_chunk)
    return {"status": "ok", "index": index}


class ChunkCompleteBody(BaseModel):
    upload_id: str
    path: str = ""
    filename: str


@api_router.post("/storages/{storage_id}/files/chunk/complete")
async def upload_chunk_complete(storage_id: str, body: ChunkCompleteBody, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    if not re.fullmatch(r"[A-Za-z0-9_-]{6,64}", body.upload_id):
        raise HTTPException(status_code=400, detail="Invalid upload id")
    tmp = os.path.join(CHUNK_DIR, f"{storage_id}_{body.upload_id}")
    if not os.path.exists(tmp):
        raise HTTPException(status_code=400, detail="No uploaded chunks found")

    def finalize():
        _ensure_dir(backend, body.path)
        with open(tmp, "rb") as f:
            key = backend.upload(body.path, f, body.filename)
        try:
            os.remove(tmp)
        except Exception:
            pass
        return key

    try:
        key = await run_in_threadpool(finalize)
        await log_activity(user, "upload", sdoc, key)
        await _log_reconnect(user, backend, sdoc, key)
        await _invalidate_usage(storage_id)
        return {"status": "uploaded", "path": key}
    except HTTPException:
        raise
    except Exception as e:
        try:
            os.remove(tmp)
        except Exception:
            pass
        raise HTTPException(status_code=400, detail=f"Upload failed: {humanize_storage_error(e)}")


# ---------------------------------------------------------------- usage metrics
@api_router.get("/storages/{storage_id}/usage")
async def storage_usage(storage_id: str, refresh: bool = False, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    if not refresh and sdoc.get("usage"):
        return sdoc["usage"]
    try:
        data = await run_in_threadpool(backend.usage)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Usage scan failed: {humanize_storage_error(e)}")
    data["computed_at"] = datetime.now(timezone.utc).isoformat()
    await db.storages.update_one({"_id": sdoc["_id"]}, {"$set": {"usage": data}})
    return data


# ---------------------------------------------------------------- cross-storage transfer
def _split_dst(dst: str):
    dst = dst.strip().strip("/")
    if "/" in dst:
        return dst.rsplit("/", 1)[0], dst.rsplit("/", 1)[1]
    return "", dst


def _transfer_file(sb, tb, src, dst):
    stream, size = sb.download(src)
    if size and size > MAX_TRANSFER_BYTES:
        raise StorageError("File exceeds the 500 MB transfer limit")
    data = stream.read()
    if len(data) > MAX_TRANSFER_BYTES:
        raise StorageError("File exceeds the 500 MB transfer limit")
    parent, name = _split_dst(dst)
    tb.upload(parent, io.BytesIO(data), name)


def _transfer_dir(sb, tb, src, dst):
    parent, name = _split_dst(dst)
    try:
        tb.mkdir(parent, name)
    except Exception:
        pass
    for item in sb.list(src):
        cs = item["path"]
        cd = f"{dst}/{item['name']}"
        if item["is_dir"]:
            _transfer_dir(sb, tb, cs, cd)
        else:
            _transfer_file(sb, tb, cs, cd)


@api_router.post("/storages/{storage_id}/files/transfer")
async def transfer_file(storage_id: str, body: TransferBody, user: dict = Depends(get_current_user)):
    src = body.src.strip().strip("/")
    dst = body.dst.strip().strip("/")
    if not src or not dst:
        raise HTTPException(status_code=400, detail="Source and destination are required")
    if body.dest_storage_id == storage_id:
        raise HTTPException(status_code=400, detail="Use move/copy for the same storage")

    src_backend, src_doc = await _resolve_backend(storage_id, user, need_write=body.move)
    dst_backend, dst_doc = await _resolve_backend(body.dest_storage_id, user, need_write=True)

    def do_transfer():
        if body.is_dir:
            _transfer_dir(src_backend, dst_backend, src, dst)
        else:
            _transfer_file(src_backend, dst_backend, src, dst)
        if body.move:
            src_backend.delete(src, body.is_dir)

    try:
        await run_in_threadpool(do_transfer)
        action = "transfer"
        detail = f"{'Moved' if body.move else 'Copied'} from {src_doc.get('name')}:{src} to {dst_doc.get('name')}:{dst}"
        await log_activity(user, action, dst_doc, dst, detail)
        await _invalidate_usage(body.dest_storage_id)
        if body.move:
            await _invalidate_usage(storage_id)
        return {"status": "ok", "path": dst, "storage_id": body.dest_storage_id}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Transfer failed: {humanize_storage_error(e)}")


# ---------------------------------------------------------------- shareable links
def _share_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "token": doc["token"],
        "storage_id": doc["storage_id"],
        "storage_name": doc.get("storage_name"),
        "path": doc["path"],
        "name": doc["name"],
        "size": doc.get("size"),
        "requires_password": bool(doc.get("password_hash")),
        "expires_at": doc.get("expires_at"),
        "downloads": doc.get("downloads", 0),
        "created_by": doc.get("created_by"),
        "created_at": doc.get("created_at"),
    }


async def _file_size_in(backend, path: str):
    parent = path.rsplit("/", 1)[0] if "/" in path else ""
    name = path.rsplit("/", 1)[-1]
    try:
        items = await run_in_threadpool(backend.list, parent)
        for it in items:
            if it["name"] == name and not it["is_dir"]:
                return it.get("size")
    except Exception:
        pass
    return None


@api_router.post("/storages/{storage_id}/files/share")
async def create_share(storage_id: str, body: ShareBody, user: dict = Depends(get_current_user)):
    path = body.path.strip().strip("/")
    if not path:
        raise HTTPException(status_code=400, detail="Path is required")
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    size = await _file_size_in(backend, path)
    token = secrets.token_urlsafe(16)
    now = datetime.now(timezone.utc)
    expires_at = (now + timedelta(days=body.expires_days)).isoformat() if body.expires_days and body.expires_days > 0 else None
    doc = {
        "token": token,
        "storage_id": storage_id,
        "storage_name": sdoc.get("name"),
        "path": path,
        "name": path.rsplit("/", 1)[-1],
        "size": size,
        "password_hash": hash_password(body.password) if body.password else None,
        "expires_at": expires_at,
        "downloads": 0,
        "created_by": user.get("email"),
        "created_at": now.isoformat(),
    }
    res = await db.shares.insert_one(doc)
    doc["_id"] = res.inserted_id
    await log_activity(user, "share", sdoc, path, f"Created share link (expires {expires_at or 'never'})")
    return _share_public(doc)


@api_router.get("/shares")
async def list_shares(user: dict = Depends(get_current_user)):
    query = {} if user.get("role") == "admin" else {"created_by": user.get("email")}
    docs = await db.shares.find(query).sort("created_at", -1).to_list(500)
    return [_share_public(d) for d in docs]


@api_router.delete("/shares/{share_id}")
async def delete_share(share_id: str, user: dict = Depends(get_current_user)):
    try:
        doc = await db.shares.find_one({"_id": ObjectId(share_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="Share not found")
    if not doc:
        raise HTTPException(status_code=404, detail="Share not found")
    if user.get("role") != "admin" and doc.get("created_by") != user.get("email"):
        raise HTTPException(status_code=403, detail="Not allowed")
    await db.shares.delete_one({"_id": doc["_id"]})
    return {"status": "deleted"}


def _share_expired(doc: dict) -> bool:
    exp = doc.get("expires_at")
    if not exp:
        return False
    try:
        return datetime.now(timezone.utc) > datetime.fromisoformat(exp)
    except Exception:
        return False


@api_router.get("/share/{token}")
async def share_info(token: str):
    doc = await db.shares.find_one({"token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Link not found")
    if _share_expired(doc):
        raise HTTPException(status_code=410, detail="This link has expired")
    return {
        "name": doc["name"],
        "size": doc.get("size"),
        "requires_password": bool(doc.get("password_hash")),
        "expires_at": doc.get("expires_at"),
        "downloads": doc.get("downloads", 0),
    }


def _human_size(n):
    if not n:
        return ""
    units = ["B", "KB", "MB", "GB", "TB"]
    i = 0
    v = float(n)
    while v >= 1024 and i < len(units) - 1:
        v /= 1024
        i += 1
    return f"{v:.1f} {units[i]}" if i > 0 and v < 10 else f"{int(v)} {units[i]}"


@api_router.get("/share/{token}/og", response_class=HTMLResponse)
async def share_og(token: str, request: Request):
    doc = await db.shares.find_one({"token": token})
    settings = await get_settings()
    app_name = settings.get("app_name") or "Nexus Storage Manager"
    image = settings.get("favicon_url") or settings.get("logo_url") or ""
    proto = request.headers.get("x-forwarded-proto", "https")
    host = request.headers.get("x-forwarded-host") or request.headers.get("host")
    origin = f"{proto}://{host}" if host else str(request.base_url).rstrip("/")
    origin = origin.rstrip("/")
    redirect = f"{origin}/share/{token}"
    if not doc or _share_expired(doc):
        title = "Link unavailable"
        desc = "This shared link is invalid or has expired."
    else:
        fname = doc.get("name") or "Shared file"
        size_txt = _human_size(doc.get("size"))
        title = f"{fname} · {app_name}"
        desc = f"Shared file{(' (' + size_txt + ')') if size_txt else ''} via {app_name}. Click to download."

    def esc(x):
        return html_lib.escape(str(x or ""), quote=True)

    img_tags = ""
    if image:
        img_tags = f'<meta property="og:image" content="{esc(image)}"/><meta name="twitter:image" content="{esc(image)}"/>'
    page = f"""<!doctype html><html lang="en"><head>
<meta charset="utf-8"/>
<title>{esc(title)}</title>
<meta name="description" content="{esc(desc)}"/>
<meta property="og:type" content="website"/>
<meta property="og:site_name" content="{esc(app_name)}"/>
<meta property="og:title" content="{esc(title)}"/>
<meta property="og:description" content="{esc(desc)}"/>
<meta property="og:url" content="{esc(redirect)}"/>
{img_tags}
<meta name="twitter:card" content="{'summary_large_image' if image else 'summary'}"/>
<meta name="twitter:title" content="{esc(title)}"/>
<meta name="twitter:description" content="{esc(desc)}"/>
<meta http-equiv="refresh" content="0; url={esc(redirect)}"/>
<script>window.location.replace({redirect!r});</script>
</head><body style="font-family:sans-serif;padding:2rem;color:#334155">Redirecting to <a href="{esc(redirect)}">{esc(title)}</a>…</body></html>"""
    return HTMLResponse(content=page)


@api_router.get("/share/{token}/download")
async def share_download(token: str, password: Optional[str] = None):
    doc = await db.shares.find_one({"token": token})
    if not doc:
        raise HTTPException(status_code=404, detail="Link not found")
    if _share_expired(doc):
        raise HTTPException(status_code=410, detail="This link has expired")
    if doc.get("password_hash"):
        if not password or not verify_password(password, doc["password_hash"]):
            raise HTTPException(status_code=401, detail="Incorrect password")
    sdoc = await db.storages.find_one({"_id": ObjectId(doc["storage_id"])})
    if not sdoc:
        raise HTTPException(status_code=404, detail="Storage no longer exists")
    try:
        backend = build_backend(sdoc["type"], decrypt_config(sdoc))
        stream, size = await run_in_threadpool(backend.download, doc["path"])
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {humanize_storage_error(e)}")
    await db.shares.update_one({"_id": doc["_id"]}, {"$inc": {"downloads": 1}})
    headers = {"Content-Disposition": f'attachment; filename="{doc["name"]}"'}
    return StreamingResponse(stream, media_type="application/octet-stream", headers=headers)


async def _accessible_storage_names(user: dict):
    names = []
    for a in user.get("access", []) or []:
        sid = a.get("storage_id")
        if not sid:
            continue
        try:
            d = await db.storages.find_one({"_id": ObjectId(sid)}, {"name": 1})
        except Exception:
            d = None
        if d:
            names.append(d.get("name"))
    return names


@api_router.get("/logs")
async def list_logs(
    user: dict = Depends(get_current_user),
    skip: int = Query(0, ge=0),
    limit: int = Query(10, ge=1, le=100),
    category: str = "all",
    search: str = "",
):
    base = []
    if user.get("role") != "admin":
        names = await _accessible_storage_names(user)
        base.append({"$or": [{"storage_name": {"$in": names}}, {"user_email": user.get("email")}]})
    conds = list(base)
    if category == "file":
        conds.append({"action": {"$in": FILE_ACTIONS}})
    elif category == "api":
        conds.append({"action": {"$in": API_ACTIONS}})
    elif category == "conn":
        conds.append({"action": {"$nin": FILE_ACTIONS + API_ACTIONS}})
    if search.strip():
        rx = {"$regex": re.escape(search.strip()), "$options": "i"}
        conds.append(
            {"$or": [
                {"user_email": rx},
                {"action": rx},
                {"storage_name": rx},
                {"path": rx},
                {"detail": rx},
            ]}
        )
    q = {"$and": conds} if conds else {}
    total = await db.activity_logs.count_documents(q)
    logs = await db.activity_logs.find(q).sort("timestamp", -1).skip(skip).limit(limit).to_list(limit)
    items = [
        {
            "id": str(l["_id"]),
            "user_email": l.get("user_email"),
            "action": l.get("action"),
            "storage_name": l.get("storage_name"),
            "storage_type": l.get("storage_type"),
            "path": l.get("path"),
            "detail": l.get("detail"),
            "timestamp": l.get("timestamp"),
        }
        for l in logs
    ]

    def merge(extra):
        cs = base + ([extra] if extra else [])
        return {"$and": cs} if cs else {}

    all_count = await db.activity_logs.count_documents(merge(None))
    file_count = await db.activity_logs.count_documents(merge({"action": {"$in": FILE_ACTIONS}}))
    api_count = await db.activity_logs.count_documents(merge({"action": {"$in": API_ACTIONS}}))
    reconnect_count = await db.activity_logs.count_documents(merge({"action": "reconnect"}))
    counts = {"all": all_count, "file": file_count, "api": api_count, "conn": all_count - file_count - api_count, "reconnect": reconnect_count}
    return {"items": items, "total": total, "counts": counts}


@api_router.delete("/logs")
async def delete_logs(
    admin: dict = Depends(require_admin),
    start: str = "",
    end: str = "",
):
    if start or end:
        ts = {}
        if start:
            ts["$gte"] = start
        if end:
            ts["$lte"] = end + "T23:59:59.999999+00:00"
        q = {"timestamp": ts}
    else:
        q = {}
    res = await db.activity_logs.delete_many(q)
    return {"deleted": res.deleted_count}


# ---------------------------------------------------------------- app settings
@api_router.get("/settings")
async def get_app_settings():
    return await get_settings()


@api_router.post("/errors")
async def report_client_error(body: ClientErrorBody, request: Request):
    user = await get_optional_user(request)
    email = user.get("email") if user else "anonymous"
    await db.activity_logs.insert_one(
        {
            "user_email": email,
            "action": "client_error",
            "storage_name": None,
            "storage_type": None,
            "path": (body.path or "")[:300],
            "detail": (body.message or "Unknown client error")[:500],
            "timestamp": datetime.now(timezone.utc).isoformat(),
        }
    )
    return {"status": "logged"}


@api_router.put("/settings")
async def update_app_settings(body: SettingsBody, admin: dict = Depends(require_admin)):
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"_id": "app"}, {"$set": data}, upsert=True)
    await log_activity(admin, "settings_updated", {"_id": "", "name": None, "type": None}, "", "Application settings updated")
    return await get_settings()


# ---------------------------------------------------------------- dashboard
@api_router.get("/dashboard/stats")
async def dashboard_stats(user: dict = Depends(get_current_user)):
    is_admin = user.get("role") == "admin"
    if is_admin:
        sfilter = {}
        storage_ids = None
    else:
        ids = [a.get("storage_id") for a in user.get("access", []) or [] if a.get("storage_id")]
        oids = []
        for sid in ids:
            try:
                oids.append(ObjectId(sid))
            except Exception:
                pass
        sfilter = {"_id": {"$in": oids}}
        storage_ids = oids
    total_storages = await db.storages.count_documents(sfilter)
    s3_count = await db.storages.count_documents({**sfilter, "type": "s3"})
    samba_count = await db.storages.count_documents({**sfilter, "type": "samba"})
    sftp_count = await db.storages.count_documents({**sfilter, "type": "sftp"})
    total_used = 0
    async for s in db.storages.find({**sfilter, "usage.total_size": {"$exists": True}}, {"usage": 1}):
        total_used += (s.get("usage") or {}).get("total_size") or 0
    if is_admin:
        total_users = await db.users.count_documents({})
        admin_count = await db.users.count_documents({"role": "admin"})
        share_count = await db.shares.count_documents({})
    else:
        total_users = None
        admin_count = None
        share_count = await db.shares.count_documents({"created_by": str(user["_id"])})
    return {
        "is_admin": is_admin,
        "total_storages": total_storages,
        "s3_count": s3_count,
        "samba_count": samba_count,
        "sftp_count": sftp_count,
        "total_users": total_users,
        "admin_count": admin_count,
        "share_count": share_count,
        "total_used_bytes": total_used,
    }


@api_router.get("/")
async def root():
    return {"message": "Nexus Storage Manager API"}


# ---------------------------------------------------------------- Client API keys (P2)
API_KEY_PREFIX = "sk_live_"


def hash_api_key(raw: str) -> str:
    return hashlib.sha256(raw.encode("utf-8")).hexdigest()


def apikey_public(doc: dict) -> dict:
    return {
        "id": str(doc["_id"]),
        "name": doc.get("name", ""),
        "key_prefix": doc.get("key_prefix", ""),
        "key_masked": f"{doc.get('key_prefix', '')}…{doc.get('key_last4', '')}",
        "storages": doc.get("storages", []),
        "is_active": doc.get("is_active", True),
        "created_at": doc.get("created_at"),
        "last_used_at": doc.get("last_used_at"),
        "revoked_at": doc.get("revoked_at"),
        "request_count": doc.get("request_count", 0),
    }


class ApiKeyBody(BaseModel):
    name: str
    storages: List[AccessEntry] = Field(default_factory=list)


class ApiKeyUpdate(BaseModel):
    name: Optional[str] = None
    storages: Optional[List[AccessEntry]] = None
    is_active: Optional[bool] = None


@api_router.get("/api-keys")
async def list_api_keys(admin: dict = Depends(require_admin)):
    docs = await db.api_keys.find().sort("created_at", -1).to_list(1000)
    return [apikey_public(d) for d in docs]


@api_router.post("/api-keys")
async def create_api_key(body: ApiKeyBody, admin: dict = Depends(require_admin)):
    if not (body.name or "").strip():
        raise HTTPException(status_code=400, detail="Name is required")
    raw = API_KEY_PREFIX + secrets.token_urlsafe(32)
    doc = {
        "name": body.name.strip(),
        "key_hash": hash_api_key(raw),
        "key_prefix": raw[:11],
        "key_last4": raw[-4:],
        "storages": [a.model_dump() for a in body.storages],
        "is_active": True,
        "created_at": datetime.now(timezone.utc).isoformat(),
        "last_used_at": None,
        "revoked_at": None,
        "request_count": 0,
        "created_by": str(admin["_id"]),
    }
    res = await db.api_keys.insert_one(doc)
    doc["_id"] = res.inserted_id
    out = apikey_public(doc)
    out["key"] = raw  # returned only once
    return out


@api_router.put("/api-keys/{key_id}")
async def update_api_key(key_id: str, body: ApiKeyUpdate, admin: dict = Depends(require_admin)):
    try:
        doc = await db.api_keys.find_one({"_id": ObjectId(key_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="API key not found")
    if not doc:
        raise HTTPException(status_code=404, detail="API key not found")
    updates = {}
    if body.name is not None:
        if not body.name.strip():
            raise HTTPException(status_code=400, detail="Name cannot be empty")
        updates["name"] = body.name.strip()
    if body.storages is not None:
        updates["storages"] = [a.model_dump() for a in body.storages]
    if body.is_active is not None:
        updates["is_active"] = body.is_active
        updates["revoked_at"] = None if body.is_active else datetime.now(timezone.utc).isoformat()
    if updates:
        await db.api_keys.update_one({"_id": doc["_id"]}, {"$set": updates})
    updated = await db.api_keys.find_one({"_id": doc["_id"]})
    return apikey_public(updated)


@api_router.delete("/api-keys/{key_id}")
async def delete_api_key(key_id: str, admin: dict = Depends(require_admin)):
    try:
        res = await db.api_keys.delete_one({"_id": ObjectId(key_id)})
    except Exception:
        raise HTTPException(status_code=404, detail="API key not found")
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail="API key not found")
    return {"status": "deleted"}


# ---- /api/v1 client-facing endpoints (API-key auth) ----
_v1_bearer = HTTPBearer(auto_error=False)


async def get_api_client(
    creds=Security(_v1_bearer),
    x_api_key: Optional[str] = Header(None, alias="X-API-Key"),
):
    raw = None
    if creds and (creds.scheme or "").lower() == "bearer":
        raw = creds.credentials
    elif x_api_key:
        raw = x_api_key
    if not raw:
        raise HTTPException(status_code=401, detail="Missing API key", headers={"WWW-Authenticate": "Bearer"})
    doc = await db.api_keys.find_one({"key_hash": hash_api_key(raw), "is_active": True})
    if not doc:
        raise HTTPException(status_code=401, detail="Invalid or revoked API key", headers={"WWW-Authenticate": "Bearer"})
    await db.api_keys.update_one(
        {"_id": doc["_id"]},
        {"$set": {"last_used_at": datetime.now(timezone.utc).isoformat()}, "$inc": {"request_count": 1}},
    )
    return doc


def apikey_permission_for(key: dict, storage_id: str) -> Optional[str]:
    for a in key.get("storages", []):
        if a.get("storage_id") == storage_id:
            return a.get("permission", "read")
    return None


async def log_api_activity(key: dict, action: str, sdoc: dict, path: str, detail: str = ""):
    await log_activity({"email": f"[API] {key.get('name', 'key')}"}, action, sdoc, path, detail)


async def _resolve_backend_apikey(storage_id: str, key: dict, need_write: bool):
    perm = apikey_permission_for(key, storage_id)
    if perm is None:
        raise HTTPException(status_code=403, detail="This API key has no access to this storage")
    if need_write and perm != "write":
        raise HTTPException(status_code=403, detail="This API key is read-only for this storage")
    doc = await get_storage_or_404(storage_id)
    try:
        return build_backend(doc["type"], decrypt_config(doc)), doc
    except StorageError as e:
        raise HTTPException(status_code=400, detail=str(e))


v1_router = APIRouter(prefix="/api/v1")


@v1_router.get("/ping")
async def v1_ping(key: dict = Depends(get_api_client)):
    return {"ok": True, "name": key.get("name"), "storages": key.get("storages", [])}


@v1_router.get("/storages")
async def v1_storages(key: dict = Depends(get_api_client)):
    result = []
    for a in key.get("storages", []):
        try:
            doc = await db.storages.find_one({"_id": ObjectId(a["storage_id"])})
        except Exception:
            doc = None
        if doc:
            pub = storage_public(doc)
            pub["permission"] = a.get("permission", "read")
            result.append(pub)
    return result


@v1_router.get("/storages/{storage_id}/files")
async def v1_list(storage_id: str, path: str = "", key: dict = Depends(get_api_client)):
    backend, sdoc = await _resolve_backend_apikey(storage_id, key, need_write=False)
    try:
        items = await run_in_threadpool(backend.list, path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_storage_error(e))
    await log_api_activity(key, "api_list", sdoc, path)
    return {"path": path, "items": items}


@v1_router.get("/storages/{storage_id}/download")
async def v1_download(storage_id: str, path: str, key: dict = Depends(get_api_client)):
    backend, sdoc = await _resolve_backend_apikey(storage_id, key, need_write=False)
    try:
        stream, size = await run_in_threadpool(backend.download, path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_storage_error(e))
    await log_api_activity(key, "api_download", sdoc, path)
    filename = path.rstrip("/").split("/")[-1]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    if size and size > 0:
        headers["Content-Length"] = str(size)
    return StreamingResponse(stream, media_type="application/octet-stream", headers=headers)


@v1_router.post("/storages/{storage_id}/upload")
async def v1_upload(
    storage_id: str,
    path: str = Form(""),
    file: UploadFile = File(...),
    key: dict = Depends(get_api_client),
):
    backend, sdoc = await _resolve_backend_apikey(storage_id, key, need_write=True)
    try:
        def do_upload():
            _ensure_dir(backend, path)
            return backend.upload(path, file.file, file.filename)
        stored = await run_in_threadpool(do_upload)
        await _invalidate_usage(storage_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {humanize_storage_error(e)}")
    await log_api_activity(key, "api_upload", sdoc, stored)
    return {"status": "uploaded", "path": stored}


@v1_router.post("/storages/{storage_id}/folder")
async def v1_folder(storage_id: str, body: FolderBody, key: dict = Depends(get_api_client)):
    backend, sdoc = await _resolve_backend_apikey(storage_id, key, need_write=True)
    try:
        await run_in_threadpool(backend.mkdir, body.path, body.name)
        await _invalidate_usage(storage_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_storage_error(e))
    target = f"{body.path}/{body.name}".strip("/")
    await log_api_activity(key, "api_create_folder", sdoc, target)
    return {"status": "created", "path": target}


@v1_router.delete("/storages/{storage_id}/files")
async def v1_delete(storage_id: str, path: str, is_dir: bool = False, key: dict = Depends(get_api_client)):
    backend, sdoc = await _resolve_backend_apikey(storage_id, key, need_write=True)
    try:
        await run_in_threadpool(backend.delete, path, is_dir)
        await _invalidate_usage(storage_id)
    except Exception as e:
        raise HTTPException(status_code=400, detail=humanize_storage_error(e))
    await log_api_activity(key, "api_delete", sdoc, path)
    return {"status": "deleted"}


# ---------------------------------------------------------------- app wiring
app.include_router(api_router)
app.include_router(v1_router)

_cors_env = os.environ.get("CORS_ORIGINS", "*")
_cors_origins = [o.strip() for o in _cors_env.split(",") if o.strip()] or ["*"]
# App auth uses Bearer tokens (no cookies), so credentials aren't required.
# Browsers reject "*" together with allow_credentials=True, so only enable
# credentials when explicit origins are configured.
_allow_credentials = "*" not in _cors_origins

app.add_middleware(
    CORSMiddleware,
    allow_credentials=_allow_credentials,
    allow_origins=_cors_origins,
    allow_methods=["*"],
    allow_headers=["*"],
)
logger.info("CORS origins=%s credentials=%s", _cors_origins, _allow_credentials)


DEFAULT_ADMIN_EMAIL = "admin@example.com"
DEFAULT_ADMIN_PASSWORD = "admin123"


async def _create_admin(email: str, password: str):
    await db.users.insert_one(
        {
            "email": email,
            "password_hash": hash_password(password),
            "name": "Administrator",
            "role": "admin",
            "access": [],
            "created_at": datetime.now(timezone.utc).isoformat(),
        }
    )


async def seed_admin():
    # Treat empty strings (e.g. panel-injected empty env vars) as "not set".
    admin_email = (os.environ.get("ADMIN_EMAIL") or "").strip().lower()
    admin_password = os.environ.get("ADMIN_PASSWORD") or ""

    if admin_email and admin_password:
        existing = await db.users.find_one({"email": admin_email})
        if existing is None:
            await _create_admin(admin_email, admin_password)
            logger.info("Seeded admin user %s", admin_email)
        elif not verify_password(admin_password, existing["password_hash"]):
            await db.users.update_one(
                {"email": admin_email},
                {"$set": {"password_hash": hash_password(admin_password), "role": "admin"}},
            )
            logger.info("Updated admin password for %s", admin_email)
        return

    # No admin env provided: only bootstrap a default admin on a fresh (empty) database
    # so first login is always possible. Once any user exists, these vars are not needed.
    if await db.users.count_documents({}) == 0:
        await _create_admin(DEFAULT_ADMIN_EMAIL, DEFAULT_ADMIN_PASSWORD)
        logger.info(
            "No ADMIN_EMAIL/ADMIN_PASSWORD set. Seeded default admin %s / %s "
            "(set ADMIN_EMAIL & ADMIN_PASSWORD to customize).",
            DEFAULT_ADMIN_EMAIL,
            DEFAULT_ADMIN_PASSWORD,
        )
    else:
        logger.info("Admin env not set and users already exist; skipping admin seeding.")


@app.on_event("startup")
async def on_startup():
    # Remove any invalid users (e.g. an admin seeded with an empty email when
    # ADMIN_EMAIL/ADMIN_PASSWORD were injected empty on an early deploy).
    await db.users.delete_many({"$or": [{"email": ""}, {"email": None}, {"email": {"$exists": False}}]})
    await db.users.create_index("email", unique=True)
    await db.activity_logs.create_index([("timestamp", -1)])
    await db.activity_logs.create_index("action")
    await db.shares.create_index("token", unique=True)
    await db.shares.create_index("created_by")
    await db.api_keys.create_index("key_hash", unique=True)
    await db.api_keys.create_index([("created_at", -1)])
    await seed_admin()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
