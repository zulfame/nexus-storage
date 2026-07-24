# Nexus Storage Manager

A multi-storage management system to manage files across **AWS S3**, **S3-compatible** (MinIO,
Wasabi, etc.) and **Samba/SMB** shares from a single web UI, with JWT authentication and
**per-storage user access control** (read-only / read-write).

Built to the **Nexus Panel deployment contract**: FastAPI + MongoDB backend, React frontend,
all configuration via environment variables.

## Features

- JWT email/password authentication (admin seeded from env on startup).
- Admin dashboard with storage & user statistics.
- Add / edit / delete / test **S3** and **Samba** storage connections (credentials encrypted at rest).
- User management with **per-storage access grants** (read or write).
- File browser: breadcrumb navigation, list, upload, download, delete, create folder.
- Role-based UI: admins manage connections & users; users only see storages assigned to them.

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

Storage backend credentials (S3 keys, Samba passwords) are entered
through the UI and stored **encrypted** in MongoDB — they are not environment variables.

## Deployment Checklist

1. `backend/server.py` exports `app`. ✅
2. Every route is prefixed with `/api`. ✅
3. Frontend uses `REACT_APP_BACKEND_URL` for all requests. ✅
4. No URL / port / secret is hardcoded. ✅
5. This README has a `## Environment Variables` section with the full 4-column table. ✅
