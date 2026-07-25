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
- Per-storage **Capacity/quota (GB)** with a Used/Total meter on List Storage & the File Browser picker.
- **SFTP private-key auth** (Ed25519/RSA/ECDSA) with optional passphrase, in addition to password.
- **Google-Drive-style File Browser**:
  - Full-width **storage picker** landing (cards like List Storage, "Open File Browser"); storages
    without access are shown grayed/disabled. No cramped internal sidebar.
  - List **and** grid views (with real image thumbnails, lazy-loaded), **sortable** columns
    (name / size / modified).
  - Breadcrumb navigation with collapse (`…` menu) for deep paths.
  - Per-folder **and** recursive whole-storage search.
  - Upload via an animated modal drop-zone with **per-file progress bars** + drag-and-drop; toast
    notifications on success/failure.
  - **Download manager** panel with per-file progress and **cancel** (abort) for large downloads.
  - Download, delete, create folder (delete uses a polished confirmation modal).
  - **Rename, Move to…, Copy to…** for files and folders (folder-picker dialog), incl. **cross-storage** transfer.
  - **Multi-select + bulk actions** (delete / move / copy / share / download many) via checkboxes.
  - **Drag-to-move** a file/folder (or a whole multi-selection) onto a folder row/card or breadcrumb.
  - **Right-click context menu** and a mobile-friendly kebab (⋮) menu.
  - **Inline file preview** for images, PDF, text/code, Word (`.docx`), Excel/CSV (`.xlsx`/`.csv`),
    video and audio (blobs re-typed to the correct MIME so PDFs render instead of downloading).
- **Shareable public links** (time-limited, optional password) with a **server-rendered OG page**
  (`/api/share/{token}/og`) so links unfurl a preview card on WhatsApp/Telegram/etc.
- **Manage APIs** (admin): issue **API keys** for external clients (per-storage read/write scopes,
  revoke/activate, request counts) + a public versioned **`/api/v1`** REST API with in-app docs
  (accordion of endpoints + sample requests). Every API call is recorded in Activity Logs.
- **Manage App**: dynamic branding (name, tagline, meta description, favicon, logo, primary color).
  The **primary color** is applied app-wide (CSS variables) and **Open Graph / meta tags**
  (title, description, favicon, og/twitter) are injected from settings.
- **Activity Logs**: server-side pagination, category filter (All / File / **API** / Connections),
  clear-by-date-range. Available to normal users too (scoped to their storages + own actions).
- **Dashboard** available to admins and users (users see a scoped view without team/user stats).
- Role-based UI: admins manage connections, users, app settings & API keys; users see Dashboard,
  File Browser and Logs, limited to storages assigned to them.

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
| STORAGE_ENCRYPTION_KEY | Optional | (falls back to JWT_SECRET) | Dedicated secret used to encrypt storage credentials at rest. If unset, the JWT_SECRET-derived key is used. Existing credentials keep decrypting via a fallback. |
| LOCAL_STORAGE_DIR | Optional | /app/data | Persistent files/scratch folder (also holds chunked-upload temp files) |
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
| GET | `/api/storages?include_inaccessible=` | any | List storages (secrets never returned; users see only granted, unless `include_inaccessible=true` which also returns no-access ones with `permission:null` for the File Browser picker) |
| POST | `/api/storages` | admin | Create storage `{name,type,config}` (type: s3/samba/sftp; `config.capacity_gb` optional; validated per type) |
| PUT | `/api/storages/{id}` | admin | Update storage (secrets/private_key preserved if left blank) |
| DELETE | `/api/storages/{id}` | admin | Delete storage |
| GET | `/api/storages/{id}/config` | admin | Decrypted config (for edit form pre-fill; incl. private_key/passphrase) |
| POST | `/api/storages/test` | admin | Test an unsaved connection `{type,config}` |
| POST | `/api/storages/{id}/test` | admin | Test a saved connection |

*Config per type:* S3 `{region,endpoint,bucket,access_key,secret_key,capacity_gb?}`, SFTP
`{host,port,username,password?,private_key?,passphrase?,base_path?,capacity_gb?}`, Samba
`{host,share,port,username,password,domain?,capacity_gb?}`. Invalid/malformed ids return `404`.

### Files
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/storages/{id}/files?path=` | read | List folder contents |
| GET | `/api/storages/{id}/files/search?q=&path=` | read | Recursive search across the storage subtree (capped) |
| POST | `/api/storages/{id}/files/upload` | write | Multipart upload (`path`, `file`; auto-creates parent folders) |
| POST | `/api/storages/{id}/files/chunk` | write | Upload one chunk (`upload_id`, `index`, `chunk`) — large files |
| POST | `/api/storages/{id}/files/chunk/complete` | write | Assemble chunks → write file `{upload_id,path,filename}` |
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
| GET | `/api/share/{token}/og` | public | Server-rendered HTML with Open Graph/Twitter meta (unfurl) + redirect to `/share/{token}` |
| GET | `/api/share/{token}/download?password=` | public | Download the shared file (validates expiry + password) |

### API Keys (admin) & Client API (`/api/v1`)
Admin-managed keys authorize external clients. Keys are SHA-256 hashed at rest and the plaintext
`sk_live_…` value is shown **once** at creation.

| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/api-keys` | admin | List keys (masked, with request_count / last_used_at) |
| POST | `/api/api-keys` | admin | Create key `{name, storages:[{storage_id,permission}]}` → returns `key` once |
| PUT | `/api/api-keys/{id}` | admin | Update `{name?, storages?, is_active?}` (revoke/activate) |
| DELETE | `/api/api-keys/{id}` | admin | Delete key |

Client endpoints authenticate via `Authorization: Bearer <key>` **or** `X-API-Key: <key>`, are
scoped to the key's per-storage read/write grants, and **log every call to Activity Logs** as
`[API] <key name>` (category `api`):

| Method | Path | Scope | Description |
|--------|------|-------|-------------|
| GET | `/api/v1/ping` | key | Verify key; echoes name + scopes |
| GET | `/api/v1/storages` | key | List storages the key can access |
| GET | `/api/v1/storages/{id}/files?path=` | read | List folder contents |
| GET | `/api/v1/storages/{id}/download?path=` | read | Download a file (stream) |
| POST | `/api/v1/storages/{id}/upload` | write | Multipart upload (`path`, `file`) |
| POST | `/api/v1/storages/{id}/folder` | write | Create folder `{path,name}` |
| DELETE | `/api/v1/storages/{id}/files?path=&is_dir=` | write | Delete file/folder |

### Logs / Settings / Misc
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/logs?skip=&limit=&category=&search=` | any | Activity logs (paginated; `category` = all/file/api/conn). Non-admins are scoped to their accessible storages + own actions |
| DELETE | `/api/logs?start=&end=` | admin | Clear logs by date range |
| GET | `/api/settings` | public | App branding settings |
| PUT | `/api/settings` | admin | Update app branding settings |
| POST | `/api/errors` | any | Client-side error reporting |
| GET | `/api/dashboard/stats` | any | Dashboard counters (non-admins get a scoped view without user/team counts) |

## Deployment Checklist

1. `backend/server.py` exports `app`. ✅
2. Every route is prefixed with `/api`. ✅
3. Frontend uses `REACT_APP_BACKEND_URL` for all requests. ✅
4. No URL / port / secret is hardcoded. ✅
5. This README has a `## Environment Variables` section with the full 4-column table. ✅

See [`ROADMAP.md`](./ROADMAP.md) for delivered milestones and the remaining backlog. The
client-facing programmatic API (API keys + `/api/v1` CRUD) is **implemented** — see the API Keys
section above and the in-app **Manage APIs** documentation.
