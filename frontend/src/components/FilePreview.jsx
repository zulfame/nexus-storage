import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { X, Download, Loader2, AlertCircle } from "lucide-react";
import { fileMeta, categoryOf, extOf } from "@/lib/fileTypes";

const MAX_PREVIEW_BYTES = 25 * 1024 * 1024; // 25 MB

const MIME = {
  pdf: "application/pdf",
  png: "image/png", jpg: "image/jpeg", jpeg: "image/jpeg", gif: "image/gif",
  webp: "image/webp", svg: "image/svg+xml", bmp: "image/bmp", ico: "image/x-icon", avif: "image/avif",
  mp4: "video/mp4", webm: "video/webm", mov: "video/quicktime", mkv: "video/x-matroska",
  avi: "video/x-msvideo", m4v: "video/mp4", wmv: "video/x-ms-wmv",
  mp3: "audio/mpeg", wav: "audio/wav", ogg: "audio/ogg", flac: "audio/flac", aac: "audio/aac", m4a: "audio/mp4",
};

export function FilePreview({ storageId, item, onClose, onDownload }) {
  const [state, setState] = useState({ loading: true, error: "", kind: "", url: "", text: "", html: "", sheets: null });
  const [sheetIdx, setSheetIdx] = useState(0);

  const meta = fileMeta(item.name);
  const Icon = meta.icon;

  useEffect(() => {
    let objectUrl = null;
    let cancelled = false;
    const cat = categoryOf(item.name);

    async function run() {
      if (item.size && item.size > MAX_PREVIEW_BYTES && ["word", "sheet", "text", "code"].includes(cat)) {
        setState({ loading: false, error: "too_large", kind: cat });
        return;
      }
      try {
        const res = await api.get(`/storages/${storageId}/files/download`, {
          params: { path: item.path },
          responseType: "blob",
        });
        if (cancelled) return;
        const blob = res.data;

        if (["image", "pdf", "video", "audio"].includes(cat)) {
          objectUrl = URL.createObjectURL(blob);
          setState({ loading: false, error: "", kind: cat, url: objectUrl });
        } else if (["text", "code"].includes(cat)) {
          const text = await blob.text();
          if (!cancelled) setState({ loading: false, error: "", kind: "text", text });
        } else if (cat === "word") {
          const buf = await blob.arrayBuffer();
          const mammoth = await import("mammoth/mammoth.browser");
          const result = await mammoth.convertToHtml({ arrayBuffer: buf });
          if (!cancelled) setState({ loading: false, error: "", kind: "html", html: result.value });
        } else if (cat === "sheet") {
          const buf = await blob.arrayBuffer();
          const XLSX = await import("xlsx");
          const wb = XLSX.read(buf, { type: "array" });
          const sheets = wb.SheetNames.map((name) => ({
            name,
            html: XLSX.utils.sheet_to_html(wb.Sheets[name], { editable: false }),
          }));
          if (!cancelled) setState({ loading: false, error: "", kind: "sheet", sheets });
        } else {
          setState({ loading: false, error: "unsupported", kind: cat });
        }
      } catch (e) {
        if (!cancelled) setState({ loading: false, error: apiError(e, "Preview failed"), kind: cat });
      }
    }
    run();
    return () => {
      cancelled = true;
      if (objectUrl) URL.revokeObjectURL(objectUrl);
    };
  }, [storageId, item]);

  return (
    <div className="fixed inset-0 z-[60] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-3 sm:p-6 animate-in fade-in duration-150" onClick={onClose}>
      <div
        className="bg-white border border-gray-200 rounded-2xl w-full max-w-4xl h-[88vh] flex flex-col shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150"
        data-testid="file-preview-dialog"
        onClick={(e) => e.stopPropagation()}
      >
        {/* header */}
        <div className="flex items-center gap-3 px-5 py-3.5 border-b border-gray-100">
          <span className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${meta.box}`}>
            <Icon size={18} />
          </span>
          <div className="min-w-0 flex-1">
            <div className="font-medium text-sm text-gray-900 truncate" data-testid="preview-file-name">{item.name}</div>
            <div className="text-xs text-gray-400 uppercase tracking-wide">{meta.category}</div>
          </div>
          <button onClick={() => onDownload(item)} data-testid="preview-download-button" className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-3 py-1.5 rounded-lg hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors">
            <Download size={15} /> <span className="hidden sm:inline">Download</span>
          </button>
          <button onClick={onClose} data-testid="preview-close-button" aria-label="Close preview" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* body */}
        <div className="flex-1 min-h-0 overflow-auto bg-gray-50" data-testid="preview-body">
          {state.loading ? (
            <div className="h-full flex flex-col items-center justify-center text-gray-400 gap-3">
              <Loader2 size={26} className="animate-spin" />
              <span className="text-sm">Loading preview…</span>
            </div>
          ) : state.error === "too_large" ? (
            <Fallback icon={AlertCircle} title="File too large to preview" desc="This file exceeds the 25 MB preview limit. Download it to view." onDownload={() => onDownload(item)} />
          ) : state.error === "unsupported" ? (
            <Fallback icon={Icon} title="No preview available" desc="This file type can't be previewed in the browser." onDownload={() => onDownload(item)} />
          ) : state.error ? (
            <Fallback icon={AlertCircle} title="Preview failed" desc={String(state.error)} onDownload={() => onDownload(item)} />
          ) : state.kind === "image" ? (
            <div className="h-full flex items-center justify-center p-4">
              <img src={state.url} alt={item.name} className="max-h-full max-w-full object-contain rounded-lg shadow-sm" />
            </div>
          ) : state.kind === "pdf" ? (
            <iframe title={item.name} src={state.url} className="w-full h-full border-0" />
          ) : state.kind === "video" ? (
            <div className="h-full flex items-center justify-center p-4 bg-black">
              <video src={state.url} controls className="max-h-full max-w-full rounded-lg" />
            </div>
          ) : state.kind === "audio" ? (
            <div className="h-full flex items-center justify-center p-8">
              <audio src={state.url} controls className="w-full max-w-lg" />
            </div>
          ) : state.kind === "text" ? (
            <pre className="p-5 text-xs sm:text-sm text-gray-800 whitespace-pre-wrap break-words font-mono leading-relaxed">{state.text}</pre>
          ) : state.kind === "html" ? (
            <div className="mx-auto max-w-3xl bg-white my-5 p-8 rounded-lg shadow-sm doc-preview" dangerouslySetInnerHTML={{ __html: state.html }} />
          ) : state.kind === "sheet" && state.sheets ? (
            <div>
              {state.sheets.length > 1 && (
                <div className="flex gap-1 px-4 pt-3 flex-wrap sticky top-0 bg-gray-50 z-10 border-b border-gray-100 pb-2">
                  {state.sheets.map((sh, i) => (
                    <button key={sh.name} onClick={() => setSheetIdx(i)} className={`text-xs font-medium px-3 py-1.5 rounded-lg transition-colors ${i === sheetIdx ? "bg-primary text-white" : "bg-white border border-gray-200 text-gray-600 hover:bg-gray-100"}`}>
                      {sh.name}
                    </button>
                  ))}
                </div>
              )}
              <div className="p-4 overflow-auto sheet-preview" dangerouslySetInnerHTML={{ __html: state.sheets[sheetIdx].html }} />
            </div>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function Fallback({ icon: Ic, title, desc, onDownload }) {
  return (
    <div className="h-full flex flex-col items-center justify-center text-center px-6 gap-3">
      <Ic size={40} className="text-gray-300" />
      <div className="font-semibold text-gray-700">{title}</div>
      <div className="text-sm text-gray-400 max-w-sm">{desc}</div>
      <button onClick={onDownload} className="mt-2 flex items-center gap-1.5 bg-primary text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors">
        <Download size={15} /> Download file
      </button>
    </div>
  );
}
