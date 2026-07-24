import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { apiError } from "@/lib/api";
import { Database, Loader2 } from "lucide-react";
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
    <div className="min-h-screen flex bg-[#0a0a0a]">
      <div
        className="hidden lg:flex flex-1 relative border-r border-border items-end p-12 bg-cover bg-center"
        style={{
          backgroundImage:
            "linear-gradient(to top, rgba(10,10,10,0.95), rgba(10,10,10,0.4)), url('https://images.pexels.com/photos/17485657/pexels-photo-17485657.png?auto=compress&cs=tinysrgb&dpr=2&h=650&w=940')",
        }}
      >
        <div>
          <div className="overline mb-3">Multi-Storage Control Plane</div>
          <h1 className="font-display font-extrabold text-5xl leading-[1.05] tracking-tight max-w-md">
            Manage S3 &amp; Samba from one command center.
          </h1>
          <p className="text-gray-400 mt-4 max-w-sm text-sm">
            Connect object storage and network shares, control per-user access, and browse
            files — all in a single tactical interface.
          </p>
        </div>
      </div>

      <div className="w-full lg:w-[480px] flex items-center justify-center p-8">
        <div className="w-full max-w-sm">
          <div className="flex items-center gap-2.5 mb-10">
            <div className="h-9 w-9 bg-primary flex items-center justify-center rounded-sm">
              <Database size={20} className="text-black" strokeWidth={2.5} />
            </div>
            <span className="font-display font-bold text-xl tracking-tight">NEXUS STORAGE</span>
          </div>

          <div className="overline mb-2">Authenticate</div>
          <h2 className="font-display font-bold text-3xl tracking-tight mb-8">Sign in</h2>

          <form onSubmit={submit} className="space-y-5">
            <div>
              <label className="overline block mb-2">Email</label>
              <input
                type="email"
                required
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                data-testid="login-email-input"
                placeholder="admin@example.com"
                className="w-full bg-[#121212] border border-border rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <div>
              <label className="overline block mb-2">Password</label>
              <input
                type="password"
                required
                value={password}
                onChange={(e) => setPassword(e.target.value)}
                data-testid="login-password-input"
                placeholder="••••••••"
                className="w-full bg-[#121212] border border-border rounded-sm px-3 py-2.5 text-sm font-mono outline-none focus:border-primary focus:ring-1 focus:ring-primary transition-colors"
              />
            </div>
            <button
              type="submit"
              disabled={loading}
              data-testid="login-submit-button"
              className="w-full bg-primary text-black font-semibold text-sm py-2.5 rounded-sm hover:bg-[#00b3cc] transition-colors flex items-center justify-center gap-2 disabled:opacity-60"
            >
              {loading && <Loader2 size={16} className="animate-spin" />}
              {loading ? "Authenticating…" : "Sign in"}
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
