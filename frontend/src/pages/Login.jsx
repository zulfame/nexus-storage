import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Database, Loader2, HardDrive, Cloud, Server } from "lucide-react";
import { toast } from "sonner";

export default function Login() {
  const { login } = useAuth();
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    try {
      const u = await login(email, password);
      toast.success("Signed in");
      navigate(u.role === "admin" ? "/" : "/files");
    } catch (err) {
      toast.error(apiError(err, "Login failed"));
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex bg-[#f6f8fc]">
      <div className="hidden lg:flex flex-1 relative items-center justify-center p-16 bg-gradient-to-br from-blue-600 to-indigo-700 overflow-hidden">
        <div className="absolute inset-0 opacity-20" style={{ backgroundImage: "radial-gradient(circle at 20% 30%, white 1px, transparent 1px)", backgroundSize: "28px 28px" }} />
        <div className="relative max-w-md text-white">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="h-10 w-10 bg-white/15 backdrop-blur rounded-xl flex items-center justify-center">
              <Database size={22} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">NEXUS STORAGE</span>
          </div>
          <h1 className="font-display font-extrabold text-5xl leading-[1.08] tracking-tight">
            All your storage, one clean workspace.
          </h1>
          <p className="text-blue-100 mt-5 text-base leading-relaxed">
            Connect S3 buckets and Samba shares, control who can access what, and manage files
            with a familiar drive-like experience.
          </p>
          <div className="flex gap-6 mt-10">
            {[{ i: Cloud, t: "AWS S3" }, { i: HardDrive, t: "MinIO / Wasabi" }, { i: Server, t: "Samba / SMB" }].map(({ i: Ic, t }) => (
              <div key={t} className="flex items-center gap-2 text-sm text-blue-50">
                <Ic size={18} /> {t}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="w-full lg:w-[480px] flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="lg:hidden flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 bg-primary flex items-center justify-center rounded-xl">
              <Database size={20} className="text-white" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-xl tracking-tight text-gray-900">NEXUS STORAGE</span>
          </div>

          <h2 className="font-display font-bold text-3xl tracking-tight mb-1 text-gray-900">Welcome back</h2>
          <p className="text-gray-500 text-sm mb-8">Sign in to your storage workspace.</p>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                placeholder="admin@example.com"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
            <div>
              <label className="text-sm font-medium text-gray-700 block mb-1.5">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                placeholder="••••••••"
                className="w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-primary text-white font-semibold text-sm py-2.5 rounded-xl hover:bg-blue-700 transition-colors flex items-center justify-center gap-2 disabled:opacity-60 shadow-sm"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Signing in…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
