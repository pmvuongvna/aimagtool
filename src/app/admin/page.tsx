"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/template-catalog";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string; active: boolean };

type AdminPayload = {
  settings: {
    creditPackages: CreditPackage[];
    imageCredits: { "1k": number; "2k": number; "4k": number };
    videoCredits: { "480p": number; "720p": number };
    grokVideoCreditsPerSecond: { "480p": number; "720p": number };
    imageEditExtraCost: number;
    defaultUserCredits: number;
  };
  users?: Array<{
    id: string;
    name: string;
    email: string;
    role: "user" | "admin";
    createdAt: string;
    credits: number;
  }>;
};

type ImportSettings = {
  enabled: boolean;
  importCount: number;
  morningHour: number;
  eveningHour: number;
  source: "meigen";
  lastImportedAt: string | null;
};

type ImportRun = {
  id: string;
  source: string;
  mode: string;
  status: string;
  requestedCount: number;
  importedCount: number;
  message: string;
  createdAt: string;
};

type TemplateItem = {
  id: string;
  title: string;
  prompt: string;
  thumbnailUrl: string;
  mediaType: "image" | "video";
  model: string;
  aspectRatio: string;
  category: TemplateCategory;
  tags: string[];
  authorName?: string;
  source: string;
  published: boolean;
  featured: boolean;
  sourceUrl?: string;
};

type TemplateSnapshot = {
  importSettings: ImportSettings;
  runs: ImportRun[];
  templates: TemplateItem[];
};

const DEFAULT_MANUAL_TEMPLATE = {
  title: "",
  prompt: "",
  thumbnailUrl: "",
  mediaType: "image" as "image" | "video",
  model: "GPT Image 2",
  aspectRatio: "1:1",
  category: "All" as TemplateCategory,
  tags: "",
  authorName: "Escanor Studio",
  published: true,
  featured: false,
};

export default function AdminPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminPayload["settings"] | null>(null);
  const [userId, setUserId] = useState("demo-user");
  const [credits, setCredits] = useState(500);
  const [packageJson, setPackageJson] = useState("[]");
  const [users, setUsers] = useState<NonNullable<AdminPayload["users"]>>([]);
  const [status, setStatus] = useState("Loading settings...");
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null);
  const [manualTemplate, setManualTemplate] = useState(DEFAULT_MANUAL_TEMPLATE);
  const [manualImportCount, setManualImportCount] = useState(12);
  const [templateLoading, setTemplateLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsRes, templatesRes] = await Promise.all([
        apiFetch(apiPath("/api/admin/settings")),
        apiFetch(apiPath("/api/admin/templates")),
      ]);

      const settingsPayload = (await settingsRes.json()) as { settings?: AdminPayload["settings"]; users?: AdminPayload["users"]; error?: string };
      if (!settingsRes.ok || !settingsPayload.settings) {
        setStatus(settingsPayload.error || "Cannot load settings");
        return;
      }

      setSettings(settingsPayload.settings);
      setUsers(settingsPayload.users || []);
      setPackageJson(JSON.stringify(settingsPayload.settings.creditPackages || [], null, 2));

      if (templatesRes.ok) {
        const templatePayload = (await templatesRes.json()) as TemplateSnapshot;
        setTemplateSnapshot(templatePayload);
        setManualImportCount(templatePayload.importSettings.importCount);
      }

      setStatus("Ready");
    }
    void load();
  }, []);

  const imageCostTotal = useMemo(() => settings ? settings.imageCredits["1k"] + settings.imageCredits["2k"] + settings.imageCredits["4k"] : 0, [settings]);
  const videoCostTotal = useMemo(() => settings ? settings.videoCredits["480p"] + settings.videoCredits["720p"] : 0, [settings]);

  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setStatus("Saving settings...");
    let creditPackages = settings.creditPackages;
    try {
      const parsed = JSON.parse(packageJson) as CreditPackage[];
      if (Array.isArray(parsed)) creditPackages = parsed;
    } catch {
      setStatus("Credit packages JSON kh?ng h?p l?.");
      return;
    }
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, creditPackages } }),
    });
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminPayload["users"] };
    if (res.ok) setUsers(payload.users || []);
    setStatus(res.ok ? "Settings saved" : "Save failed");
  }

  async function updateUserCredits(e: FormEvent) {
    e.preventDefault();
    setStatus("Updating credits...");
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCredit: { userId, credits } }),
    });
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminPayload["users"] };
    if (res.ok) setUsers(payload.users || []);
    setStatus(res.ok ? "User credits updated" : "Update failed");
  }

  async function saveImportSettings(e: FormEvent) {
    e.preventDefault();
    if (!templateSnapshot) return;
    setTemplateLoading(true);
    setStatus("Saving import settings...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ importSettings: templateSnapshot.importSettings }),
    });
    const payload = (await res.json().catch(() => ({}))) as { snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setManualImportCount(payload.snapshot.importSettings.importCount);
    }
    setTemplateLoading(false);
    setStatus(res.ok ? "Import settings saved" : "Save import settings failed");
  }

  async function runImportNow() {
    setTemplateLoading(true);
    setStatus("Importing prompts from MeiGen...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import-now", count: manualImportCount }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setManualImportCount(payload.snapshot.importSettings.importCount);
      setStatus(payload.result?.run?.message || "Import complete");
    } else {
      setStatus("Import failed");
    }
    setTemplateLoading(false);
  }

  async function saveManualTemplate(e: FormEvent) {
    e.preventDefault();
    setTemplateLoading(true);
    setStatus("Saving manual prompt...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        action: "create-manual",
        manualTemplate: {
          ...manualTemplate,
          tags: manualTemplate.tags.split(",").map((item) => item.trim()).filter(Boolean),
        },
      }),
    });
    const payload = (await res.json().catch(() => ({}))) as { snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setManualTemplate(DEFAULT_MANUAL_TEMPLATE);
      setStatus("Manual prompt saved");
    } else {
      setStatus("Save manual prompt failed");
    }
    setTemplateLoading(false);
  }

  async function handleLogout() {
    await apiFetch(apiPath("/api/auth/logout"), { method: "POST" });
    router.push("/login");
  }

  if (!settings) {
    return (
      <main className="admin-v2">
        <h1>Admin Console</h1>
        <p>{status}</p>
      </main>
    );
  }

  return (
    <main className="admin-v2">
      <header className="admin-header">
        <div className="admin-header-main">
          <p className="admin-kicker">SYSTEM CONTROL</p>
          <h1>Admin Console</h1>
          <p className="admin-status">Status: {status}</p>
        </div>
        <div className="admin-header-actions">
          <Link href="/user" className="chip-btn dark">Open Studio</Link>
          <Link href="/" className="chip-btn ghost">Landing</Link>
          <button type="button" className="chip-btn dark" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="admin-metrics">
        <article><p>Image Cost Pool</p><h3>{imageCostTotal}</h3></article>
        <article><p>Default Video Cost Pool (Veo3)</p><h3>{videoCostTotal}</h3></article>
        <article><p>Grok Rate / sec</p><h3>{settings.grokVideoCreditsPerSecond["480p"]} / {settings.grokVideoCreditsPerSecond["720p"]}</h3></article>
        <article><p>Default User Credits</p><h3>{settings.defaultUserCredits}</h3></article>
        <article><p>Templates</p><h3>{templateSnapshot?.templates.length || 0}</h3></article>
      </section>

      <section className="admin-grid">
        <form className="admin-card" onSubmit={saveSettings}>
          <h2>Credit Matrix</h2>
          <p className="admin-hint">Grok video uses per-second rates. Default video costs are reserved for Veo3.</p>

          <div className="admin-subgrid">
            <label>Image 1K<input type="number" value={settings.imageCredits["1k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "1k": Number(e.target.value) } })} /></label>
            <label>Image 2K<input type="number" value={settings.imageCredits["2k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "2k": Number(e.target.value) } })} /></label>
            <label>Image 4K<input type="number" value={settings.imageCredits["4k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "4k": Number(e.target.value) } })} /></label>
          </div>

          <div className="admin-subgrid">
            <label>Video 480p<input type="number" value={settings.videoCredits["480p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "480p": Number(e.target.value) } })} /></label>
            <label>Video 720p<input type="number" value={settings.videoCredits["720p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "720p": Number(e.target.value) } })} /></label>
            <label>Image Edit Extra<input type="number" value={settings.imageEditExtraCost} onChange={(e) => setSettings({ ...settings, imageEditExtraCost: Number(e.target.value) })} /></label>
          </div>

          <div className="admin-subgrid">
            <label>Grok 480p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["480p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "480p": Number(e.target.value) } })} /></label>
            <label>Grok 720p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["720p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "720p": Number(e.target.value) } })} /></label>
            <div />
          </div>

          <label>Default User Credits<input type="number" value={settings.defaultUserCredits} onChange={(e) => setSettings({ ...settings, defaultUserCredits: Number(e.target.value) })} /></label>
          <label>Credit Packages (JSON)
            <textarea rows={10} value={packageJson} onChange={(e) => setPackageJson(e.target.value)} placeholder='[{"id":"starter","name":"Starter","credits":500,"priceVnd":99000,"badge":"Pho bien","active":true}]' />
          </label>
          <button className="generate-cta">Save Credit Settings</button>
        </form>

        <form className="admin-card" onSubmit={updateUserCredits}>
          <h2>User Credits</h2>
          <p className="admin-hint">Manually top-up or reset any user account.</p>
          <label>User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
          <label>Credits<input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} /></label>
          <button className="generate-cta">Update User Credits</button>
        </form>
      </section>

      <section className="admin-grid admin-grid-wide">
        <form className="admin-card" onSubmit={saveImportSettings}>
          <h2>Prompt Importer</h2>
          <p className="admin-hint">Auto import from MeiGen 2 times per day. Thumbnail s? l?y tr?c ti?p t? MeiGen. Admin c? th? ??i s? l??ng v? b?m import ngay.</p>
          <div className="admin-subgrid">
            <label>Auto Import
              <input type="checkbox" checked={templateSnapshot?.importSettings.enabled || false} onChange={(e) => setTemplateSnapshot((prev) => prev ? { ...prev, importSettings: { ...prev.importSettings, enabled: e.target.checked } } : prev)} />
            </label>
            <label>Prompts per run
              <input type="number" min={1} max={50} value={templateSnapshot?.importSettings.importCount || 12} onChange={(e) => setTemplateSnapshot((prev) => prev ? { ...prev, importSettings: { ...prev.importSettings, importCount: Number(e.target.value) } } : prev)} />
            </label>
            <label>Import now count
              <input type="number" min={1} max={50} value={manualImportCount} onChange={(e) => setManualImportCount(Number(e.target.value))} />
            </label>
          </div>
          <div className="admin-subgrid">
            <label>Morning hour
              <input type="number" min={0} max={23} value={templateSnapshot?.importSettings.morningHour || 9} onChange={(e) => setTemplateSnapshot((prev) => prev ? { ...prev, importSettings: { ...prev.importSettings, morningHour: Number(e.target.value) } } : prev)} />
            </label>
            <label>Evening hour
              <input type="number" min={0} max={23} value={templateSnapshot?.importSettings.eveningHour || 21} onChange={(e) => setTemplateSnapshot((prev) => prev ? { ...prev, importSettings: { ...prev.importSettings, eveningHour: Number(e.target.value) } } : prev)} />
            </label>
            <label>Last imported
              <input value={templateSnapshot?.importSettings.lastImportedAt ? new Date(templateSnapshot.importSettings.lastImportedAt).toLocaleString("vi-VN") : "Chua có"} readOnly />
            </label>
          </div>
          <div className="admin-inline-actions">
            <button className="generate-cta" type="submit" disabled={templateLoading}>Save Import Settings</button>
            <button className="chip-btn dark" type="button" disabled={templateLoading} onClick={runImportNow}>Get ngay t? MeiGen</button>
          </div>
        </form>

        <form className="admin-card" onSubmit={saveManualTemplate}>
          <h2>Manual Prompt</h2>
          <p className="admin-hint">Th?m prompt th? c?ng v?o th? vi?n m?u. Prompt n?y s? xu?t hi?n lu?n trong trang M?u c? s?n.</p>
          <div className="admin-subgrid">
            <label>Title<input value={manualTemplate.title} onChange={(e) => setManualTemplate({ ...manualTemplate, title: e.target.value })} /></label>
            <label>Thumbnail URL<input value={manualTemplate.thumbnailUrl} onChange={(e) => setManualTemplate({ ...manualTemplate, thumbnailUrl: e.target.value })} /></label>
            <label>Author<input value={manualTemplate.authorName} onChange={(e) => setManualTemplate({ ...manualTemplate, authorName: e.target.value })} /></label>
          </div>
          <label>Prompt<textarea rows={8} value={manualTemplate.prompt} onChange={(e) => setManualTemplate({ ...manualTemplate, prompt: e.target.value })} /></label>
          <div className="admin-subgrid">
            <label>Media Type
              <select value={manualTemplate.mediaType} onChange={(e) => setManualTemplate({ ...manualTemplate, mediaType: e.target.value as "image" | "video" })}>
                <option value="image">Image</option>
                <option value="video">Video</option>
              </select>
            </label>
            <label>Model<input value={manualTemplate.model} onChange={(e) => setManualTemplate({ ...manualTemplate, model: e.target.value })} /></label>
            <label>Aspect Ratio<input value={manualTemplate.aspectRatio} onChange={(e) => setManualTemplate({ ...manualTemplate, aspectRatio: e.target.value })} /></label>
          </div>
          <div className="admin-subgrid">
            <label>Category
              <select value={manualTemplate.category} onChange={(e) => setManualTemplate({ ...manualTemplate, category: e.target.value as TemplateCategory })}>
                {TEMPLATE_CATEGORIES.map((item) => <option key={item} value={item}>{item}</option>)}
              </select>
            </label>
            <label>Tags (comma separated)<input value={manualTemplate.tags} onChange={(e) => setManualTemplate({ ...manualTemplate, tags: e.target.value })} /></label>
            <label>Published
              <input type="checkbox" checked={manualTemplate.published} onChange={(e) => setManualTemplate({ ...manualTemplate, published: e.target.checked })} />
            </label>
          </div>
          <label>Featured
            <input type="checkbox" checked={manualTemplate.featured} onChange={(e) => setManualTemplate({ ...manualTemplate, featured: e.target.checked })} />
          </label>
          <button className="generate-cta" type="submit" disabled={templateLoading}>Save Manual Prompt</button>
        </form>
      </section>

      <section className="admin-card">
        <div className="admin-users-head">
          <h2>Recent Import Runs</h2>
          <p className="admin-hint">Theo d?i c?c l?n auto/manual import t? MeiGen.</p>
        </div>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>Time</th>
                <th>Mode</th>
                <th>Status</th>
                <th>Requested</th>
                <th>Imported</th>
                <th>Message</th>
              </tr>
            </thead>
            <tbody>
              {(templateSnapshot?.runs || []).length === 0 ? (
                <tr><td colSpan={6} className="admin-users-empty">Ch?a c? l?ch s? import prompt.</td></tr>
              ) : (
                templateSnapshot?.runs.map((item) => (
                  <tr key={item.id}>
                    <td>{new Date(item.createdAt).toLocaleString("vi-VN")}</td>
                    <td>{item.mode}</td>
                    <td><span className={`admin-role ${item.status === "success" ? "admin" : "user"}`}>{item.status}</span></td>
                    <td>{item.requestedCount}</td>
                    <td>{item.importedCount}</td>
                    <td>{item.message}</td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-users-head">
          <h2>Template Library</h2>
          <p className="admin-hint">Prompt ?? l?u trong h? th?ng, g?m prompt manual v? prompt import t? MeiGen.</p>
        </div>
        <div className="admin-template-grid">
          {(templateSnapshot?.templates || []).map((item) => (
            <article key={item.id} className="admin-template-card">
              <div className="admin-template-thumb" style={{ backgroundImage: `url(${item.thumbnailUrl || "https://images.unsplash.com/photo-1520034475321-cbe63696469a?auto=format&fit=crop&w=800&q=80"})` }} />
              <div className="admin-template-body">
                <div className="admin-template-head">
                  <strong>{item.title}</strong>
                  <span className={`admin-role ${item.mediaType === "video" ? "admin" : "user"}`}>{item.mediaType}</span>
                </div>
                <span>{item.model} · {item.aspectRatio} · {item.category}</span>
                <p>{item.prompt.slice(0, 180)}{item.prompt.length > 180 ? "…" : ""}</p>
                <div className="admin-template-tags">
                  {item.tags.slice(0, 6).map((tag) => <span key={`${item.id}-${tag}`}>{tag}</span>)}
                </div>
                <small>Source: {item.source}{item.authorName ? ` · ${item.authorName}` : ""}</small>
              </div>
            </article>
          ))}
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-users-head">
          <h2>Users</h2>
          <p className="admin-hint">Danh s?ch t?i kho?n ?? ??ng k? trong h? th?ng.</p>
        </div>
        <div className="admin-users-table-wrap">
          <table className="admin-users-table">
            <thead>
              <tr>
                <th>User</th>
                <th>Role</th>
                <th>Credits</th>
                <th>Created</th>
                <th>Action</th>
              </tr>
            </thead>
            <tbody>
              {users.length === 0 ? (
                <tr><td colSpan={5} className="admin-users-empty">Ch?a c? user ho?c backend ch?a k?t n?i DB.</td></tr>
              ) : users.map((item) => (
                <tr key={item.id}>
                  <td><div className="admin-user-main"><b>{item.name}</b><span>{item.email}</span><code>{item.id}</code></div></td>
                  <td><span className={`admin-role ${item.role}`}>{item.role}</span></td>
                  <td>{item.credits.toLocaleString("vi-VN")}</td>
                  <td>{new Date(item.createdAt).toLocaleString("vi-VN")}</td>
                  <td>
                    <button type="button" className="chip-btn dark" onClick={() => { setUserId(item.id); setCredits(item.credits); setStatus(`Selected ${item.email}`); }}>Edit credit</button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>
    </main>
  );
}
