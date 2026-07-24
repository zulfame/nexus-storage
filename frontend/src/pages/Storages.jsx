import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Cloud, Server, Plus, Trash2, Pencil, Plug, Loader2 } from "lucide-react";

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
      <label className="overline block mb-1.5">{label}</label>
      <input
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        data-testid={testid}
        className="w-full bg-[#0d0d0d] border border-border rounded-xl px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
      />
    </div>
  );
}

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
        ? {
            region: c.region,
            endpoint: c.endpoint,
            bucket: c.bucket,
            access_key: c.access_key,
            secret_key: c.secret_key,
          }
        : {
            host: c.host,
            share: c.share,
            username: c.username,
            password: c.password,
            domain: c.domain,
          };
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
    <div className="p-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="overline mb-2">Connections</div>
          <h1 className="font-display font-bold text-4xl tracking-tight">List Storage</h1>
        </div>
        <button
          onClick={openNew}
          data-testid="add-storage-button"
          className="flex items-center gap-2 bg-primary text-black font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-[#00b3cc] transition-colors"
        >
          <Plus size={16} /> Add Storage
        </button>
      </div>

      {storages.length === 0 ? (
        <div className="border border-dashed border-border rounded-xl p-16 text-center text-gray-500">
          No storages yet. Add your first S3 or Samba connection.
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4" data-testid="storages-list">
          {storages.map((s) => (
            <div
              key={s.id}
              data-testid={`storage-card-${s.id}`}
              className="bg-[#121212] border border-border rounded-xl p-5 hover:border-[#3a3a3a] transition-colors"
            >
              <div className="flex items-start justify-between mb-4">
                <div className="flex items-center gap-3">
                  <div className="h-10 w-10 flex items-center justify-center rounded-xl bg-[#1a1a1a] text-primary">
                    {s.type === "s3" ? <Cloud size={20} /> : <Server size={20} />}
                  </div>
                  <div>
                    <div className="font-semibold text-sm">{s.name}</div>
                    <div className="overline mt-0.5">{s.type}</div>
                  </div>
                </div>
              </div>
              <div className="font-mono text-xs text-gray-400 space-y-1 mb-4 break-all">
                {s.type === "s3" ? (
                  <>
                    <div>bucket: {s.config.bucket || "—"}</div>
                    <div>endpoint: {s.config.endpoint || "aws default"}</div>
                  </>
                ) : (
                  <>
                    <div>host: {s.config.host || "—"}</div>
                    <div>share: {s.config.share || "—"}</div>
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
                  className="flex-1 flex items-center justify-center gap-1.5 text-xs font-medium border border-border py-1.5 rounded-xl hover:border-primary hover:text-primary transition-colors"
                >
                  <Plug size={14} /> Test
                </button>
                <button
                  onClick={() => openEdit(s)}
                  data-testid={`edit-storage-${s.id}`}
                  aria-label="Edit storage"
                  className="p-1.5 border border-border rounded-xl hover:text-primary hover:border-primary transition-colors"
                >
                  <Pencil size={14} />
                </button>
                <button
                  onClick={() => remove(s)}
                  data-testid={`delete-storage-${s.id}`}
                  aria-label="Delete storage"
                  className="p-1.5 border border-border rounded-xl hover:text-destructive hover:border-destructive transition-colors"
                >
                  <Trash2 size={14} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-border rounded-xl w-full max-w-lg max-h-[90vh] overflow-y-auto" data-testid="storage-dialog">
            <div className="p-6 border-b border-border">
              <h3 className="font-display font-bold text-xl tracking-tight">
                {editId ? "Edit Storage" : "Add Storage"}
              </h3>
            </div>
            <div className="p-6 space-y-4">
              <Field label="Name" value={form.name} onChange={(v) => setForm((f) => ({ ...f, name: v }))} placeholder="My Bucket" testid="storage-name-input" />
              <div>
                <label className="overline block mb-1.5">Type</label>
                <div className="flex gap-2">
                  {["s3", "samba"].map((t) => (
                    <button
                      key={t}
                      onClick={() => setForm((f) => ({ ...f, type: t }))}
                      data-testid={`storage-type-${t}`}
                      className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${
                        form.type === t
                          ? "border-primary text-primary bg-[#00e5ff11]"
                          : "border-border text-gray-400 hover:text-white"
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
            <div className="p-6 border-t border-border flex items-center gap-2">
              <button
                onClick={test}
                disabled={testing}
                data-testid="test-connection-button"
                className="flex items-center gap-1.5 text-sm font-medium border border-border px-4 py-2 rounded-xl hover:border-primary hover:text-primary transition-colors disabled:opacity-60"
              >
                {testing ? <Loader2 size={15} className="animate-spin" /> : <Plug size={15} />} Test
              </button>
              <div className="flex-1" />
              <button
                onClick={() => setOpen(false)}
                data-testid="cancel-storage-button"
                className="text-sm font-medium px-4 py-2 rounded-xl text-gray-400 hover:text-white transition-colors"
              >
                Cancel
              </button>
              <button
                onClick={save}
                disabled={saving}
                data-testid="save-storage-button"
                className="flex items-center gap-1.5 bg-primary text-black font-semibold text-sm px-5 py-2 rounded-xl hover:bg-[#00b3cc] transition-colors disabled:opacity-60"
              >
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
