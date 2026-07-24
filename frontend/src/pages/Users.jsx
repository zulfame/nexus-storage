import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, Loader2, KeyRound } from "lucide-react";

export default function Users() {
  const [users, setUsers] = useState([]);
  const [storages, setStorages] = useState([]);
  const [openNew, setOpenNew] = useState(false);
  const [form, setForm] = useState({ email: "", password: "", name: "", role: "user" });
  const [saving, setSaving] = useState(false);
  const [accessUser, setAccessUser] = useState(null);
  const [access, setAccess] = useState({});

  const load = () => {
    api.get("/users").then((r) => setUsers(r.data)).catch((e) => toast.error(apiError(e)));
    api.get("/storages").then((r) => setStorages(r.data)).catch(() => {});
  };

  useEffect(() => {
    load();
  }, []);

  const create = async () => {
    setSaving(true);
    try {
      await api.post("/users", form);
      toast.success("User created");
      setOpenNew(false);
      setForm({ email: "", password: "", name: "", role: "user" });
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const remove = async (u) => {
    if (!window.confirm(`Delete user ${u.email}?`)) return;
    try {
      await api.delete(`/users/${u.id}`);
      toast.success("User deleted");
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  const openAccess = (u) => {
    const map = {};
    (u.access || []).forEach((a) => (map[a.storage_id] = a.permission));
    setAccess(map);
    setAccessUser(u);
  };

  const toggle = (id, perm) => {
    setAccess((a) => {
      const next = { ...a };
      if (next[id] === perm) delete next[id];
      else next[id] = perm;
      return next;
    });
  };

  const saveAccess = async () => {
    const payload = { access: Object.entries(access).map(([storage_id, permission]) => ({ storage_id, permission })) };
    try {
      await api.put(`/users/${accessUser.id}/access`, payload);
      toast.success("Access updated");
      setAccessUser(null);
      load();
    } catch (e) {
      toast.error(apiError(e));
    }
  };

  return (
    <div className="p-8 max-w-5xl">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="overline mb-2">Access Control</div>
          <h1 className="font-display font-bold text-4xl tracking-tight">Users</h1>
        </div>
        <button
          onClick={() => setOpenNew(true)}
          data-testid="add-user-button"
          className="flex items-center gap-2 bg-primary text-black font-semibold text-sm px-4 py-2.5 rounded-sm hover:bg-[#00b3cc] transition-colors"
        >
          <UserPlus size={16} /> Add User
        </button>
      </div>

      <div className="border border-border rounded-sm overflow-hidden" data-testid="users-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0d0d0d] text-left">
              <th className="px-4 py-3 overline">Email</th>
              <th className="px-4 py-3 overline">Role</th>
              <th className="px-4 py-3 overline">Storages</th>
              <th className="px-4 py-3 overline text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {users.map((u) => (
              <tr key={u.id} className="border-t border-border hover:bg-[#151515] transition-colors" data-testid={`user-row-${u.id}`}>
                <td className="px-4 py-3 font-mono">{u.email}</td>
                <td className="px-4 py-3">
                  <span className={`text-xs font-medium px-2 py-0.5 rounded-sm ${u.role === "admin" ? "bg-[#00e5ff22] text-primary" : "bg-[#1a1a1a] text-gray-400"}`}>
                    {u.role}
                  </span>
                </td>
                <td className="px-4 py-3 font-mono text-gray-400">
                  {u.role === "admin" ? "all" : (u.access?.length || 0)}
                </td>
                <td className="px-4 py-3">
                  <div className="flex items-center justify-end gap-2">
                    {u.role !== "admin" && (
                      <button
                        onClick={() => openAccess(u)}
                        data-testid={`manage-access-${u.id}`}
                        className="flex items-center gap-1.5 text-xs font-medium border border-border px-2.5 py-1.5 rounded-sm hover:border-primary hover:text-primary transition-colors"
                      >
                        <KeyRound size={13} /> Access
                      </button>
                    )}
                    {u.role !== "admin" && (
                      <button
                        onClick={() => remove(u)}
                        data-testid={`delete-user-${u.id}`}
                        aria-label="Delete user"
                        className="p-1.5 border border-border rounded-sm hover:text-destructive hover:border-destructive transition-colors"
                      >
                        <Trash2 size={14} />
                      </button>
                    )}
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {openNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-border rounded-sm w-full max-w-md" data-testid="new-user-dialog">
            <div className="p-6 border-b border-border">
              <h3 className="font-display font-bold text-xl tracking-tight">Add User</h3>
            </div>
            <div className="p-6 space-y-4">
              {[
                { k: "email", label: "Email", type: "email", ph: "user@example.com", tid: "new-user-email" },
                { k: "name", label: "Name", type: "text", ph: "Jane Doe", tid: "new-user-name" },
                { k: "password", label: "Password", type: "password", ph: "••••••", tid: "new-user-password" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="overline block mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.k]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    data-testid={f.tid}
                    className="w-full bg-[#0d0d0d] border border-border rounded-sm px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="overline block mb-1.5">Role</label>
                <div className="flex gap-2">
                  {["user", "admin"].map((r) => (
                    <button
                      key={r}
                      onClick={() => setForm((s) => ({ ...s, role: r }))}
                      data-testid={`new-user-role-${r}`}
                      className={`flex-1 py-2 text-sm font-medium rounded-sm border transition-colors ${form.role === r ? "border-primary text-primary bg-[#00e5ff11]" : "border-border text-gray-400 hover:text-white"}`}
                    >
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button onClick={() => setOpenNew(false)} data-testid="cancel-user-button" className="text-sm font-medium px-4 py-2 rounded-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={create} disabled={saving} data-testid="save-user-button" className="flex items-center gap-1.5 bg-primary text-black font-semibold text-sm px-5 py-2 rounded-sm hover:bg-[#00b3cc] transition-colors disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {accessUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-border rounded-sm w-full max-w-lg max-h-[90vh] overflow-y-auto" data-testid="access-dialog">
            <div className="p-6 border-b border-border">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-primary" />
                <h3 className="font-display font-bold text-xl tracking-tight">Storage Access</h3>
              </div>
              <p className="text-sm text-gray-400 mt-1 font-mono">{accessUser.email}</p>
            </div>
            <div className="p-6 space-y-3">
              {storages.length === 0 && <p className="text-sm text-gray-500">No storages available.</p>}
              {storages.map((s) => (
                <div key={s.id} className="flex items-center justify-between border border-border rounded-sm p-3" data-testid={`access-row-${s.id}`}>
                  <div>
                    <div className="text-sm font-medium">{s.name}</div>
                    <div className="overline mt-0.5">{s.type}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {["read", "write"].map((p) => (
                      <button
                        key={p}
                        onClick={() => toggle(s.id, p)}
                        data-testid={`access-${s.id}-${p}`}
                        className={`text-xs font-medium px-3 py-1.5 rounded-sm border transition-colors ${access[s.id] === p ? "border-primary text-primary bg-[#00e5ff11]" : "border-border text-gray-400 hover:text-white"}`}
                      >
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button onClick={() => setAccessUser(null)} data-testid="cancel-access-button" className="text-sm font-medium px-4 py-2 rounded-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={saveAccess} data-testid="save-access-button" className="bg-primary text-black font-semibold text-sm px-5 py-2 rounded-sm hover:bg-[#00b3cc] transition-colors">Save Access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
