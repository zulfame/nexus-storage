import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { relTime } from "@/lib/logMeta";
import { Accordion, AccordionItem, AccordionTrigger, AccordionContent } from "@/components/ui/accordion";
import { toast } from "sonner";
import {
  KeyRound,
  Plus,
  Trash2,
  Copy,
  Check,
  X,
  Loader2,
  ShieldCheck,
  ShieldOff,
  Cloud,
  Server,
  HardDrive,
  Terminal,
  Book,
  Zap,
} from "lucide-react";

const BASE = (process.env.REACT_APP_BACKEND_URL || "").replace(/\/$/, "");
const V1 = `${BASE}/api/v1`;

const TYPE_ICON = { s3: Cloud, sftp: HardDrive, samba: Server };

const EX_ID = "STORAGE_ID";
const ENDPOINTS = [
  {
    method: "GET",
    path: "/api/v1/ping",
    title: "Verify API key",
    desc: "Returns the key name and the storages it can access. Use it to test authentication.",
    params: [],
    sample: `curl -H "Authorization: Bearer sk_live_xxx" \\\n  ${V1}/ping`,
    response: `{\n  "ok": true,\n  "name": "Mobile app · production",\n  "storages": [\n    { "storage_id": "${EX_ID}", "permission": "read" }\n  ]\n}`,
  },
  {
    method: "GET",
    path: "/api/v1/storages",
    title: "List storages",
    desc: "Lists every storage this API key has been granted access to, with its permission.",
    params: [],
    sample: `curl -H "Authorization: Bearer sk_live_xxx" \\\n  ${V1}/storages`,
    response: `[\n  {\n    "id": "${EX_ID}",\n    "name": "STAGING S3",\n    "type": "s3",\n    "permission": "read"\n  }\n]`,
  },
  {
    method: "GET",
    path: "/api/v1/storages/{id}/files",
    title: "List files & folders",
    desc: "Lists the contents of a folder inside a storage.",
    params: [
      { name: "id", in: "path", required: true, desc: "Storage id" },
      { name: "path", in: "query", required: false, desc: "Folder path (empty = root)" },
    ],
    sample: `curl -H "Authorization: Bearer sk_live_xxx" \\\n  "${V1}/storages/${EX_ID}/files?path=invoices"`,
    response: `{\n  "path": "invoices",\n  "items": [\n    {\n      "name": "jan.pdf",\n      "path": "invoices/jan.pdf",\n      "is_dir": false,\n      "size": 20481,\n      "modified": "2026-06-01T10:00:00+00:00"\n    }\n  ]\n}`,
  },
  {
    method: "GET",
    path: "/api/v1/storages/{id}/download",
    title: "Download a file",
    desc: "Streams the raw file bytes (Content-Disposition: attachment). Requires read access.",
    params: [
      { name: "id", in: "path", required: true, desc: "Storage id" },
      { name: "path", in: "query", required: true, desc: "Full file path" },
    ],
    sample: `curl -H "Authorization: Bearer sk_live_xxx" \\\n  "${V1}/storages/${EX_ID}/download?path=invoices/jan.pdf" \\\n  -o jan.pdf`,
    response: `# Binary file stream (200 OK)\n# Content-Disposition: attachment; filename="jan.pdf"`,
  },
  {
    method: "POST",
    path: "/api/v1/storages/{id}/upload",
    title: "Upload a file",
    desc: "Uploads a file via multipart/form-data. Requires write access. Parent folders are created automatically.",
    params: [
      { name: "id", in: "path", required: true, desc: "Storage id" },
      { name: "path", in: "form", required: false, desc: "Target folder (empty = root)" },
      { name: "file", in: "form", required: true, desc: "The file to upload" },
    ],
    sample: `curl -X POST -H "Authorization: Bearer sk_live_xxx" \\\n  -F "path=invoices" \\\n  -F "file=@/local/jan.pdf" \\\n  ${V1}/storages/${EX_ID}/upload`,
    response: `{\n  "status": "uploaded",\n  "path": "invoices/jan.pdf"\n}`,
  },
  {
    method: "POST",
    path: "/api/v1/storages/{id}/folder",
    title: "Create a folder",
    desc: "Creates a new folder. Requires write access. Send a JSON body.",
    params: [
      { name: "id", in: "path", required: true, desc: "Storage id" },
      { name: "path", in: "body", required: false, desc: "Parent folder" },
      { name: "name", in: "body", required: true, desc: "New folder name" },
    ],
    sample: `curl -X POST -H "Authorization: Bearer sk_live_xxx" \\\n  -H "Content-Type: application/json" \\\n  -d '{"path":"invoices","name":"2026"}' \\\n  ${V1}/storages/${EX_ID}/folder`,
    response: `{\n  "status": "created",\n  "path": "invoices/2026"\n}`,
  },
  {
    method: "DELETE",
    path: "/api/v1/storages/{id}/files",
    title: "Delete a file or folder",
    desc: "Permanently deletes a file or folder. Requires write access.",
    params: [
      { name: "id", in: "path", required: true, desc: "Storage id" },
      { name: "path", in: "query", required: true, desc: "Path to delete" },
      { name: "is_dir", in: "query", required: false, desc: "true when deleting a folder" },
    ],
    sample: `curl -X DELETE -H "Authorization: Bearer sk_live_xxx" \\\n  "${V1}/storages/${EX_ID}/files?path=invoices/jan.pdf&is_dir=false"`,
    response: `{\n  "status": "deleted"\n}`,
  },
];

function MethodBadge({ m }) {
  const map = {
    GET: "bg-emerald-50 text-emerald-700 border-emerald-200",
    POST: "bg-blue-50 text-blue-700 border-blue-200",
    DELETE: "bg-red-50 text-red-600 border-red-200",
  };
  return <span className={`text-[11px] font-bold px-2 py-0.5 rounded-md border ${map[m]}`}>{m}</span>;
}

function CopyBtn({ text, testid }) {
  const [done, setDone] = useState(false);
  const copy = async () => {
    try { await navigator.clipboard.writeText(text); } catch {
      const el = document.createElement("textarea"); el.value = text; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setDone(true); setTimeout(() => setDone(false), 1500);
  };
  return (
    <button onClick={copy} data-testid={testid} className="shrink-0 h-7 w-7 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
      {done ? <Check size={14} /> : <Copy size={14} />}
    </button>
  );
}

function AccessPicker({ storages, value, onChange }) {
  const set = (sid, perm) => {
    const next = { ...value };
    if (perm === "none") delete next[sid];
    else next[sid] = perm;
    onChange(next);
  };
  if (!storages.length) return <p className="text-sm text-gray-400">No storages available. Create a storage first.</p>;
  return (
    <div className="space-y-2 max-h-64 overflow-y-auto pr-1">
      {storages.map((s) => {
        const Ic = TYPE_ICON[s.type] || Server;
        const cur = value[s.id] || "none";
        return (
          <div key={s.id} className="flex items-center gap-3 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
            <span className="h-8 w-8 rounded-lg bg-white border border-gray-200 flex items-center justify-center text-gray-500 shrink-0"><Ic size={15} /></span>
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800 truncate">{s.name}</div>
              <div className="overline">{s.type}</div>
            </div>
            <div className="flex bg-white border border-gray-200 rounded-lg overflow-hidden shrink-0">
              {["none", "read", "write"].map((p) => (
                <button
                  key={p}
                  onClick={() => set(s.id, p)}
                  data-testid={`access-${s.id}-${p}`}
                  className={`text-xs font-medium px-2.5 py-1.5 transition-colors ${cur === p ? (p === "write" ? "bg-emerald-600 text-white" : p === "read" ? "bg-blue-600 text-white" : "bg-gray-500 text-white") : "text-gray-500 hover:bg-gray-100"}`}
                >
                  {p === "none" ? "No access" : p}
                </button>
              ))}
            </div>
          </div>
        );
      })}
    </div>
  );
}

function CreateDialog({ storages, onClose, onCreated }) {
  const [name, setName] = useState("");
  const [access, setAccess] = useState({});
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (!name.trim()) return toast.error("Name is required");
    setSaving(true);
    try {
      const body = { name: name.trim(), storages: Object.entries(access).map(([storage_id, permission]) => ({ storage_id, permission })) };
      const r = await api.post("/api-keys", body);
      onCreated(r.data);
    } catch (e) {
      toast.error(apiError(e, "Failed to create API key"));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[88vh]" data-testid="create-api-key-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center"><KeyRound size={18} /></span>
          <div className="flex-1"><div className="font-semibold text-sm text-gray-900">New API Key</div><div className="text-xs text-gray-400">Grant a client access to specific storages</div></div>
          <button onClick={onClose} aria-label="Close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100"><X size={18} /></button>
        </div>
        <div className="p-5 space-y-4 overflow-y-auto">
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Key name</label>
            <input value={name} onChange={(e) => setName(e.target.value)} data-testid="api-key-name-input" placeholder="e.g. Mobile app · production" className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors" />
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-2">Storage access</label>
            <AccessPicker storages={storages} value={access} onChange={setAccess} />
          </div>
        </div>
        <div className="px-5 py-4 border-t border-gray-100 flex gap-2.5">
          <button onClick={onClose} className="flex-1 text-sm font-semibold px-4 py-2.5 rounded-xl text-gray-600 bg-gray-100 hover:bg-gray-200 transition-colors">Cancel</button>
          <button onClick={submit} disabled={saving} data-testid="create-api-key-submit" className="flex-1 flex items-center justify-center gap-2 text-sm font-semibold px-4 py-2.5 rounded-xl text-white bg-primary hover:bg-blue-700 transition-colors disabled:opacity-70">
            {saving ? <Loader2 size={15} className="animate-spin" /> : <KeyRound size={15} />} Generate Key
          </button>
        </div>
      </div>
    </div>
  );
}

function RevealDialog({ data, onClose }) {
  return (
    <div className="fixed inset-0 z-[75] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150" data-testid="reveal-api-key-dialog">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-emerald-50 text-emerald-600 flex items-center justify-center"><Check size={18} /></span>
          <div className="flex-1"><div className="font-semibold text-sm text-gray-900">API Key created</div><div className="text-xs text-gray-400">Copy it now — it will not be shown again</div></div>
        </div>
        <div className="p-5 space-y-4">
          <div className="flex items-center gap-2 bg-gray-900 rounded-xl px-3.5 py-3">
            <code className="text-xs sm:text-sm text-emerald-300 font-mono break-all flex-1" data-testid="revealed-api-key">{data.key}</code>
            <CopyBtn text={data.key} testid="copy-revealed-key" />
          </div>
          <div className="bg-amber-50 border border-amber-200 rounded-xl px-3.5 py-3 text-xs text-amber-800">
            Store this key securely. For security only a hashed version is kept — we can't show it again.
          </div>
          <button onClick={onClose} data-testid="reveal-done" className="w-full bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 transition-colors">Done</button>
        </div>
      </div>
    </div>
  );
}

function DocRow({ method, path, desc }) {
  return (
    <div className="flex items-start gap-3 py-2.5 border-b border-gray-100 last:border-0">
      <MethodBadge m={method} />
      <code className="text-xs text-gray-800 font-mono break-all flex-1">{path}</code>
      <span className="text-xs text-gray-400 hidden sm:block w-40 shrink-0 text-right">{desc}</span>
    </div>
  );
}

function CodeBlock({ code, testid }) {
  return (
    <div className="relative bg-gray-900 rounded-lg px-3.5 py-3">
      <pre className="text-[11px] sm:text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all pr-8">{code}</pre>
      <div className="absolute top-2 right-2"><CopyBtn text={code} testid={testid} /></div>
    </div>
  );
}

function ParamTable({ rows }) {
  if (!rows?.length) return null;
  return (
    <div className="border border-gray-200 rounded-lg overflow-hidden">
      <table className="w-full text-xs">
        <thead>
          <tr className="bg-gray-50 text-left">
            <th className="px-3 py-1.5 font-semibold text-gray-500">Parameter</th>
            <th className="px-3 py-1.5 font-semibold text-gray-500">In</th>
            <th className="px-3 py-1.5 font-semibold text-gray-500">Required</th>
            <th className="px-3 py-1.5 font-semibold text-gray-500">Description</th>
          </tr>
        </thead>
        <tbody>
          {rows.map((r) => (
            <tr key={r.name} className="border-t border-gray-100">
              <td className="px-3 py-1.5 font-mono text-gray-800">{r.name}</td>
              <td className="px-3 py-1.5 text-gray-500">{r.in}</td>
              <td className="px-3 py-1.5">{r.required ? <span className="text-red-600 font-medium">yes</span> : <span className="text-gray-400">no</span>}</td>
              <td className="px-3 py-1.5 text-gray-600">{r.desc}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

export default function ManageApis() {
  const [keys, setKeys] = useState([]);
  const [storages, setStorages] = useState([]);
  const [loading, setLoading] = useState(true);
  const [showCreate, setShowCreate] = useState(false);
  const [reveal, setReveal] = useState(null);
  const [confirm, setConfirm] = useState(null);
  const [busy, setBusy] = useState(null);

  const load = () => {
    setLoading(true);
    Promise.all([
      api.get("/api-keys").then((r) => setKeys(r.data)).catch((e) => toast.error(apiError(e, "Failed to load keys"))),
      api.get("/storages").then((r) => setStorages(r.data)).catch(() => {}),
    ]).finally(() => setLoading(false));
  };
  useEffect(load, []);

  const storageName = (sid) => storages.find((s) => s.id === sid)?.name || sid.slice(0, 6);

  const toggleActive = async (k) => {
    setBusy(k.id);
    try {
      await api.put(`/api-keys/${k.id}`, { is_active: !k.is_active });
      toast.success(k.is_active ? "Key revoked" : "Key re-activated");
      load();
    } catch (e) {
      toast.error(apiError(e, "Update failed"));
    } finally {
      setBusy(null);
    }
  };

  const del = (k) => {
    setConfirm({
      title: "Delete API key?",
      message: `"${k.name}" will stop working immediately. This cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try { await api.delete(`/api-keys/${k.id}`); toast.success("API key deleted"); load(); }
        catch (e) { toast.error(apiError(e, "Delete failed")); }
      },
    });
  };

  const curlExample = `curl -H "Authorization: Bearer sk_live_xxx" \\\n  ${V1}/storages`;

  return (
    <div>
      <PageHeader overline="Developers" title="Manage APIs" />
      <div className="p-4 sm:p-8 space-y-6">
        {/* Keys card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
          <div className="flex items-center justify-between gap-3 px-5 sm:px-6 py-4 border-b border-gray-100">
            <div className="flex items-center gap-2.5">
              <span className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center"><KeyRound size={18} /></span>
              <div>
                <h3 className="font-display font-semibold text-base text-gray-900">Client API Keys</h3>
                <p className="text-xs text-gray-400">{keys.length} key{keys.length !== 1 ? "s" : ""} · used by external clients</p>
              </div>
            </div>
            <button onClick={() => setShowCreate(true)} data-testid="new-api-key-button" className="flex items-center gap-2 bg-primary text-white text-sm font-semibold px-3.5 sm:px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">
              <Plus size={16} /> <span className="hidden sm:inline">New Key</span>
            </button>
          </div>

          {loading ? (
            <div className="flex items-center justify-center py-16 text-gray-400"><Loader2 size={22} className="animate-spin" /></div>
          ) : keys.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-16 text-gray-400">
              <KeyRound size={38} className="mb-3 opacity-40" />
              <p className="text-sm">No API keys yet. Create one to let external clients access your storages.</p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-sm min-w-[720px]">
                <thead>
                  <tr className="bg-gray-50 text-left border-b border-gray-200">
                    <th className="px-5 py-2.5 overline">Name</th>
                    <th className="px-4 py-2.5 overline">Key</th>
                    <th className="px-4 py-2.5 overline">Access</th>
                    <th className="px-4 py-2.5 overline w-24">Requests</th>
                    <th className="px-4 py-2.5 overline w-32">Last used</th>
                    <th className="px-4 py-2.5 overline w-24">Status</th>
                    <th className="px-4 py-2.5 overline w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody data-testid="api-keys-table">
                  {keys.map((k) => (
                    <tr key={k.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors" data-testid={`api-key-row-${k.id}`}>
                      <td className="px-5 py-3 font-medium text-gray-800">{k.name}</td>
                      <td className="px-4 py-3"><code className="text-xs font-mono text-gray-500">{k.key_masked}</code></td>
                      <td className="px-4 py-3">
                        {k.storages.length === 0 ? (
                          <span className="text-xs text-gray-400">No storages</span>
                        ) : (
                          <div className="flex flex-wrap gap-1">
                            {k.storages.map((a) => (
                              <span key={a.storage_id} className={`text-[11px] font-medium px-2 py-0.5 rounded-md ${a.permission === "write" ? "bg-emerald-50 text-emerald-700" : "bg-blue-50 text-blue-700"}`}>
                                {storageName(a.storage_id)} · {a.permission}
                              </span>
                            ))}
                          </div>
                        )}
                      </td>
                      <td className="px-4 py-3 text-gray-600 tabular-nums">{k.request_count ?? 0}</td>
                      <td className="px-4 py-3 text-gray-400 text-xs">{k.last_used_at ? relTime(k.last_used_at) : "Never"}</td>
                      <td className="px-4 py-3">
                        {k.is_active ? (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-emerald-50 text-emerald-700"><ShieldCheck size={12} /> Active</span>
                        ) : (
                          <span className="inline-flex items-center gap-1 text-[11px] font-semibold px-2 py-1 rounded-md bg-gray-100 text-gray-500"><ShieldOff size={12} /> Revoked</span>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center justify-end gap-1.5">
                          <button onClick={() => toggleActive(k)} disabled={busy === k.id} data-testid={`toggle-api-key-${k.id}`} title={k.is_active ? "Revoke" : "Activate"} className={`h-8 w-8 flex items-center justify-center rounded-lg border transition-colors ${k.is_active ? "border-gray-200 text-gray-500 hover:text-amber-600 hover:border-amber-300" : "border-gray-200 text-gray-500 hover:text-emerald-600 hover:border-emerald-300"}`}>
                            {busy === k.id ? <Loader2 size={14} className="animate-spin" /> : k.is_active ? <ShieldOff size={15} /> : <ShieldCheck size={15} />}
                          </button>
                          <button onClick={() => del(k)} data-testid={`delete-api-key-${k.id}`} title="Delete" className="h-8 w-8 flex items-center justify-center rounded-lg border border-gray-200 text-gray-500 hover:text-red-600 hover:border-red-300 transition-colors">
                            <Trash2 size={15} />
                          </button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </div>

        {/* Documentation card */}
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" data-testid="api-docs-card">
          <div className="flex items-center gap-2.5 px-5 sm:px-6 py-4 border-b border-gray-100">
            <span className="h-9 w-9 rounded-xl bg-violet-50 text-violet-600 flex items-center justify-center"><Book size={18} /></span>
            <div>
              <h3 className="font-display font-semibold text-base text-gray-900">API Documentation</h3>
              <p className="text-xs text-gray-400">REST API for external clients — version 1</p>
            </div>
          </div>
          <div className="p-5 sm:p-6 space-y-6">
            <div className="grid md:grid-cols-2 gap-4">
              <div>
                <div className="overline mb-1.5">Base URL</div>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <code className="text-xs font-mono text-gray-800 break-all flex-1">{V1}</code>
                  <CopyBtn text={V1} testid="copy-base-url" />
                </div>
              </div>
              <div>
                <div className="overline mb-1.5">Authentication</div>
                <div className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2.5">
                  <code className="text-xs font-mono text-gray-800 break-all flex-1">Authorization: Bearer &lt;API_KEY&gt;</code>
                  <CopyBtn text="Authorization: Bearer <API_KEY>" testid="copy-auth-header" />
                </div>
              </div>
            </div>

            <div className="bg-blue-50/60 border border-blue-100 rounded-xl px-4 py-3 flex items-start gap-2.5 text-xs text-blue-800">
              <Zap size={15} className="shrink-0 mt-0.5" />
              <span>Every request is authenticated by API key and recorded in <b>Logs Activity</b> (as <code className="font-mono">[API] &lt;key name&gt;</code>). Alternatively you may send the key via the <code className="font-mono">X-API-Key</code> header.</span>
            </div>

            <div>
              <div className="overline mb-2 flex items-center gap-1.5"><Terminal size={13} /> Endpoints</div>
              <Accordion type="single" collapsible className="border border-gray-200 rounded-xl divide-y divide-gray-100 overflow-hidden" data-testid="endpoints-accordion">
                {ENDPOINTS.map((e, i) => (
                  <AccordionItem key={i} value={`ep-${i}`} className="border-0">
                    <AccordionTrigger className="px-4 hover:no-underline hover:bg-gray-50" data-testid={`endpoint-trigger-${i}`}>
                      <div className="flex items-center gap-3 min-w-0 flex-1 text-left">
                        <MethodBadge m={e.method} />
                        <code className="text-xs text-gray-800 font-mono break-all">{e.path}</code>
                        <span className="text-xs text-gray-400 hidden md:block ml-auto mr-2 shrink-0">{e.title}</span>
                      </div>
                    </AccordionTrigger>
                    <AccordionContent className="px-4 pb-4">
                      <div className="space-y-3 pt-1">
                        <p className="text-sm text-gray-600">{e.desc}</p>
                        {e.params.length > 0 && (
                          <div>
                            <div className="overline mb-1.5">Parameters</div>
                            <ParamTable rows={e.params} />
                          </div>
                        )}
                        <div>
                          <div className="overline mb-1.5">Sample request</div>
                          <CodeBlock code={e.sample} testid={`endpoint-sample-copy-${i}`} />
                        </div>
                        <div>
                          <div className="overline mb-1.5">Sample response</div>
                          <CodeBlock code={e.response} testid={`endpoint-response-copy-${i}`} />
                        </div>
                      </div>
                    </AccordionContent>
                  </AccordionItem>
                ))}
              </Accordion>
            </div>

            <div>
              <div className="overline mb-2">Example request</div>
              <div className="relative bg-gray-900 rounded-xl px-4 py-3.5">
                <pre className="text-xs text-emerald-300 font-mono whitespace-pre-wrap break-all">{curlExample}</pre>
                <div className="absolute top-2.5 right-2.5"><CopyBtn text={curlExample.replace(/\\\n\s*/g, "")} testid="copy-curl" /></div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {showCreate && (
        <CreateDialog
          storages={storages}
          onClose={() => setShowCreate(false)}
          onCreated={(data) => { setShowCreate(false); setReveal(data); load(); }}
        />
      )}
      {reveal && <RevealDialog data={reveal} onClose={() => setReveal(null)} />}
      {confirm && (
        <ConfirmDialog title={confirm.title} message={confirm.message} confirmLabel={confirm.confirmLabel} danger onConfirm={confirm.onConfirm} onClose={() => setConfirm(null)} />
      )}
    </div>
  );
}
