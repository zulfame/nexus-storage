import { useCallback, useEffect, useRef, useState } from "react";
import api, { API, apiError } from "@/lib/api";
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
      const res = await api.get(`/storages/${active.id}/files/download`, {
        params: { path: item.path },
        responseType: "blob",
      });
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
      await api.delete(`/storages/${active.id}/files`, {
        params: { path: item.path, is_dir: item.is_dir },
      });
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
    <div className="flex min-h-screen">
      {/* storage switcher */}
      <div className="w-64 shrink-0 border-r border-border bg-[#0d0d0d] p-4">
        <div className="overline mb-3 px-1">Storages</div>
        {storages.length === 0 && (
          <p className="text-xs text-gray-500 px-1">No storages assigned.</p>
        )}
        <div className="space-y-1" data-testid="storage-switcher">
          {storages.map((s) => (
            <button
              key={s.id}
              onClick={() => setActive(s)}
              data-testid={`switch-storage-${s.id}`}
              className={`w-full flex items-center gap-2.5 px-3 py-2.5 rounded-sm text-sm text-left transition-colors border ${
                active?.id === s.id
                  ? "border-primary bg-[#00e5ff11] text-primary"
                  : "border-transparent text-gray-400 hover:text-white hover:bg-[#161616]"
              }`}
            >
              {s.type === "s3" ? <Cloud size={16} /> : <Server size={16} />}
              <span className="flex-1 truncate">{s.name}</span>
              <span className="text-[10px] font-mono uppercase opacity-60">{s.permission?.[0]}</span>
            </button>
          ))}
        </div>
      </div>

      {/* browser */}
      <div className="flex-1 p-8 min-w-0">
        {!active ? (
          <div className="flex flex-col items-center justify-center h-full text-gray-500">
            <HardDrive size={40} className="mb-4 opacity-40" />
            <p className="text-sm">Select or ask an admin to assign a storage.</p>
          </div>
        ) : (
          <>
            <div className="flex items-center justify-between mb-6 gap-4 flex-wrap">
              <div className="flex items-center gap-1.5 text-sm font-mono flex-wrap min-w-0" data-testid="breadcrumbs">
                <button onClick={() => goTo("")} className="text-primary hover:underline">
                  {active.name}
                </button>
                {crumbs.map((c, i) => {
                  const p = crumbs.slice(0, i + 1).join("/");
                  return (
                    <span key={p} className="flex items-center gap-1.5 text-gray-400">
                      <ChevronRight size={13} className="text-gray-600" />
                      <button onClick={() => goTo(p)} className="hover:text-white">
                        {c}
                      </button>
                    </span>
                  );
                })}
              </div>

              {canWrite && (
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => setNewFolder(true)}
                    data-testid="new-folder-button"
                    className="flex items-center gap-1.5 text-sm font-medium border border-border px-3 py-2 rounded-sm hover:border-primary hover:text-primary transition-colors"
                  >
                    <FolderPlus size={15} /> Folder
                  </button>
                  <button
                    onClick={() => fileInput.current?.click()}
                    disabled={uploading}
                    data-testid="upload-file-button"
                    className="flex items-center gap-1.5 bg-primary text-black font-semibold text-sm px-4 py-2 rounded-sm hover:bg-[#00b3cc] transition-colors disabled:opacity-60"
                  >
                    {uploading ? <Loader2 size={15} className="animate-spin" /> : <Upload size={15} />}
                    Upload
                  </button>
                  <input ref={fileInput} type="file" onChange={onUpload} className="hidden" data-testid="file-input" />
                </div>
              )}
            </div>

            <div className="border border-border rounded-sm overflow-hidden">
              <table className="w-full text-sm">
                <thead>
                  <tr className="bg-[#0d0d0d] text-left">
                    <th className="px-4 py-2.5 overline">Name</th>
                    <th className="px-4 py-2.5 overline w-32">Size</th>
                    <th className="px-4 py-2.5 overline w-28 text-right">Actions</th>
                  </tr>
                </thead>
                <tbody data-testid="file-list">
                  {loading ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-500">
                        <Loader2 size={18} className="animate-spin inline" />
                      </td>
                    </tr>
                  ) : items.length === 0 ? (
                    <tr>
                      <td colSpan={3} className="px-4 py-12 text-center text-gray-500 text-sm">
                        This folder is empty.
                      </td>
                    </tr>
                  ) : (
                    items.map((item) => (
                      <tr
                        key={item.path}
                        className="border-t border-border hover:bg-[#151515] transition-colors group"
                        data-testid={`file-row-${item.name}`}
                      >
                        <td className="px-4 py-2.5">
                          <button
                            onClick={() => enter(item)}
                            disabled={!item.is_dir}
                            className={`flex items-center gap-2.5 font-mono ${item.is_dir ? "hover:text-primary" : "cursor-default"}`}
                          >
                            {item.is_dir ? (
                              <Folder size={16} className="text-primary shrink-0" />
                            ) : (
                              <FileIcon size={16} className="text-gray-500 shrink-0" />
                            )}
                            <span className="truncate">{item.name}</span>
                          </button>
                        </td>
                        <td className="px-4 py-2.5 font-mono text-gray-400">
                          {item.is_dir ? "—" : fmtSize(item.size)}
                        </td>
                        <td className="px-4 py-2.5">
                          <div className="flex items-center justify-end gap-1.5 opacity-0 group-hover:opacity-100 transition-opacity">
                            {!item.is_dir && (
                              <button
                                onClick={() => download(item)}
                                data-testid={`download-${item.name}`}
                                aria-label="Download"
                                className="p-1.5 border border-border rounded-sm hover:text-primary hover:border-primary transition-colors"
                              >
                                <Download size={14} />
                              </button>
                            )}
                            {canWrite && (
                              <button
                                onClick={() => remove(item)}
                                data-testid={`delete-file-${item.name}`}
                                aria-label="Delete"
                                className="p-1.5 border border-border rounded-sm hover:text-destructive hover:border-destructive transition-colors"
                              >
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
          </>
        )}
      </div>

      {newFolder && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/80 p-4">
          <div className="bg-[#121212] border border-border rounded-sm w-full max-w-sm" data-testid="folder-dialog">
            <div className="p-6 border-b border-border">
              <h3 className="font-display font-bold text-xl tracking-tight">New Folder</h3>
            </div>
            <div className="p-6">
              <label className="overline block mb-1.5">Folder name</label>
              <input
                autoFocus
                value={folderName}
                onChange={(e) => setFolderName(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && createFolder()}
                data-testid="folder-name-input"
                placeholder="new-folder"
                className="w-full bg-[#0d0d0d] border border-border rounded-sm px-3 py-2 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div className="p-6 border-t border-border flex justify-end gap-2">
              <button onClick={() => setNewFolder(false)} className="text-sm font-medium px-4 py-2 rounded-sm text-gray-400 hover:text-white">Cancel</button>
              <button onClick={createFolder} data-testid="create-folder-button" className="bg-primary text-black font-semibold text-sm px-5 py-2 rounded-sm hover:bg-[#00b3cc] transition-colors">Create</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
