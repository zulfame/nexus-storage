import { useCallback, useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { metaFor, relTime } from "@/lib/logMeta";
import { toast } from "sonner";
import {
  RefreshCw,
  Cloud,
  Server,
  PlugZap,
  Activity,
  FileStack,
  Wifi,
  Trash2,
  ChevronLeft,
  ChevronRight,
  Loader2,
  Search,
} from "lucide-react";

const PAGE_SIZE = 10;

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
  const [data, setData] = useState({ items: [], total: 0, counts: { all: 0, file: 0, conn: 0, reconnect: 0 } });
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(0);
  const [search, setSearch] = useState("");
  const [delOpen, setDelOpen] = useState(false);
  const [range, setRange] = useState({ start: "", end: "" });
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data } = await api.get("/logs", { params: { skip: page * PAGE_SIZE, limit: PAGE_SIZE, category: filter, search } });
      setData(data);
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setLoading(false);
    }
  }, [page, filter, search]);

  useEffect(() => {
    const t = setTimeout(load, 300);
    return () => clearTimeout(t);
  }, [load]);

  const setTab = (k) => {
    setFilter(k);
    setPage(0);
  };

  const doDelete = async () => {
    setDeleting(true);
    try {
      const { data: res } = await api.delete("/logs", { params: { start: range.start, end: range.end } });
      toast.success(`Deleted ${res.deleted} log${res.deleted === 1 ? "" : "s"}`);
      setDelOpen(false);
      setRange({ start: "", end: "" });
      setPage(0);
      load();
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setDeleting(false);
    }
  };

  const counts = data.counts || {};
  const total = filter === "all" ? counts.all : filter === "file" ? counts.file : counts.conn;
  const totalPages = Math.max(1, Math.ceil((data.total || 0) / PAGE_SIZE));
  const from = data.total === 0 ? 0 : page * PAGE_SIZE + 1;
  const to = Math.min((page + 1) * PAGE_SIZE, data.total || 0);

  const tabs = [
    { k: "all", label: "All Activity" },
    { k: "file", label: "File Operations" },
    { k: "conn", label: "Connections" },
  ];

  return (
    <div>
      <PageHeader overline="Audit Trail" title="Logs Activity">
        <button onClick={() => setDelOpen(true)} data-testid="open-delete-logs" className="flex items-center gap-2 text-sm font-medium border border-gray-200 px-4 py-2.5 rounded-xl hover:border-red-300 hover:text-red-600 hover:bg-red-50 transition-colors">
          <Trash2 size={16} /> Clear Logs
        </button>
        <button onClick={load} data-testid="refresh-logs-button" className="flex items-center gap-2 text-sm font-medium border border-gray-200 px-4 py-2.5 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
          <RefreshCw size={16} className={loading ? "animate-spin" : ""} /> Refresh
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
          <StatCard label="Total Events" value={counts.all ?? 0} icon={Activity} color="#2563eb" />
          <StatCard label="File Operations" value={counts.file ?? 0} icon={FileStack} color="#059669" />
          <StatCard label="Connection Events" value={counts.conn ?? 0} icon={Wifi} color="#7c3aed" />
          <StatCard label="Auto-Reconnects" value={counts.reconnect ?? 0} icon={PlugZap} color="#d97706" />
        </div>

        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 mb-4">
          <div className="flex items-center gap-1 bg-white border border-gray-200 rounded-xl p-1 w-fit shadow-sm">
            {tabs.map((t) => (
              <button key={t.k} onClick={() => setTab(t.k)} data-testid={`logs-filter-${t.k}`} className={`text-sm font-medium px-4 py-1.5 rounded-lg transition-colors ${filter === t.k ? "bg-primary text-white shadow-sm" : "text-gray-600 hover:bg-gray-100"}`}>
                {t.label}
              </button>
            ))}
          </div>
          <div className="relative w-full sm:w-72">
            <Search size={16} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
            <input
              value={search}
              onChange={(e) => { setSearch(e.target.value); setPage(0); }}
              data-testid="logs-search"
              placeholder="Search user, action, storage, path…"
              className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
            />
          </div>
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
                  <tr><td colSpan={5} className="px-4 py-12 text-center text-gray-400"><Loader2 size={18} className="animate-spin inline" /></td></tr>
                ) : data.items.length === 0 ? (
                  <tr><td colSpan={5} className="px-4 py-16 text-center text-gray-400"><Activity size={28} className="mx-auto mb-3 opacity-40" /><div className="text-sm">No activity recorded yet.</div></td></tr>
                ) : (
                  data.items.map((l) => {
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
                            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-[11px] font-semibold shrink-0">{(l.user_email || "?")[0].toUpperCase()}</div>
                            <span className="text-gray-700">{l.user_email}</span>
                          </div>
                        </td>
                        <td className="px-4 py-3">
                          {l.storage_name ? (
                            <span className="inline-flex items-center gap-1.5 text-gray-700">
                              {l.storage_type === "s3" ? <Cloud size={14} className="text-emerald-600" /> : <Server size={14} className="text-amber-600" />}
                              {l.storage_name}
                            </span>
                          ) : <span className="text-gray-400">—</span>}
                        </td>
                        <td className="px-4 py-3 text-gray-500 break-all max-w-md">{l.path || l.detail || "—"}</td>
                        <td className="px-4 py-3 text-right text-gray-400 whitespace-nowrap" title={l.timestamp ? new Date(l.timestamp).toLocaleString() : ""}>{relTime(l.timestamp)}</td>
                      </tr>
                    );
                  })
                )}
              </tbody>
            </table>
          </div>

          <div className="flex items-center justify-between px-4 py-3 border-t border-gray-100 bg-gray-50 text-sm">
            <span className="text-gray-500" data-testid="logs-range">{from}–{to} of {data.total}</span>
            <div className="flex items-center gap-2">
              <span className="text-gray-400">Page {page + 1} / {totalPages}</span>
              <button onClick={() => setPage((p) => Math.max(0, p - 1))} disabled={page === 0} data-testid="logs-prev" className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors">
                <ChevronLeft size={16} />
              </button>
              <button onClick={() => setPage((p) => (p + 1 < totalPages ? p + 1 : p))} disabled={page + 1 >= totalPages} data-testid="logs-next" className="p-1.5 rounded-lg border border-gray-200 disabled:opacity-40 hover:bg-white transition-colors">
                <ChevronRight size={16} />
              </button>
            </div>
          </div>
        </div>
      </div>

      {delOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl" data-testid="delete-logs-dialog">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">Clear Activity Logs</h3>
              <p className="text-sm text-gray-500 mt-1">Delete logs within a date range. Leave both empty to delete all logs.</p>
            </div>
            <div className="p-6 grid grid-cols-2 gap-4">
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">From</label>
                <input type="date" value={range.start} onChange={(e) => setRange((r) => ({ ...r, start: e.target.value }))} data-testid="delete-logs-start" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100" />
              </div>
              <div>
                <label className="text-sm font-medium text-gray-700 block mb-1.5">To</label>
                <input type="date" value={range.end} onChange={(e) => setRange((r) => ({ ...r, end: e.target.value }))} data-testid="delete-logs-end" className="w-full bg-white border border-gray-200 rounded-xl px-3 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100" />
              </div>
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setDelOpen(false)} className="text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={doDelete} disabled={deleting} data-testid="confirm-delete-logs" className="flex items-center gap-1.5 bg-red-600 text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-red-700 transition-colors disabled:opacity-60">
                {deleting && <Loader2 size={15} className="animate-spin" />} Delete
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
