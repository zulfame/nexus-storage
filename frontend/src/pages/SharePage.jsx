import { useEffect, useState } from "react";
import { useParams } from "react-router-dom";
import axios from "axios";
import { API, apiError } from "@/lib/api";
import { useSettings } from "@/context/SettingsContext";
import { fileMeta } from "@/lib/fileTypes";
import { Download, Lock, Loader2, Database, AlertTriangle } from "lucide-react";

function fmtSize(n) {
  if (!n) return "";
  const u = ["B", "KB", "MB", "GB"];
  let i = 0, v = n;
  while (v >= 1024 && i < u.length - 1) { v /= 1024; i++; }
  return `${v.toFixed(v < 10 && i > 0 ? 1 : 0)} ${u[i]}`;
}

export default function SharePage() {
  const { token } = useParams();
  const { settings } = useSettings();
  const [info, setInfo] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState("");
  const [password, setPassword] = useState("");
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    axios.get(`${API}/share/${token}`)
      .then((r) => setInfo(r.data))
      .catch((e) => setError(apiError(e, "This link is invalid or has expired")))
      .finally(() => setLoading(false));
  }, [token]);

  const download = async () => {
    setBusy(true);
    try {
      const res = await axios.get(`${API}/share/${token}/download`, {
        params: password ? { password } : {},
        responseType: "blob",
      });
      const url = URL.createObjectURL(res.data);
      const a = document.createElement("a");
      a.href = url;
      a.download = info.name;
      a.click();
      URL.revokeObjectURL(url);
      setInfo((s) => ({ ...s, downloads: (s.downloads || 0) + 1 }));
    } catch (e) {
      setError(apiError(e, "Download failed"));
    } finally {
      setBusy(false);
    }
  };

  const appName = settings?.app_name || "Nexus Storage Manager";
  const logo = settings?.logo_url;
  const meta = info ? fileMeta(info.name) : null;
  const Icon = meta ? meta.icon : Download;

  return (
    <div className="min-h-screen bg-gradient-to-br from-blue-600 to-indigo-700 flex items-center justify-center p-4">
      <div className="w-full max-w-md">
        <div className="flex items-center justify-center gap-2.5 mb-6 text-white">
          {logo ? <img src={logo} alt="logo" className="h-8 w-8 rounded-lg object-cover" /> : (
            <div className="h-8 w-8 bg-white/15 backdrop-blur rounded-lg flex items-center justify-center"><Database size={18} /></div>
          )}
          <span className="font-display font-bold text-lg tracking-tight">{appName}</span>
        </div>

        <div className="bg-white rounded-2xl shadow-2xl overflow-hidden" data-testid="share-page">
          {loading ? (
            <div className="p-16 text-center text-gray-400"><Loader2 size={26} className="animate-spin inline" /></div>
          ) : error && !info ? (
            <div className="p-10 text-center">
              <AlertTriangle size={40} className="text-amber-400 mx-auto mb-3" />
              <div className="font-semibold text-gray-800">Link unavailable</div>
              <div className="text-sm text-gray-500 mt-1" data-testid="share-error">{error}</div>
            </div>
          ) : (
            <div className="p-8 text-center">
              <div className={`h-16 w-16 rounded-2xl mx-auto flex items-center justify-center mb-4 ${meta?.box || "bg-gray-100 text-gray-500"}`}>
                <Icon size={30} />
              </div>
              <div className="font-semibold text-gray-900 break-all" data-testid="share-filename">{info.name}</div>
              <div className="text-xs text-gray-400 mt-1">{fmtSize(info.size)}{info.size ? " · " : ""}Shared file</div>

              {info.requires_password && (
                <div className="mt-5 text-left">
                  <label className="text-sm font-medium text-gray-700 mb-1.5 flex items-center gap-1.5"><Lock size={13} /> Password required</label>
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    onKeyDown={(e) => e.key === "Enter" && download()}
                    data-testid="share-password-input"
                    placeholder="Enter password"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>
              )}

              {error && <div className="text-xs text-red-500 mt-3" data-testid="share-download-error">{error}</div>}

              <button
                onClick={download}
                disabled={busy || (info.requires_password && !password)}
                data-testid="share-download-button"
                className="mt-5 w-full flex items-center justify-center gap-2 bg-primary text-white font-semibold text-sm px-5 py-3 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {busy ? <Loader2 size={16} className="animate-spin" /> : <Download size={16} />}
                Download
              </button>
              {info.expires_at && (
                <div className="text-[11px] text-gray-400 mt-3">Link expires {new Date(info.expires_at).toLocaleDateString()}</div>
              )}
            </div>
          )}
        </div>
        <div className="text-center text-white/60 text-xs mt-5">Powered by {appName}</div>
      </div>
    </div>
  );
}
