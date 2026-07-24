import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "@/lib/api";
import { UserMenu } from "@/components/UserMenu";
import { FilePreview } from "@/components/FilePreview";
import { UploadDialog } from "@/components/UploadDialog";
import { MoveCopyDialog } from "@/components/MoveCopyDialog";
import { ThumbImage } from "@/components/ThumbImage";
import { fileMeta, isPreviewable, categoryOf } from "@/lib/fileTypes";
import { toast } from "sonner";
import {
  Cloud,
  Server,
  Folder,
  Upload,
  Download,
  Trash2,
  FolderPlus,
  ChevronRight,
  Loader2,
  HardDrive,
  LayoutGrid,
  List as ListIcon,
  Search,
  Eye,
  MoreHorizontal,
  UploadCloud,
  Pencil,
  FolderInput,
  Copy as CopyIcon,
  FolderOpen,
} from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
} from "@/components/ui/dropdown-menu";
import {
  ContextMenu,
  ContextMenuTrigger,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuSeparator,
} from "@/components/ui/context-menu";

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

function storageIcon(type, size = 16) {
  if (type === "s3") return <Cloud size={size} />;
  if (type === "sftp") return <HardDrive size={size} />;
  return <Server size={size} />;
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
  const [newFolder, setNewFolder] = useState(false);
  const [folderName, setFolderName] = useState("");
  const [view, setView] = useState(() => localStorage.getItem("files_view") || "list");
  const [query, setQuery] = useState("");
  const [preview, setPreview] = useState(null);
  const [uploadOpen, setUploadOpen] = useState(false);
  const [uploadInitial, setUploadInitial] = useState(null);
  const [dragging, setDragging] = useState(false);
  const [renameItem, setRenameItem] = useState(null);
  const [renameValue, setRenameValue] = useState("");
  const [moveCopy, setMoveCopy] = useState(null); // { item, mode }
  const reqId = useRef(0);

  const openUpload = (files) => {
    setUploadInitial(files && files.length ? files : null);
    setUploadOpen(true);
  };

  const canWrite = active?.permission === "write";

  const setViewMode = (v) => {
    setView(v);
    localStorage.setItem("files_view", v);
  };

  useEffect(() => {
    api.get("/storages").then((r) => {
      setStorages(r.data);
      if (r.data.length) setActive(r.data[0]);
    });
  }, []);

  const loadFiles = useCallback(
    async (p) => {
      if (!active) return;
      const myId = ++reqId.current;
      const sid = active.id;
      setLoading(true);
      setItems([]);
      try {
        const r = await api.get(`/storages/${sid}/files`, { params: { path: p } });
        if (reqId.current !== myId) return;
        setItems(r.data.items);
      } catch (e) {
        if (reqId.current !== myId) return;
        toast.error(apiError(e, "Failed to list files"));
        setItems([]);
      } finally {
        if (reqId.current === myId) setLoading(false);
      }
    },
    [active]
  );

  useEffect(() => {
    if (active) {
      setPath("");
      setQuery("");
      loadFiles("");
    }
  }, [active, loadFiles]);

  const enter = (item) => {
    if (!item.is_dir) return;
    setQuery("");
    setPath(item.path);
    loadFiles(item.path);
  };

  const openItem = (item) => {
    if (item.is_dir) return enter(item);
    if (isPreviewable(item.name)) setPreview(item);
    else download(item);
  };

  const goTo = (p) => {
    setQuery("");
    setPath(p);
    loadFiles(p);
  };

  const crumbs = path ? path.split("/").filter(Boolean) : [];

  const onDrop = (e) => {
    e.preventDefault();
    setDragging(false);
    if (!canWrite) return;
    const fs = Array.from(e.dataTransfer?.files || []);
    if (fs.length) openUpload(fs);
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

  const openRename = (item) => {
    setRenameItem(item);
    setRenameValue(item.name);
  };

  const doRename = async () => {
    const name = renameValue.trim();
    if (!name || name === renameItem.name) return setRenameItem(null);
    if (/[\\/]/.test(name)) return toast.error("Name cannot contain slashes");
    const parent = renameItem.path.includes("/") ? renameItem.path.slice(0, renameItem.path.lastIndexOf("/")) : "";
    const dst = parent ? `${parent}/${name}` : name;
    try {
      await api.post(`/storages/${active.id}/files/move`, { src: renameItem.path, dst, is_dir: renameItem.is_dir, copy: false });
      toast.success("Renamed");
      setRenameItem(null);
      loadFiles(path);
    } catch (e) {
      toast.error(apiError(e, "Rename failed"));
    }
  };

  const filtered = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;

  const ItemMenu = ({ item, children }) => (
    <ContextMenu>
      <ContextMenuTrigger asChild>{children}</ContextMenuTrigger>
      <ContextMenuContent className="w-52" data-testid={`ctx-menu-${item.name}`}>
        {item.is_dir ? (
          <ContextMenuItem onClick={() => enter(item)} className="cursor-pointer"><FolderOpen size={15} className="mr-2 text-blue-500" /> Open</ContextMenuItem>
        ) : (
          <>
            {isPreviewable(item.name) && (
              <ContextMenuItem onClick={() => setPreview(item)} data-testid={`ctx-preview-${item.name}`} className="cursor-pointer"><Eye size={15} className="mr-2 text-gray-500" /> Preview</ContextMenuItem>
            )}
            <ContextMenuItem onClick={() => download(item)} data-testid={`ctx-download-${item.name}`} className="cursor-pointer"><Download size={15} className="mr-2 text-gray-500" /> Download</ContextMenuItem>
          </>
        )}
        {canWrite && (
          <>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => openRename(item)} data-testid={`ctx-rename-${item.name}`} className="cursor-pointer"><Pencil size={15} className="mr-2 text-gray-500" /> Rename</ContextMenuItem>
            <ContextMenuItem onClick={() => setMoveCopy({ item, mode: "move" })} data-testid={`ctx-move-${item.name}`} className="cursor-pointer"><FolderInput size={15} className="mr-2 text-gray-500" /> Move to…</ContextMenuItem>
            <ContextMenuItem onClick={() => setMoveCopy({ item, mode: "copy" })} data-testid={`ctx-copy-${item.name}`} className="cursor-pointer"><CopyIcon size={15} className="mr-2 text-gray-500" /> Copy to…</ContextMenuItem>
            <ContextMenuSeparator />
            <ContextMenuItem onClick={() => remove(item)} data-testid={`ctx-delete-${item.name}`} className="cursor-pointer text-red-600 focus:text-red-600"><Trash2 size={15} className="mr-2" /> Delete</ContextMenuItem>
          </>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );

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
              {storageIcon(s.type)}
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
            <header className="sticky top-0 lg:top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 sm:px-6 py-3.5 flex items-center gap-3">
              <div className="flex items-center gap-1.5 text-sm min-w-0 flex-1 overflow-hidden" data-testid="breadcrumbs">
                <button onClick={() => goTo("")} className="font-semibold text-blue-600 hover:underline shrink-0 max-w-[40vw] sm:max-w-[220px] truncate">{active.name}</button>
                {(() => {
                  const TAIL = 2;
                  const collapse = crumbs.length > TAIL + 1;
                  const hidden = collapse ? crumbs.slice(0, crumbs.length - TAIL) : [];
                  const tail = collapse ? crumbs.slice(-TAIL) : crumbs;
                  const tailStart = collapse ? crumbs.length - TAIL : 0;
                  return (
                    <>
                      {collapse && (
                        <>
                          <ChevronRight size={13} className="text-gray-300 shrink-0" />
                          <DropdownMenu>
                            <DropdownMenuTrigger asChild>
                              <button data-testid="breadcrumb-collapse" aria-label="Show hidden folders" className="shrink-0 h-6 w-7 flex items-center justify-center rounded-md text-gray-500 hover:bg-gray-100 hover:text-gray-800 transition-colors">
                                <MoreHorizontal size={16} />
                              </button>
                            </DropdownMenuTrigger>
                            <DropdownMenuContent align="start" className="max-w-[260px]">
                              {hidden.map((c, i) => {
                                const p = crumbs.slice(0, i + 1).join("/");
                                return (
                                  <DropdownMenuItem key={p} onClick={() => goTo(p)} className="cursor-pointer">
                                    <Folder size={14} className="mr-2 text-blue-500 shrink-0" />
                                    <span className="truncate">{c}</span>
                                  </DropdownMenuItem>
                                );
                              })}
                            </DropdownMenuContent>
                          </DropdownMenu>
                        </>
                      )}
                      {tail.map((c, i) => {
                        const idx = tailStart + i;
                        const p = crumbs.slice(0, idx + 1).join("/");
                        const isLast = idx === crumbs.length - 1;
                        return (
                          <span key={p} className="flex items-center gap-1.5 min-w-0 shrink">
                            <ChevronRight size={13} className="text-gray-300 shrink-0" />
                            <button
                              onClick={() => goTo(p)}
                              className={`truncate max-w-[30vw] sm:max-w-[200px] ${isLast ? "font-medium text-gray-900" : "text-gray-500 hover:text-gray-900"}`}
                              title={c}
                            >
                              {c}
                            </button>
                          </span>
                        );
                      })}
                    </>
                  );
                })()}
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {canWrite && (
                  <>
                    <button onClick={() => setNewFolder(true)} data-testid="new-folder-button" className={btnOutline}>
                      <FolderPlus size={15} /> <span className="hidden sm:inline">Folder</span>
                    </button>
                    <button onClick={() => openUpload(null)} data-testid="upload-file-button" className={btnPrimary}>
                      <Upload size={15} /> <span className="hidden sm:inline">Upload</span>
                    </button>
                  </>
                )}
                <UserMenu />
              </div>
            </header>

            <div
              className="p-4 sm:p-6 relative"
              onDragOver={(e) => { if (canWrite) { e.preventDefault(); setDragging(true); } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragging(false); }}
              onDrop={onDrop}
            >
              {dragging && (
                <div className="absolute inset-3 sm:inset-5 z-20 rounded-2xl border-2 border-dashed border-blue-400 bg-blue-50/80 backdrop-blur-sm flex flex-col items-center justify-center pointer-events-none" data-testid="drop-overlay">
                  <UploadCloud size={36} className="text-blue-500 mb-2" />
                  <div className="text-sm font-semibold text-blue-700">Drop files to upload</div>
                  <div className="text-xs text-blue-500 mt-0.5">to {active.name}{path ? `/${path}` : ""}</div>
                </div>
              )}
              {/* toolbar: search + view toggle */}
              <div className="flex items-center gap-3 mb-4 flex-wrap">
                <div className="relative flex-1 min-w-[180px] max-w-sm">
                  <Search size={15} className="absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
                  <input
                    value={query}
                    onChange={(e) => setQuery(e.target.value)}
                    placeholder="Search in this folder…"
                    data-testid="file-search-input"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>
                <div className="text-xs text-gray-400 hidden sm:block">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</div>
                <div className="ml-auto flex items-center bg-white border border-gray-200 rounded-xl p-1">
                  <button onClick={() => setViewMode("list")} data-testid="view-list-button" aria-label="List view" className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>
                    <ListIcon size={16} />
                  </button>
                  <button onClick={() => setViewMode("grid")} data-testid="view-grid-button" aria-label="Grid view" className={`p-1.5 rounded-lg transition-colors ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>
                    <LayoutGrid size={16} />
                  </button>
                </div>
              </div>

              {loading ? (
                <div className="py-20 text-center text-gray-400"><Loader2 size={22} className="animate-spin inline" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-2xl">
                  {query.trim() ? "No files match your search." : "This folder is empty."}
                </div>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="file-list">
                  {filtered.map((item) => {
                    const meta = fileMeta(item.name);
                    const Ic = item.is_dir ? Folder : meta.icon;
                    const isImg = !item.is_dir && categoryOf(item.name) === "image";
                    return (
                      <ItemMenu key={item.path} item={item}>
                      <div
                        data-testid={`file-card-${item.name}`}
                        onDoubleClick={() => openItem(item)}
                        className="group relative bg-white border border-gray-200 rounded-2xl p-4 flex flex-col items-center text-center hover:shadow-md hover:border-blue-200 transition-all cursor-pointer"
                        onClick={() => openItem(item)}
                      >
                        {isImg ? (
                          <div className="h-14 w-14 rounded-xl overflow-hidden mb-2.5 bg-gray-50 border border-gray-100">
                            <ThumbImage storageId={active.id} item={item} fallback={<Ic size={26} className="text-sky-500" />} />
                          </div>
                        ) : (
                          <div className={`h-14 w-14 rounded-xl flex items-center justify-center mb-2.5 ${item.is_dir ? "bg-blue-50 text-blue-500" : meta.box}`}>
                            <Ic size={26} fill={item.is_dir ? "#dbeafe" : "none"} />
                          </div>
                        )}
                        <div className="text-xs font-medium text-gray-800 truncate w-full" title={item.name}>{item.name}</div>
                        <div className="text-[11px] text-gray-400 mt-0.5">{item.is_dir ? "Folder" : fmtSize(item.size)}</div>
                        <div className="absolute top-2 right-2 flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          {!item.is_dir && (
                            <button onClick={(e) => { e.stopPropagation(); download(item); }} data-testid={`download-${item.name}`} aria-label="Download" className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-blue-600 hover:border-blue-300 shadow-sm">
                              <Download size={13} />
                            </button>
                          )}
                          {canWrite && (
                            <button onClick={(e) => { e.stopPropagation(); remove(item); }} data-testid={`delete-file-${item.name}`} aria-label="Delete" className="p-1.5 bg-white border border-gray-200 rounded-lg hover:text-red-600 hover:border-red-200 shadow-sm">
                              <Trash2 size={13} />
                            </button>
                          )}
                        </div>
                      </div>
                      </ItemMenu>
                    );
                  })}
                </div>
              ) : (
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
                        {filtered.map((item) => {
                          const meta = fileMeta(item.name);
                          const Ic = item.is_dir ? Folder : meta.icon;
                          return (
                            <ItemMenu key={item.path} item={item}>
                            <tr className="border-b border-gray-100 last:border-0 hover:bg-gray-50 transition-colors group cursor-pointer" data-testid={`file-row-${item.name}`} onClick={() => openItem(item)}>
                              <td className="px-4 py-2.5">
                                <div className={`flex items-center gap-2.5 ${item.is_dir ? "text-gray-800" : "text-gray-700"}`}>
                                  <span className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 overflow-hidden ${item.is_dir ? "bg-blue-50 text-blue-500" : meta.box}`}>
                                    {!item.is_dir && categoryOf(item.name) === "image" ? (
                                      <ThumbImage storageId={active.id} item={item} fallback={<Ic size={16} className="text-sky-500" />} />
                                    ) : (
                                      <Ic size={16} fill={item.is_dir ? "#dbeafe" : "none"} />
                                    )}
                                  </span>
                                  <span className="truncate">{item.name}</span>
                                </div>
                              </td>
                              <td className="px-4 py-2.5 text-gray-500">{item.is_dir ? "—" : fmtSize(item.size)}</td>
                              <td className="px-4 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <div className="flex items-center justify-end gap-1.5">
                                  {!item.is_dir && isPreviewable(item.name) && (
                                    <button onClick={() => setPreview(item)} data-testid={`preview-${item.name}`} aria-label="Preview" className="p-1.5 border border-gray-200 rounded-lg hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100">
                                      <Eye size={14} />
                                    </button>
                                  )}
                                  {!item.is_dir && (
                                    <button onClick={() => download(item)} data-testid={`download-${item.name}`} aria-label="Download" className="p-1.5 border border-gray-200 rounded-lg hover:text-blue-600 hover:border-blue-300 hover:bg-blue-50 transition-colors sm:opacity-0 sm:group-hover:opacity-100">
                                      <Download size={14} />
                                    </button>
                                  )}
                                  {canWrite && (
                                    <DropdownMenu>
                                      <DropdownMenuTrigger asChild>
                                        <button data-testid={`more-${item.name}`} aria-label="More actions" className="p-1.5 border border-gray-200 rounded-lg text-gray-500 hover:text-gray-800 hover:bg-gray-100 transition-colors">
                                          <MoreHorizontal size={14} />
                                        </button>
                                      </DropdownMenuTrigger>
                                      <DropdownMenuContent align="end" className="w-44">
                                        <DropdownMenuItem onClick={() => openRename(item)} className="cursor-pointer"><Pencil size={14} className="mr-2 text-gray-500" /> Rename</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setMoveCopy({ item, mode: "move" })} className="cursor-pointer"><FolderInput size={14} className="mr-2 text-gray-500" /> Move to…</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => setMoveCopy({ item, mode: "copy" })} className="cursor-pointer"><CopyIcon size={14} className="mr-2 text-gray-500" /> Copy to…</DropdownMenuItem>
                                        <DropdownMenuItem onClick={() => remove(item)} className="cursor-pointer text-red-600 focus:text-red-600"><Trash2 size={14} className="mr-2" /> Delete</DropdownMenuItem>
                                      </DropdownMenuContent>
                                    </DropdownMenu>
                                  )}
                                </div>
                              </td>
                            </tr>
                            </ItemMenu>
                          );
                        })}
                      </tbody>
                    </table>
                  </div>
                </div>
              )}
            </div>
          </>
        )}
      </div>

      {preview && (
        <FilePreview
          storageId={active.id}
          item={preview}
          onClose={() => setPreview(null)}
          onDownload={download}
        />
      )}

      {uploadOpen && active && (
        <UploadDialog
          storageId={active.id}
          path={path}
          initialFiles={uploadInitial}
          onClose={() => { setUploadOpen(false); setUploadInitial(null); }}
          onDone={() => loadFiles(path)}
        />
      )}

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
      {moveCopy && active && (
        <MoveCopyDialog
          storageId={active.id}
          item={moveCopy.item}
          mode={moveCopy.mode}
          onClose={() => setMoveCopy(null)}
          onDone={() => loadFiles(path)}
        />
      )}

      {renameItem && (
        <div className="fixed inset-0 z-[70] flex items-center justify-center bg-gray-900/50 backdrop-blur-sm p-4 animate-in fade-in duration-150" onClick={() => setRenameItem(null)}>
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-sm shadow-2xl animate-in zoom-in-95 duration-150" data-testid="rename-dialog" onClick={(e) => e.stopPropagation()}>
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">Rename {renameItem.is_dir ? "folder" : "file"}</h3>
            </div>
            <div className="p-6">
              <label className="text-sm font-medium text-gray-700 block mb-1.5">New name</label>
              <input
                autoFocus
                value={renameValue}
                onChange={(e) => setRenameValue(e.target.value)}
                onKeyDown={(e) => e.key === "Enter" && doRename()}
                onFocus={(e) => e.target.select()}
                data-testid="rename-input"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setRenameItem(null)} className="text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={doRename} data-testid="rename-confirm-button" className="bg-primary text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition-colors shadow-sm">Rename</button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
