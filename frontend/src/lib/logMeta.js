import {
  Upload,
  Trash2,
  FolderPlus,
  PlugZap,
  Plug,
  Unplug,
  Plus,
  Pencil,
  Activity,
  Settings,
  AlertTriangle,
  MoveRight,
  Copy,
  Terminal,
  Download,
} from "lucide-react";

export const LOG_META = {
  upload: { label: "Upload", icon: Upload, color: "#2563eb", cat: "file" },
  delete: { label: "Delete File", icon: Trash2, color: "#dc2626", cat: "file" },
  delete_folder: { label: "Delete Folder", icon: Trash2, color: "#dc2626", cat: "file" },
  create_folder: { label: "New Folder", icon: FolderPlus, color: "#059669", cat: "file" },
  move: { label: "Move / Rename", icon: MoveRight, color: "#0891b2", cat: "file" },
  copy: { label: "Copy", icon: Copy, color: "#7c3aed", cat: "file" },
  api_list: { label: "API · List", icon: Terminal, color: "#0d9488", cat: "api" },
  api_download: { label: "API · Download", icon: Download, color: "#0891b2", cat: "api" },
  api_upload: { label: "API · Upload", icon: Upload, color: "#2563eb", cat: "api" },
  api_create_folder: { label: "API · New Folder", icon: FolderPlus, color: "#059669", cat: "api" },
  api_delete: { label: "API · Delete", icon: Trash2, color: "#dc2626", cat: "api" },
  connection_ok: { label: "Connection OK", icon: Plug, color: "#059669", cat: "conn" },
  connection_failed: { label: "Connection Failed", icon: Unplug, color: "#dc2626", cat: "conn" },
  reconnect: { label: "Auto-Reconnect", icon: PlugZap, color: "#d97706", cat: "conn" },
  storage_added: { label: "Storage Added", icon: Plus, color: "#7c3aed", cat: "conn" },
  storage_updated: { label: "Storage Updated", icon: Pencil, color: "#2563eb", cat: "conn" },
  storage_deleted: { label: "Storage Removed", icon: Trash2, color: "#dc2626", cat: "conn" },
  settings_updated: { label: "App Settings", icon: Settings, color: "#0891b2", cat: "conn" },
  client_error: { label: "App Error", icon: AlertTriangle, color: "#dc2626", cat: "conn" },
};

export function metaFor(action) {
  return LOG_META[action] || { label: action, icon: Activity, color: "#64748b", cat: "conn" };
}

export function relTime(iso) {
  if (!iso) return "—";
  const d = new Date(iso);
  const s = Math.floor((Date.now() - d.getTime()) / 1000);
  if (s < 60) return "just now";
  const m = Math.floor(s / 60);
  if (m < 60) return `${m}m ago`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h}h ago`;
  const days = Math.floor(h / 24);
  if (days < 7) return `${days}d ago`;
  return d.toLocaleDateString();
}
