import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { fileMeta } from "@/lib/fileTypes";
import { X, CheckCircle2, AlertCircle, Loader2, UploadCloud } from "lucide-react";

function fmtSize(n) {
  if (!n) return "0 B";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export function UploadDialog({ storageId, path, files, onClose, onDone }) {
  const [rows, setRows] = useState(() => files.map((f) => ({ file: f, pct: 0, status: "pending", error: "" })));
  const [busy, setBusy] = useState(true);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      for (let i = 0; i < files.length; i++) {
        if (cancelled) break;
        setRows((r) => r.map((x, idx) => (idx === i ? { ...x, status: "uploading" } : x)));
        const fd = new FormData();
        fd.append("path", path);
        fd.append("file", files[i]);
        try {
          await api.post(`/storages/${storageId}/files/upload`, fd, {
            onUploadProgress: (e) => {
              if (!e.total) return;
              const p = Math.round((e.loaded * 100) / e.total);
              setRows((r) => r.map((x, idx) => (idx === i ? { ...x, pct: p } : x)));
            },
          });
          if (!cancelled) setRows((r) => r.map((x, idx) => (idx === i ? { ...x, pct: 100, status: "done" } : x)));
        } catch (err) {
          if (!cancelled) setRows((r) => r.map((x, idx) => (idx === i ? { ...x, status: "error", error: apiError(err, "Upload failed") } : x)));
        }
      }
      if (!cancelled) {
        setBusy(false);
        onDone?.();
      }
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const doneCount = rows.filter((r) => r.status === "done").length;
  const errCount = rows.filter((r) => r.status === "error").length;

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150">
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150" data-testid="upload-dialog">
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            {busy ? <Loader2 size={18} className="animate-spin" /> : <UploadCloud size={18} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">{busy ? "Uploading files…" : "Upload complete"}</div>
            <div className="text-xs text-gray-400">{doneCount}/{rows.length} done{errCount ? ` · ${errCount} failed` : ""}</div>
          </div>
          {!busy && (
            <button onClick={onClose} data-testid="upload-close-button" aria-label="Close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
              <X size={18} />
            </button>
          )}
        </div>

        <div className="p-4 space-y-3 max-h-[50vh] overflow-y-auto" data-testid="upload-list">
          {rows.map((r, i) => {
            const meta = fileMeta(r.file.name);
            const Ic = meta.icon;
            return (
              <div key={i} className="flex items-center gap-3">
                <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${meta.box}`}>
                  <Ic size={16} />
                </span>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between gap-2">
                    <span className="text-xs font-medium text-gray-800 truncate">{r.file.name}</span>
                    <span className="text-[11px] text-gray-400 shrink-0">
                      {r.status === "done" ? <CheckCircle2 size={14} className="text-green-500 inline" /> :
                       r.status === "error" ? <AlertCircle size={14} className="text-red-500 inline" /> :
                       r.status === "uploading" ? `${r.pct}%` : fmtSize(r.file.size)}
                    </span>
                  </div>
                  <div className="h-1.5 rounded-full bg-gray-100 overflow-hidden mt-1.5">
                    <div
                      className={`h-full rounded-full transition-[width] duration-300 ease-out ${r.status === "error" ? "bg-red-400" : r.status === "done" ? "bg-green-500" : "bg-primary"}`}
                      style={{ width: `${r.status === "done" ? 100 : r.pct}%` }}
                    />
                  </div>
                  {r.status === "error" && <div className="text-[11px] text-red-500 mt-1 truncate">{r.error}</div>}
                </div>
              </div>
            );
          })}
        </div>

        {!busy && (
          <div className="px-5 py-3.5 border-t border-gray-100 flex justify-end bg-gray-50/60">
            <button onClick={onClose} data-testid="upload-done-button" className="bg-primary text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition-colors">
              Done
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
