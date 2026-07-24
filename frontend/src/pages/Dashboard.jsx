import { useEffect, useState } from "react";
import api from "@/lib/api";
import { HardDrive, Users, Cloud, Server, ShieldCheck } from "lucide-react";

function Stat({ label, value, icon: Icon, accent, testid }) {
  return (
    <div
      data-testid={testid}
      className="bg-[#121212] border border-border rounded-sm p-6 relative overflow-hidden"
      style={{ boxShadow: "inset 0 1px 0 rgba(255,255,255,0.05)" }}
    >
      <div className="flex items-start justify-between">
        <div>
          <div className="overline mb-2">{label}</div>
          <div className="font-mono font-bold text-4xl tracking-tight">{value}</div>
        </div>
        <div
          className="h-10 w-10 flex items-center justify-center rounded-sm"
          style={{ background: accent + "22", color: accent }}
        >
          <Icon size={20} />
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
    <div className="p-8 max-w-6xl">
      <div className="overline mb-2">Overview</div>
      <h1 className="font-display font-bold text-4xl tracking-tight mb-8">Dashboard</h1>

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-4 gap-4" data-testid="dashboard-stats">
        <Stat label="Total Storages" value={s.total_storages ?? "—"} icon={HardDrive} accent="#00e5ff" testid="stat-total-storages" />
        <Stat label="S3 Buckets" value={s.s3_count ?? "—"} icon={Cloud} accent="#34d399" testid="stat-s3" />
        <Stat label="Samba Shares" value={s.samba_count ?? "—"} icon={Server} accent="#fbbf24" testid="stat-samba" />
        <Stat label="Users" value={s.total_users ?? "—"} icon={Users} accent="#a78bfa" testid="stat-users" />
      </div>

      <div className="mt-10 bg-[#121212] border border-border rounded-sm p-6">
        <div className="flex items-center gap-3 mb-4">
          <ShieldCheck size={20} className="text-primary" />
          <h3 className="font-display font-semibold text-xl tracking-tight">Getting Started</h3>
        </div>
        <ol className="text-sm text-gray-300 space-y-2 list-decimal list-inside">
          <li>Go to <span className="font-mono text-primary">Storages</span> and add an S3 or Samba connection, then test it.</li>
          <li>Create users under <span className="font-mono text-primary">Users</span> and grant them per-storage access (read or write).</li>
          <li>Open <span className="font-mono text-primary">File Browser</span> to upload, download, delete files and create folders.</li>
        </ol>
      </div>
    </div>
  );
}
