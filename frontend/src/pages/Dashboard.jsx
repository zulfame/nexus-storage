import { useEffect, useState } from "react";
import { Link } from "react-router-dom";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { metaFor, relTime } from "@/lib/logMeta";
import { HardDrive, Users, Cloud, Server, Activity, ArrowRight, ShieldCheck } from "lucide-react";

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div className="bg-white border border-gray-200 rounded-2xl p-5 shadow-sm hover:shadow-md transition-shadow" data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}>
      <div className="flex items-start justify-between">
        <div>
          <div className="overline mb-2">{label}</div>
          <div className="font-bold text-3xl tracking-tight text-gray-900">{value}</div>
        </div>
        <div className="h-11 w-11 flex items-center justify-center rounded-xl" style={{ background: accent + "18", color: accent }}>
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

function Bar({ label, value, total, color, icon: Icon }) {
  const pct = total ? Math.round((value / total) * 100) : 0;
  return (
    <div>
      <div className="flex items-center justify-between text-sm mb-1.5">
        <span className="flex items-center gap-2 text-gray-700"><Icon size={15} style={{ color }} /> {label}</span>
        <span className="font-semibold text-gray-900">{value}</span>
      </div>
      <div className="h-2 rounded-full bg-gray-100 overflow-hidden">
        <div className="h-full rounded-full transition-all" style={{ width: `${pct}%`, background: color }} />
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);
  const [recent, setRecent] = useState([]);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
    api.get("/logs", { params: { limit: 8 } }).then((r) => setRecent(r.data.items || [])).catch(() => {});
  }, []);

  const s = stats || {};

  return (
    <div>
      <PageHeader overline="Overview" title="Dashboard" />
      <div className="p-4 sm:p-8 space-y-6">
        <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
          <Stat label="Total Storages" value={s.total_storages ?? "—"} icon={HardDrive} accent="#2563eb" />
          <Stat label="S3 Buckets" value={s.s3_count ?? "—"} icon={Cloud} accent="#059669" />
          <Stat label="Samba Shares" value={s.samba_count ?? "—"} icon={Server} accent="#d97706" />
          <Stat label="Users" value={s.total_users ?? "—"} icon={Users} accent="#7c3aed" />
        </div>

        <div className="grid grid-cols-1 lg:grid-cols-5 gap-6">
          {/* breakdown */}
          <div className="lg:col-span-2 space-y-6">
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h3 className="font-display font-semibold text-lg text-gray-900 mb-5">Storage Breakdown</h3>
              <div className="space-y-4">
                <Bar label="S3 / Compatible" value={s.s3_count || 0} total={s.total_storages || 0} color="#059669" icon={Cloud} />
                <Bar label="Samba / SMB" value={s.samba_count || 0} total={s.total_storages || 0} color="#d97706" icon={Server} />
                <Bar label="SFTP" value={s.sftp_count || 0} total={s.total_storages || 0} color="#7c3aed" icon={HardDrive} />
              </div>
            </div>
            <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-6">
              <h3 className="font-display font-semibold text-lg text-gray-900 mb-5">Team</h3>
              <div className="flex items-center gap-4">
                <div className="flex-1 rounded-xl bg-purple-50 p-4">
                  <div className="text-2xl font-bold text-purple-700">{s.total_users ?? "—"}</div>
                  <div className="overline mt-1">Total Users</div>
                </div>
                <div className="flex-1 rounded-xl bg-blue-50 p-4">
                  <div className="text-2xl font-bold text-blue-700 flex items-center gap-1.5"><ShieldCheck size={18} /> {s.admin_count ?? "—"}</div>
                  <div className="overline mt-1">Admins</div>
                </div>
              </div>
            </div>
          </div>

          {/* recent activity */}
          <div className="lg:col-span-3 bg-white border border-gray-200 rounded-2xl shadow-sm p-6" data-testid="dashboard-recent-activity">
            <div className="flex items-center justify-between mb-5">
              <h3 className="font-display font-semibold text-lg text-gray-900 flex items-center gap-2"><Activity size={18} className="text-blue-600" /> Recent Activity</h3>
              <Link to="/logs" className="text-sm font-medium text-blue-600 hover:underline flex items-center gap-1" data-testid="dashboard-view-all-logs">
                View all <ArrowRight size={14} />
              </Link>
            </div>
            {recent.length === 0 ? (
              <div className="text-sm text-gray-400 py-8 text-center">No activity yet.</div>
            ) : (
              <ul className="divide-y divide-gray-100">
                {recent.map((l) => {
                  const meta = metaFor(l.action);
                  const Icon = meta.icon;
                  return (
                    <li key={l.id} className="flex items-center gap-3 py-2.5">
                      <div className="h-8 w-8 rounded-lg flex items-center justify-center shrink-0" style={{ background: meta.color + "18", color: meta.color }}>
                        <Icon size={15} />
                      </div>
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-gray-800 truncate">
                          <span className="font-medium">{meta.label}</span>
                          {l.path && <span className="text-gray-500"> · {l.path}</span>}
                        </div>
                        <div className="text-xs text-gray-400 truncate">{l.user_email}{l.storage_name ? ` · ${l.storage_name}` : ""}</div>
                      </div>
                      <span className="text-xs text-gray-400 whitespace-nowrap">{relTime(l.timestamp)}</span>
                    </li>
                  );
                })}
              </ul>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
