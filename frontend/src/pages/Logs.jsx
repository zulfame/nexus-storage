import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { toast } from "sonner";
import { Upload, Trash2, FolderPlus, RefreshCw, Cloud, Server } from "lucide-react";

const ACTION_META = {
  upload: { label: "Upload", icon: Upload, color: "#2563eb" },
  delete: { label: "Delete", icon: Trash2, color: "#dc2626" },
  delete_folder: { label: "Delete Folder", icon: Trash2, color: "#dc2626" },
  create_folder: { label: "Create Folder", icon: FolderPlus, color: "#059669" },
};

function fmtDate(iso) {
  if (!iso) return "—";
  return new Date(iso).toLocaleString();
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
    <div>
      <PageHeader overline="Audit Trail" title="Logs Activity">
        <button
          onClick={load}
          data-testid="refresh-logs-button"
          className="flex items-center gap-2 text-sm font-medium border border-gray-200 px-4 py-2.5 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors"
        >
          <RefreshCw size={16} /> Refresh
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden" data-testid="logs-table">
          <div className="overflow-x-auto">
            <table className="w-full text-sm min-w-[720px]">
              <thead>
                <tr className="bg-gray-50 text-left border-b border-gray-200">
                  <th className="px-4 py-3 overline w-44">Action</th>
                  <th className="px-4 py-3 overline">User</th>
                  <th className="px-4 py-3 overline">Storage</th>
                  <th className="px-4 py-3 overline">Path</th>
                  <th className="px-4 py-3 overline w-56">Time</th>
                </tr>
              </thead>
              <tbody>
                {loading ? (
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400">Loading…</td></tr>
                ) : logs.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400 text-sm">No file activity recorded yet.</td></tr>
                ) : (
                  logs.map((l) => {
                    const meta = ACTION_META[l.action] || { label: l.action, icon: Upload, color: "#64748b" };
                    const Icon = meta.icon;
                    return (
                      <tr key={l.id} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors" data-testid={`log-row-${l.id}`}>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-xs font-medium px-2.5 py-1 rounded-lg" style={{ background: meta.color + "18", color: meta.color }}>
                            <Icon size={13} /> {meta.label}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-700">{l.user_email}</td>
                        <td className="px-4 py-3">
                          <span className="inline-flex items-center gap-1.5 text-gray-700">
                            {l.storage_type === "s3" ? <Cloud size={14} className="text-emerald-600" /> : <Server size={14} className="text-amber-600" />}
                            {l.storage_name}
                          </span>
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all">{l.path}</td>
                        <td className="px-4 py-3 text-gray-400">{fmtDate(l.timestamp)}</td>
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
