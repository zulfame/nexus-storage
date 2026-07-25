import { RefreshCw, Loader2, HardDrive } from "lucide-react";

function fmtBytes(n) {
  if (n == null) return "—";
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function StorageMeter({ usage, capacityGb, onRefresh, refreshing, testid }) {
  const used = usage?.total_size ?? null;
  const totalBytes = capacityGb ? Number(capacityGb) * 1024 ** 3 : null;
  const pct = used != null && totalBytes ? Math.min(100, Math.round((used / totalBytes) * 100)) : null;
  const barColor =
    pct == null ? "bg-gray-300" : pct >= 90 ? "bg-red-500" : pct >= 70 ? "bg-amber-500" : "bg-blue-500";

  return (
    <div className="bg-blue-50/50 border border-blue-100 rounded-xl px-3 py-2.5" data-testid={testid}>
      <div className="flex items-center justify-between gap-2 mb-2">
        <div className="text-xs flex items-center gap-1.5 min-w-0">
          <HardDrive size={13} className="text-blue-500 shrink-0" />
          {totalBytes ? (
            <span className="truncate">
              <span className="font-semibold text-gray-900">{used != null ? fmtBytes(used) : "—"}</span>
              <span className="text-gray-400"> / {fmtBytes(totalBytes)}</span>
              {pct != null && <span className="text-gray-400"> · {pct}%</span>}
            </span>
          ) : used != null ? (
            <span className="truncate">
              <span className="font-semibold text-gray-900">{fmtBytes(used)}</span>
              <span className="text-gray-400"> used</span>
            </span>
          ) : (
            <span className="text-gray-400">Usage not calculated</span>
          )}
        </div>
        {onRefresh && (
          <button
            onClick={onRefresh}
            disabled={refreshing}
            data-testid={testid ? `${testid}-refresh` : undefined}
            className="shrink-0 flex items-center gap-1 text-xs font-medium text-blue-600 hover:text-blue-700 disabled:opacity-60"
          >
            {refreshing ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
            {used != null ? "Refresh" : "Calculate"}
          </button>
        )}
      </div>
      <div className="h-1.5 bg-blue-100 rounded-full overflow-hidden">
        <div
          className={`h-full rounded-full transition-all duration-300 ${barColor}`}
          style={{ width: `${pct ?? (used != null ? 100 : 0)}%` }}
        />
      </div>
    </div>
  );
}
