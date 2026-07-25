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

function upsertMeta(attr, key, content) {
  let el = document.querySelector(`meta[${attr}="${key}"]`);
  if (!el) {
    el = document.createElement("meta");
    el.setAttribute(attr, key);
    document.head.appendChild(el);
  }
  el.setAttribute("content", content || "");
}

function hexToHslTriple(hex) {
  if (!hex) return null;
  let h = String(hex).replace("#", "").trim();
  if (h.length === 3) h = h.split("").map((c) => c + c).join("");
  if (h.length !== 6 || /[^0-9a-fA-F]/.test(h)) return null;
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  const max = Math.max(r, g, b), min = Math.min(r, g, b);
  let hue = 0, s = 0;
  const l = (max + min) / 2;
  if (max !== min) {
    const d = max - min;
    s = l > 0.5 ? d / (2 - max - min) : d / (max + min);
    switch (max) {
      case r: hue = (g - b) / d + (g < b ? 6 : 0); break;
      case g: hue = (b - r) / d + 2; break;
      default: hue = (r - g) / d + 4;
    }
    hue /= 6;
  }
  return `${Math.round(hue * 360)} ${Math.round(s * 100)}% ${Math.round(l * 100)}%`;
}

function applyTheme(color) {
  const triple = hexToHslTriple(color);
  if (triple) {
    document.documentElement.style.setProperty("--primary", triple);
    document.documentElement.style.setProperty("--ring", triple);
  }
}

function applyMeta(s) {
  const name = s.app_name || "";
  const desc = s.meta_description || "";
  const image = s.favicon_url || s.logo_url || "";
  if (name) document.title = name;
  upsertMeta("name", "description", desc);
  upsertMeta("name", "theme-color", s.primary_color || "#2563eb");
  // Open Graph
  upsertMeta("property", "og:title", name);
  upsertMeta("property", "og:description", desc);
  upsertMeta("property", "og:type", "website");
  upsertMeta("property", "og:site_name", name);
  if (image) upsertMeta("property", "og:image", image);
  // Twitter
  upsertMeta("name", "twitter:card", image ? "summary_large_image" : "summary");
  upsertMeta("name", "twitter:title", name);
  upsertMeta("name", "twitter:description", desc);
  if (image) upsertMeta("name", "twitter:image", image);
  // Favicon
  if (s.favicon_url) {
    let link = document.querySelector("link[rel='icon']");
    if (!link) {
      link = document.createElement("link");
      link.setAttribute("rel", "icon");
      document.head.appendChild(link);
    }
    link.setAttribute("href", s.favicon_url);
  }
  applyTheme(s.primary_color);
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
