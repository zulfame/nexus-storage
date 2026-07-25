import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
} from "@/components/ui/select";
import { Cloud, Server, HardDrive, Plus, Trash2, Pencil, Plug, Loader2, Rocket, KeyRound, FolderOpen, Eye, EyeOff, X, RefreshCw } from "lucide-react";
import { StorageMeter } from "@/components/StorageMeter";

function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

const empty = {
  name: "",
  type: "s3",
  config: {
    region: "",
    endpoint: "",
    bucket: "",
    access_key: "",
    secret_key: "",
    host: "",
    share: "",
    port: "445",
    username: "",
    password: "",
    domain: "",
    base_path: "",
    capacity_gb: "",
  },
};

function Field({ label, value, onChange, placeholder, type = "text", testid }) {
  const [show, setShow] = useState(false);
  const isSecret = type === "password";
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <div className="relative">
        <input
          type={isSecret && !show ? "password" : "text"}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          placeholder={placeholder}
          autoComplete={isSecret ? "new-password" : "off"}
          data-testid={testid}
          className={`w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 ${isSecret ? "pr-11" : ""} text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors`}
        />
        {isSecret && (
          <button
            type="button"
            tabIndex={-1}
            onClick={() => setShow((s) => !s)}
            data-testid={testid ? `${testid}-toggle` : undefined}
            aria-label={show ? "Hide value" : "Show value"}
            className="absolute right-3 top-1/2 -translate-y-1/2 text-gray-400 hover:text-blue-600 transition-colors"
          >
            {show ? <EyeOff size={16} /> : <Eye size={16} />}
          </button>
        )}
      </div>
    </div>
  );
}

const btnPrimary =
  "flex items-center gap-2 bg-primary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm";
const btnGhost =
  "text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors";
const btnOutline =
  "flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors";

const TYPE_META = {
  s3: { label: "S3 / Compatible", short: "S3", icon: Cloud, box: "bg-emerald-50 text-emerald-600", desc: "AWS S3, MinIO, Wasabi & compatible object storage" },
  samba: { label: "Samba / SMB", short: "Samba", icon: Server, box: "bg-amber-50 text-amber-600", desc: "Windows / NAS network share over SMB (port 445)" },
  sftp: { label: "SFTP", short: "SFTP", icon: HardDrive, box: "bg-violet-50 text-violet-600", desc: "Secure file transfer over SSH (recommended for NAS)" },
};
const typeMeta = (t) => TYPE_META[t] || TYPE_META.samba;

export default function Storages() {
  const [storages, setStorages] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);
  const [calcId, setCalcId] = useState(null);

  const load = () =>
    api.get("/storages").then((r) => setStorages(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const calcUsage = async (s) => {
    setCalcId(s.id);
    try {
      const r = await api.get(`/storages/${s.id}/usage`, { params: { refresh: true } });
      setStorages((list) => list.map((x) => (x.id === s.id ? { ...x, usage: r.data } : x)));
    } catch (e) {
      toast.error(apiError(e, "Usage scan failed"));
    } finally {
      setCalcId(null);
    }
  };

  const setCfg = (k, v) => setForm((f) => ({ ...f, config: { ...f.config, [k]: v } }));

  const changeType = (t) =>
    setForm((f) => {
      const port = t === "sftp" ? "2222" : t === "samba" ? "445" : f.config.port;
      return { ...f, type: t, config: { ...f.config, port } };
    });

  const openNew = () => {
    setForm(empty);
    setEditId(null);
    setOpen(true);
  };

  const openEdit = async (s) => {
    setEditId(s.id);
    setForm({ name: s.name, type: s.type, config: { ...empty.config, ...s.config } });
    setOpen(true);
    try {
      const r = await api.get(`/storages/${s.id}/config`);
      setForm({ name: r.data.name, type: r.data.type, config: { ...empty.config, ...r.data.config } });
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const payload = () => {
    const c = form.config;
    const cap = c.capacity_gb === "" || c.capacity_gb == null ? null : Number(c.capacity_gb);
    let config;
    if (form.type === "s3") {
      config = { region: c.region, endpoint: c.endpoint, bucket: c.bucket, access_key: c.access_key, secret_key: c.secret_key };
    } else if (form.type === "sftp") {
      config = { host: c.host, port: c.port, username: c.username, password: c.password, base_path: c.base_path };
    } else {
      config = { host: c.host, share: c.share, port: c.port, username: c.username, password: c.password, domain: c.domain };
    }
    config.capacity_gb = cap;
    return { name: form.name, type: form.type, config };
  };

  const test = async () => {
    setTesting(true);
    try {
      const r = await api.post("/storages/test", payload());
      r.data.success ? toast.success(r.data.message) : toast.error(r.data.message);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setTesting(false);
    }
  };

  const save = async () => {
    setSaving(true);
    try {
      if (editId) await api.put(`/storages/${editId}`, payload());
      else await api.post("/storages", payload());
      toast.success(editId ? "Storage updated" : "Storage added");
      setOpen(false);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (s) => {
    if (!window.confirm(`Delete storage "${s.name}"? Users will lose access.`)) return;
    try {
      await api.delete(`/storages/${s.id}`);
      toast.success("Storage deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div>
      <PageHeader overline="Connections" title="List Storage">
        <button onClick={openNew} data-testid="add-storage-button" className={btnPrimary}>
          <Plus size={16} /> Add Storage
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        {storages.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-2xl p-16 text-center text-gray-400 bg-white">
            No storages yet. Add your first S3, Samba or SFTP connection.
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5" data-testid="storages-list">
            {storages.map((s) => (
              <div
                key={s.id}
                data-testid={`storage-card-${s.id}`}
                className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow"
              >
                <div className="flex items-start justify-between mb-4">
                  <div className="flex items-center gap-3">
                    <div className={`h-11 w-11 flex items-center justify-center rounded-xl ${typeMeta(s.type).box}`}>
                      {(() => { const Ic = typeMeta(s.type).icon; return <Ic size={22} />; })()}
                    </div>
                    <div>
                      <div className="font-semibold text-sm text-gray-900">{s.name}</div>
                      <div className="overline mt-0.5">{s.type}</div>
                    </div>
                  </div>
                </div>
                <div className="text-xs text-gray-500 space-y-1 mb-4 break-all bg-gray-50 rounded-xl p-3">
                  {s.type === "s3" ? (
                    <>
                      <div><span className="text-gray-400">bucket</span> · {s.config.bucket || "—"}</div>
                      <div><span className="text-gray-400">endpoint</span> · {s.config.endpoint || "aws default"}</div>
                    </>
                  ) : s.type === "sftp" ? (
                    <>
                      <div><span className="text-gray-400">host</span> · {s.config.host || "—"}{s.config.port ? `:${s.config.port}` : ""}</div>
                      <div><span className="text-gray-400">path</span> · {s.config.base_path ? `/${s.config.base_path}` : "/"}</div>
                    </>
                  ) : (
                    <>
                      <div><span className="text-gray-400">host</span> · {s.config.host || "—"}</div>
                      <div><span className="text-gray-400">share</span> · {s.config.share || "—"}</div>
                    </>
                  )}
                </div>
                <div className="mb-4">
                  <StorageMeter
                    usage={s.usage}
                    capacityGb={s.config.capacity_gb}
                    onRefresh={() => calcUsage(s)}
                    refreshing={calcId === s.id}
                    testid={`usage-${s.id}`}
                  />
                </div>
                <div className="flex items-center gap-2">
                  <button
                    onClick={async () => {
                      const r = await api.post(`/storages/${s.id}/test`);
                      r.data.success ? toast.success(r.data.message) : toast.error(r.data.message);
                    }}
                    data-testid={`test-storage-${s.id}`}
                    className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-gray-200 py-2 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
                  >
                    <Plug size={14} /> Test
                  </button>
                  <button onClick={() => openEdit(s)} data-testid={`edit-storage-${s.id}`} aria-label="Edit storage" className="p-2 border border-gray-200 rounded-xl hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                    <Pencil size={14} />
                  </button>
                  <button onClick={() => remove(s)} data-testid={`delete-storage-${s.id}`} aria-label="Delete storage" className="p-2 border border-gray-200 rounded-xl hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors">
                    <Trash2 size={14} />
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[92vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150" data-testid="storage-dialog">
            {/* Header */}
            <div className="relative px-6 pt-6 pb-5 border-b border-gray-100">
              <button
                onClick={() => setOpen(false)}
                data-testid="close-storage-dialog"
                aria-label="Close"
                className="absolute top-5 right-5 h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
              >
                <X size={18} />
              </button>
              <div className="flex items-center gap-3.5">
                <div className={`h-12 w-12 flex items-center justify-center rounded-xl shrink-0 ${typeMeta(form.type).box}`}>
                  {(() => { const Ic = typeMeta(form.type).icon; return <Ic size={24} />; })()}
                </div>
                <div>
                  <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">
                    {editId ? "Edit Storage" : "Add Storage"}
                  </h3>
                  <p className="text-sm text-gray-500 mt-0.5">{typeMeta(form.type).desc}</p>
                </div>
              </div>
            </div>

            {/* Body */}
            <div className="p-6 space-y-5 overflow-y-auto">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Connection type</label>
                <Select value={form.type} onValueChange={changeType}>
                  <SelectTrigger data-testid="storage-type-select" className="w-full h-12 rounded-xl border-gray-200 px-3.5 focus:ring-2 focus:ring-blue-100 focus:border-primary">
                    <div className="flex items-center gap-2.5">
                      <span className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 ${typeMeta(form.type).box}`}>
                        {(() => { const Ic = typeMeta(form.type).icon; return <Ic size={15} />; })()}
                      </span>
                      <span className="font-medium text-sm text-gray-900">{typeMeta(form.type).label}</span>
                    </div>
                  </SelectTrigger>
                  <SelectContent className="rounded-xl">
                    {["s3", "samba", "sftp"].map((t) => (
                      <SelectItem key={t} value={t} data-testid={`storage-type-${t}`} className="rounded-lg py-2.5 cursor-pointer">
                        <div className="flex items-center gap-2.5 pr-2">
                          <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 ${typeMeta(t).box}`}>
                            {(() => { const Ic = typeMeta(t).icon; return <Ic size={16} />; })()}
                          </span>
                          <div>
                            <div className="font-medium text-sm text-gray-900 leading-tight">{typeMeta(t).label}</div>
                            <div className="text-xs text-gray-400 leading-tight mt-0.5">{typeMeta(t).desc}</div>
                          </div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>

              <Field label="Display name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="e.g. Production NAS" testid="storage-name-input" />

              <Field label="Capacity / quota in GB (optional)" value={form.config.capacity_gb} onChange={(v) => setCfg("capacity_gb", v.replace(/[^0-9.]/g, ""))} placeholder="e.g. 300 — used to show a Used / Total meter" testid="storage-capacity-input" />

              <div className="pt-1">
                <div className="flex items-center gap-2 mb-3">
                  <span className="overline">{typeMeta(form.type).short} settings</span>
                  <div className="flex-1 h-px bg-gray-100" />
                </div>

                {form.type === "s3" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Bucket" value={form.config.bucket} onChange={(v) => setCfg("bucket", v)} placeholder="my-bucket" testid="s3-bucket-input" />
                      <Field label="Region" value={form.config.region} onChange={(v) => setCfg("region", v)} placeholder="us-east-1" testid="s3-region-input" />
                    </div>
                    <Field label="Endpoint (optional, for MinIO/Wasabi)" value={form.config.endpoint} onChange={(v) => setCfg("endpoint", v)} placeholder="https://s3.example.com" testid="s3-endpoint-input" />
                    <Field label="Access Key" value={form.config.access_key} onChange={(v) => setCfg("access_key", v)} placeholder="AKIA…" testid="s3-access-key-input" />
                    <Field label="Secret Key" value={form.config.secret_key} onChange={(v) => setCfg("secret_key", v)} placeholder="••••••" type="password" testid="s3-secret-key-input" />
                  </div>
                ) : form.type === "sftp" ? (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <Field label="Host / IP" value={form.config.host} onChange={(v) => setCfg("host", v)} placeholder="192.168.2.8" testid="sftp-host-input" />
                      </div>
                      <Field label="Port" value={form.config.port} onChange={(v) => setCfg("port", v)} placeholder="2222" testid="sftp-port-input" />
                    </div>
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Username" value={form.config.username} onChange={(v) => setCfg("username", v)} placeholder="admin" testid="sftp-username-input" />
                      <Field label="Password" value={form.config.password} onChange={(v) => setCfg("password", v)} placeholder="••••••" type="password" testid="sftp-password-input" />
                    </div>
                    <Field label="Base path (optional)" value={form.config.base_path} onChange={(v) => setCfg("base_path", v)} placeholder="Leave empty for home folder" testid="sftp-basepath-input" />
                  </div>
                ) : (
                  <div className="space-y-4">
                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
                      <div className="sm:col-span-2">
                        <Field label="Host / IP" value={form.config.host} onChange={(v) => setCfg("host", v)} placeholder="192.168.1.10" testid="samba-host-input" />
                      </div>
                      <Field label="Port" value={form.config.port} onChange={(v) => setCfg("port", v)} placeholder="445" testid="samba-port-input" />
                    </div>
                    <Field label="Share" value={form.config.share} onChange={(v) => setCfg("share", v)} placeholder="shared" testid="samba-share-input" />
                    <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                      <Field label="Username" value={form.config.username} onChange={(v) => setCfg("username", v)} placeholder="user" testid="samba-username-input" />
                      <Field label="Password" value={form.config.password} onChange={(v) => setCfg("password", v)} placeholder="••••••" type="password" testid="samba-password-input" />
                    </div>
                    <Field label="Domain (optional)" value={form.config.domain} onChange={(v) => setCfg("domain", v)} placeholder="WORKGROUP" testid="samba-domain-input" />
                  </div>
                )}
              </div>
            </div>

            {/* Footer */}
            <div className="p-5 border-t border-gray-100 flex items-center gap-2 bg-gray-50/60">
              <button onClick={test} disabled={testing} data-testid="test-connection-button" className={btnOutline + " bg-white disabled:opacity-60"}>
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test connection
              </button>
              <div className="flex-1" />
              <button onClick={() => setOpen(false)} data-testid="cancel-storage-button" className={btnGhost}>Cancel</button>
              <button onClick={save} disabled={saving} data-testid="save-storage-button" className={btnPrimary + " disabled:opacity-60"}>
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editId ? "Save changes" : "Add storage"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
