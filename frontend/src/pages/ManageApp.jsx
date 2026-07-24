import { useEffect, useState } from "react";
import api, { apiError } from "@/lib/api";
import { PageHeader } from "@/components/PageHeader";
import { useSettings } from "@/context/SettingsContext";
import { toast } from "sonner";
import { Loader2, Database, Save } from "lucide-react";

function Field({ label, hint, children }) {
  return (
    <div>
      <label className="text-sm font-medium text-gray-700 block mb-1.5">{label}</label>
      {children}
      {hint && <p className="text-xs text-gray-400 mt-1.5">{hint}</p>}
    </div>
  );
}

const inputCls =
  "w-full bg-white border border-gray-200 rounded-xl px-3.5 py-2.5 text-sm outline-none focus:border-primary focus:ring-2 focus:ring-blue-100 transition-colors";

export default function ManageApp() {
  const { settings, refresh } = useSettings();
  const [form, setForm] = useState(settings);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    setForm(settings);
  }, [settings]);

  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));

  const save = async () => {
    setSaving(true);
    try {
      await api.put("/settings", form);
      await refresh();
      toast.success("App settings saved");
    } catch (e) {
      toast.error(apiError(e));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div>
      <PageHeader overline="Configuration" title="Manage App">
        <button onClick={save} disabled={saving} data-testid="save-settings-button" className="flex items-center gap-2 bg-primary text-white font-semibold text-sm px-4 py-2.5 rounded-xl hover:bg-blue-700 transition-colors shadow-sm disabled:opacity-60">
          {saving ? <Loader2 size={16} className="animate-spin" /> : <Save size={16} />} Save Changes
        </button>
      </PageHeader>

      <div className="p-4 sm:p-8 grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-2 bg-white border border-gray-200 rounded-2xl shadow-sm p-6 space-y-5">
          <Field label="Application Name">
            <input value={form.app_name} onChange={(e) => set("app_name", e.target.value)} data-testid="settings-app-name" placeholder="Nexus Storage Manager" className={inputCls} />
          </Field>
          <Field label="Tagline" hint="Shown on the login screen.">
            <input value={form.tagline} onChange={(e) => set("tagline", e.target.value)} data-testid="settings-tagline" placeholder="All your storage, one clean workspace." className={inputCls} />
          </Field>
          <Field label="Meta Description" hint="Used for the browser tab metadata (SEO/description).">
            <textarea value={form.meta_description} onChange={(e) => set("meta_description", e.target.value)} data-testid="settings-meta-description" rows={3} placeholder="Describe your app…" className={inputCls + " resize-none"} />
          </Field>
          <Field label="Favicon URL" hint="Direct image URL (.png/.ico/.svg) shown in the browser tab.">
            <input value={form.favicon_url} onChange={(e) => set("favicon_url", e.target.value)} data-testid="settings-favicon-url" placeholder="https://…/favicon.png" className={inputCls} />
          </Field>
          <Field label="Logo URL" hint="Optional logo shown in the sidebar (falls back to the default mark).">
            <input value={form.logo_url} onChange={(e) => set("logo_url", e.target.value)} data-testid="settings-logo-url" placeholder="https://…/logo.png" className={inputCls} />
          </Field>
          <Field label="Primary Color">
            <div className="flex items-center gap-3">
              <input type="color" value={form.primary_color || "#2563eb"} onChange={(e) => set("primary_color", e.target.value)} data-testid="settings-primary-color" className="h-10 w-14 rounded-lg border border-gray-200 cursor-pointer bg-white" />
              <span className="text-sm text-gray-500">{form.primary_color}</span>
            </div>
          </Field>
        </div>

        {/* Live preview */}
        <div className="space-y-4">
          <div className="overline">Preview</div>
          <div className="bg-white border border-gray-200 rounded-2xl shadow-sm p-5">
            <div className="flex items-center gap-2.5">
              {form.logo_url ? (
                <img src={form.logo_url} alt="logo" className="h-9 w-9 rounded-xl object-cover" onError={(e) => (e.target.style.display = "none")} />
              ) : (
                <div className="h-9 w-9 flex items-center justify-center rounded-xl" style={{ background: form.primary_color || "#2563eb" }}>
                  <Database size={18} className="text-white" strokeWidth={2.5} />
                </div>
              )}
              <div>
                <div className="font-display font-bold text-base leading-none text-gray-900">{form.app_name || "App name"}</div>
                <div className="overline mt-1">Storage Manager</div>
              </div>
            </div>
            <p className="text-sm text-gray-500 mt-4">{form.tagline || "Your tagline appears here."}</p>
            <button className="mt-4 w-full text-white font-semibold text-sm py-2.5 rounded-xl" style={{ background: form.primary_color || "#2563eb" }}>
              Primary button
            </button>
          </div>
          <p className="text-xs text-gray-400">Changes apply across all pages (including the login screen) after saving.</p>
        </div>
      </div>
    </div>
  );
}
