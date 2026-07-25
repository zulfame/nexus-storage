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

export function ShareDialog({ storageId, item, onClose }) {
  const [days, setDays] = useState(7);
  const [password, setPassword] = useState("");
  const [creating, setCreating] = useState(false);
  const [link, setLink] = useState("");
  const [copied, setCopied] = useState(false);

  const create = async () => {
    setCreating(true);
    try {
      const r = await api.post(`/storages/${storageId}/files/share`, {
        path: item.path,
        expires_days: days,
        password: password || null,
      });
      setLink(`${window.location.origin}/api/share/${r.data.token}/og`);
      toast.success("Share link created");
    } catch (e) {
      toast.error(apiError(e, "Failed to create link"));
    } finally {
      setCreating(false);
    }
  };

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(link);
    } catch {
      const el = document.createElement("textarea");
      el.value = link; document.body.appendChild(el); el.select(); document.execCommand("copy"); el.remove();
    }
    setCopied(true);
    toast.success("Copied to clipboard");
    setTimeout(() => setCopied(false), 1500);
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150" data-testid="share-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0"><Share2 size={18} /></span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">Share file</div>
            <div className="text-xs text-gray-400 truncate">{item.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="share-dialog-close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors"><X size={18} /></button>
        </div>

        {link ? (
          <div className="p-5">
            <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5"><LinkIcon size={13} /> Public link</label>
            <div className="flex gap-2">
              <input readOnly value={link} data-testid="share-link-output" onFocus={(e) => e.target.select()} className="flex-1 bg-gray-50 border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none" />
              <button onClick={copy} data-testid="share-copy-button" className="shrink-0 flex items-center gap-1.5 bg-primary text-white font-semibold text-sm px-4 rounded-xl hover:bg-blue-700 transition-colors">
                {copied ? <Check size={15} /> : <Copy size={15} />}
              </button>
            </div>
            <div className="text-xs text-gray-400 mt-2">
              Anyone with this link {password ? "and the password " : ""}can download the file{days ? `, expires in ${days} day${days > 1 ? "s" : ""}` : " (no expiry)"}.
            </div>
            <button onClick={onClose} className="mt-5 w-full bg-gray-100 text-gray-700 font-semibold text-sm py-2.5 rounded-xl hover:bg-gray-200 transition-colors">Done</button>
          </div>
        ) : (
          <div className="p-5 space-y-4">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Link expires in</label>
              <div className="grid grid-cols-4 gap-2">
                {EXPIRY.map((e) => (
                  <button key={e.v} onClick={() => setDays(e.v)} data-testid={`share-expiry-${e.v}`} className={`py-2 text-xs font-medium rounded-xl border transition-colors ${days === e.v ? "border-primary text-blue-700 bg-blue-50" : "border-gray-200 text-gray-500 hover:bg-gray-50"}`}>
                    {e.label}
                  </button>
                ))}
              </div>
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Password <span className="text-gray-400 font-normal">(optional)</span></label>
              <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} data-testid="share-password-set" placeholder="Leave empty for no password" className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors" />
            </div>
            <button onClick={create} disabled={creating} data-testid="share-create-button" className="w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
              {creating ? <Loader2 size={15} className="animate-spin" /> : <Share2 size={15} />} Create link
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
