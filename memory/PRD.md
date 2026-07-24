# Nexus Storage Manager — PRD

## Original Problem Statement
Build a storage management system to manage multi-storage via S3 and Samba connections, with
per-storage user access permissions. Must follow the Nexus Panel deployment contract (backend
FastAPI+MongoDB exporting `app`, all routes `/api`-prefixed, frontend using
`REACT_APP_BACKEND_URL`, JWT auth seeded from `ADMIN_EMAIL`/`ADMIN_PASSWORD`, no hardcoded
config, README env-var table).

## User Choices
- Auth: JWT email/password (Nexus contract).
- Storage targets: AWS S3 + S3-compatible (MinIO/Wasabi) + Samba/SMB.
- File ops: list, upload, download, delete, create folder.
- Access model: per-storage (read / write).
- Credentials: entered via UI, stored encrypted in MongoDB.

## Architecture
- Backend: FastAPI (`backend/server.py` exports `app`), MongoDB via Motor. Modules:
  `crypto_util.py` (Fernet encryption of secrets, key derived from JWT_SECRET),
  `storage_backends.py` (S3Backend via boto3, SambaBackend via smbprotocol/smbclient).
- Auth: bcrypt + PyJWT Bearer tokens (localStorage on frontend). Admin seeded idempotently.
- Frontend: React (CRA/craco), Tailwind, shadcn/ui, lucide-react, sonner. Poppins font,
  dark tactical theme, cyan accent, rounded-xl surfaces.

## Personas
- Admin: manages storage connections, users, per-storage access, views dashboard & audit logs.
- User: sees only assigned storages, browses/manages files per granted permission.

## Implemented (2026-07-24)
- JWT auth (login, /me), admin seeding, role-based routing.
- Storage CRUD + connection test (S3 & Samba), secrets encrypted at rest & never returned.
- User CRUD + per-storage access assignment (read/write).
- File browser: breadcrumbs, list, upload, download, delete, create folder; permission-gated.
- Admin dashboard stats.
- Activity logging (upload/delete/create-folder) + admin "Logs Activity" page.
- UI polish: Poppins, full-width layouts, rounded-xl, renamed menus (List Storage, Manage User).
- SEO: noindex meta + robots.txt Disallow.
- README `## Environment Variables` table; `.env.example`. Testing: 19/19 backend pass.

## Backlog / Next
- P1: Storage config validation (required fields per type); 404 on unknown/malformed ids;
  reject storage type conversion on PUT; connection-test timeout.
- P2: Logs pagination/filters (user/action/storage/date); dedicated STORAGE_ENCRYPTION_KEY env.
- P2: File rename/move/copy across storages; multi-file upload with progress; storage usage metrics.
