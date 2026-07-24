import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "@/lib/api";
import { UserMenu } from "@/components/UserMenu";
import { toast } from "sonner";
import {
  Cloud,
  Server,
  Folder,
  File as FileIcon,
  Upload,
  Download,
  Trash2,
  FolderPlus,
  ChevronRight,
  Loader2,
  HardDrive,
} from "lucide-react";

function fmtSize(n) {
  if (!n) return "—";
  const u = ["B", "KB", "MB", "GB", "TB"];
  let i = 0;
  let v = n;
  while (v >= 1024 && i < u.length - 1) {
    v /= 1024;
    i++;
  }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

const btnPrimary =
  "flex items-center gap-1.5 bg-primary text-white font-semibold text-sm px-4 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60";
const btnOutline =
  "flex items-center gap-1.5 text-sm font-medium border border-gray-200 px-3 py-2 rounded-xl hover:border-blue-300 hover:text-blue-600 hover:bg-blue-50 transition-colors";

export default function Files() {
  const [storages, setStorages] = useState([]);
  const [active, setActive] = useState(null);
  const [path, setPath] = useState("");
  const [items, setItems] = useState([]);
  const [loading, setLoading] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const fileInput = useRef(null);

  const canWrite = active?.permission === "write";

  useEffect(() => {
    api.get("/storages").then((r) => {
      setStorages(r.data);
      if (r.data.length) setActive(r.data[0]);
    });
  }, []);

  const loadFiles = useCallback(
    async (p) => {
      if (!active) return;
      setLoading(true);
      try {
        const r = await api.get(`/storages/${active.id}/files`, { params: { path: p } });
        setItems(r.data.items);
      } catch (e) {
        toast.error(apiError(e, "Failed to list files"));
        setItems([]);
      } finally {
        setLoading(false);
      }
    },
    [active]
  );

  useEffect(() => {
    if (active) {
      setPath("");
      loadFiles("");
    }
  }, [active, loadFiles]);

  const enter = (item) => {
    if (!item.is_dir) return;
    setPath(item.path);
    loadFiles(item.path);
  };

  const goTo = (p) => {
    setPath(p);
    loadFiles(p);
  };

  const crumbs = path ? path.split("/").filter(Boolean) : [];

  const onUpload = async (e) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setUploading(true);
    const fd = new FormData();
    fd.append("path", path);
    fd.append("file", file);
    try {
      await api.post(`/storages/${active.id}/files/upload`, fd);
      toast.success(`Uploaded ${file.name}`);
      loadFiles(path);
    } catch (err) {
      toast.error(apiError(err, "Upload failed"));
    } finally {
      setUploading(false);
      if (fileInput.current) fileInput.current.value = "";
    }
  };

  const download = async (item) => {
    try {
      const res = await api.get(`/storages/${active.id}/files/download`, { params: { path: item.path }, responseType: "blob" });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
    } catch (e) {
      toast.error(apiError(e, "Download failed"));
    }
  };

  const remove = async (item) => {
    if (!window.confirm(`Delete ${item.is_dir ? "folder" : "file"} "${item.name}"?`)) return;
    try {
      await api.delete(`/storages/${active.id}/files`, { params: { path: item.path, is_dir: item.is_dir } });
      toast.success("Deleted");
      loadFiles(path);
    } catch (e) {
      toast.error(apiError(e, "Delete failed"));
    }
  };

  const createFolder = async () => {
    if (!folderName.trim()) return;
    try {
      await api.post(`/storages/${active.id}/files/folder`, { path, name: folderName.trim() });
      toast.success("Folder created");
      setNewFolder(false);
      setFolderName("");
      loadFiles(path);
    } catch (e) {
      toast.error(apiError(e, "Create folder failed"));
    }
  };

  return (
    <div className="flex flex-col lg:flex-row min-h-[calc(100vh-0px)]">
      {/* storage switcher */}
      <div className="lg:w-64 lg:shrink-0 lg:h-screen lg:sticky lg:top-0 border-b lg:border-b-0 lg:border-r border-gray-200 bg-white">
        <div className="px-4 pt-4 pb-2 overline">Storages</div>
        {storages.length === 0 && <p className="text-xs text-gray-400 px-4 pb-4">No storages assigned.</p>}
        <div className="flex lg:flex-col gap-2 px-3 pb-3 overflow-x-auto lg:overflow-visible" data-testid="storage-switcher">
          {storages.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              data-testid={`switch-storage-${s.id}`}
              className={`flex items-center gap-2.5 px-3 py-2.5 rounded-xl text-sm text-left transition-colors border whitespace-nowrap shrink-0 lg:w-full ${
                active?.id === s.id ? "border-primary bg-blue-50 text-blue-700" : "border-transparent text-gray-600 hover:bg-gray-100"
              }`}
            >
              {s.type === "s3" ? <Cloud size={16} /> : <Server size={16} />}
              <span className="flex-1 truncate">{s.name}</span>
              <span
                className="text-[9px] font-medium uppercase tracking-wide px-1.5 py-0.5 rounded"
                style={{
                  background: s.permission === "write" ? "#05966918" : "#2563eb18",
                  color: s.permission === "write" ? "#059669" : "#2563eb",
                }}
              >
                {s.permission}
              </span>
            </button>
          ))}
        </div>
      </div>

      {/* browser */}
      <div className="flex-1 min-w-0">
        {!active ? (
          <>
            <header className="sticky top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3">
              <div className="text-sm font-semibold text-gray-700">File Browser</div>
              <UserMenu />
            </header>
            <div className="flex flex-col items-center justify-center h-96 text-gray-400">
              <HardDrive size={40} className="mb-4 opacity-40" />
              <p className="text-sm">No storage assigned yet. Ask an admin to grant you access.</p>
            </div>
          </>
        ) : (
          <>
            <header className="sticky top-0 lg:top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 sm:px-6 py-3.5 flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm flex-wrap min-w-0" data-testid="breadcrumbs">
                <button onClick={() => goTo("")} className="font-semibold text-blue-600 hover:underline">{active.name}</button>
                {crumbs.map((c, i) => {
                  const p = crumbs.slice(0, i + 1).join("/");
                  return (
                    <span key={p} className="flex items-center gap-1.5 text-gray-500">
                      <ChevronRight size={13} className="text-gray-300" />
                      <button onClick={() => goTo(p)} className="hover:text-gray-900">{c}</button>
                    </span>
                  );
                })}
              </div>

              <div className="flex items-center gap-2">
                {canWrite && (
                  <>
                    <button onClick={() => setNewFolder(true)} data-testid="new-folder-button" className={btnOutline}>
                      <FolderPlus size={15} /> <span className="hidden sm:inline">Folder</span>
                    </button>
                    <button onClick={() => fileInput.current?.click()} disabled={uploading} data-testid="upload-file-button" className={btnPrimary}>
                      {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />} Upload
                    </button>
                    <input ref={fileInput} type="file" onChange={onUpload} className="hidden" data-testid="file-input" />
                  </>
                )}
                <UserMenu />
              </div>
            </header>

            <div className="p-4 sm:p-6">
              <div className="bg-white border border-gray-200 rounded-2xl shadow-sm overflow-hidden">
                <div className="overflow-x-auto">
                  <table className="w-full text-sm min-w-[520px]">
                    <thead>
                      <tr className="bg-gray-50 text-left border-b border-gray-200">
                        <th className="px-4 py-2.5 overline">Name</th>
                        <th className="px-4 py-2.5 overline w-32">Size</th>
                        <th className="px-4 py-2.5 overline w-28 text-right">Actions</th>
                      </tr>
                    </thead>
                    <tbody data-testid="file-list">
                      {loading ? (
                        <tr><td colSpan={3} className="px-4 py-12 text-center text-gray-400"><Loader2 size={18} className="animate-spin inline" /></td></tr>
                      ) : items.length === 0 ? (
                        <tr><td colSpan={3} className="px-4 py-16 text-center text-gray-400 text-sm">This folder is empty.</td></tr>
                      ) : (
                        items.map((item) => (
                          <tr key={item.path} className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group" data-testid={`file-row-${item.name}`}>
                            <td className="px-4 py-2.5">
                              <button onClick={() => enter(item)} disabled={!item.is_dir} className={`flex items-center gap-2.5 ${item.is_dir ? "hover:text-blue-600 text-gray-800" : "cursor-default text-gray-700"}`}>
                                {item.is_dir ? <Folder size={17} className="text-blue-500 shrink-0" fill="#dbeafe" /> : <FileIcon size={17} className="text-gray-400 shrink-0" />}
                                <span className="truncate">{item.name}</span>
                              </button>
                            </td>
                            <td className="px-4 py-2.5 text-gray-500">{item.is_dir ? "—" : fmtSize(item.size)}</td>
                            <td className="px-4 py-2.5">
                              <div className="flex items-center justify-end gap-1.5 sm:opacity-0 sm:group-hover:opacity-100 transition-opacity">
                                {!item.is_dir && (
                                  <button onClick={() => download(item)} data-testid={`download-${item.name}`} aria-label="Download" className="p-1.5 border border-gray-200 rounded-lg hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors">
                                    <Download size={14} />
                                  </button>
                                )}
                                {canWrite && (
                                  <button onClick={() => remove(item)} data-testid={`delete-file-${item.name}`} aria-label="Delete" className="p-1.5 border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-200 hover:bg-red-50 transition-colors">
                                    <Trash2 size={14} />
                                  </button>
                                )}
                              </div>
                            </td>
                          </tr>
                        ))
                      )}
                    </tbody>
                  </table>
                </div>
              </div>
            </div>
          </>
        )}
      </div>

      {newFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-2xl" data-testid="folder-dialog">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">New Folder</h3>
            </div>
            <div className="p-6">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Folder name</label>
              <input
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                data-testid="folder-name-input"
                placeholder="new-folder"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setNewFolder(false)} className="text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={createFolder} data-testid="create-folder-button" className="bg-primary text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
