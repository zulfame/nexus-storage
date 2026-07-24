import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { LayoutDashboard, HardDrive, Users, FolderOpen, LogOut, Database } from "lucide-react";

const navBase =
  "flex items-center gap-3 px-4 py-2.5 text-sm font-medium transition-colors border-l-2";

function Item({ to, icon: Icon, label, testid, end }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      className={({ isActive }) =>
        `${navBase} ${
          isActive
            ? "border-primary bg-[#1a1a1a] text-primary"
            : "border-transparent text-gray-400 hover:text-white hover:bg-[#161616]"
        }`
      }
    >
      <Icon size={18} strokeWidth={2} />
      {label}
    </NavLink>
  );
}

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";

  return (
    <div className="min-h-screen flex bg-background text-foreground">
      <aside className="w-64 shrink-0 border-r border-border bg-[#0d0d0d] flex flex-col fixed h-screen">
        <div className="px-5 py-6 border-b border-border">
          <div className="flex items-center gap-2.5">
            <div className="h-8 w-8 bg-primary flex items-center justify-center rounded-sm">
              <Database size={18} className="text-black" strokeWidth={2.5} />
            </div>
            <div>
              <div className="font-display font-bold text-lg leading-none tracking-tight">
                NEXUS
              </div>
              <div className="overline mt-1">Storage Manager</div>
            </div>
          </div>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1">
          {isAdmin && (
            <Item to="/" end icon={LayoutDashboard} label="Dashboard" testid="nav-dashboard" />
          )}
          <Item to="/files" icon={FolderOpen} label="File Browser" testid="nav-files" />
          {isAdmin && (
            <>
              <Item to="/storages" icon={HardDrive} label="Storages" testid="nav-storages" />
              <Item to="/users" icon={Users} label="Users" testid="nav-users" />
            </>
          )}
        </nav>

        <div className="border-t border-border p-4">
          <div className="mb-3">
            <div className="text-sm font-medium truncate" data-testid="current-user-email">
              {user?.email}
            </div>
            <div className="overline mt-0.5">{user?.role}</div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            data-testid="logout-button"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-300 border border-border hover:border-destructive hover:text-destructive transition-colors rounded-sm"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="flex-1 ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
