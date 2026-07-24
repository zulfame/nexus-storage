import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { UserPlus, Trash2, ShieldCheck, Loader2, KeyRound } from "lucide-react";

const btnPrimary =
  "flex items-center gap-2 bg-primary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm";
const btnGhost = "text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100 transition-colors";

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
    <div>
      <PageHeader overline="Access Control" title="Manage User">
        <button onClick={() => setOpenNew(true)} data-testid="add-user-button" className={btnPrimary}>
          <UserPlus size={16} /> Add User
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" data-testid="users-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[560px]">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-200">
                  <th className="px-4 py-3 overline">Email</th>
                  <th className="px-4 py-3 overline">Role</th>
                  <th className="px-4 py-3 overline">Storages</th>
                  <th className="px-4 py-3 overline text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {users.map((u) => (
                  <tr key={u.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors" data-testid={`user-row-${u.id}`}>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-2.5">
                        <div className="h-8 w-8 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold shrink-0">
                          {(u.email || "?")[0].toUpperCase()}
                        </div>
                        <span className="text-gray-800">{u.email || "(no email)"}</span>
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <span className={`text-xs font-medium px-2.5 py-1 rounded-lg ${u.role === "admin" ? "bg-blue-50 text-blue-700" : "bg-gray-100 text-gray-600"}`}>
                        {u.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-500">{u.role === "admin" ? "all" : (u.access?.length || 0)}</td>
                    <td className="px-4 py-3">
                      <div className="flex items-center justify-end gap-2">
                        {u.role !== "admin" && (
                          <button onClick={() => openAccess(u)} data-testid={`manage-access-${u.id}`} className="flex items-center gap-1.5 text-xs font-medium border border-gray-200 px-2.5 py-1.5 rounded-lg hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
                            <KeyRound size={13} /> Access
                          </button>
                        )}
                        {u.role !== "admin" && (
                          <button onClick={() => remove(u)} data-testid={`delete-user-${u.id}`} aria-label="Delete user" className="p-1.5 border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors">
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
        </div>
      </div>

      {openNew && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl" data-testid="new-user-dialog">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">Add User</h3>
            </div>
            <div className="p-6 space-y-4">
              {[
                { k: "email", label: "Email", type: "email", ph: "user@example.com", tid: "new-user-email" },
                { k: "name", label: "Name", type: "text", ph: "Jane Doe", tid: "new-user-name" },
                { k: "password", label: "Password", type: "password", ph: "••••••", tid: "new-user-password" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">{f.label}</label>
                  <input
                    type={f.type}
                    value={form[f.k]}
                    onChange={(e) => setForm((s) => ({ ...s, [f.k]: e.target.value }))}
                    placeholder={f.ph}
                    data-testid={f.tid}
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>
              ))}
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">Role</label>
                <div className="flex gap-2">
                  {["user", "admin"].map((r) => (
                    <button key={r} onClick={() => setForm((s) => ({ ...s, role: r }))} data-testid={`new-user-role-${r}`} className={`flex-1 py-2 text-sm font-medium rounded-xl border transition-colors ${form.role === r ? "border-primary text-blue-700 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                      {r}
                    </button>
                  ))}
                </div>
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setOpenNew(false)} data-testid="cancel-user-button" className={btnGhost}>Cancel</button>
              <button onClick={create} disabled={saving} data-testid="save-user-button" className={btnPrimary + " disabled:opacity-60"}>
                {saving && <Loader2 size={15} className="animate-spin" />} Create
              </button>
            </div>
          </div>
        </div>
      )}

      {accessUser && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-lg max-h-[90vh] overflow-y-auto shadow-2xl" data-testid="access-dialog">
            <div className="p-6 border-b border-gray-100">
              <div className="flex items-center gap-2">
                <ShieldCheck size={18} className="text-blue-600" />
                <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">Storage Access</h3>
              </div>
              <p className="text-sm text-gray-500 mt-1">{accessUser.email}</p>
            </div>
            <div className="p-6 space-y-3">
              {storages.length === 0 && <p className="text-sm text-gray-400">No storages available.</p>}
              {storages.map((s) => (
                <div key={s.id} className="flex items-center justify-between border border-gray-200 rounded-xl p-3" data-testid={`access-row-${s.id}`}>
                  <div>
                    <div className="text-sm font-medium text-gray-800">{s.name}</div>
                    <div className="overline mt-0.5">{s.type}</div>
                  </div>
                  <div className="flex gap-1.5">
                    {["read", "write"].map((p) => (
                      <button key={p} onClick={() => toggle(s.id, p)} data-testid={`access-${s.id}-${p}`} className={`text-xs font-medium px-3 py-1.5 rounded-lg border transition-colors ${access[s.id] === p ? "border-primary text-blue-700 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                        {p}
                      </button>
                    ))}
                  </div>
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setAccessUser(null)} data-testid="cancel-access-button" className={btnGhost}>Cancel</button>
              <button onClick={saveAccess} data-testid="save-access-button" className={btnPrimary}>Save Access</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
