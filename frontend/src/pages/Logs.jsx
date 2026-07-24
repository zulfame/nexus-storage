import { useEffect, useMemo, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import {
  Upload,
  Trash2,
  FolderPlus,
  RefreshCw,
  Cloud,
  Server,
  PlugZap,
  Plug,
  Unplug,
  Plus,
  Pencil,
  Activity,
  FileStack,
  Wifi,
} from "lucide-react";

const META = {
  upload: { label: "Upload", icon: Upload, color: "#2563eb", cat: "file" },
  delete: { label: "Delete File", icon: Trash2, color: "#dc2626", cat: "file" },
  delete_folder: { label: "Delete Folder", icon: Trash2, color: "#dc2626", cat: "file" },
  create_folder: { label: "New Folder", icon: FolderPlus, color: "#059669", cat: "file" },
  connection_ok: { label: "Connection OK", icon: Plug, color: "#059669", cat: "conn" },
  connection_failed: { label: "Connection Failed", icon: Unplug, color: "#dc2626", cat: "conn" },
  reconnect: { label: "Auto-Reconnect", icon: PlugZap, color: "#d97706", cat: "conn" },
  storage_added: { label: "Storage Added", icon: Plus, color: "#7c3aed", cat: "conn" },
  storage_updated: { label: "Storage Updated", icon: Pencil, color: "#2563eb", cat: "conn" },
  storage_deleted: { label: "Storage Removed", icon: Trash2, color: "#dc2626", cat: "conn" },
};

function metaFor(action) {
  return META[action] || { label: action, icon: Activity, color: "#64748b", cat: "conn" };
}

function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}

function StatCard({ label, value, icon: Icon, color }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-4 shadow-sm flex items-center gap-4">
      <div className="h-11 w-11 rounded-xl flex items-center justify-center shrink-0" style={{ background: color + "18", color }}>
        <Icon size={20} />
      </div>
      <div>
        <div className="text-2xl font-bold text-gray-900 leading-none">{value}</div>
        <div className="overline mt-1.5">{label}</div>
      </div>
    </div>
  );
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");

  const load = () => {
    setLoading(true);
    api
      .get("/logs")
      .then((r) => setLogs(r.data))
      .catch((e) => toast.error(apiError(e)))
      .finally(() => setLoading(false));
  };

  useEffect(() => {
    load();
  }, []);

  const stats = useMemo(() => {
    const file = logs.filter((l) => metaFor(l.action).cat === "file").length;
    const conn = logs.length - file;
    const reconn = logs.filter((l) => l.action === "reconnect").length;
    return { total: logs.length, file, conn, reconn };
  }, [logs]);

  const filtered = useMemo(() => {
    if (filter === "all") return logs;
    return logs.filter((l) => metaFor(l.action).cat === filter);
  }, [logs, filter]);

  const tabs = [
    { k: "all", label: "All Activity" },
    { k: "file", label: "File Operations" },
    { k: "conn", label: "Connections" },
  ];

  return (
    <div>
      <PageHeader overline="Audit Trail" title="Logs Activity">
        <button
          onClick={load}
          data-testid="refresh-logs-button"
          className="flex items-center gap-2 text-sm font-medium border border-gray-200 px-4 py-2.5 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Events" value={stats.total} icon={Activity} color="#2563eb" />
          <StatCard label="File Operations" value={stats.file} icon={FileStack} color="#059669" />
          <StatCard label="Connection Events" value={stats.conn} icon={Wifi} color="#7c3aed" />
          <StatCard label="Auto-Reconnects" value={stats.reconn} icon={PlugZap} color="#d97706" />
        </div>

        <div className="flex items-center gap-1 mb-4 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
          {tabs.map((t) => (
            <button
              key={t.k}
              onClick={() => setFilter(t.k)}
              data-testid={`logs-filter-${t.k}`}
              className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${
                filter === t.k ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"
              }`}
            >
              {t.label}
            </button>
          ))}
        </div>

        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" data-testid="logs-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[760px]">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-200">
                  <th className="px-4 py-3 overline w-48">Activity</th>
                  <th className="px-4 py-3 overline">User</th>
                  <th className="px-4 py-3 overline">Storage</th>
                  <th className="px-4 py-3 overline">Details</th>
                  <th className="px-4 py-3 overline w-32 text-right">When</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Loading…</td></tr>
                ) : filtered.length === 0 ? (
                  <tr>
                    <td colSpan={5} className="px-4 py-16 text-center text-gray-400">
                      <Activity size={28} className="mx-auto mb-3 opacity-40" />
                      <div className="text-sm">No activity recorded yet.</div>
                    </td>
                  </tr>
                ) : (
                  filtered.map((l) => {
                    const meta = metaFor(l.action);
                    const Icon = meta.icon;
                    return (
                      <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors" data-testid={`log-row-${l.id}`}>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-semibold px-2.5 py-1 rounded-lg" style={{ background: meta.color + "18", color: meta.color }}>
                            <Icon size={13} /> {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2">
                            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-semibold shrink-0">
                              {(l.user_email || "?")[0].toUpperCase()}
                            </div>
                            <span className="text-gray-700">{l.user_email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {l.storage_name ? (
                            <span className="inline-flex items-center gap-1.5 text-gray-700">
                              {l.storage_type === "s3" ? <Cloud size={14} className="text-emerald-600" /> : <Server size={14} className="text-amber-600" />}
                              {l.storage_name}
                            </span>
                          ) : (
                            <span className="text-gray-400">—</span>
                          )}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all max-w-md">{l.path || l.detail || "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap" title={l.timestamp ? new Date(l.timestamp).toLocaleString() : ""}>
                          {relTime(l.timestamp)}
                        </td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>
        </div>
      </div>
    </div>
  );
}
