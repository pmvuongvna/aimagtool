"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/template-catalog";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string; active: boolean };
type AdminUser = { id: string; name: string; email: string; role: "user" | "admin"; createdAt: string; credits: number };

type AdminPayload = {
  settings: {
    creditPackages: CreditPackage[];
    imageCredits: { "1k": number; "2k": number; "4k": number };
    videoCredits: { "480p": number; "720p": number };
    grokVideoCreditsPerSecond: { "480p": number; "720p": number };
    imageEditExtraCost: number;
    defaultUserCredits: number;
  };
  users?: AdminUser[];
};

type ImportSettings = {
  enabled: boolean;
  importCount: number;
  morningHour: number;
  eveningHour: number;
  source: "meigen";
  lastImportedAt: string | null;
  listingUrls: string[];
};

type ImportRun = {
  id: string;
  source: string;
  mode: string;
  status: string;
  requestedCount: number;
  importedCount: number;
  message: string;
  details?: { errors?: string[]; candidateCount?: number; attemptedCount?: number; skippedCount?: number };
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

type TemplateSnapshot = { importSettings: ImportSettings; runs: ImportRun[]; templates: TemplateItem[] };

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

const formatNumber = (value: number) => value.toLocaleString("vi-VN");
const formatDate = (value: string) => new Date(value).toLocaleString("vi-VN");

export default function AdminPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminPayload["settings"] | null>(null);
  const [userId, setUserId] = useState("demo-user");
  const [credits, setCredits] = useState(500);
  const [packageJson, setPackageJson] = useState("[]");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [status, setStatus] = useState("Loading settings...");
  const [templateSnapshot, setTemplateSnapshot] = useState<TemplateSnapshot | null>(null);
  const [manualTemplate, setManualTemplate] = useState(DEFAULT_MANUAL_TEMPLATE);
  const [manualImportCount, setManualImportCount] = useState(12);
  const [templateLoading, setTemplateLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [selectedUserId, setSelectedUserId] = useState("");

  useEffect(() => {
    async function load() {
      const [settingsRes, templatesRes] = await Promise.all([
        apiFetch(apiPath("/api/admin/settings")),
        apiFetch(apiPath("/api/admin/templates")),
      ]);

      const settingsPayload = (await settingsRes.json()) as { settings?: AdminPayload["settings"]; users?: AdminUser[]; error?: string };
      if (!settingsRes.ok || !settingsPayload.settings) {
        setStatus(settingsPayload.error || "Cannot load settings");
        return;
      }

      const loadedUsers = settingsPayload.users || [];
      setSettings(settingsPayload.settings);
      setUsers(loadedUsers);
      setPackageJson(JSON.stringify(settingsPayload.settings.creditPackages || [], null, 2));
      if (loadedUsers[0]) {
        setSelectedUserId(loadedUsers[0].id);
        setUserId(loadedUsers[0].id);
        setCredits(loadedUsers[0].credits);
      }

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
  const totalCreditsAllocated = useMemo(() => users.reduce((sum, item) => sum + item.credits, 0), [users]);
  const adminCount = useMemo(() => users.filter((item) => item.role === "admin").length, [users]);
  const userCount = useMemo(() => users.filter((item) => item.role === "user").length, [users]);
  const featuredTemplateCount = useMemo(() => (templateSnapshot?.templates || []).filter((item) => item.featured).length, [templateSnapshot]);

  const filteredUsers = useMemo(() => users.filter((item) => {
    const matchesRole = userRoleFilter === "all" || item.role === userRoleFilter;
    const keyword = userSearch.trim().toLowerCase();
    const haystack = `${item.name} ${item.email} ${item.id}`.toLowerCase();
    return matchesRole && (!keyword || haystack.includes(keyword));
  }), [users, userRoleFilter, userSearch]);

  const selectedUser = useMemo(() => users.find((item) => item.id === selectedUserId) || filteredUsers[0] || users[0] || null, [users, filteredUsers, selectedUserId]);

  useEffect(() => {
    if (selectedUser && selectedUser.id !== selectedUserId) setSelectedUserId(selectedUser.id);
  }, [selectedUser, selectedUserId]);

  function syncUsers(nextUsers: AdminUser[]) {
    setUsers(nextUsers);
    const nextSelected = nextUsers.find((item) => item.id === selectedUserId) || nextUsers[0] || null;
    if (nextSelected) {
      setSelectedUserId(nextSelected.id);
      setUserId(nextSelected.id);
      setCredits(nextSelected.credits);
    }
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserId(user.id);
    setCredits(user.credits);
    setStatus(`Selected ${user.email}`);
  }
  async function saveSettings(e: FormEvent) {
    e.preventDefault();
    if (!settings) return;
    setStatus("Saving settings...");
    let creditPackages = settings.creditPackages;
    try {
      const parsed = JSON.parse(packageJson) as CreditPackage[];
      if (Array.isArray(parsed)) creditPackages = parsed;
    } catch {
      setStatus("Credit packages JSON is invalid.");
      return;
    }
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ settings: { ...settings, creditPackages } }),
    });
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminUser[] };
    if (res.ok) syncUsers(payload.users || []);
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
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminUser[] };
    if (res.ok) syncUsers(payload.users || []);
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
    setStatus("Queueing MeiGen import...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "import-now", count: manualImportCount }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setManualImportCount(payload.snapshot.importSettings.importCount);
      setStatus(payload.result?.run?.message || "Import queued");
    } else {
      setStatus("Import failed");
    }
    setTemplateLoading(false);
  }

  async function rehostThumbnails() {
    setTemplateLoading(true);
    setStatus("Rehosting MeiGen thumbnails to R2...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "rehost-thumbnails", count: 48 }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setStatus(payload.result?.run?.message || "Thumbnail rehost complete");
    } else {
      setStatus("Thumbnail rehost failed");
    }
    setTemplateLoading(false);
  }

  async function cleanBrokenThumbnails() {
    const confirmed = window.confirm("Remove MeiGen templates that have broken thumbnail URLs? This only deletes clearly invalid thumbnail records.");
    if (!confirmed) return;
    setTemplateLoading(true);
    setStatus("Cleaning broken MeiGen thumbnails...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clean-broken-thumbnails" }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setStatus(payload.result?.run?.message || "Broken MeiGen thumbnails cleaned");
    } else {
      setStatus("Clean broken thumbnails failed");
    }
    setTemplateLoading(false);
  }

  async function clearMeigenTemplates() {
    const confirmed = window.confirm("Clear all imported MeiGen templates and import history? This keeps manual templates intact.");
    if (!confirmed) return;
    setTemplateLoading(true);
    setStatus("Clearing MeiGen templates...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "clear-meigen" }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setStatus(payload.result?.run?.message || "MeiGen templates cleared");
    } else {
      setStatus("Clear MeiGen templates failed");
    }
    setTemplateLoading(false);
  }

  async function repairMeigenTemplates() {
    setTemplateLoading(true);
    setStatus("Repairing MeiGen metadata...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repair-meigen" }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setStatus(payload.result?.run?.message || "MeiGen metadata repaired");
    } else {
      setStatus("Repair MeiGen metadata failed");
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
        <div className="admin-loading-card">
          <p className="admin-kicker">CONTROL PLANE</p>
          <h1>Admin Console</h1>
          <p>{status}</p>
        </div>
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
          <div className="admin-status-row">
            <span className="admin-status-chip">{userCount} users</span>
            <span className="admin-status-chip">{adminCount} admins</span>
            <span className="admin-status-chip">{templateSnapshot?.templates.length || 0} templates</span>
          </div>
        </div>
        <div className="admin-header-actions">
          <Link href="/user" className="chip-btn dark">Open Studio</Link>
          <Link href="/" className="chip-btn ghost">Landing</Link>
          <button type="button" className="chip-btn dark" onClick={handleLogout}>Logout</button>
        </div>
      </header>

      <section className="admin-overview-grid">
        <article className="admin-overview-card admin-overview-highlight">
          <div className="admin-overview-top"><span>Credit strategy</span><b>Live policy</b></div>
          <h3>{imageCostTotal + videoCostTotal}</h3>
          <p>Total base cost pool across image + video policies. Use this block to sanity-check your pricing ladder.</p>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-top"><span>Allocated credits</span><b>All users</b></div>
          <h3>{formatNumber(totalCreditsAllocated)}</h3>
          <p>Current credits assigned to all registered users in the database.</p>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-top"><span>Featured templates</span><b>Gallery</b></div>
          <h3>{featuredTemplateCount}</h3>
          <p>Templates highlighted in the gallery for quicker discovery and onboarding.</p>
        </article>
        <article className="admin-overview-card">
          <div className="admin-overview-top"><span>Grok rate / sec</span><b>480p / 720p</b></div>
          <h3>{settings.grokVideoCreditsPerSecond["480p"]} / {settings.grokVideoCreditsPerSecond["720p"]}</h3>
          <p>Per-second pricing used only for Grok video workflows.</p>
        </article>
      </section>

      <section className="admin-layout-grid">
        <div className="admin-stack">
          <form className="admin-card" onSubmit={saveSettings}>
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Credit policy</p>
                <h2>Credit Matrix</h2>
              </div>
              <div className="admin-mini-stats">
                <span>Default user: {settings.defaultUserCredits}</span>
                <span>Packages: {settings.creditPackages.length}</span>
              </div>
            </div>
            <p className="admin-hint">Tune image tiers, Grok per-second rates, Veo fallback pricing, and the default credit balance new users receive.</p>

            <div className="admin-form-block">
              <h3>Image generation</h3>
              <div className="admin-subgrid">
                <label>Image 1K<input type="number" value={settings.imageCredits["1k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "1k": Number(e.target.value) } })} /></label>
                <label>Image 2K<input type="number" value={settings.imageCredits["2k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "2k": Number(e.target.value) } })} /></label>
                <label>Image 4K<input type="number" value={settings.imageCredits["4k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "4k": Number(e.target.value) } })} /></label>
              </div>
            </div>

            <div className="admin-form-block">
              <h3>Video generation</h3>
              <div className="admin-subgrid">
                <label>Video 480p<input type="number" value={settings.videoCredits["480p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "480p": Number(e.target.value) } })} /></label>
                <label>Video 720p<input type="number" value={settings.videoCredits["720p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "720p": Number(e.target.value) } })} /></label>
                <label>Image Edit Extra<input type="number" value={settings.imageEditExtraCost} onChange={(e) => setSettings({ ...settings, imageEditExtraCost: Number(e.target.value) })} /></label>
              </div>
            </div>

            <div className="admin-form-block">
              <h3>Grok runtime pricing</h3>
              <div className="admin-subgrid admin-subgrid-two">
                <label>Grok 480p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["480p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "480p": Number(e.target.value) } })} /></label>
                <label>Grok 720p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["720p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "720p": Number(e.target.value) } })} /></label>
              </div>
            </div>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Default User Credits<input type="number" value={settings.defaultUserCredits} onChange={(e) => setSettings({ ...settings, defaultUserCredits: Number(e.target.value) })} /></label>
              <div className="admin-note-box">
                <strong>Policy note</strong>
                <span>Video 480p / 720p here remain the fallback pool for future Veo-style models.</span>
              </div>
            </div>

            <label>Credit Packages (JSON)
              <textarea rows={10} value={packageJson} onChange={(e) => setPackageJson(e.target.value)} placeholder='[{"id":"starter","name":"Starter","credits":500,"priceVnd":99000,"badge":"Pho bien","active":true}]' />
            </label>
            <button className="generate-cta">Save Credit Settings</button>
          </form>

          <section className="admin-card">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Users</p>
                <h2>User Management</h2>
              </div>
              <div className="admin-mini-stats">
                <span>{filteredUsers.length} visible</span>
                <span>{users.length} total</span>
              </div>
            </div>
            <p className="admin-hint">Search accounts, filter by role, inspect balances, and push a top-up without leaving the dashboard.</p>

            <div className="admin-user-toolbar">
              <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email, or user ID" />
              <div className="admin-filter-pills">
                <button type="button" className={`admin-filter-pill ${userRoleFilter === "all" ? "active" : ""}`} onClick={() => setUserRoleFilter("all")}>All</button>
                <button type="button" className={`admin-filter-pill ${userRoleFilter === "user" ? "active" : ""}`} onClick={() => setUserRoleFilter("user")}>Users</button>
                <button type="button" className={`admin-filter-pill ${userRoleFilter === "admin" ? "active" : ""}`} onClick={() => setUserRoleFilter("admin")}>Admins</button>
              </div>
            </div>

            <div className="admin-user-layout">
              <div className="admin-user-list">
                {filteredUsers.length === 0 ? (
                  <div className="admin-users-empty">No users found yet, or the backend is not connected to the database.</div>
                ) : filteredUsers.map((item) => (
                  <button key={item.id} type="button" className={`admin-user-list-item ${selectedUser?.id === item.id ? "active" : ""}`} onClick={() => selectUser(item)}>
                    <div className="admin-user-list-main">
                      <div className="admin-user-avatar">{(item.name || item.email).slice(0, 1).toUpperCase()}</div>
                      <div className="admin-user-summary">
                        <strong>{item.name}</strong>
                        <span>{item.email}</span>
                      </div>
                    </div>
                    <div className="admin-user-list-side">
                      <span className={`admin-role ${item.role}`}>{item.role}</span>
                      <b>{formatNumber(item.credits)}</b>
                    </div>
                  </button>
                ))}
              </div>

              <div className="admin-user-detail">
                {selectedUser ? (
                  <>
                    <div className="admin-user-hero">
                      <div className="admin-user-avatar large">{(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}</div>
                      <div>
                        <h3>{selectedUser.name}</h3>
                        <p>{selectedUser.email}</p>
                        <code>{selectedUser.id}</code>
                      </div>
                      <span className={`admin-role ${selectedUser.role}`}>{selectedUser.role}</span>
                    </div>
                    <div className="admin-user-stat-grid">
                      <article><small>Credits</small><strong>{formatNumber(selectedUser.credits)}</strong></article>
                      <article><small>Joined</small><strong>{formatDate(selectedUser.createdAt)}</strong></article>
                    </div>
                    <form className="admin-user-credit-form" onSubmit={updateUserCredits}>
                      <input type="hidden" value={userId} readOnly />
                      <label>User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
                      <label>Credits<input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} /></label>
                      <div className="admin-quick-credit-actions">
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(selectedUser.credits + settings.defaultUserCredits)}>+ Default Pack</button>
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(settings.defaultUserCredits)}>Reset to Default</button>
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(0)}>Set 0</button>
                      </div>
                      <button className="generate-cta">Update User Credits</button>
                    </form>
                  </>
                ) : <div className="admin-users-empty">Select a user to inspect credits and update the account balance.</div>}
              </div>
            </div>
          </section>
        </div>
        <div className="admin-stack">
          <section className="admin-card">
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Templates</p>
                <h2>Prompt Importer</h2>
              </div>
              <div className="admin-mini-stats">
                <span>{templateSnapshot?.importSettings.enabled ? "Auto on" : "Auto off"}</span>
                <span>{templateSnapshot?.importSettings.importCount ?? 0} / run</span>
              </div>
            </div>
            <p className="admin-hint">Control automatic imports, trigger recovery tasks, and keep the MeiGen feed healthy without leaving admin.</p>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Import Count / Run
                <input
                  type="number"
                  min={1}
                  max={50}
                  value={templateSnapshot?.importSettings.importCount ?? 12}
                  onChange={(e) => setTemplateSnapshot((prev) => prev ? {
                    ...prev,
                    importSettings: { ...prev.importSettings, importCount: Number(e.target.value) },
                  } : prev)}
                />
              </label>
              <label>Auto Import Schedule
                <select
                  value={templateSnapshot?.importSettings.enabled ? "enabled" : "disabled"}
                  onChange={(e) => setTemplateSnapshot((prev) => prev ? {
                    ...prev,
                    importSettings: { ...prev.importSettings, enabled: e.target.value === "enabled" },
                  } : prev)}
                >
                  <option value="enabled">Enabled</option>
                  <option value="disabled">Disabled</option>
                </select>
              </label>
            </div>

            <div className="admin-form-block">
              <h3>Recovery actions</h3>
              <div className="admin-quick-credit-actions admin-template-actions">
                <button type="button" className="chip-btn ghost" onClick={saveImportSettings} disabled={templateLoading}>Save Import Settings</button>
                <button type="button" className="chip-btn ghost" onClick={runImportNow} disabled={templateLoading}>Import Now</button>
                <button type="button" className="chip-btn ghost" onClick={rehostThumbnails} disabled={templateLoading}>Rehost Thumbnails</button>
                <button type="button" className="chip-btn ghost" onClick={cleanBrokenThumbnails} disabled={templateLoading}>Clean Broken URLs</button>
                <button type="button" className="chip-btn ghost" onClick={repairMeigenTemplates} disabled={templateLoading}>Repair MeiGen Templates</button>
                <button type="button" className="chip-btn ghost danger" onClick={clearMeigenTemplates} disabled={templateLoading}>Clear MeiGen Templates</button>
              </div>
            </div>
          </section>

          <form className="admin-card" onSubmit={saveManualTemplate}>
            <div className="admin-section-head">
              <div>
                <p className="admin-kicker">Manual content</p>
                <h2>Manual Prompt</h2>
              </div>
              <div className="admin-mini-stats">
                <span>{manualImportCount} seed items</span>
              </div>
            </div>
            <p className="admin-hint">Create a hand-curated template with its own tags, thumbnail, and generator metadata.</p>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Title<input value={manualTemplate.title} onChange={(e) => setManualTemplate({ ...manualTemplate, title: e.target.value })} /></label>
              <label>Category<input value={manualTemplate.category} onChange={(e) => setManualTemplate({ ...manualTemplate, category: e.target.value as TemplateCategory })} /></label>
              <label>Model<input value={manualTemplate.model} onChange={(e) => setManualTemplate({ ...manualTemplate, model: e.target.value })} /></label>
              <label>Media Type<select value={manualTemplate.mediaType} onChange={(e) => setManualTemplate({ ...manualTemplate, mediaType: e.target.value as "image" | "video" })}><option value="image">Image</option><option value="video">Video</option></select></label>
              <label>Aspect Ratio<input value={manualTemplate.aspectRatio} onChange={(e) => setManualTemplate({ ...manualTemplate, aspectRatio: e.target.value })} /></label>
              <label>Thumbnail URL<input value={manualTemplate.thumbnailUrl} onChange={(e) => setManualTemplate({ ...manualTemplate, thumbnailUrl: e.target.value })} /></label>
            </div>
            <label>Tags (comma separated)
              <input value={manualTemplate.tags} onChange={(e) => setManualTemplate({ ...manualTemplate, tags: e.target.value })} />
            </label>
            <label>Prompt
              <textarea rows={8} value={manualTemplate.prompt} onChange={(e) => setManualTemplate({ ...manualTemplate, prompt: e.target.value })} />
            </label>
            <button className="generate-cta" disabled={templateLoading}>Save Manual Prompt</button>
          </form>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Monitoring</p>
            <h2>Recent Import Runs</h2>
          </div>
          <div className="admin-mini-stats">
            <span>{templateSnapshot?.runs.length || 0} tracked</span>
          </div>
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
              {templateSnapshot?.runs.length ? templateSnapshot.runs.slice(0, 8).map((run: ImportRun) => (
                <tr key={run.id}>
                  <td>{formatDate(run.createdAt)}</td>
                  <td>{run.mode}</td>
                  <td><span className={`admin-role ${run.status === "success" ? "user" : "admin"}`}>{run.status}</span></td>
                  <td>{run.requestedCount}</td>
                  <td>{run.importedCount}</td>
                  <td>{run.message}</td>
                </tr>
              )) : (
                <tr>
                  <td colSpan={6} className="admin-users-empty">No import runs tracked yet.</td>
                </tr>
              )}
            </tbody>
          </table>
        </div>
      </section>

      <section className="admin-card">
        <div className="admin-section-head">
          <div>
            <p className="admin-kicker">Library</p>
            <h2>Template Snapshot</h2>
          </div>
          <div className="admin-mini-stats">
            <span>{templateSnapshot?.templates.length || 0} total templates</span>
            <span>{featuredTemplateCount} featured</span>
          </div>
        </div>
        <div className="admin-template-grid">
          {templateSnapshot?.templates.slice(0, 12).map((template: TemplateItem) => (
            <article key={template.id} className="admin-template-card">
              <div className="admin-template-thumb" style={{ backgroundImage: template.thumbnailUrl ? `url(${template.thumbnailUrl})` : undefined }} />
              <div className="admin-template-copy">
                <div className="admin-template-topline">
                  <strong>{template.title}</strong>
                  <span>{template.model}</span>
                </div>
                <p>{template.prompt}</p>
                <div className="admin-template-tags">
                  {(template.tags || []).slice(0, 4).map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              </div>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}



