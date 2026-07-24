from dotenv import load_dotenv
from pathlib import Path
import os

ROOT_DIR = Path(__file__).parent
load_dotenv(ROOT_DIR / ".env")

import logging
from datetime import datetime, timezone, timedelta
from typing import List, Optional

import bcrypt
import jwt
from bson import ObjectId
from fastapi import FastAPI, APIRouter, Depends, HTTPException, Request, UploadFile, File, Form, Query
from fastapi.responses import StreamingResponse
from fastapi.security import HTTPBearer
from starlette.concurrency import run_in_threadpool
from motor.motor_asyncio import AsyncIOMotorClient
from pydantic import BaseModel, EmailStr, Field
from starlette.middleware.cors import CORSMiddleware

from crypto_util import encrypt, decrypt
from storage_backends import build_backend, StorageError

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
        "username": cfg.get("username", ""),
        "domain": cfg.get("domain", ""),
        "access_key": cfg.get("access_key", ""),
    }
    return {
        "id": str(doc["_id"]),
        "name": doc["name"],
        "type": doc["type"],
        "config": safe_cfg,
        "created_at": doc.get("created_at"),
    }


def decrypt_config(doc: dict) -> dict:
    cfg = dict(doc.get("config", {}))
    if doc["type"] == "s3" and cfg.get("secret_key"):
        cfg["secret_key"] = decrypt(cfg["secret_key"])
    if doc["type"] == "samba" and cfg.get("password"):
        cfg["password"] = decrypt(cfg["password"])
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


class SettingsBody(BaseModel):
    app_name: str = ""
    tagline: str = ""
    meta_description: str = ""
    favicon_url: str = ""
    logo_url: str = ""
    primary_color: str = ""


DEFAULT_SETTINGS = {
    "app_name": "Nexus Storage Manager",
    "tagline": "All your storage, one clean workspace.",
    "meta_description": "Manage S3 and Samba storage from one workspace, with per-user access control.",
    "favicon_url": "",
    "logo_url": "",
    "primary_color": "#2563eb",
}

FILE_ACTIONS = ["upload", "delete", "delete_folder", "create_folder"]


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
    await db.users.delete_one({"_id": ObjectId(user_id)})
    return {"status": "deleted"}


@api_router.put("/users/{user_id}/access")
async def update_access(user_id: str, body: AccessUpdate, admin: dict = Depends(require_admin)):
    access = [a.model_dump() for a in body.access]
    await db.users.update_one({"_id": ObjectId(user_id)}, {"$set": {"access": access}})
    user = await db.users.find_one({"_id": ObjectId(user_id)})
    return user_public(user)


# ---------------------------------------------------------------- storage routes
@api_router.get("/storages")
async def list_storages(user: dict = Depends(get_current_user)):
    docs = await db.storages.find().sort("created_at", 1).to_list(1000)
    result = []
    for doc in docs:
        perm = user_permission_for(user, str(doc["_id"]))
        if perm is None:
            continue
        pub = storage_public(doc)
        pub["permission"] = perm
        result.append(pub)
    return result


@api_router.post("/storages")
async def create_storage(body: StorageBody, admin: dict = Depends(require_admin)):
    if body.type not in ("s3", "samba"):
        raise HTTPException(status_code=400, detail="type must be s3 or samba")
    cfg = dict(body.config)
    if body.type == "s3" and cfg.get("secret_key"):
        cfg["secret_key"] = encrypt(cfg["secret_key"])
    if body.type == "samba" and cfg.get("password"):
        cfg["password"] = encrypt(cfg["password"])
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
    if body.type == "samba":
        if cfg.get("password"):
            cfg["password"] = encrypt(cfg["password"])
        else:
            cfg["password"] = existing.get("password", "") if same_type else ""
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
        return {"success": False, "message": str(e)}


@api_router.post("/storages/{storage_id}/test")
async def test_saved(storage_id: str, admin: dict = Depends(require_admin)):
    doc = await get_storage_or_404(storage_id)
    try:
        backend = build_backend(doc["type"], decrypt_config(doc))
        await run_in_threadpool(backend.test)
        await log_activity(admin, "connection_ok", doc, "", "Connection test succeeded")
        return {"success": True, "message": "Connection successful"}
    except Exception as e:
        await log_activity(admin, "connection_failed", doc, "", f"Connection test failed: {e}")
        return {"success": False, "message": str(e)}


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
        raise HTTPException(status_code=400, detail=f"Failed to list: {e}")


@api_router.post("/storages/{storage_id}/files/upload")
async def upload_file(
    storage_id: str,
    path: str = Form(""),
    file: UploadFile = File(...),
    user: dict = Depends(get_current_user),
):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        key = await run_in_threadpool(backend.upload, path, file.file, file.filename)
        await log_activity(user, "upload", sdoc, key)
        await _log_reconnect(user, backend, sdoc, key)
        return {"status": "uploaded", "path": key}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Upload failed: {e}")


@api_router.get("/storages/{storage_id}/files/download")
async def download_file(storage_id: str, path: str, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=False)
    try:
        stream, size = await run_in_threadpool(backend.download, path)
        await _log_reconnect(user, backend, sdoc, path)
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Download failed: {e}")
    filename = path.rstrip("/").split("/")[-1]
    headers = {"Content-Disposition": f'attachment; filename="{filename}"'}
    return StreamingResponse(stream, media_type="application/octet-stream", headers=headers)


@api_router.delete("/storages/{storage_id}/files")
async def delete_file(
    storage_id: str, path: str, is_dir: bool = False, user: dict = Depends(get_current_user)
):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        await run_in_threadpool(backend.delete, path, is_dir)
        await log_activity(user, "delete_folder" if is_dir else "delete", sdoc, path)
        await _log_reconnect(user, backend, sdoc, path)
        return {"status": "deleted"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Delete failed: {e}")


@api_router.post("/storages/{storage_id}/files/folder")
async def create_folder(storage_id: str, body: FolderBody, user: dict = Depends(get_current_user)):
    backend, sdoc = await _resolve_backend(storage_id, user, need_write=True)
    try:
        await run_in_threadpool(backend.mkdir, body.path, body.name)
        target = f"{body.path.rstrip('/')}/{body.name}" if body.path else body.name
        await log_activity(user, "create_folder", sdoc, target)
        await _log_reconnect(user, backend, sdoc, target)
        return {"status": "created"}
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=400, detail=f"Create folder failed: {e}")


@api_router.get("/logs")
async def list_logs(
    admin: dict = Depends(require_admin),
    skip: int = Query(0, ge=0),
    limit: int = Query(25, ge=1, le=100),
    category: str = "all",
):
    if category == "file":
        q = {"action": {"$in": FILE_ACTIONS}}
    elif category == "conn":
        q = {"action": {"$nin": FILE_ACTIONS}}
    else:
        q = {}
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
    all_count = await db.activity_logs.count_documents({})
    file_count = await db.activity_logs.count_documents({"action": {"$in": FILE_ACTIONS}})
    reconnect_count = await db.activity_logs.count_documents({"action": "reconnect"})
    counts = {"all": all_count, "file": file_count, "conn": all_count - file_count, "reconnect": reconnect_count}
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


@api_router.put("/settings")
async def update_app_settings(body: SettingsBody, admin: dict = Depends(require_admin)):
    data = body.model_dump()
    data["updated_at"] = datetime.now(timezone.utc).isoformat()
    await db.settings.update_one({"_id": "app"}, {"$set": data}, upsert=True)
    await log_activity(admin, "settings_updated", {"_id": "", "name": None, "type": None}, "", "Application settings updated")
    return await get_settings()


# ---------------------------------------------------------------- dashboard
@api_router.get("/dashboard/stats")
async def dashboard_stats(admin: dict = Depends(require_admin)):
    total_storages = await db.storages.count_documents({})
    s3_count = await db.storages.count_documents({"type": "s3"})
    samba_count = await db.storages.count_documents({"type": "samba"})
    total_users = await db.users.count_documents({})
    admin_count = await db.users.count_documents({"role": "admin"})
    return {
        "total_storages": total_storages,
        "s3_count": s3_count,
        "samba_count": samba_count,
        "total_users": total_users,
        "admin_count": admin_count,
    }


@api_router.get("/")
async def root():
    return {"message": "Nexus Storage Manager API"}


# ---------------------------------------------------------------- app wiring
app.include_router(api_router)

app.add_middleware(
    CORSMiddleware,
    allow_credentials=True,
    allow_origins=os.environ.get("CORS_ORIGINS", "*").split(","),
    allow_methods=["*"],
    allow_headers=["*"],
)


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
    await db.users.create_index("email", unique=True)
    await db.activity_logs.create_index([("timestamp", -1)])
    await db.activity_logs.create_index("action")
    await seed_admin()


@app.on_event("shutdown")
async def on_shutdown():
    client.close()
