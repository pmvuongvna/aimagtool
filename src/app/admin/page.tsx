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
type UserSort = "newest" | "oldest" | "credits-desc" | "credits-asc" | "name-asc";
type UserBulkAction = "set-zero" | "reset-default" | "add-default" | "set-package" | "promote-admin" | "demote-user";
type AdminSectionKey = "users" | "credits" | "imports" | "manual" | "monitoring" | "library";

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

const USER_PAGE_SIZE = 8;
const USER_SORT_OPTIONS: Array<{ value: UserSort; label: string }> = [
  { value: "newest", label: "Newest first" },
  { value: "oldest", label: "Oldest first" },
  { value: "credits-desc", label: "Highest credits" },
  { value: "credits-asc", label: "Lowest credits" },
  { value: "name-asc", label: "Name A-Z" },
];

const formatNumber = (value: number) => value.toLocaleString("vi-VN");
const formatDate = (value: string) => new Date(value).toLocaleString("vi-VN");
const formatDateShort = (value: string) => new Date(value).toLocaleDateString("vi-VN");
const truncateText = (value: string, size = 80) => (value.length > size ? `${value.slice(0, size)}...` : value);

const ADMIN_SECTIONS: Array<{ id: AdminSectionKey; label: string; eyebrow: string; title: string; description: string }> = [
  { id: "users", label: "Users", eyebrow: "Users", title: "User Management", description: "Search accounts, sort balances, and update user access from one focused workspace." },
  { id: "credits", label: "Credits", eyebrow: "Credits", title: "Credit Policy", description: "Manage image tiers, video pricing, Grok runtime rates, and package presets without unrelated panels." },
  { id: "imports", label: "Imports", eyebrow: "Imports", title: "Prompt Importer", description: "Control MeiGen sync cadence, launch imports, and run maintenance tasks from a dedicated operations panel." },
  { id: "manual", label: "Manual", eyebrow: "Manual", title: "Manual Prompt Studio", description: "Publish curated prompts with explicit model, media, category, thumbnail, and tag controls." },
  { id: "monitoring", label: "Monitoring", eyebrow: "Monitoring", title: "Run Monitoring", description: "Inspect import history, success rate, and error messages in one clean monitoring view." },
  { id: "library", label: "Library", eyebrow: "Library", title: "Template Library", description: "Audit the published template surface and latest gallery records without mixing in import controls." },
] as const;

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
  const [userActionLoading, setUserActionLoading] = useState(false);
  const [userSearch, setUserSearch] = useState("");
  const [userRoleFilter, setUserRoleFilter] = useState<"all" | "user" | "admin">("all");
  const [userSort, setUserSort] = useState<UserSort>("newest");
  const [activeSection, setActiveSection] = useState<AdminSectionKey>("users");
  const [selectedUserId, setSelectedUserId] = useState("");
  const [selectedUserIds, setSelectedUserIds] = useState<string[]>([]);
  const [currentPage, setCurrentPage] = useState(1);
  const [bulkPackageId, setBulkPackageId] = useState("");

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
      const loadedSettings = settingsPayload.settings;
      setSettings(loadedSettings);
      setUsers(loadedUsers);
      setPackageJson(JSON.stringify(loadedSettings.creditPackages || [], null, 2));
      const starterPackage = loadedSettings.creditPackages.find((item) => item.active) || loadedSettings.creditPackages[0];
      setBulkPackageId(starterPackage?.id || "");
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

  useEffect(() => {
    if (!bulkPackageId && settings?.creditPackages.length) {
      const starterPackage = settings.creditPackages.find((item) => item.active) || settings.creditPackages[0];
      setBulkPackageId(starterPackage?.id || "");
    }
  }, [settings, bulkPackageId]);

  useEffect(() => {
    setCurrentPage(1);
  }, [userSearch, userRoleFilter, userSort]);

  useEffect(() => {
    setSelectedUserIds((prev) => prev.filter((id) => users.some((item) => item.id === id)));
  }, [users]);

  const imageCostTotal = useMemo(() => settings ? settings.imageCredits["1k"] + settings.imageCredits["2k"] + settings.imageCredits["4k"] : 0, [settings]);
  const videoCostTotal = useMemo(() => settings ? settings.videoCredits["480p"] + settings.videoCredits["720p"] : 0, [settings]);
  const totalCreditsAllocated = useMemo(() => users.reduce((sum, item) => sum + item.credits, 0), [users]);
  const adminCount = useMemo(() => users.filter((item) => item.role === "admin").length, [users]);
  const userCount = useMemo(() => users.filter((item) => item.role === "user").length, [users]);
  const featuredTemplateCount = useMemo(() => (templateSnapshot?.templates || []).filter((item) => item.featured).length, [templateSnapshot]);
  const publishedTemplateCount = useMemo(() => (templateSnapshot?.templates || []).filter((item) => item.published).length, [templateSnapshot]);
  const activePackageCount = useMemo(() => (settings?.creditPackages || []).filter((item) => item.active).length, [settings]);
  const averageCredits = useMemo(() => users.length ? Math.round(totalCreditsAllocated / users.length) : 0, [totalCreditsAllocated, users]);
  const recentUsersCount = useMemo(() => {
    const threshold = Date.now() - 7 * 24 * 60 * 60 * 1000;
    return users.filter((item) => new Date(item.createdAt).getTime() >= threshold).length;
  }, [users]);
  const latestImportRun = useMemo(() => templateSnapshot?.runs?.[0] || null, [templateSnapshot]);
  const importRuns = templateSnapshot?.runs || [];
  const successfulImports = useMemo(() => importRuns.filter((run) => run.status === "success").length, [importRuns]);
  const importSuccessRate = useMemo(
    () => importRuns.length ? Math.round((successfulImports / importRuns.length) * 100) : 0,
    [importRuns, successfulImports],
  );
  const manualTemplateCount = useMemo(
    () => (templateSnapshot?.templates || []).filter((item) => item.source === "manual").length,
    [templateSnapshot],
  );
  const meigenTemplateCount = useMemo(
    () => (templateSnapshot?.templates || []).filter((item) => item.source === "meigen").length,
    [templateSnapshot],
  );

  const filteredUsers = useMemo(() => users.filter((item) => {
    const matchesRole = userRoleFilter === "all" || item.role === userRoleFilter;
    const keyword = userSearch.trim().toLowerCase();
    const haystack = `${item.name} ${item.email} ${item.id}`.toLowerCase();
    return matchesRole && (!keyword || haystack.includes(keyword));
  }), [users, userRoleFilter, userSearch]);

  const sortedUsers = useMemo(() => {
    const nextUsers = [...filteredUsers];
    nextUsers.sort((left, right) => {
      if (userSort === "oldest") return new Date(left.createdAt).getTime() - new Date(right.createdAt).getTime();
      if (userSort === "credits-desc") return right.credits - left.credits;
      if (userSort === "credits-asc") return left.credits - right.credits;
      if (userSort === "name-asc") return left.name.localeCompare(right.name, "vi");
      return new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime();
    });
    return nextUsers;
  }, [filteredUsers, userSort]);

  const pageCount = useMemo(() => Math.max(1, Math.ceil(sortedUsers.length / USER_PAGE_SIZE)), [sortedUsers.length]);
  const visiblePage = Math.min(currentPage, pageCount);
  const paginatedUsers = useMemo(() => {
    const startIndex = (visiblePage - 1) * USER_PAGE_SIZE;
    return sortedUsers.slice(startIndex, startIndex + USER_PAGE_SIZE);
  }, [sortedUsers, visiblePage]);

  const selectedUser = useMemo(
    () => users.find((item) => item.id === selectedUserId) || paginatedUsers[0] || sortedUsers[0] || users[0] || null,
    [users, paginatedUsers, sortedUsers, selectedUserId],
  );

  const selectedUsers = useMemo(() => users.filter((item) => selectedUserIds.includes(item.id)), [users, selectedUserIds]);
  const selectedCreditsTotal = useMemo(() => selectedUsers.reduce((sum, item) => sum + item.credits, 0), [selectedUsers]);
  const topBalanceUsers = useMemo(() => [...users].sort((left, right) => right.credits - left.credits).slice(0, 5), [users]);
  const newestUsers = useMemo(() => [...users].sort((left, right) => new Date(right.createdAt).getTime() - new Date(left.createdAt).getTime()).slice(0, 5), [users]);
  const maxBalance = topBalanceUsers[0]?.credits || 1;
  const roleBreakdown = useMemo(() => {
    const total = Math.max(users.length, 1);
    return [
      { label: "Users", count: userCount, width: `${(userCount / total) * 100}%`, tone: "user" },
      { label: "Admins", count: adminCount, width: `${(adminCount / total) * 100}%`, tone: "admin" },
    ];
  }, [users.length, userCount, adminCount]);
  const selectedPackage = useMemo(() => settings?.creditPackages.find((item) => item.id === bulkPackageId) || null, [settings, bulkPackageId]);
  const activeSectionMeta = useMemo(() => ADMIN_SECTIONS.find((item) => item.id === activeSection) || ADMIN_SECTIONS[0], [activeSection]);
  const workspaceMode = activeSection === "users" || activeSection === "credits" ? "primary" : activeSection === "imports" || activeSection === "manual" ? "secondary" : "lower";

  useEffect(() => {
    if (selectedUser && selectedUser.id !== selectedUserId) setSelectedUserId(selectedUser.id);
  }, [selectedUser, selectedUserId]);

  useEffect(() => {
    if (currentPage > pageCount) setCurrentPage(pageCount);
  }, [currentPage, pageCount]);

  function syncUsers(nextUsers: AdminUser[], nextStatus?: string) {
    setUsers(nextUsers);
    setSelectedUserIds((prev) => prev.filter((id) => nextUsers.some((item) => item.id === id)));
    const nextSelected = nextUsers.find((item) => item.id === selectedUserId) || nextUsers[0] || null;
    if (nextSelected) {
      setSelectedUserId(nextSelected.id);
      setUserId(nextSelected.id);
      setCredits(nextSelected.credits);
    }
    if (nextStatus) setStatus(nextStatus);
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
    setUserId(user.id);
    setCredits(user.credits);
    setStatus(`Selected ${user.email}`);
  }

  function toggleUserSelection(targetUserId: string) {
    setSelectedUserIds((prev) => prev.includes(targetUserId) ? prev.filter((id) => id !== targetUserId) : [...prev, targetUserId]);
  }

  function toggleVisibleSelection() {
    const visibleIds = paginatedUsers.map((item) => item.id);
    const allSelected = visibleIds.every((id) => selectedUserIds.includes(id));
    setSelectedUserIds((prev) => {
      if (allSelected) return prev.filter((id) => !visibleIds.includes(id));
      return Array.from(new Set([...prev, ...visibleIds]));
    });
  }

  function clearUserSelection() {
    setSelectedUserIds([]);
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
    if (res.ok) syncUsers(payload.users || [], "Settings saved");
    else setStatus("Save failed");
  }

  async function updateUserCredits(e: FormEvent) {
    e.preventDefault();
    setUserActionLoading(true);
    setStatus("Updating credits...");
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCredit: { userId, credits } }),
    });
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminUser[] };
    if (res.ok) syncUsers(payload.users || [], "User credits updated");
    else setStatus("Update failed");
    setUserActionLoading(false);
  }

  async function applyBulkAction(action: UserBulkAction, targetUserIds = selectedUserIds, packageId = bulkPackageId) {
    if (!targetUserIds.length) {
      setStatus("Pick at least one user first.");
      return;
    }

    setUserActionLoading(true);
    setStatus("Applying bulk action...");
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ bulkAction: { action, userIds: targetUserIds, packageId } }),
    });
    const payload = (await res.json().catch(() => ({}))) as { users?: AdminUser[]; bulkResult?: { message?: string }; error?: string };

    if (res.ok) syncUsers(payload.users || [], payload.bulkResult?.message || "Bulk action complete");
    else setStatus(payload.error || "Bulk action failed");
    setUserActionLoading(false);
  }

  async function saveImportSettings(event?: FormEvent) {
    event?.preventDefault();
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
      setStatus("Import settings saved");
    } else {
      setStatus("Save import settings failed");
    }
    setTemplateLoading(false);
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
      <main className="admin-v2 admin-v3-shell">
        <div className="admin-loading-card">
          <p className="admin-kicker">CONTROL PLANE</p>
          <h1>Admin Console</h1>
          <p>{status}</p>
        </div>
      </main>
    );
  }

  return (
    <main className="admin-v2 admin-v3-shell">
      <div className="admin-shell-grid-v5">
        <aside className="admin-sidebar-v5">
          <div className="admin-sidebar-brand">
            <span className="admin-sidebar-dot" />
            <div>
              <strong>Escanor Admin</strong>
              <span>Control center</span>
            </div>
          </div>

          <div className="admin-sidebar-card hero">
            <small>Live workspace</small>
            <strong>{formatNumber(totalCreditsAllocated)}</strong>
            <span>Total credits managed across the platform.</span>
          </div>

          <nav className="admin-sidebar-nav" aria-label="Admin navigation">
            {ADMIN_SECTIONS.map((item) => (
              <button key={item.id} type="button" className={`admin-sidebar-link ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}>
                <span>{item.label}</span>
              </button>
            ))}
          </nav>

          <div className="admin-sidebar-stack">
            <div className="admin-sidebar-card compact">
              <small>Accounts</small>
              <strong>{users.length}</strong>
              <span>{adminCount} admins / {userCount} users</span>
            </div>
            <div className="admin-sidebar-card compact">
              <small>Templates</small>
              <strong>{templateSnapshot?.templates.length || 0}</strong>
              <span>{publishedTemplateCount} published</span>
            </div>
            <div className="admin-sidebar-card compact">
              <small>Import health</small>
              <strong>{importSuccessRate}%</strong>
              <span>{successfulImports} successful runs</span>
            </div>
            <div className="admin-sidebar-card compact">
              <small>Default credits</small>
              <strong>{formatNumber(settings.defaultUserCredits)}</strong>
              <span>{activePackageCount} active packages</span>
            </div>
          </div>
        </aside>

        <div className="admin-shell-content-v5">
      <header className="admin-shell-header admin-shell-header-v4">
        <div className="admin-command-card admin-command-card-v4">
          <div className="admin-command-top admin-command-top-v4">
            <div className="admin-command-copy">
              <p className="admin-kicker">{activeSectionMeta.eyebrow}</p>
              <h1>{activeSectionMeta.title}</h1>
              <p className="admin-status">{activeSectionMeta.description}</p>
            </div>
            <div className="admin-header-actions admin-header-actions-v4">
              <Link href="/user" className="chip-btn dark">Open Studio</Link>
              <Link href="/" className="chip-btn ghost">Landing</Link>
              <button type="button" className="chip-btn dark" onClick={handleLogout}>Logout</button>
            </div>
          </div>

          <div className="admin-status-row admin-status-row-v4">
            <span className="admin-status-chip">{status}</span>
            <span className="admin-status-chip">{userCount} users</span>
            <span className="admin-status-chip">{adminCount} admins</span>
            <span className="admin-status-chip">{templateSnapshot?.templates.length || 0} templates</span>
            <span className="admin-status-chip">{activePackageCount} active packages</span>
          </div>

          <div className="admin-overview-grid">
            <article className="admin-overview-card featured">
              <span>Total allocated credits</span>
              <strong>{formatNumber(totalCreditsAllocated)}</strong>
              <small>Live balance distributed across every tracked account.</small>
            </article>
            <article className="admin-overview-card">
              <span>Import success rate</span>
              <strong>{importSuccessRate}%</strong>
              <small>{successfulImports}/{importRuns.length || 0} recent runs completed successfully.</small>
            </article>
            <article className="admin-overview-card">
              <span>Template split</span>
              <strong>{meigenTemplateCount} / {manualTemplateCount}</strong>
              <small>MeiGen sourced versus manually curated templates.</small>
            </article>
            <article className="admin-overview-card">
              <span>Average credits / user</span>
              <strong>{formatNumber(averageCredits)}</strong>
              <small>{recentUsersCount} new accounts joined in the last 7 days.</small>
            </article>
          </div>
        </div>

        </header>

      <section className={`admin-workspace-grid admin-workspace-grid-v4 ${workspaceMode !== "lower" ? "admin-workspace-grid-solo" : "admin-tab-hidden"}`}>
        <div className={activeSection === "users" || activeSection === "credits" ? "admin-primary-stack" : "admin-primary-stack admin-tab-hidden"}>
          <section id="admin-users" className={`admin-card admin-user-console-card admin-user-console-v3 ${activeSection === "users" ? "" : "admin-tab-hidden"}`}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Users</p>
                <h2>User Management</h2>
                <p className="admin-hint">Search accounts, filter by role, review balances, and handle user credit operations in one focused workspace.</p>
              </div>
              <div className="admin-mini-stats">
                <span>{sortedUsers.length} matched</span>
                <span>{users.length} total</span>
              </div>
            </div>

            <div className="admin-user-toolbar admin-user-toolbar-v3">
              <div className="admin-user-toolbar-search">
                <input value={userSearch} onChange={(e) => setUserSearch(e.target.value)} placeholder="Search by name, email, or user ID" />
                <div className="admin-filter-pills">
                  <button type="button" className={`admin-filter-pill ${userRoleFilter === "all" ? "active" : ""}`} onClick={() => setUserRoleFilter("all")}>All</button>
                  <button type="button" className={`admin-filter-pill ${userRoleFilter === "user" ? "active" : ""}`} onClick={() => setUserRoleFilter("user")}>Users</button>
                  <button type="button" className={`admin-filter-pill ${userRoleFilter === "admin" ? "active" : ""}`} onClick={() => setUserRoleFilter("admin")}>Admins</button>
                </div>
              </div>

              <div className="admin-user-toolbar-actions">
                <label className="admin-inline-select">
                  <span>Sort</span>
                  <select value={userSort} onChange={(e) => setUserSort(e.target.value as UserSort)}>
                    {USER_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                  </select>
                </label>
                <div className="admin-mini-stats admin-mini-stats-compact">
                  <span>Page {visiblePage}/{pageCount}</span>
                  <span>{selectedCreditsTotal ? `${formatNumber(selectedCreditsTotal)} credits` : "No batch selected"}</span>
                </div>
              </div>
            </div>

            <div className="admin-user-summary-strip admin-user-summary-strip-v3">
              <article>
                <small>Visible users</small>
                <strong>{sortedUsers.length}</strong>
              </article>
              <article>
                <small>Selected accounts</small>
                <strong>{selectedUserIds.length}</strong>
              </article>
              <article>
                <small>Admins</small>
                <strong>{adminCount}</strong>
              </article>
              <article>
                <small>Users</small>
                <strong>{userCount}</strong>
              </article>
            </div>

            <div className="admin-user-analytics-grid">
              <article className="admin-insight-card">
                <div className="admin-insight-head">
                  <strong>Role distribution</strong>
                  <span>{users.length} accounts</span>
                </div>
                <div className="admin-role-bars">
                  {roleBreakdown.map((item) => (
                    <div key={item.label} className="admin-role-bar-row">
                      <div className="admin-role-bar-copy">
                        <span>{item.label}</span>
                        <b>{item.count}</b>
                      </div>
                      <div className="admin-role-bar-track">
                        <span className={`admin-role-bar-fill ${item.tone}`} style={{ width: item.width }} />
                      </div>
                    </div>
                  ))}
                </div>
              </article>

              <article className="admin-insight-card">
                <div className="admin-insight-head">
                  <strong>Top balances</strong>
                  <span>Highest credit holders</span>
                </div>
                <div className="admin-balance-list">
                  {topBalanceUsers.map((item) => (
                    <div key={item.id} className="admin-balance-row">
                      <div>
                        <b>{item.name}</b>
                        <span>{item.email}</span>
                      </div>
                      <div className="admin-balance-bar-wrap">
                        <strong>{formatNumber(item.credits)}</strong>
                        <div className="admin-role-bar-track compact">
                          <span className="admin-role-bar-fill user" style={{ width: `${Math.max((item.credits / maxBalance) * 100, 10)}%` }} />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>
              </article>
            </div>

            <div className="admin-bulk-console">
              <div className="admin-bulk-copy">
                <strong>Bulk actions</strong>
                <span>Apply role or credit updates to the selected accounts in one pass.</span>
              </div>
              <div className="admin-bulk-actions">
                <button type="button" className="chip-btn ghost" onClick={toggleVisibleSelection} disabled={userActionLoading || paginatedUsers.length === 0}>
                  {paginatedUsers.every((item) => selectedUserIds.includes(item.id)) ? "Unselect page" : "Select page"}
                </button>
                <button type="button" className="chip-btn ghost" onClick={clearUserSelection} disabled={userActionLoading || selectedUserIds.length === 0}>Clear</button>
                <button type="button" className="chip-btn ghost" onClick={() => void applyBulkAction("add-default")} disabled={userActionLoading || selectedUserIds.length === 0}>+ Default</button>
                <button type="button" className="chip-btn ghost" onClick={() => void applyBulkAction("reset-default")} disabled={userActionLoading || selectedUserIds.length === 0}>Reset default</button>
                <button type="button" className="chip-btn ghost" onClick={() => void applyBulkAction("set-zero")} disabled={userActionLoading || selectedUserIds.length === 0}>Set 0</button>
                <label className="admin-inline-select package">
                  <span>Package</span>
                  <select value={bulkPackageId} onChange={(e) => setBulkPackageId(e.target.value)}>
                    {(settings.creditPackages || []).map((item) => (
                      <option key={item.id} value={item.id}>{item.name} - {formatNumber(item.credits)}</option>
                    ))}
                  </select>
                </label>
                <button type="button" className="chip-btn dark" onClick={() => void applyBulkAction("set-package")} disabled={userActionLoading || selectedUserIds.length === 0 || !selectedPackage}>Apply package</button>
                <button type="button" className="chip-btn ghost" onClick={() => void applyBulkAction("promote-admin")} disabled={userActionLoading || selectedUserIds.length === 0}>Promote</button>
                <button type="button" className="chip-btn ghost" onClick={() => void applyBulkAction("demote-user")} disabled={userActionLoading || selectedUserIds.length === 0}>Demote</button>
              </div>
            </div>

            <div className="admin-user-layout admin-user-layout-v3">
              <div className="admin-user-list-panel">
                <div className="admin-user-list-head">
                  <div>
                    <strong>Account list</strong>
                    <span>{paginatedUsers.length ? `${(visiblePage - 1) * USER_PAGE_SIZE + 1}-${Math.min(visiblePage * USER_PAGE_SIZE, sortedUsers.length)} of ${sortedUsers.length}` : "No matches"}</span>
                  </div>
                  <span className="admin-status-chip muted">{selectedUserIds.length ? `${selectedUserIds.length} in batch` : "Single select mode"}</span>
                </div>

                <div className="admin-user-list admin-user-list-v3">
                  {paginatedUsers.length === 0 ? (
                    <div className="admin-users-empty">No users found yet, or the backend is not connected to the database.</div>
                  ) : paginatedUsers.map((item) => {
                    const isChecked = selectedUserIds.includes(item.id);
                    const isActive = selectedUser?.id === item.id;
                    return (
                      <article key={item.id} className={`admin-user-row ${isActive ? "active" : ""}`}>
                        <button type="button" className={`admin-user-check ${isChecked ? "active" : ""}`} onClick={() => toggleUserSelection(item.id)} aria-label={`Select ${item.email}`}>
                          {isChecked ? "x" : ""}
                        </button>
                        <button type="button" className={`admin-user-list-item admin-user-list-item-v3 ${isActive ? "active" : ""}`} onClick={() => selectUser(item)}>
                          <div className="admin-user-list-main">
                            <div className="admin-user-avatar">{(item.name || item.email).slice(0, 1).toUpperCase()}</div>
                            <div className="admin-user-summary admin-user-summary-list">
                              <strong>{item.name}</strong>
                              <span>{item.email}</span>
                              <code>{truncateText(item.id, 26)}</code>
                            </div>
                          </div>
                          <div className="admin-user-list-side admin-user-list-side-v3">
                            <span className={`admin-role ${item.role}`}>{item.role}</span>
                            <b>{formatNumber(item.credits)}</b>
                            <small>{formatDateShort(item.createdAt)}</small>
                          </div>
                        </button>
                      </article>
                    );
                  })}
                </div>

                <div className="admin-pagination">
                  <button type="button" className="chip-btn ghost" onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} disabled={visiblePage <= 1}>Previous</button>
                  <span>Page {visiblePage} of {pageCount}</span>
                  <button type="button" className="chip-btn ghost" onClick={() => setCurrentPage((page) => Math.min(page + 1, pageCount))} disabled={visiblePage >= pageCount}>Next</button>
                </div>
              </div>

              <div className="admin-user-detail admin-user-detail-v3">
                {selectedUser ? (
                  <>
                    <div className="admin-user-hero admin-user-hero-v3">
                      <div className="admin-user-avatar large">{(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}</div>
                      <div className="admin-user-identity">
                        <h3>{selectedUser.name}</h3>
                        <p>{selectedUser.email}</p>
                        <code>{selectedUser.id}</code>
                      </div>
                      <span className={`admin-role ${selectedUser.role}`}>{selectedUser.role}</span>
                    </div>

                    <div className="admin-user-stat-grid admin-user-stat-grid-detail admin-user-stat-grid-v3">
                      <article>
                        <small>Credits</small>
                        <strong>{formatNumber(selectedUser.credits)}</strong>
                      </article>
                      <article>
                        <small>Joined</small>
                        <strong>{formatDate(selectedUser.createdAt)}</strong>
                      </article>
                      <article>
                        <small>Selected in batch</small>
                        <strong>{selectedUserIds.includes(selectedUser.id) ? "Yes" : "No"}</strong>
                      </article>
                    </div>

                    <form className="admin-user-credit-form admin-user-credit-form-v3" onSubmit={updateUserCredits}>
                      <div className="admin-subgrid admin-subgrid-two admin-user-form-grid">
                        <label>User ID<input value={userId} onChange={(e) => setUserId(e.target.value)} /></label>
                        <label>Credits<input type="number" value={credits} onChange={(e) => setCredits(Number(e.target.value))} /></label>
                      </div>
                      <div className="admin-quick-credit-actions admin-quick-credit-actions-v3">
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(selectedUser.credits + settings.defaultUserCredits)}>+ Default pack</button>
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(settings.defaultUserCredits)}>Reset default</button>
                        <button type="button" className="chip-btn ghost" onClick={() => setCredits(0)}>Set 0</button>
                      </div>
                      <div className="admin-detail-actions">
                        <button className="generate-cta" disabled={userActionLoading}>Update User Credits</button>
                        <button type="button" className="chip-btn dark" onClick={() => void applyBulkAction(selectedUser.role === "admin" ? "demote-user" : "promote-admin", [selectedUser.id])} disabled={userActionLoading}>
                          {selectedUser.role === "admin" ? "Demote to user" : "Promote to admin"}
                        </button>
                      </div>
                    </form>

                    <div className="admin-insight-card compact">
                      <div className="admin-insight-head">
                        <strong>Recent signups</strong>
                        <span>Quick switch list</span>
                      </div>
                      <div className="admin-recent-list">
                        {newestUsers.map((item) => (
                          <button key={item.id} type="button" className="admin-recent-row" onClick={() => selectUser(item)}>
                            <div>
                              <b>{item.name}</b>
                              <span>{item.email}</span>
                            </div>
                            <small>{formatDateShort(item.createdAt)}</small>
                          </button>
                        ))}
                      </div>
                    </div>
                  </>
                ) : <div className="admin-users-empty">Select a user to inspect credits and update the account balance.</div>}
              </div>
            </div>
          </section>

          <form id="admin-credits" className={`admin-card admin-credit-console ${activeSection === "credits" ? "" : "admin-tab-hidden"}`} onSubmit={saveSettings}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Credit policy</p>
                <h2>Credit Matrix</h2>
                <p className="admin-hint">Manage image tiers, Grok per-second pricing, fallback video policy, and package distribution from one structured block.</p>
              </div>
              <div className="admin-mini-stats">
                <span>{activePackageCount} active packages</span>
                <span>Default user: {settings.defaultUserCredits}</span>
              </div>
            </div>

            <div className="admin-credit-groups">
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
            </div>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Default User Credits<input type="number" value={settings.defaultUserCredits} onChange={(e) => setSettings({ ...settings, defaultUserCredits: Number(e.target.value) })} /></label>
              <div className="admin-note-box">
                <strong>Policy note</strong>
                <span>Video 480p / 720p remain the fallback pool for future Veo-style models. Grok pricing is per-second only.</span>
              </div>
            </div>

            <label>Credit Packages (JSON)
              <textarea rows={10} value={packageJson} onChange={(e) => setPackageJson(e.target.value)} placeholder='[{"id":"starter","name":"Starter","credits":500,"priceVnd":99000,"badge":"Pho bien","active":true}]' />
            </label>
            <button className="generate-cta">Save Credit Settings</button>
          </form>
        </div>

        <div className={activeSection === "imports" || activeSection === "manual" ? "admin-secondary-stack" : "admin-secondary-stack admin-tab-hidden"}>
          <section className={`admin-card admin-ops-rail ${activeSection === "imports" ? "" : "admin-tab-hidden"}`}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Operations</p>
                <h2>System Snapshot</h2>
                <p className="admin-hint">A quick read on templates, imports, packages, and user growth before you make changes.</p>
              </div>
              <span className="admin-status-chip muted">Live</span>
            </div>

            <div className="admin-ops-rail-grid">
              <article>
                <small>Published templates</small>
                <strong>{publishedTemplateCount}</strong>
                <span>{featuredTemplateCount} featured</span>
              </article>
              <article>
                <small>Manual prompts</small>
                <strong>{manualTemplateCount}</strong>
                <span>{meigenTemplateCount} MeiGen templates</span>
              </article>
              <article>
                <small>Active packages</small>
                <strong>{activePackageCount}</strong>
                <span>Image pool {formatNumber(imageCostTotal)}</span>
              </article>
              <article>
                <small>Video pool</small>
                <strong>{formatNumber(videoCostTotal)}</strong>
                <span>Latest run {latestImportRun?.status || 'idle'}</span>
              </article>
            </div>
          </section>
          <section id="admin-imports" className={`admin-card admin-ops-console ${activeSection === "imports" ? "" : "admin-tab-hidden"}`}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Template ops</p>
                <h2>Prompt Importer</h2>
                <p className="admin-hint">Control the MeiGen sync cadence, trigger maintenance tasks, and inspect template ingestion health from one operations panel.</p>
              </div>
              <div className="admin-mini-stats">
                <span>{templateSnapshot?.importSettings.enabled ? "Auto on" : "Auto off"}</span>
                <span>{templateSnapshot?.importSettings.importCount ?? 0} / run</span>
              </div>
            </div>

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

            <div className="admin-template-action-grid">
              <button type="button" className="chip-btn ghost" onClick={() => void saveImportSettings()} disabled={templateLoading}>Save settings</button>
              <button type="button" className="chip-btn ghost" onClick={runImportNow} disabled={templateLoading}>Import now</button>
              <button type="button" className="chip-btn ghost" onClick={rehostThumbnails} disabled={templateLoading}>Rehost thumbs</button>
              <button type="button" className="chip-btn ghost" onClick={cleanBrokenThumbnails} disabled={templateLoading}>Clean broken</button>
              <button type="button" className="chip-btn ghost" onClick={repairMeigenTemplates} disabled={templateLoading}>Repair data</button>
              <button type="button" className="chip-btn ghost danger" onClick={clearMeigenTemplates} disabled={templateLoading}>Clear MeiGen</button>
            </div>
          </section>

          <form id="admin-manual" className={`admin-card admin-manual-console ${activeSection === "manual" ? "" : "admin-tab-hidden"}`} onSubmit={saveManualTemplate}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Manual content</p>
                <h2>Manual Prompt</h2>
                <p className="admin-hint">Seed curated prompts directly into the gallery with full control over category, media type, thumbnail, and tags.</p>
              </div>
              <div className="admin-mini-stats">
                <span>{publishedTemplateCount} published</span>
                <span>{featuredTemplateCount} featured</span>
              </div>
            </div>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Title<input value={manualTemplate.title} onChange={(e) => setManualTemplate({ ...manualTemplate, title: e.target.value })} /></label>
              <label>Category
                <select value={manualTemplate.category} onChange={(e) => setManualTemplate({ ...manualTemplate, category: e.target.value as TemplateCategory })}>
                  {TEMPLATE_CATEGORIES.map((category) => <option key={category} value={category}>{category}</option>)}
                </select>
              </label>
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

      <section className={activeSection === "monitoring" || activeSection === "library" ? "admin-lower-grid admin-lower-grid-solo" : "admin-lower-grid admin-tab-hidden"}>
        <section id="admin-monitoring" className={`admin-card ${activeSection === "monitoring" ? "" : "admin-tab-hidden"}`}>
          <div className="admin-panel-head">
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

        <section id="admin-library" className={`admin-card ${activeSection === "library" ? "" : "admin-tab-hidden"}`}>
          <div className="admin-panel-head">
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
            {templateSnapshot?.templates.slice(0, 8).map((template: TemplateItem) => (
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
      </section>
        </div>
      </div>
    </main>
  );
}

