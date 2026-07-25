# Nexus Storage Manager — Roadmap & Enhancements

This document tracks **potential improvements** and the **feature backlog**. Most items listed here
have since been implemented (marked ✅); remaining open items are called out per priority.

Last updated: 2026-06 (post Client-API + backlog delivery).

---

## 1. Potential Improvements (suggested during development)

These are UX/polish ideas surfaced across sessions. Small-to-medium effort, high perceived value.

| # | Improvement | Area | Notes |
|---|-------------|------|-------|
| PI-1 | **Real-time connection status** (online/offline) badge on each storage card | Dashboard / List Storage | Periodic/background health check per storage so users see which NAS/bucket is reachable without clicking "Test". |
| PI-2 | **UI consistency polish** across Dashboard, Logs Activity, Manage User, Manage App | Frontend | Bring the remaining admin pages to the same refined level as File Browser & List Storage (spacing, cards, empty states, micro-animations). |
| PI-3 | **Multi-select + bulk actions** (move / copy / delete / share / download multiple items) | File Browser | ✅ Implemented (2026-06). Checkbox selection + select-all, blue selection toolbar, bulk delete/move/copy/share/download. |
| PI-4 | **Drag-to-move** between folders / onto breadcrumb | File Browser | ✅ Implemented (2026-06). Single item or whole multi-selection; drop on folder row/card or breadcrumb crumb. |
| PI-5 | **Column sort** (name / size / modified) in list view | File Browser | ✅ Implemented. Sort toggles on table headers. |
| PI-6 | **Grid image thumbnails** | File Browser | ✅ Implemented (ThumbImage, lazy-loaded, cached). |
| PI-7 | **Toast + progress polish** | File Browser | ✅ Upload progress modal + toasts; ✅ Download manager panel with per-file progress + cancel (abort). |

---

## 2. Feature Enhancements (prioritized backlog)

### P0 — none outstanding
Core product is functional and verified.

### P1 — high priority
- **FE-1: Multi-select & bulk file operations** (move/copy/delete/share/download many). ✅ Implemented (2026-06).
- **FE-2: Storage config validation** — required fields per type on create/update + `404` for
  unknown/malformed storage ids. ✅ Implemented (2026-06).
- **FE-3: SFTP private-key auth** — SSH key (Ed25519/RSA/ECDSA) + passphrase in addition to password.
  ✅ Implemented (2026-06); verified against a real SSH server.
- **FE-4: Client-facing programmatic API** — API keys + versioned `/api/v1` CRUD. ✅ Implemented
  (2026-06). See Section 3 for the delivered routes.

### P2 — medium priority (all delivered)
- **FE-5: Cross-storage move/copy** ✅  · **FE-6: Storage usage metrics** ✅ (Used/Total capacity meter)
  · **FE-7: Dedicated `STORAGE_ENCRYPTION_KEY`** ✅ · **FE-8: Log aggregation** ✅
  · **FE-9: Folder/chunked upload** ✅ (chunked) · **FE-10: Shareable links** ✅ (+ OG unfurl page)
  · **FE-11: Recursive search** ✅.

### P3 — nice to have (open)
- **FE-12: File versioning / trash** (soft-delete + restore where supported).
- **FE-13: 2FA / TOTP** for admin accounts.
- **FE-14: Webhooks** on file events (uploaded/deleted/moved).
- **FE-15: Themes** (light/dark toggle) and per-user preferences.
- **FE-16: True SSR/prerender OG** for the app root/landing (share links already unfurl via
  `/api/share/{token}/og`).
- **FE-17: Client SDK snippets** (copy-paste Python/JS) in the API Documentation card.

---

## 3. Client-facing Programmatic API — ✅ DELIVERED (2026-06)

Implemented so external clients can integrate programmatically. **Note:** the delivered routes differ
slightly from the original proposal below — the actual, current contract is:

- **Admin key management** lives under `/api/api-keys` (JWT admin), UI at **Manage APIs** (`/manage-apis`).
- **Client API** is versioned under **`/api/v1`** and auth'd via `Authorization: Bearer <key>` **or**
  `X-API-Key: <key>`. Keys are `sk_live_…`, SHA-256 hashed at rest, shown once, scoped per-storage
  (read/write), revocable, with `request_count` + `last_used_at`. Every call is audit-logged
  (`[API] <name>`, category `api`).
- **Delivered client endpoints:** `GET /api/v1/ping`, `GET /api/v1/storages`,
  `GET /api/v1/storages/{id}/files`, `GET /api/v1/storages/{id}/download`,
  `POST /api/v1/storages/{id}/upload`, `POST /api/v1/storages/{id}/folder`,
  `DELETE /api/v1/storages/{id}/files`.
- **Not yet built (future):** storage/user CRUD via `/api/v1`, `move/copy` via `/api/v1`, key rotation,
  rate limiting, and a published OpenAPI spec. In-app docs (accordion + samples) already ship on the
  Manage APIs page.

The original design sketch (kept for reference) follows.

### 3.1 Design principles
- **Versioned** under `/api/v1/...` so the UI's internal routes and the public client API can evolve
  independently.
- **API-key auth** via `X-API-Key: <key>` header (alternative to JWT). Keys are hashed at rest
  (only shown once at creation).
- **Scoped keys**: each key is bound to a set of storages + permission (read / write) and optional
  admin capability — never broader than the granting admin intends.
- **Rate limiting** per key; standard JSON error envelope `{error:{code,message}}`.
- **Pagination** (`page`, `size`) and consistent list envelopes `{items, total, page, size}`.
- **Audit**: every key action is written to the activity log with the key label as the actor.

### 3.2 API Key management (admin, via UI + API)
| Method | Path | Role | Description |
|--------|------|------|-------------|
| GET | `/api/v1/keys` | admin | List API keys (metadata only, never the secret) |
| POST | `/api/v1/keys` | admin | Create key `{label, scopes:[{storage_id,permission}], expires_at?}` → returns the plaintext key **once** |
| PATCH | `/api/v1/keys/{id}` | admin | Update label / scopes / enabled |
| DELETE | `/api/v1/keys/{id}` | admin | Revoke a key |
| POST | `/api/v1/keys/{id}/rotate` | admin | Rotate secret (returns new key once) |

Data model (proposed):
`api_keys: { id, label, key_hash, prefix, scopes:[{storage_id,permission}], is_admin, enabled, expires_at, created_by, created_at, last_used_at }`

### 3.3 Storage management API (CRUD)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/storages` | key/JWT | List storages the key can access |
| POST | `/api/v1/storages` | admin key | Create storage `{name,type,config}` |
| GET | `/api/v1/storages/{id}` | key/JWT | Storage metadata (secrets never returned) |
| PATCH | `/api/v1/storages/{id}` | admin key | Update storage |
| DELETE | `/api/v1/storages/{id}` | admin key | Delete storage |
| POST | `/api/v1/storages/{id}/test` | admin key | Test connection |

### 3.4 File operations API (CRUD)
| Method | Path | Auth (scope) | Description |
|--------|------|--------------|-------------|
| GET | `/api/v1/storages/{id}/files?path=&page=&size=` | read | List folder (paginated) |
| GET | `/api/v1/storages/{id}/files/stat?path=` | read | Metadata for a single path |
| GET | `/api/v1/storages/{id}/files/content?path=` | read | Download / stream file bytes |
| POST | `/api/v1/storages/{id}/files/content?path=` | write | Upload / overwrite (raw body or multipart) |
| POST | `/api/v1/storages/{id}/folders` | write | Create folder `{path,name}` |
| POST | `/api/v1/storages/{id}/files/move` | write | Move/rename `{src,dst,is_dir}` |
| POST | `/api/v1/storages/{id}/files/copy` | write | Copy `{src,dst,is_dir}` |
| DELETE | `/api/v1/storages/{id}/files?path=&is_dir=` | write | Delete file/folder |
| POST | `/api/v1/storages/{id}/files/link` | read | Create a time-limited signed download link (pairs with FE-10) |

### 3.5 User & access management API (admin)
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/users` | admin key | List users |
| POST | `/api/v1/users` | admin key | Create user |
| PATCH | `/api/v1/users/{id}` | admin key | Update user |
| DELETE | `/api/v1/users/{id}` | admin key | Delete user |
| PUT | `/api/v1/users/{id}/access` | admin key | Set per-storage access |

### 3.6 Utility / observability
| Method | Path | Auth | Description |
|--------|------|------|-------------|
| GET | `/api/v1/ping` | key | Auth check + key scope echo |
| GET | `/api/v1/usage` | admin key | Aggregate usage/metrics (pairs with FE-6) |
| GET | `/api/v1/logs?...` | admin key | Activity logs (paginated, filterable) |

### 3.7 Deliverables when building this
- OpenAPI/Swagger spec published at `/api/v1/openapi.json` + interactive docs.
- Auth middleware resolving `X-API-Key` → key doc → scope enforcement.
- Rate limiting + per-key `last_used_at`.
- UI page under existing admin surface (no new top-level menu required) to create/revoke keys and
  copy the secret once.

---

## 4. Implemented milestones (summary)
See `PRD.md` for the full, dated implementation history. Highlights: JWT auth; storage CRUD + test
(S3/Samba/**SFTP incl. private-key**) with config validation + `404`s; per-storage access; File
Browser (storage-picker landing, list/grid, sortable columns, preview for
images/pdf/docx/xlsx/csv/text/media, upload progress + drag-drop, **download manager + cancel**,
rename/move/copy, **cross-storage transfer**, **multi-select bulk actions**, **drag-to-move**,
context menu, thumbnails, recursive search); per-storage **capacity meter**; **shareable links + OG
unfurl page**; **Manage APIs** (API keys + `/api/v1` client API with in-app docs, all calls logged);
Dashboard + Logs for users (scoped); app branding with **app-wide primary color** + **OG/meta
injection**; activity logs (All/File/**API**/Connections).
