import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { Folder, ChevronRight, Loader2, X, FolderInput, Copy as CopyIcon, Home, Cloud, Server, HardDrive } from "lucide-react";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";

function typeIcon(type, size = 14) {
  if (type === "s3") return <Cloud size={size} />;
  if (type === "sftp") return <HardDrive size={size} />;
  return <Server size={size} />;
}

export function MoveCopyDialog({ sourceStorageId, storages = [], item, items, mode, onClose, onDone }) {
  const list = items && items.length ? items : item ? [item] : [];
  const single = list.length === 1;
  const label = single ? list[0].name : `${list.length} items`;
  const [destId, setDestId] = useState(sourceStorageId);
  const [path, setPath] = useState("");
  const [folders, setFolders] = useState([]);
  const [loading, setLoading] = useState(false);
  const [working, setWorking] = useState(false);

  const isMove = mode === "move";
  const crossStorage = destId !== sourceStorageId;

  const load = (sid, p) => {
    setLoading(true);
    api.get(`/storages/${sid}/files`, { params: { path: p } })
      .then((r) => setFolders((r.data.items || []).filter((i) => i.is_dir)))
      .catch((e) => toast.error(apiError(e, "Failed to load folders")))
      .finally(() => setLoading(false));
  };

  useEffect(() => { load(destId, ""); /* eslint-disable-next-line */ }, []);

  const changeDest = (sid) => { setDestId(sid); setPath(""); load(sid, ""); };
  const go = (p) => { setPath(p); load(destId, p); };

  const crumbs = path ? path.split("/").filter(Boolean) : [];
  const invalidTarget = !crossStorage && list.some((it) => {
    const sp = it.path.includes("/") ? it.path.slice(0, it.path.lastIndexOf("/")) : "";
    return (it.is_dir && (path === it.path || path.startsWith(it.path + "/"))) || (isMove && path === sp);
  });

  const submit = async () => {
    setWorking(true);
    let ok = 0;
    const failed = [];
    for (const it of list) {
      const dst = path ? `${path}/${it.name}` : it.name;
      try {
        if (crossStorage) {
          await api.post(`/storages/${sourceStorageId}/files/transfer`, {
            dest_storage_id: destId, src: it.path, dst, is_dir: it.is_dir, move: isMove,
          });
        } else {
          await api.post(`/storages/${sourceStorageId}/files/move`, {
            src: it.path, dst, is_dir: it.is_dir, copy: !isMove,
          });
        }
        ok++;
      } catch {
        failed.push(it.name);
      }
    }
    const verb = isMove ? "Moved" : "Copied";
    if (failed.length) toast.warning(`${verb} ${ok}, ${failed.length} failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`);
    else toast.success(`${verb} ${ok} item${ok > 1 ? "s" : ""}${crossStorage ? " across storages" : ""}`);
    setWorking(false);
    if (ok > 0) onDone?.();
    onClose();
  };

  const destStorage = storages.find((s) => s.id === destId);

  return (
    <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/60 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={onClose}>
      <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl overflow-hidden animate-in zoom-in-95 duration-150 flex flex-col max-h-[85vh]" data-testid="move-copy-dialog" onClick={(e) => e.stopPropagation()}>
        <div className="flex items-center gap-3 px-5 py-4 border-b border-gray-100">
          <span className="h-9 w-9 rounded-lg bg-blue-50 text-blue-600 flex items-center justify-center shrink-0">
            {isMove ? <FolderInput size={18} /> : <CopyIcon size={18} />}
          </span>
          <div className="flex-1 min-w-0">
            <div className="font-semibold text-sm text-gray-900">{isMove ? "Move" : "Copy"} to…</div>
            <div className="text-xs text-gray-400 truncate">{label}</div>
          </div>
          <button onClick={onClose} aria-label="Close" data-testid="move-copy-close" className="h-8 w-8 flex items-center justify-center rounded-lg text-gray-400 hover:text-gray-700 hover:bg-gray-100 transition-colors">
            <X size={18} />
          </button>
        </div>

        {/* destination storage */}
        <div className="px-5 pt-4">
          <label className="text-xs font-medium text-gray-500 block mb-1.5">Destination storage</label>
          <Select value={destId} onValueChange={changeDest}>
            <SelectTrigger data-testid="dest-storage-select" className="w-full h-10 rounded-xl border-gray-200">
              <div className="flex items-center gap-2">
                {destStorage && <span className="text-gray-500">{typeIcon(destStorage.type)}</span>}
                <SelectValue />
              </div>
            </SelectTrigger>
            <SelectContent className="rounded-xl">
              {storages.map((s) => (
                <SelectItem key={s.id} value={s.id} data-testid={`dest-storage-${s.name}`} className="rounded-lg cursor-pointer">
                  <span className="flex items-center gap-2">{typeIcon(s.type)} {s.name}{s.id === sourceStorageId ? " (current)" : ""}</span>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          {crossStorage && (
            <div className="text-[11px] text-blue-600 mt-1.5">Cross-storage {isMove ? "move" : "copy"} — streamed via server (max 500 MB per file).</div>
          )}
        </div>

        {/* breadcrumb */}
        <div className="flex items-center gap-1 px-5 py-2.5 mt-2 border-y border-gray-100 text-xs overflow-x-auto whitespace-nowrap">
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
        <div className="flex-1 overflow-y-auto p-2 min-h-[160px]" data-testid="move-folder-list">
          {loading ? (
            <div className="py-12 text-center text-gray-400"><Loader2 size={20} className="animate-spin inline" /></div>
          ) : folders.length === 0 ? (
            <div className="py-12 text-center text-gray-400 text-sm">No sub-folders here.</div>
          ) : (
            folders.map((f) => {
              const disabled = !crossStorage && list.some((it) => it.is_dir && f.path === it.path);
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
            To: <span className="font-medium text-gray-600">{destStorage?.name}:/{path || ""}</span>
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
