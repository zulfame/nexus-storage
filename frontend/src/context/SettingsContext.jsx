import { createContext, useContext, useEffect, useState, useCallback } from "react";
import api from "@/lib/api";

const DEFAULTS = {
  app_name: "Nexus Storage Manager",
  tagline: "All your storage, one clean workspace.",
  meta_description: "Manage S3 and Samba storage from one workspace, with per-user access control.",
  favicon_url: "",
  logo_url: "",
  primary_color: "#2563eb",
};

const SettingsContext = createContext(null);

function applyMeta(s) {
  if (s.app_name) document.title = s.app_name;
  let m = document.querySelector('meta[name="description"]');
  if (!m) {
    m = document.createElement("meta");
    m.setAttribute("name", "description");
    document.head.appendChild(m);
  }
  m.setAttribute("content", s.meta_description || "");
  if (s.favicon_url) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("href", s.favicon_url);
  }
}

export function SettingsProvider({ children }) {
  const [settings, setSettings] = useState(DEFAULTS);

  const load = useCallback(async () => {
    try {
      const { data } = await api.get("/settings");
      const merged = { ...DEFAULTS, ...data };
      setSettings(merged);
      applyMeta(merged);
      return merged;
    } catch {
      return DEFAULTS;
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <SettingsContext.Provider value={{ settings, refresh: load }}>{children}</SettingsContext.Provider>
  );
}

export function useSettings() {
  return useContext(SettingsContext) || { settings: DEFAULTS, refresh: () => {} };
}
