import { useState } from "react";
import { useAuth } from "@/context/AuthContext";
import api, { apiError } from "@/lib/api";
import { toast } from "sonner";
import { ChevronDown, KeyRound, LogOut, Loader2, ShieldCheck } from "lucide-react";
import {
  DropdownMenu,
  DropdownMenuTrigger,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
} from "@/components/ui/dropdown-menu";

export function UserMenu() {
  const { user, logout } = useAuth();
  const [open, setOpen] = useState(false);
  const [pw, setPw] = useState({ current: "", next: "", confirm: "" });
  const [saving, setSaving] = useState(false);

  if (!user) return null;

  const submit = async () => {
    if (pw.next.length < 6) return toast.error("New password must be at least 6 characters");
    if (pw.next !== pw.confirm) return toast.error("New passwords do not match");
    setSaving(true);
    try {
      await api.post("/auth/change-password", { current_password: pw.current, new_password: pw.next });
      toast.success("Password changed successfully");
      setOpen(false);
      setPw({ current: "", next: "", confirm: "" });
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  const initial = (user.email || "?")[0].toUpperCase();

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button data-testid="user-menu-button" className="flex items-center gap-2 pl-1.5 pr-2.5 py-1.5 rounded-xl border border-gray-200 bg-white hover:bg-gray-50 transition-colors">
            <div className="h-7 w-7 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center text-xs font-semibold">{initial}</div>
            <span className="text-sm font-medium text-gray-700 max-w-[150px] truncate hidden sm:block">{user.name || user.email}</span>
            <ChevronDown size={15} className="text-gray-400" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel>
            <div className="text-sm font-medium text-gray-900 truncate">{user.email}</div>
            <div className="text-xs text-gray-400 mt-0.5 flex items-center gap-1 capitalize">
              <ShieldCheck size={12} /> {user.role}
            </div>
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem data-testid="menu-change-password" onClick={() => setOpen(true)} className="cursor-pointer">
            <KeyRound size={15} className="mr-2" /> Change password
          </DropdownMenuItem>
          <DropdownMenuItem data-testid="menu-logout" onClick={logout} className="cursor-pointer text-red-600 focus:text-red-600">
            <LogOut size={15} className="mr-2" /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {open && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-gray-900/40 backdrop-blur-sm p-4">
          <div className="bg-white border border-gray-200 rounded-2xl w-full max-w-md shadow-2xl" data-testid="change-password-dialog">
            <div className="p-6 border-b border-gray-100">
              <h3 className="font-display font-bold text-xl tracking-tight text-gray-900">Change Password</h3>
              <p className="text-sm text-gray-500 mt-1">Update the password for {user.email}.</p>
            </div>
            <div className="p-6 space-y-4">
              {[
                { k: "current", label: "Current password", tid: "cp-current" },
                { k: "next", label: "New password", tid: "cp-new" },
                { k: "confirm", label: "Confirm new password", tid: "cp-confirm" },
              ].map((f) => (
                <div key={f.k}>
                  <label className="text-sm font-medium text-gray-700 block mb-1.5">{f.label}</label>
                  <input
                    type="password"
                    value={pw[f.k]}
                    onChange={(e) => setPw((s) => ({ ...s, [f.k]: e.target.value }))}
                    onKeyDown={(e) => e.key === "Enter" && submit()}
                    data-testid={f.tid}
                    placeholder="••••••••"
                    className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
                  />
                </div>
              ))}
            </div>
            <div className="p-6 border-t border-gray-100 flex justify-end gap-2">
              <button onClick={() => setOpen(false)} className="text-sm font-medium px-4 py-2 rounded-xl text-gray-600 hover:bg-gray-100">Cancel</button>
              <button onClick={submit} disabled={saving} data-testid="cp-submit" className="flex items-center gap-1.5 bg-primary text-white font-semibold text-sm px-5 py-2 rounded-xl hover:bg-blue-700 transition-colors disabled:opacity-60">
                {saving && <Loader2 size={15} className="animate-spin" />} Update Password
              </button>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
