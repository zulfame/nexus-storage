import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Cloud, Server, Plus, Trash2, Pencil, Plug, Loader2, Rocket, KeyRound, FolderOpen } from "lucide-react";

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
    username: "",
    password: "",
    domain: "",
  },
};

function Field({ label, value, onChange, placeholder, type = "text", testid }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
      />
    </div>
  );
}

const btnPrimary =
  "flex items-center gap-2 bg-primary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm";
const btnGhost =
  "text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors";
const btnOutline =
  "flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-4 py-2 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors";

export default function Storages() {
  const [storages, setStorages] = useState([]);
  const [open, setOpen] = useState(false);
  const [form, setForm] = useState(empty);
  const [editId, setEditId] = useState(null);
  const [testing, setTesting] = useState(false);
  const [saving, setSaving] = useState(false);

  const load = () =>
    api.get("/storages").then((r) => setStorages(r.data)).catch((e) => toast.error(apiError(e)));

  useEffect(() => {
    load();
  }, []);

  const setCfg = (k, v) => setForm((f) => ({ ...f, config: { ...f.config, [k]: v } }));

  const openNew = () => {
    setForm(empty);
    setEditId(null);
    setOpen(true);
  };

  const openEdit = (s) => {
    setForm({
      name: s.name,
      type: s.type,
      config: { ...empty.config, ...s.config, secret_key: "", password: "" },
    });
    setEditId(s.id);
    setOpen(true);
  };

  const payload = () => {
    const c = form.config;
    const config =
      form.type === "s3"
        ? { region: c.region, endpoint: c.endpoint, bucket: c.bucket, access_key: c.access_key, secret_key: c.secret_key }
        : { host: c.host, share: c.share, username: c.username, password: c.password, domain: c.domain };
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
        <div className="mb-6 rounded-2xl border border-blue-100 bg-gradient-to-br from-blue-50 to-indigo-50 p-6 sm:p-8 shadow-sm" data-testid="getting-started">
          <div className="flex flex-col sm:flex-row items-start gap-5">
            <div className="h-12 w-12 rounded-xl bg-primary text-white flex items-center justify-center shrink-0 shadow-sm">
              <Rocket size={24} />
            </div>
            <div className="flex-1 w-full">
              <h3 className="font-display font-bold text-xl text-gray-900">Getting Started</h3>
              <p className="text-sm text-gray-600 mt-1">Connect and manage your storage in three quick steps.</p>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mt-5">
                {[
                  { n: 1, icon: Plug, title: "Add a connection", desc: "Create an S3 or Samba storage and test it." },
                  { n: 2, icon: KeyRound, title: "Grant access", desc: "Assign users read or write per storage." },
                  { n: 3, icon: FolderOpen, title: "Browse files", desc: "Upload, download and organize your files." },
                ].map((s) => (
                  <div key={s.n} className="bg-white rounded-xl border border-blue-100 p-4">
                    <div className="flex items-center gap-2 mb-2">
                      <span className="h-6 w-6 rounded-lg bg-blue-100 text-blue-700 text-xs font-bold flex items-center justify-center">{s.n}</span>
                      <s.icon size={16} className="text-blue-600" />
                    </div>
                    <div className="text-sm font-semibold text-gray-900">{s.title}</div>
                    <div className="text-xs text-gray-500 mt-0.5">{s.desc}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>

        {storages.length === 0 ? (
          <div className="border border-dashed border-gray-300 rounded-2xl p-16 text-center text-gray-400 bg-white">
            No storages yet. Add your first S3 or Samba connection.
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
                    <div className={`h-11 w-11 flex items-center justify-center rounded-xl ${s.type === "s3" ? "bg-emerald-50 text-emerald-600" : "bg-amber-50 text-amber-600"}`}>
                      {s.type === "s3" ? <Cloud size={22} /> : <Server size={22} />}
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
                  ) : (
                    <>
                      <div><span className="text-gray-400">host</span> · {s.config.host || "—"}</div>
                      <div><span className="text-gray-400">share</span> · {s.config.share || "—"}</div>
                    </>
                  )}
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
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" data-testid="storage-dialog">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">
                {editId ? "Edit Storage" : "Add Storage"}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="My Bucket" testid="storage-name-input" />
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {["s3", "samba"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      data-testid={`storage-type-${t}`}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                        form.type === t ? "border-primary text-blue-700 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"
                      }`}
                    >
                      {t === "s3" ? "S3 / Compatible" : "Samba / SMB"}
                    </button>
                  ))}
                </div>
              </div>

              {form.type === "s3" ? (
                <>
                  <Field label="Bucket" value={form.config.bucket} onChange={(v) => setCfg("bucket", v)} placeholder="my-bucket" testid="s3-bucket-input" />
                  <Field label="Region" value={form.config.region} onChange={(v) => setCfg("region", v)} placeholder="us-east-1" testid="s3-region-input" />
                  <Field label="Endpoint (optional, for MinIO/Wasabi)" value={form.config.endpoint} onChange={(v) => setCfg("endpoint", v)} placeholder="https://s3.example.com" testid="s3-endpoint-input" />
                  <Field label="Access Key" value={form.config.access_key} onChange={(v) => setCfg("access_key", v)} placeholder="AKIA…" testid="s3-access-key-input" />
                  <Field label={editId ? "Secret Key (leave blank to keep)" : "Secret Key"} value={form.config.secret_key} onChange={(v) => setCfg("secret_key", v)} placeholder="••••••" type="password" testid="s3-secret-key-input" />
                </>
              ) : (
                <>
                  <Field label="Host / IP" value={form.config.host} onChange={(v) => setCfg("host", v)} placeholder="192.168.1.10" testid="samba-host-input" />
                  <Field label="Share" value={form.config.share} onChange={(v) => setCfg("share", v)} placeholder="shared" testid="samba-share-input" />
                  <Field label="Username" value={form.config.username} onChange={(v) => setCfg("username", v)} placeholder="user" testid="samba-username-input" />
                  <Field label={editId ? "Password (leave blank to keep)" : "Password"} value={form.config.password} onChange={(v) => setCfg("password", v)} placeholder="••••••" type="password" testid="samba-password-input" />
                  <Field label="Domain (optional)" value={form.config.domain} onChange={(v) => setCfg("domain", v)} placeholder="WORKGROUP" testid="samba-domain-input" />
                </>
              )}
            </div>
            <div className="p-6 border-t border-gray-100 flex items-center gap-2">
              <button onClick={test} disabled={testing} data-testid="test-connection-button" className={btnOutline + " disabled:opacity-60"}>
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test
              </button>
              <div className="flex-1" />
              <button onClick={() => setOpen(false)} data-testid="cancel-storage-button" className={btnGhost}>Cancel</button>
              <button onClick={save} disabled={saving} data-testid="save-storage-button" className={btnPrimary + " disabled:opacity-60"}>
                {saving && <Loader2 size={15} className="animate-spin" />}
                {editId ? "Save" : "Add"}
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
