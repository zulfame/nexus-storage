import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Folder, ChevronRight, Loader2, X, FolderInput, Copy as CopyIcon, Home } from "lucide-react";

export function MoveCopyDialog({ storageId, item, mode, onClose, onDone }) {
  const [path, setPath] = useState("");
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const load = (p) => {
    setLoading(true);
    api.get(`/storages/${storageId}/files`, { params: { path: p } })
      .then((r) => setFolders((r.data.items || []).filter((i) => i.is_dir)))
      .catch((e) => toast.error(apiError(e, "Failed to load folders")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(""); /* eslint-disable-next-line */ }, []);

  const crumbs = path ? path.split("/").filter(Boolean) : [];
  const srcParent = item.path.includes("/") ? item.path.slice(0, item.path.lastIndexOf("/")) : "";
  const isMove = mode === "move";
  // disallow dropping a folder into itself/descendant, or moving into current parent
  const invalidTarget =
    (item.is_dir && (path === item.path || path.startsWith(item.path + "/"))) ||
    (isMove && path === srcParent);

  const go = (p) => { setPath(p); load(p); };

  const submit = async () => {
    const dst = path ? `${path}/${item.name}` : item.name;
    setWorking(true);
    try {
      await api.post(`/storages/${storageId}/files/move`, {
        src: item.path,
        dst,
        is_dir: item.is_dir,
        copy: !isMove,
      });
      toast.success(`${isMove ? "Moved" : "Copied"} "${item.name}"`);
      onDone?.();
      onClose();
    } catch (e) {
      toast.error(apiError(e, `${isMove ? "Move" : "Copy"} failed`));
    } finally {
      setWorking(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[80vh]" data-testid="move-copy-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            {isMove ? <FolderInput size={18} /> : <CopyIcon size={18} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">{isMove ? "Move" : "Copy"} to…</div>
            <div className="text-xs text-gray-400 truncate">{item.name}</div>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="move-copy-close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* breadcrumb */}
        <div className="flex items-center gap-1 px-5 py-2.5 border-b border-gray-100 text-xs overflow-x-auto whitespace-nowrap">
          <button onClick={() => go("")} className="flex items-center gap-1 text-blue-600 font-medium hover:underline shrink-0"><Home size={13} /> Root</button>
          {crumbs.map((c, i) => {
            const p = crumbs.slice(0, i + 1).join("/");
            return (
              <span key={p} className="flex items-center gap-1 text-gray-500 shrink-0">
                <ChevronRight size={12} className="text-gray-300" />
                <button onClick={() => go(p)} className="hover:text-gray-900 max-w-[120px] truncate">{c}</button>
              </span>
            );
          })}
        </div>

        {/* folder list */}
        <div className="flex-1 overflow-y-auto p-2 min-h-[180px]" data-testid="move-folder-list">
          {loading ? (
            <div className="py-12 text-center text-gray-400"><Loader2 size={20} className="animate-spin inline" /></div>
          ) : folders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No sub-folders here.</div>
          ) : (
            folders.map((f) => {
              const disabled = item.is_dir && f.path === item.path;
              return (
                <button
                  key={f.path}
                  disabled={disabled}
                  onClick={() => go(f.path)}
                  data-testid={`move-folder-${f.name}`}
                  className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors ${disabled ? "opacity-40 cursor-not-allowed" : "hover:bg-gray-100 text-gray-800"}`}
                >
                  <Folder size={17} className="text-blue-500 shrink-0" fill="#dbeafe" />
                  <span className="truncate flex-1">{f.name}</span>
                  <ChevronRight size={15} className="text-gray-300" />
                </button>
              );
            })
          )}
        </div>

        <div className="px-5 py-3.5 border-t border-gray-100 flex items-center gap-2 bg-gray-50/60">
          <div className="text-xs text-gray-400 flex-1 truncate">
            Destination: <span className="font-medium text-gray-600">/{path || ""}</span>
          </div>
          <button onClick={onClose} className="text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
          <button
            onClick={submit}
            disabled={working || invalidTarget}
            data-testid="move-copy-confirm"
            className="flex items-center gap-1.5 bg-primary text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
          >
            {working && <Loader2 size={15} className="animate-spin" />}
            {isMove ? "Move here" : "Copy here"}
          </button>
        </div>
      </div>
    </div>
  );
}
