import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Upload, Trash2, FolderPlus, RefreshCw, Cloud, Server } from "lucide-react";

const ACTION_META = {
  upload: { label: "Upload", icon: Upload, color: "#34d399" },
  delete: { label: "Delete", icon: Trash2, color: "#ef4444" },
  delete_folder: { label: "Delete Folder", icon: Trash2, color: "#ef4444" },
  create_folder: { label: "Create Folder", icon: FolderPlus, color: "#00e5ff" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  return d.toLocaleString();
}

export default function Logs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);

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

  return (
    <div className="p-8">
      <div className="flex items-end justify-between mb-8">
        <div>
          <div className="overline mb-2">Audit Trail</div>
          <h1 className="font-display font-bold text-4xl tracking-tight">Logs Activity</h1>
        </div>
        <button
          onClick={load}
          data-testid="refresh-logs-button"
          className="flex items-center gap-2 text-sm font-medium border border-border px-4 py-2.5 rounded-xl hover:border-primary hover:text-primary transition-colors"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </div>

      <div className="border border-border rounded-xl overflow-hidden" data-testid="logs-table">
        <table className="w-full text-sm">
          <thead>
            <tr className="bg-[#0d0d0d] text-left">
              <th className="px-4 py-3 overline w-44">Action</th>
              <th className="px-4 py-3 overline">User</th>
              <th className="px-4 py-3 overline">Storage</th>
              <th className="px-4 py-3 overline">Path</th>
              <th className="px-4 py-3 overline w-56">Time</th>
            </tr>
          </thead>
          <tbody>
            {loading ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500">
                  Loading…
                </td>
              </tr>
            ) : logs.length === 0 ? (
              <tr>
                <td colSpan={5} className="px-4 py-12 text-center text-gray-500 text-sm">
                  No file activity recorded yet.
                </td>
              </tr>
            ) : (
              logs.map((l) => {
                const meta = ACTION_META[l.action] || {
                  label: l.action,
                  icon: Upload,
                  color: "#a0a0a0",
                };
                const Icon = meta.icon;
                return (
                  <tr
                    key={l.id}
                    className="border-t border-border hover:bg-[#151515] transition-colors"
                    data-testid={`log-row-${l.id}`}
                  >
                    <td className="px-4 py-3">
                      <span
                        className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg"
                        style={{ background: meta.color + "22", color: meta.color }}
                      >
                        <Icon size={13} /> {meta.label}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-300">{l.user_email}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center gap-1.5 text-gray-300">
                        {l.storage_type === "s3" ? <Cloud size={14} /> : <Server size={14} />}
                        {l.storage_name}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-mono text-gray-400 break-all">{l.path}</td>
                    <td className="px-4 py-3 font-mono text-gray-500">{fmtDate(l.timestamp)}</td>
                  </tr>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}
