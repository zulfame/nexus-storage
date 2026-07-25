import { useState } from "react";
import { NavLink, Outlet, useNavigate } from "react-router-dom";
import { useAuth } from "@/context/AuthContext";
import { useSettings } from "@/context/SettingsContext";
import {
  LayoutDashboard,
  HardDrive,
  Users,
  FolderOpen,
  LogOut,
  Database,
  ScrollText,
  SlidersHorizontal,
  KeyRound,
  Menu,
  X,
} from "lucide-react";

const navBase =
  "flex items-center gap-3 mx-3 px-3 py-2.5 text-sm font-medium rounded-xl transition-colors";

function Item({ to, icon: Icon, label, testid, end, onNavigate }) {
  return (
    <NavLink
      to={to}
      end={end}
      data-testid={testid}
      onClick={onNavigate}
      className={({ isActive }) =>
        `${navBase} ${
          isActive
            ? "bg-blue-50 text-blue-700"
            : "text-gray-600 hover:text-gray-900 hover:bg-gray-100"
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
  const { settings } = useSettings();
  const navigate = useNavigate();
  const isAdmin = user?.role === "admin";
  const [open, setOpen] = useState(false);
  const close = () => setOpen(false);
  const appName = settings.app_name || "Nexus";
  const logo = settings.logo_url;

  return (
    <div className="min-h-screen bg-[#f6f8fc] text-gray-900">
      {/* Mobile top bar */}
      <div className="lg:hidden sticky top-0 z-30 flex items-center justify-between bg-white border-b border-gray-200 shadow-[0_2px_14px_rgba(15,23,42,0.06)] px-4 py-3">
        <div className="flex items-center gap-2.5 min-w-0">
          {logo ? (
            <img src={logo} alt="logo" className="h-8 w-8 rounded-xl object-cover" />
          ) : (
            <div className="h-8 w-8 bg-primary flex items-center justify-center rounded-xl">
              <Database size={16} className="text-white" strokeWidth={2.5} />
            </div>
          )}
          <span className="font-display font-bold text-base tracking-tight truncate">{appName}</span>
        </div>
        <button
          onClick={() => setOpen(true)}
          data-testid="mobile-menu-button"
          aria-label="Open menu"
          className="p-2 rounded-xl border border-gray-200 text-gray-600 hover:bg-gray-50"
        >
          <Menu size={20} />
        </button>
      </div>

      {/* Backdrop */}
      {open && (
        <div
          className="lg:hidden fixed inset-0 z-30 bg-gray-900/40 backdrop-blur-sm"
          onClick={close}
          data-testid="sidebar-backdrop"
        />
      )}

      {/* Sidebar */}
      <aside
        className={`fixed top-0 left-0 h-screen w-64 bg-white flex flex-col border-r border-gray-200 shadow-[2px_0_16px_rgba(15,23,42,0.05)] z-40 transform transition-transform duration-200 lg:translate-x-0 ${
          open ? "translate-x-0" : "-translate-x-full"
        }`}
        data-testid="sidebar"
      >
        <div className="px-5 py-5 border-b border-gray-100 flex items-center justify-between">
          <div className="flex items-center gap-2.5 min-w-0">
            {logo ? (
              <img src={logo} alt="logo" className="h-9 w-9 rounded-xl object-cover shadow-sm" />
            ) : (
              <div className="h-9 w-9 bg-primary flex items-center justify-center rounded-xl shadow-sm">
                <Database size={18} className="text-white" strokeWidth={2.5} />
              </div>
            )}
            <div className="min-w-0">
              <div className="font-display font-bold text-base leading-tight tracking-tight text-gray-900 truncate">
                {appName}
              </div>
              <div className="overline mt-0.5">Storage Manager</div>
            </div>
          </div>
          <button onClick={close} className="lg:hidden p-1.5 rounded-lg text-gray-400 hover:bg-gray-100" aria-label="Close menu">
            <X size={18} />
          </button>
        </div>

        <nav className="flex-1 py-4 flex flex-col gap-1 overflow-y-auto">
          <Item to="/" end icon={LayoutDashboard} label="Dashboard" testid="nav-dashboard" onNavigate={close} />
          <Item to="/files" icon={FolderOpen} label="File Browser" testid="nav-files" onNavigate={close} />
          {isAdmin && <Item to="/storages" icon={HardDrive} label="List Storage" testid="nav-storages" onNavigate={close} />}
          <Item to="/logs" icon={ScrollText} label="Logs Activity" testid="nav-logs" onNavigate={close} />
          {isAdmin && (
            <>
              <Item to="/settings" icon={SlidersHorizontal} label="Manage App" testid="nav-manage-app" onNavigate={close} />
              <Item to="/manage-apis" icon={KeyRound} label="Manage APIs" testid="nav-manage-apis" onNavigate={close} />
              <Item to="/users" icon={Users} label="Manage User" testid="nav-users" onNavigate={close} />
            </>
          )}
        </nav>

        <div className="border-t border-gray-100 p-4">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-9 w-9 rounded-full bg-blue-100 text-blue-700 flex items-center justify-center font-semibold text-sm shrink-0">
              {(user?.email || "?")[0].toUpperCase()}
            </div>
            <div className="min-w-0">
              <div className="text-sm font-medium truncate text-gray-800" data-testid="current-user-email">
                {user?.email}
              </div>
              <div className="overline mt-0.5">{user?.role}</div>
            </div>
          </div>
          <button
            onClick={() => {
              logout();
              navigate("/login");
            }}
            data-testid="logout-button"
            className="w-full flex items-center justify-center gap-2 px-3 py-2 text-sm font-medium text-gray-600 border border-gray-200 hover:bg-red-50 hover:border-red-200 hover:text-red-600 transition-colors rounded-xl"
          >
            <LogOut size={16} /> Sign out
          </button>
        </div>
      </aside>

      <main className="lg:ml-64 min-h-screen">
        <Outlet />
      </main>
    </div>
  );
}
