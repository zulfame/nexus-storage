# Nexus Storage Manager

A multi-storage management system to manage files across **AWS S3**, **S3-compatible** (MinIO,
Wasabi, etc.), **Samba/SMB** shares, and **SFTP** servers from a single web UI, with JWT
authentication and **per-storage user access control** (read-only / read-write).

Built to the **Nexus Panel deployment contract**: FastAPI + MongoDB backend, React frontend,
all configuration via environment variables.

## Features

- JWT email/password authentication (admin seeded from env on startup); in-app change password.
- Admin dashboard with storage & user statistics (S3 / Samba / SFTP breakdown, recent activity).
- Add / edit / delete / **test** storage connections for **S3**, **Samba/SMB**, and **SFTP**
  (credentials encrypted at rest; configurable ports; secrets revealable in the edit form for
  verification via an eye toggle).
- User management with **per-storage access grants** (read or write).
- **Google-Drive-style File Browser**:
  - List **and** grid views (with real image thumbnails, lazy-loaded).
  - Breadcrumb navigation with collapse (`…` menu) for deep paths.
  - Per-folder search.
  - Upload via an animated modal drop-zone with **per-file progress bars** + drag-and-drop; toast
    notifications on success/failure.
  - Download, delete, create folder.
  - **Rename, Move to…, Copy to…** for files and folders (folder-picker dialog).
  - **Right-click context menu** and a mobile-friendly kebab (⋮) menu.
  - **File preview** for images, PDF, text/code, Word (`.docx`), Excel/CSV (`.xlsx`/`.csv`),
    video and audio.
- **Manage App**: dynamic branding (name, tagline, meta description, favicon, logo, primary color).
- **Activity Logs**: server-side pagination, category filter, clear-by-date-range.
- Role-based UI: admins manage connections, users & app settings; users only see storages
  assigned to them.

## Repo Structure

```
backend/    FastAPI app (entrypoint server.py exports `app`)
frontend/   React app (all API calls use REACT_APP_BACKEND_URL + /api)
```

## Backend

- Entrypoint `backend/server.py` exports a FastAPI object named `app`.
  Run with `uvicorn server:app --host 0.0.0.0 --port 8001`.
- Every route is prefixed with `/api`.
- Install deps: `pip install -r backend/requirements.txt` (Python 3.11).
- Reads all config from environment variables (see table below). Nothing is hardcoded.
- Storage backends: `boto3` (S3), `smbprotocol`/`smbclient` (Samba), `paramiko` (SFTP). Blocking
  storage calls run in a threadpool; connection errors trigger an auto-reconnect retry wrapper.

## Frontend

- `yarn build` (Node 20). Warnings do not fail the build.
- All API calls use `${process.env.REACT_APP_BACKEND_URL}/api/...`.

## Environment Variables

| Variable | Required/Optional | Default Value | Description |
|----------|-------------------|---------------|-------------|
| MONGO_URL | Required | - | MongoDB connection string (injected by panel) |
| DB_NAME | Required | - | MongoDB database name (injected by panel) |
| CORS_ORIGINS | Required | * | Comma-separated allowed CORS origins |
| REACT_APP_BACKEND_URL | Required | - | Backend base URL used by the frontend (injected by panel) |
| JWT_SECRET | Required | (auto by panel) | JWT signing key; also derives the credential encryption key |
| ADMIN_EMAIL | Optional | admin@example.com | Initial admin email. Seeded only on a fresh (empty) database. Not needed once any user exists. |
| ADMIN_PASSWORD | Optional | admin123 | Initial admin password. Seeded only on a fresh (empty) database. Not needed once any user exists. |
| LOCAL_STORAGE_DIR | Optional | /app/data | Persistent files/scratch folder (mounted volume) |
| ACCESS_TOKEN_MINUTES | Optional | 1440 | JWT access token lifetime in minutes |

All variables are read via `os.environ.get(...)`. Only the ones marked **Required** without a
default will block deploy.

> **First login / admin bootstrap:** On a fresh (empty) database the backend always seeds a
> working admin so you can log in immediately:
> - If `ADMIN_EMAIL` **and** `ADMIN_PASSWORD` are set, that account is created (and its password
>   kept in sync on restart).
> - If they are **empty or unset**, a default admin is seeded: **`admin@example.com` / `admin123`**
>   (change the password from the in-app user menu after logging in).
>
> Once you have logged in and created/managed users in the database, `ADMIN_EMAIL` and
> `ADMIN_PASSWORD` are **no longer needed** — the backend will not re-seed when users already exist.

Storage backend credentials (S3 keys, Samba/SFTP passwords) are entered
through the UI and stored **encrypted** in MongoDB — they are not environment variables.

## API Reference

All endpoints are prefixed with `/api`. Auth uses `Authorization: Bearer <token>`.
Roles: **any** = any authenticated user, **admin** = admin only.

### Auth
| Method | Path | Role | Description |
|--------|------|------|-------------|
| POST | `/api/auth/login` | public | Login with `{email,password}` → `{access_token, user}` |
| GET | `/api/auth/me` | any | Current user profile |
| POST | `/api/auth/change-password` | any | `{current_password,new_password}` |

### Users (admin)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/users` | admin | List users |
| POST | `/api/users` | admin | Create user `{email,name,password,role}` |
| PUT | `/api/users/{id}` | admin | Update user (name/role/password) |
| DELETE | `/api/users/{id}` | admin | Delete user |
| PUT | `/api/users/{id}/access` | admin | Set per-storage access `[{storage_id,permission}]` |

### Storages
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/storages` | any | List storages (secrets never returned; users see only granted) |
| POST | `/api/storages` | admin | Create storage `{name,type,config}` (type: s3/samba/sftp) |
| PUT | `/api/storages/{id}` | admin | Update storage |
| DELETE | `/api/storages/{id}` | admin | Delete storage |
| GET | `/api/storages/{id}/config` | admin | Decrypted config (for edit form pre-fill) |
| POST | `/api/storages/test` | admin | Test an unsaved connection `{type,config}` |
| POST | `/api/storages/{id}/test` | admin | Test a saved connection |

### Files
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/storages/{id}/files?path=` | read | List folder contents |
| POST | `/api/storages/{id}/files/upload` | write | Multipart upload (`path`, `file`) |
| GET | `/api/storages/{id}/files/download?path=` | read | Download a file (stream) |
| DELETE | `/api/storages/{id}/files?path=&is_dir=` | write | Delete file/folder |
| POST | `/api/storages/{id}/files/folder` | write | Create folder `{path,name}` |
| POST | `/api/storages/{id}/files/move` | write | Move/rename or copy `{src,dst,is_dir,copy}` |
| POST | `/api/storages/{id}/files/transfer` | read src / write dst | Cross-storage move/copy `{dest_storage_id,src,dst,is_dir,move}` (streamed, 500MB/file cap) |
| GET | `/api/storages/{id}/usage?refresh=` | read | Storage usage (total size, file/folder counts); cached, `refresh=1` recomputes |
| POST | `/api/storages/{id}/files/share` | read | Create a public share link `{path,expires_days,password?}` |

### Shares
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/shares` | any | List own shares (admins see all) |
| DELETE | `/api/shares/{id}` | owner/admin | Revoke a share |
| GET | `/api/share/{token}` | public | Share metadata (name, size, requires_password, expiry) |
| GET | `/api/share/{token}/download?password=` | public | Download the shared file (validates expiry + password) |

### Logs / Settings / Misc
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/logs?page=&size=&category=` | admin | Paginated activity logs |
| DELETE | `/api/logs?start=&end=` | admin | Clear logs by date range |
| GET | `/api/settings` | public | App branding settings |
| PUT | `/api/settings` | admin | Update app branding settings |
| POST | `/api/errors` | any | Client-side error reporting |
| GET | `/api/dashboard/stats` | admin | Dashboard counters |

## Deployment Checklist

1. `backend/server.py` exports `app`. ✅
2. Every route is prefixed with `/api`. ✅
3. Frontend uses `REACT_APP_BACKEND_URL` for all requests. ✅
4. No URL / port / secret is hardcoded. ✅
5. This README has a `## Environment Variables` section with the full 4-column table. ✅

See [`ROADMAP.md`](./ROADMAP.md) for planned enhancements, potential improvements, and the
proposed client-facing programmatic API (API keys + CRUD/manage endpoints).
