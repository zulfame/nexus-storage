import { Download, CheckCircle2, AlertCircle, Loader2, X } from "lucide-react";

function fmtBytes(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function DownloadManager({ downloads = [], onDismiss }) {
  if (!downloads.length) return null;
  const active = downloads.filter((d) => d.status === "downloading").length;

  return (
    <div className="fixed bottom-4 right-4 z-[75] w-[320px] max-w-[calc(100vw-2rem)]" data-testid="download-manager">
      <div className="bg-white border border-gray-200 rounded-2xl shadow-2xl overflow-hidden animate-in slide-in-from-bottom-2 fade-in duration-200">
        <div className="flex items-center gap-2 px-4 py-3 border-b border-gray-100 bg-gray-50/70">
          <Download size={16} className="text-blue-600" />
          <span className="text-sm font-semibold text-gray-800">
            {active > 0 ? `Downloading ${active} file${active > 1 ? "s" : ""}` : "Downloads"}
          </span>
        </div>
        <div className="max-h-[260px] overflow-y-auto divide-y divide-gray-100">
          {downloads.map((d) => {
            const pct = d.total ? Math.min(100, Math.round((d.loaded / d.total) * 100)) : (d.status === "done" ? 100 : null);
            return (
              <div key={d.id} className="px-4 py-3" data-testid={`download-item-${d.name}`}>
                <div className="flex items-center gap-2">
                  <span className="shrink-0">
                    {d.status === "done" ? (
                      <CheckCircle2 size={16} className="text-green-500" />
                    ) : d.status === "error" ? (
                      <AlertCircle size={16} className="text-red-500" />
                    ) : (
                      <Loader2 size={16} className="text-blue-500 animate-spin" />
                    )}
                  </span>
                  <span className="text-xs font-medium text-gray-800 truncate flex-1" title={d.name}>{d.name}</span>
                  <button
                    onClick={() => onDismiss?.(d.id)}
                    aria-label="Dismiss"
                    data-testid={`download-dismiss-${d.name}`}
                    className="shrink-0 h-6 w-6 flex items-center justify-center rounded-md text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"
                  >
                    <X size={13} />
                  </button>
                </div>
                <div className="mt-2 flex items-center gap-2">
                  <div className="flex-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                    <div
                      className={`h-full rounded-full transition-all duration-200 ${
                        d.status === "error" ? "bg-red-400" : d.status === "done" ? "bg-green-500" : "bg-blue-500"
                      } ${pct === null ? "animate-pulse w-1/3" : ""}`}
                      style={pct === null ? undefined : { width: `${pct}%` }}
                    />
                  </div>
                  <span className="text-[11px] text-gray-400 tabular-nums shrink-0 w-14 text-right">
                    {d.status === "error"
                      ? "Failed"
                      : d.status === "done"
                      ? "Done"
                      : pct !== null
                      ? `${pct}%`
                      : fmtBytes(d.loaded)}
                  </span>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
