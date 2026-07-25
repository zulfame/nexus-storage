import { useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Share2, X, Loader2, Copy, Check, Link as LinkIcon } from "lucide-react";

const EXPIRY = [
  { v: 1, label: "1 day" },
  { v: 7, label: "7 days" },
  { v: 30, label: "30 days" },
  { v: 0, label: "Never" },
];

export function BulkShareDialog({ storageId, items = [], onClose }) {
  const [days, setDays] = useState(7);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [results, setResults] = useState(null); // [{ name, link }]
  const [copiedIdx, setCopiedIdx] = useState(-1);
  const [copiedAll, setCopiedAll] = useState(false);

  const create = async () => {
    setCreating(true);
    const out = [];
    const failed = [];
    for (const it of items) {
      try {
        const r = await api.post(`/storages/${storageId}/files/share`, {
          path: it.path,
          expires_days: days,
          password: password || null,
        });
        out.push({ name: it.name, link: `${window.location.origin}/share/${r.data.token}` });
      } catch {
        failed.push(it.name);
      }
    }
    setResults(out);
    if (failed.length) toast.warning(`Created ${out.length} link(s), ${failed.length} failed`);
    else toast.success(`Created ${out.length} share link(s)`);
    setCreating(false);
  };

  const writeClipboard = async (text) => {
    try {
      await navigator.clipboard.writeText(text);
    } catch {
      const el = document.createElement("textarea");
      el.value = text; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
  };

  const copyOne = async (link, idx) => {
    await writeClipboard(link);
    setCopiedIdx(idx);
    setTimeout(() => setCopiedIdx(-1), 1500);
  };

  const copyAll = async () => {
    await writeClipboard(results.map((r) => `${r.name}: ${r.link}`).join("\n"));
    setCopiedAll(true);
    toast.success("All links copied");
    setTimeout(() => setCopiedAll(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]" data-testid="bulk-share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Share2 size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">Share {items.length} files</div>
            <div className="text-xs text-gray-400 truncate">Generates a public link for each file</div>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="bulk-share-close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        {results ? (
          <div className="p-5 flex flex-col min-h-0">
            <div className="flex items-center justify-between mb-2.5">
              <label className="text-sm font-medium text-gray-700 flex items-center gap-1.5"><LinkIcon size={13} /> {results.length} link{results.length !== 1 ? "s" : ""} created</label>
              <button onClick={copyAll} data-testid="bulk-share-copy-all" className="flex items-center gap-1.5 text-xs font-semibold text-blue-600 hover:text-blue-700 px-2 py-1 rounded-lg hover:bg-blue-50 transition-colors">
                {copiedAll ? <Check size={13} /> : <Copy size={13} />} Copy all
              </button>
            </div>
            <div className="flex-1 overflow-y-auto space-y-2 pr-1" data-testid="bulk-share-results">
              {results.map((r, i) => (
                <div key={i} className="flex items-center gap-2 bg-gray-50 border border-gray-200 rounded-xl px-3 py-2">
                  <div className="min-w-0 flex-1">
                    <div className="text-xs font-medium text-gray-800 truncate">{r.name}</div>
                    <div className="text-[11px] text-gray-400 truncate">{r.link}</div>
                  </div>
                  <button onClick={() => copyOne(r.link, i)} data-testid={`bulk-share-copy-${i}`} aria-label="Copy link" className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg bg-white border border-gray-200 text-gray-500 hover:text-blue-600 hover:border-blue-300 transition-colors">
                    {copiedIdx === i ? <Check size={14} /> : <Copy size={14} />}
                  </button>
                </div>
              ))}
            </div>
            <button onClick={onClose} className="mt-4 w-full bg-gray-100 text-gray-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-200 transition-colors">Done</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Links expire in</label>
              <div className="grid grid-cols-4 gap-2">
                {EXPIRY.map((e) => (
                  <button key={e.v} onClick={() => setDays(e.v)} data-testid={`bulk-share-expiry-${e.v}`} className={`py-2 text-xs font-medium rounded-xl border transition-colors ${days === e.v ? "border-primary text-blue-700 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Password <span className="text-gray-400 font-normal">(applies to all, optional)</span></label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="bulk-share-password" placeholder="Leave empty for no password" className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
            <button onClick={create} disabled={creating} data-testid="bulk-share-create-button" className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Create {items.length} links
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
