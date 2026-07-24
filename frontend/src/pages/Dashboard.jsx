import { useEffect, useState } from "react";
import api from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { HardDrive, Users, Cloud, Server, ShieldCheck } from "lucide-react";

function Stat({ label, value, icon: Icon, accent }) {
  return (
    <div
      data-testid={`stat-${label.toLowerCase().replace(/\s+/g, "-")}`}
      className="bg-white border border-gray-200 rounded-2xl p-6 shadow-sm hover:shadow-md transition-shadow"
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="overline mb-2">{label}</div>
          <div className="font-bold text-4xl tracking-tight text-gray-900">{value}</div>
        </div>
        <div
          className="h-11 w-11 flex items-center justify-center rounded-xl"
          style={{ background: accent + "18", color: accent }}
        >
          <Icon size={22} />
        </div>
      </div>
    </div>
  );
}

export default function Dashboard() {
  const [stats, setStats] = useState(null);

  useEffect(() => {
    api.get("/dashboard/stats").then((r) => setStats(r.data)).catch(() => {});
  }, []);

  const s = stats || {};

  return (
    <div>
      <PageHeader overline="Overview" title="Dashboard" />
      <div className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-5" data-testid="dashboard-stats">
          <Stat label="Total Storages" value={s.total_storages ?? "—"} icon={HardDrive} accent="#2563eb" />
          <Stat label="S3 Buckets" value={s.s3_count ?? "—"} icon={Cloud} accent="#059669" />
          <Stat label="Samba Shares" value={s.samba_count ?? "—"} icon={Server} accent="#d97706" />
          <Stat label="Users" value={s.total_users ?? "—"} icon={Users} accent="#7c3aed" />
        </div>

        <div className="mt-8 bg-white border border-gray-200 rounded-2xl p-6 shadow-sm max-w-3xl">
          <div className="flex items-center gap-3 mb-4">
            <div className="h-9 w-9 rounded-xl bg-blue-50 text-blue-600 flex items-center justify-center">
              <ShieldCheck size={18} />
            </div>
            <h3 className="font-display font-semibold text-lg tracking-tight text-gray-900">Getting Started</h3>
          </div>
          <ol className="text-sm text-gray-600 space-y-2.5 list-decimal list-inside marker:text-blue-500 marker:font-semibold">
            <li>Open <span className="font-medium text-blue-600">List Storage</span> to add an S3 or Samba connection, then test it.</li>
            <li>Create users in <span className="font-medium text-blue-600">Manage User</span> and grant per-storage access (read or write).</li>
            <li>Use <span className="font-medium text-blue-600">File Browser</span> to upload, download, delete files and create folders.</li>
            <li>Track every change in <span className="font-medium text-blue-600">Logs Activity</span>.</li>
          </ol>
        </div>
      </div>
    </div>
  );
}
