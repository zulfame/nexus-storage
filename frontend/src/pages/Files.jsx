import { useCallback, useEffect, useRef, useState } from "react";
import api, { apiError } from "@/lib/api";
import { UserMenu } from "@/components/UserMenu";
import { FilePreview } from "@/components/FilePreview";
import { UploadDialog } from "@/components/UploadDialog";
import { MoveCopyDialog } from "@/components/MoveCopyDialog";
import { ShareDialog } from "@/components/ShareDialog";
import { BulkShareDialog } from "@/components/BulkShareDialog";
import { ConfirmDialog } from "@/components/ConfirmDialog";
import { DownloadManager } from "@/components/DownloadManager";
import { PageHeader } from "@/components/PageHeader";
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
  ArrowUp,
  ArrowDown,
  ChevronsUpDown,
  Share2,
  X,
  CheckSquare,
  Minus,
  ArrowLeft,
  Lock,
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

function fmtDate(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  if (isNaN(d)) return "—";
  return d.toLocaleDateString("en-GB", { day: "2-digit", month: "short", year: "numeric" }) +
    ", " + d.toLocaleTimeString([], { hour: "2-digit", minute: "2-digit" });
}

const STORAGE_META = {
  s3: { icon: Cloud, box: "bg-emerald-50 text-emerald-600", label: "S3 / Compatible" },
  sftp: { icon: HardDrive, box: "bg-violet-50 text-violet-600", label: "SFTP" },
  samba: { icon: Server, box: "bg-amber-50 text-amber-600", label: "Samba / SMB" },
};
const storageMeta = (t) => STORAGE_META[t] || STORAGE_META.samba;

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
  const [shareItem, setShareItem] = useState(null);
  const [sort, setSort] = useState({ key: "name", dir: "asc" });
  const [searchScope, setSearchScope] = useState("folder"); // folder | all
  const [searchResults, setSearchResults] = useState([]);
  const [searching, setSearching] = useState(false);
  const [selected, setSelected] = useState(() => new Set());
  const [bulkMoveCopy, setBulkMoveCopy] = useState(null); // "move" | "copy"
  const [bulkShare, setBulkShare] = useState(false);
  const [confirm, setConfirm] = useState(null); // { title, message, confirmLabel, onConfirm }
  const [downloads, setDownloads] = useState([]);
  const reqId = useRef(0);

  const clearSelection = useCallback(() => setSelected(new Set()), []);
  const toggleSelect = (item) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(item.path)) n.delete(item.path);
      else n.add(item.path);
      return n;
    });

  const toggleSort = (key) =>
    setSort((s) => (s.key === key ? { key, dir: s.dir === "asc" ? "desc" : "asc" } : { key, dir: "asc" }));

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
    api.get("/storages", { params: { include_inaccessible: true } }).then((r) => {
      setStorages(r.data);
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
      clearSelection();
      loadFiles("");
    }
  }, [active, loadFiles, clearSelection]);

  const enter = (item) => {
    if (!item.is_dir) return;
    setQuery("");
    clearSelection();
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
    clearSelection();
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

  const dismissDownload = (id) => setDownloads((d) => d.filter((x) => x.id !== id));

  const download = async (item) => {
    const id = `${item.path}-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`;
    setDownloads((d) => [
      ...d,
      { id, name: item.name, loaded: 0, total: item.size || 0, status: "downloading" },
    ]);
    try {
      const res = await api.get(`/storages/${active.id}/files/download`, {
        params: { path: item.path },
        responseType: "blob",
        onDownloadProgress: (e) => {
          const total = e.total || item.size || 0;
          setDownloads((d) => d.map((x) => (x.id === id ? { ...x, loaded: e.loaded, total } : x)));
        },
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = item.name;
      a.click();
      URL.revokeObjectURL(url);
      setDownloads((d) => d.map((x) => (x.id === id ? { ...x, status: "done", loaded: x.total || x.loaded } : x)));
      setTimeout(() => dismissDownload(id), 3000);
    } catch (e) {
      toast.error(apiError(e, "Download failed"));
      setDownloads((d) => d.map((x) => (x.id === id ? { ...x, status: "error" } : x)));
      setTimeout(() => dismissDownload(id), 5000);
    }
  };

  const remove = (item) => {
    setConfirm({
      title: `Delete ${item.is_dir ? "folder" : "file"}?`,
      message: `"${item.name}" will be permanently deleted. This action cannot be undone.`,
      confirmLabel: "Delete",
      onConfirm: async () => {
        try {
          await api.delete(`/storages/${active.id}/files`, { params: { path: item.path, is_dir: item.is_dir } });
          toast.success("Deleted");
          loadFiles(path);
        } catch (e) {
          toast.error(apiError(e, "Delete failed"));
        }
      },
    });
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

  useEffect(() => {
    if (searchScope !== "all" || !query.trim() || !active) return;
    const t = setTimeout(async () => {
      setSearching(true);
      try {
        const r = await api.get(`/storages/${active.id}/files/search`, { params: { q: query.trim(), path } });
        setSearchResults(r.data.items || []);
      } catch (e) {
        toast.error(apiError(e, "Search failed"));
      } finally {
        setSearching(false);
      }
    }, 400);
    return () => clearTimeout(t);
  }, [query, searchScope, active, path]);

  const localFiltered = query.trim()
    ? items.filter((i) => i.name.toLowerCase().includes(query.trim().toLowerCase()))
    : items;
  const rawList = searchScope === "all" && query.trim() ? searchResults : localFiltered;

  const filtered = [...rawList].sort((a, b) => {
    if (a.is_dir !== b.is_dir) return a.is_dir ? -1 : 1; // folders always first
    const mul = sort.dir === "asc" ? 1 : -1;
    let av, bv;
    if (sort.key === "size") { av = a.size || 0; bv = b.size || 0; }
    else if (sort.key === "modified") { av = a.modified ? Date.parse(a.modified) : 0; bv = b.modified ? Date.parse(b.modified) : 0; }
    else { av = a.name.toLowerCase(); bv = b.name.toLowerCase(); }
    if (av < bv) return -1 * mul;
    if (av > bv) return 1 * mul;
    return 0;
  });

  const selectedItems = filtered.filter((i) => selected.has(i.path));
  const selCount = selectedItems.length;
  const allSelected = filtered.length > 0 && selCount === filtered.length;
  const selectedFiles = selectedItems.filter((i) => !i.is_dir);
  const toggleSelectAll = () =>
    setSelected(allSelected ? new Set() : new Set(filtered.map((i) => i.path)));

  const bulkDelete = () => {
    if (!selCount) return;
    setConfirm({
      title: `Delete ${selCount} item${selCount > 1 ? "s" : ""}?`,
      message: `The selected item${selCount > 1 ? "s" : ""} will be permanently deleted. This action cannot be undone.`,
      confirmLabel: `Delete ${selCount}`,
      onConfirm: async () => {
        let ok = 0;
        const failed = [];
        for (const it of selectedItems) {
          try {
            await api.delete(`/storages/${active.id}/files`, { params: { path: it.path, is_dir: it.is_dir } });
            ok++;
          } catch {
            failed.push(it.name);
          }
        }
        if (failed.length) toast.warning(`Deleted ${ok}, ${failed.length} failed: ${failed.slice(0, 3).join(", ")}${failed.length > 3 ? "…" : ""}`);
        else toast.success(`Deleted ${ok} item${ok > 1 ? "s" : ""}`);
        clearSelection();
        loadFiles(path);
      },
    });
  };

  const bulkDownload = () => {
    if (!selectedFiles.length) return toast.error("Only files can be downloaded");
    selectedFiles.forEach((f, i) => setTimeout(() => download(f), i * 300));
  };

  const SortHeader = ({ label, sortKey, className = "" }) => {
    const active = sort.key === sortKey;
    return (
      <th className={`px-4 py-2.5 ${className}`}>
        <button
          onClick={() => toggleSort(sortKey)}
          data-testid={`sort-${sortKey}`}
          className={`inline-flex items-center gap-1 overline transition-colors ${active ? "text-blue-600" : "hover:text-gray-700"}`}
        >
          {label}
          {active ? (sort.dir === "asc" ? <ArrowUp size={12} /> : <ArrowDown size={12} />) : <ChevronsUpDown size={12} className="text-gray-300" />}
        </button>
      </th>
    );
  };

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
            <ContextMenuItem onClick={() => setShareItem(item)} data-testid={`ctx-share-${item.name}`} className="cursor-pointer"><Share2 size={15} className="mr-2 text-gray-500" /> Share…</ContextMenuItem>
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
    <div>
      {!active ? (
        <>
          <PageHeader overline="Browse" title="File Browser" />
          <div className="p-4 sm:p-8">
            {storages.length === 0 ? (
              <div className="flex flex-col items-center justify-center h-96 text-gray-400">
                <HardDrive size={40} className="mb-4 opacity-40" />
                <p className="text-sm">No storages available yet.</p>
              </div>
            ) : (
              <>
                <p className="text-sm text-gray-500 mb-6">Select a storage to browse and manage its files.</p>
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-5" data-testid="storage-picker">
                  {storages.map((s) => {
                    const accessible = !!s.permission;
                    const M = storageMeta(s.type);
                    const Ic = M.icon;
                    return (
                      <button
                        key={s.id}
                        type="button"
                        disabled={!accessible}
                        onClick={() => accessible && setActive(s)}
                        data-testid={`storage-card-${s.id}`}
                        aria-disabled={!accessible}
                        className={`group relative text-left rounded-2xl p-5 border transition-all duration-200 ${
                          accessible
                            ? "bg-white border-gray-200 shadow-sm hover:shadow-lg hover:border-blue-200 hover:-translate-y-0.5 cursor-pointer"
                            : "bg-gray-50 border-gray-200 cursor-not-allowed"
                        }`}
                      >
                        <div className="flex items-start justify-between mb-4">
                          <div className={`h-12 w-12 flex items-center justify-center rounded-xl shrink-0 transition-transform ${accessible ? `${M.box} group-hover:scale-105` : "bg-gray-200 text-gray-400"}`}>
                            <Ic size={24} />
                          </div>
                          {accessible ? (
                            <span
                              className="text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md"
                              style={{
                                background: s.permission === "write" ? "#05966918" : "#2563eb18",
                                color: s.permission === "write" ? "#059669" : "#2563eb",
                              }}
                            >
                              {s.permission}
                            </span>
                          ) : (
                            <span className="flex items-center gap-1 text-[10px] font-semibold uppercase tracking-wide px-2 py-1 rounded-md bg-gray-200 text-gray-500">
                              <Lock size={11} /> No access
                            </span>
                          )}
                        </div>
                        <div className={`font-semibold text-sm truncate ${accessible ? "text-gray-900" : "text-gray-500"}`}>{s.name}</div>
                        <div className="text-xs text-gray-400 mt-0.5">{M.label}</div>
                        <div className={`mt-4 pt-3 border-t text-xs ${accessible ? "border-gray-100 text-gray-500" : "border-gray-200 text-gray-400"}`}>
                          {s.usage ? (
                            <span>
                              <span className="font-semibold text-gray-700">{fmtSize(s.usage.total_size)}</span>
                              <span className="text-gray-400"> · {s.usage.file_count} files</span>
                            </span>
                          ) : accessible ? (
                            <span className="inline-flex items-center gap-1.5 text-blue-600 font-medium">
                              <FolderOpen size={13} /> Open browser
                            </span>
                          ) : (
                            <span>Ask an admin for access</span>
                          )}
                        </div>
                      </button>
                    );
                  })}
                </div>
              </>
            )}
          </div>
        </>
      ) : (
        <>
          <header className="sticky top-0 lg:top-0 z-10 bg-white/90 backdrop-blur border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 sm:px-6 py-3.5 flex items-center gap-3">
              <button
                onClick={() => { setActive(null); setPath(""); setQuery(""); clearSelection(); }}
                data-testid="back-to-storages"
                aria-label="Back to storages"
                className="shrink-0 h-8 w-8 flex items-center justify-center rounded-lg text-gray-500 hover:text-gray-900 hover:bg-gray-100 transition-colors"
              >
                <ArrowLeft size={18} />
              </button>
              <span className={`shrink-0 h-8 w-8 rounded-lg hidden sm:flex items-center justify-center ${storageMeta(active.type).box}`}>
                {(() => { const Ic = storageMeta(active.type).icon; return <Ic size={16} />; })()}
              </span>
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
                    placeholder={searchScope === "all" ? "Search entire storage…" : "Search in this folder…"}
                    data-testid="file-search-input"
                    className="w-full bg-white border border-gray-200 rounded-xl pl-9 pr-3 py-2 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>
                <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1 text-xs font-medium">
                  <button onClick={() => setSearchScope("folder")} data-testid="search-scope-folder" className={`px-2.5 py-1 rounded-lg transition-colors ${searchScope === "folder" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>This folder</button>
                  <button onClick={() => setSearchScope("all")} data-testid="search-scope-all" className={`px-2.5 py-1 rounded-lg transition-colors ${searchScope === "all" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>Everywhere</button>
                </div>
                <div className="text-xs text-gray-400 hidden sm:block">{filtered.length} item{filtered.length !== 1 ? "s" : ""}</div>
                <div className="ml-auto flex items-center gap-2">
                  {view === "grid" && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button data-testid="grid-sort-button" className="flex items-center gap-1.5 text-sm font-medium border border-gray-200 bg-white px-3 py-2 rounded-xl text-gray-600 hover:bg-gray-50 transition-colors">
                          <ChevronsUpDown size={14} />
                          <span className="hidden sm:inline">Sort: {sort.key === "modified" ? "Date" : sort.key === "size" ? "Size" : "Name"}</span>
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end" className="w-40">
                        {[["name", "Name"], ["size", "Size"], ["modified", "Date modified"]].map(([k, label]) => (
                          <DropdownMenuItem key={k} onClick={() => toggleSort(k)} className="cursor-pointer flex items-center justify-between">
                            {label}
                            {sort.key === k && (sort.dir === "asc" ? <ArrowUp size={13} /> : <ArrowDown size={13} />)}
                          </DropdownMenuItem>
                        ))}
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                  <div className="flex items-center bg-white border border-gray-200 rounded-xl p-1">
                    <button onClick={() => setViewMode("list")} data-testid="view-list-button" aria-label="List view" className={`p-1.5 rounded-lg transition-colors ${view === "list" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>
                      <ListIcon size={16} />
                    </button>
                    <button onClick={() => setViewMode("grid")} data-testid="view-grid-button" aria-label="Grid view" className={`p-1.5 rounded-lg transition-colors ${view === "grid" ? "bg-blue-50 text-blue-600" : "text-gray-400 hover:text-gray-600"}`}>
                      <LayoutGrid size={16} />
                    </button>
                  </div>
                </div>
              </div>

              {selCount > 0 && (
                <div className="flex items-center gap-2 mb-4 bg-blue-600 text-white rounded-2xl px-3 sm:px-4 py-2.5 shadow-sm animate-in fade-in slide-in-from-top-1 duration-150 flex-wrap" data-testid="selection-toolbar">
                  <button onClick={clearSelection} data-testid="selection-clear" aria-label="Clear selection" className="h-7 w-7 flex items-center justify-center rounded-lg hover:bg-white/20 transition-colors shrink-0">
                    <X size={16} />
                  </button>
                  <span className="text-sm font-semibold shrink-0" data-testid="selection-count">{selCount} selected</span>
                  <div className="h-5 w-px bg-white/30 mx-1 hidden sm:block" />
                  <div className="flex items-center gap-1.5 ml-auto flex-wrap">
                    {selectedFiles.length > 0 && (
                      <button onClick={bulkDownload} data-testid="bulk-download-button" className="flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors">
                        <Download size={15} /> <span className="hidden sm:inline">Download</span>
                      </button>
                    )}
                    {selectedFiles.length > 0 && (
                      <button onClick={() => setBulkShare(true)} data-testid="bulk-share-button" className="flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors">
                        <Share2 size={15} /> <span className="hidden sm:inline">Share</span>
                      </button>
                    )}
                    {canWrite && (
                      <>
                        <button onClick={() => setBulkMoveCopy("move")} data-testid="bulk-move-button" className="flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors">
                          <FolderInput size={15} /> <span className="hidden sm:inline">Move</span>
                        </button>
                        <button onClick={() => setBulkMoveCopy("copy")} data-testid="bulk-copy-button" className="flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg hover:bg-white/20 transition-colors">
                          <CopyIcon size={15} /> <span className="hidden sm:inline">Copy</span>
                        </button>
                        <button onClick={bulkDelete} data-testid="bulk-delete-button" className="flex items-center gap-1.5 text-sm font-medium px-2.5 sm:px-3 py-1.5 rounded-lg bg-white/15 hover:bg-white/25 transition-colors">
                          <Trash2 size={15} /> <span className="hidden sm:inline">Delete</span>
                        </button>
                      </>
                    )}
                  </div>
                </div>
              )}

              {loading || searching ? (
                <div className="py-20 text-center text-gray-400"><Loader2 size={22} className="animate-spin inline" /></div>
              ) : filtered.length === 0 ? (
                <div className="py-20 text-center text-gray-400 text-sm bg-white border border-gray-200 rounded-2xl">
                  {query.trim() ? (searchScope === "all" ? "No files match across this storage." : "No files match your search.") : "This folder is empty."}
                </div>
              ) : view === "grid" ? (
                <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 xl:grid-cols-6 gap-3" data-testid="file-list">
                  {filtered.map((item) => {
                    const meta = fileMeta(item.name);
                    const Ic = item.is_dir ? Folder : meta.icon;
                    const isImg = !item.is_dir && categoryOf(item.name) === "image";
                    const isSel = selected.has(item.path);
                    return (
                      <ItemMenu key={item.path} item={item}>
                      <div
                        data-testid={`file-card-${item.name}`}
                        onDoubleClick={() => openItem(item)}
                        className={`group relative bg-white border rounded-2xl p-4 flex flex-col items-center text-center hover:shadow-md transition-all cursor-pointer ${isSel ? "border-blue-500 ring-2 ring-blue-200 bg-blue-50/40" : "border-gray-200 hover:border-blue-200"}`}
                        onClick={() => openItem(item)}
                      >
                        <button
                          onClick={(e) => { e.stopPropagation(); toggleSelect(item); }}
                          data-testid={`select-${item.name}`}
                          aria-label={`Select ${item.name}`}
                          className={`absolute top-2 left-2 h-6 w-6 flex items-center justify-center rounded-md border bg-white transition-opacity ${isSel ? "border-blue-500 text-blue-600 opacity-100" : "border-gray-300 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400"}`}
                        >
                          <CheckSquare size={15} />
                        </button>
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
                    <table className="w-full text-sm min-w-[640px]">
                      <thead>
                        <tr className="bg-gray-50 text-left border-b border-gray-200">
                          <th className="pl-4 pr-1 py-2.5 w-10">
                            <button
                              onClick={toggleSelectAll}
                              data-testid="select-all"
                              aria-label="Select all"
                              className={`h-5 w-5 flex items-center justify-center rounded border bg-white transition-colors ${allSelected ? "border-blue-500 text-blue-600" : selCount > 0 ? "border-blue-500 text-blue-600" : "border-gray-300 text-transparent hover:border-blue-400"}`}
                            >
                              {allSelected ? <CheckSquare size={13} /> : selCount > 0 ? <Minus size={13} /> : <CheckSquare size={13} />}
                            </button>
                          </th>
                          <SortHeader label="Name" sortKey="name" />
                          <SortHeader label="Size" sortKey="size" className="w-32" />
                          <SortHeader label="Modified" sortKey="modified" className="w-48 hidden sm:table-cell" />
                          <th className="px-4 py-2.5 overline w-28 text-right">Actions</th>
                        </tr>
                      </thead>
                      <tbody data-testid="file-list">
                        {filtered.map((item) => {
                          const meta = fileMeta(item.name);
                          const Ic = item.is_dir ? Folder : meta.icon;
                          const isSel = selected.has(item.path);
                          return (
                            <ItemMenu key={item.path} item={item}>
                            <tr className={`border-b border-gray-100 last:border-0 transition-colors group cursor-pointer ${isSel ? "bg-blue-50 hover:bg-blue-50" : "hover:bg-gray-50"}`} data-testid={`file-row-${item.name}`} onClick={() => openItem(item)}>
                              <td className="pl-4 pr-1 py-2.5" onClick={(e) => e.stopPropagation()}>
                                <button
                                  onClick={() => toggleSelect(item)}
                                  data-testid={`select-${item.name}`}
                                  aria-label={`Select ${item.name}`}
                                  className={`h-5 w-5 flex items-center justify-center rounded border bg-white transition-all ${isSel ? "border-blue-500 text-blue-600 opacity-100" : "border-gray-300 text-transparent opacity-0 group-hover:opacity-100 hover:border-blue-400"}`}
                                >
                                  <CheckSquare size={13} />
                                </button>
                              </td>
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
                              <td className="px-4 py-2.5 text-gray-500 hidden sm:table-cell whitespace-nowrap">{fmtDate(item.modified)}</td>
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
                                        {!item.is_dir && <DropdownMenuItem onClick={() => setShareItem(item)} className="cursor-pointer"><Share2 size={14} className="mr-2 text-gray-500" /> Share…</DropdownMenuItem>}
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
          sourceStorageId={active.id}
          storages={storages.filter((s) => s.permission)}
          item={moveCopy.item}
          mode={moveCopy.mode}
          onClose={() => setMoveCopy(null)}
          onDone={() => loadFiles(path)}
        />
      )}

      {shareItem && active && (
        <ShareDialog storageId={active.id} item={shareItem} onClose={() => setShareItem(null)} />
      )}

      {bulkMoveCopy && active && selCount > 0 && (
        <MoveCopyDialog
          sourceStorageId={active.id}
          storages={storages.filter((s) => s.permission)}
          items={selectedItems}
          mode={bulkMoveCopy}
          onClose={() => setBulkMoveCopy(null)}
          onDone={() => { clearSelection(); loadFiles(path); }}
        />
      )}

      {bulkShare && active && selectedFiles.length > 0 && (
        <BulkShareDialog
          storageId={active.id}
          items={selectedFiles}
          onClose={() => setBulkShare(false)}
        />
      )}

      {confirm && (
        <ConfirmDialog
          title={confirm.title}
          message={confirm.message}
          confirmLabel={confirm.confirmLabel}
          danger
          onConfirm={confirm.onConfirm}
          onClose={() => setConfirm(null)}
        />
      )}

      <DownloadManager downloads={downloads} onDismiss={dismissDownload} />

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
