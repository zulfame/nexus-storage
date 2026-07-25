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

## Implemented (2026-07-24, later iterations)
- Light theme (Google-Drive style), Poppins font, header/sidebar shadows, fully responsive
  (mobile drawer, scrollable tables). SEO noindex.
- Auto-reconnect: S3 (rebuild client) & Samba (reset+re-register session) retry wrapper on
  connection errors, with a `reconnected` flag surfaced as a 'reconnect' activity log.
- Blocking S3/Samba calls moved to threadpool (run_in_threadpool) — never block event loop.
- Connection/lifecycle activity logging: storage_added/updated/deleted, connection_ok/failed,
  reconnect. Logs endpoint returns `detail`.
- Redesigned Logs Activity page: summary stat cards, All/File/Connection filter tabs,
  informative table (activity badge, avatar, storage, details, relative time).
- Guarded update_storage against secret loss on storage type change.
- Verified: 22/22 backend tests, 100% frontend flows (desktop + mobile).

## Implemented (2026-07-24, iterations 5-6)
- Manage App page (public GET /api/settings, admin PUT): app name, tagline, meta description,
  favicon URL, logo URL, primary color — applied dynamically across all pages incl. login
  (document.title, meta, favicon, branding) via SettingsContext.
- Sidebar order: Dashboard, File Browser, List Storage, Logs Activity, Manage App, Manage User.
- Dashboard: recent-activity feed, storage breakdown bars, team summary (Getting Started removed).
- Getting Started card moved to List Storage (full-width).
- Logs Activity: server-side pagination (25/page) with counts, category filter, and Clear-Logs
  by date range (DELETE /api/logs?start&end).
- Header UserMenu on every page (incl. Files empty-state) with Change Password dialog +
  Sign out; POST /api/auth/change-password (bcrypt verify + rehash, >=6 chars).
- Verified: 32/32 backend tests; frontend flows pass desktop + mobile.

## Implemented (2026-06, fork: SFTP + secret reveal + modal redesign)
- SFTP storage type (paramiko): SFTPBackend with test/list/upload/download/delete(recursive)/mkdir,
  auto-reconnect, configurable port (default 2222), optional base_path (relative=home, /abs=root).
  Registered in build_backend; server handles encrypt/decrypt/public-config for 'sftp'.
- Password/secret UX: reusable PasswordInput + Field eye-toggle across Login, Storages
  (S3 secret, Samba/SFTP password), Users (add/edit), Change Password. Values masked by default.
- Secret verification on Edit: new admin endpoint GET /api/storages/{id}/config returns the
  DECRYPTED config so the Edit dialog pre-fills real secrets (revealable via eye), while the
  public GET /api/storages list still never leaks secrets.
- Storage modal redesign: connection type moved to a shadcn Select at the top (with icon +
  description), fields auto-adjust, 2/3-col grid layout, dynamic header icon, X close button.
- Dashboard breakdown + stats include SFTP count.
- Verified: iteration 9 (both) 53/53 backend + full UI incl. live SFTP server (127.0.0.1:2222);
  iteration 10 (frontend) 100% for redesigned modal.
- Note: design_guidelines.json describes a dark theme but the app is intentionally LIGHT-themed
  and consistent — keep the light theme unless the user explicitly asks to switch.

## Implemented (2026-06, fork: File Browser UX + upload progress)
- Removed the Getting Started card from List Storage page.
- File Browser overhaul: list/grid view toggle (persisted in localStorage), per-folder search,
  colored file-type icons (lib/fileTypes.js), row/card click opens preview or downloads.
- FilePreview modal (components/FilePreview.jsx): images, pdf (iframe), text/code, docx
  (mammoth), xlsx/csv (SheetJS with sheet tabs), video, audio; 25MB guard + graceful fallbacks.
- Breadcrumb collapse: deep paths show root › … (dropdown of hidden folders) › last 2; header
  actions (Folder/Upload/UserMenu) stay pinned right on one row (no wrap).
- Animated Upload modal (components/UploadDialog.jsx): multi-file sequential upload with
  per-file progress bars (axios onUploadProgress) to 100% + done/error states.
- Drag-and-drop upload onto the browser area with a 'Drop files' overlay.
- Fixed storage-switch race condition in loadFiles (reqId ref guard + clear on switch).
- Storage sidebar/type icons include SFTP (HardDrive).
- Verified: iteration 11 (File Browser ~95%, race bug noted) + iteration 12 (100%, upload
  progress + drag-drop + race fix). New deps: mammoth, xlsx.

## Implemented (2026-06, fork: Drive-style file ops)
- File operations (all backends S3/Samba/SFTP): rename, move-to, copy-to for files AND folders.
  Backend move(src,dst,is_dir)+copy(src,dst,is_dir); endpoint POST /files/move {src,dst,is_dir,copy}
  with self-move / folder-into-itself guards. FILE_ACTIONS + logMeta include move/copy.
- Right-click context menu (shadcn ContextMenu) on rows & grid cards: Open/Preview, Download,
  Rename, Move to…, Copy to…, Delete. Plus mobile-friendly kebab (⋮) DropdownMenu in the list.
- Rename dialog (in-place, same parent). MoveCopyDialog: folder-picker with breadcrumb + invalid
  target guard, calls move endpoint with copy flag.
- Real image thumbnails in grid + list via ThumbImage (IntersectionObserver lazy load, cached,
  8MB cap) hitting the download endpoint.
- Verified: iteration 14 (both) 100% frontend + backend curl-verified move/copy/rename on SFTP.

## Implemented (2026-06, fork: Modified column + sorting)
- List view: new **Modified** date/time column between Size and Actions (fmtDate; hidden on mobile).
- **Sortable columns**: clickable Name/Size/Modified headers (sort-<key>) toggle asc/desc with arrow
  indicator; folders always grouped on top. Grid view gets a Sort dropdown (grid-sort-button).
- Login hero copy/chips updated to mention SFTP.
- Verified: iteration 15 (frontend) 100%.

## Backlog / Next
See `ROADMAP.md` for the full prioritized backlog, potential improvements, and the proposed
client-facing programmatic API (API keys + versioned `/api/v1` CRUD/manage endpoints).

Highlights:
- P1: multi-select + bulk file ops; storage config validation + 404 on bad ids; SFTP private-key
  auth; **client-facing programmatic API** (API keys, `/api/v1` storage/file/user CRUD).
- P2: cross-storage move/copy; storage usage metrics; dedicated STORAGE_ENCRYPTION_KEY; log
  aggregation + BSON dates; folder/chunked uploads; shareable links; recursive search.

## Documentation
- `README.md`: features, env-var table, full `/api` reference, deployment checklist.
- `ROADMAP.md`: potential improvements, prioritized enhancements, proposed client API.
- `memory/PRD.md` (this file): dated implementation history + architecture.
