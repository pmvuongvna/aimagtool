"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { FormEvent, useEffect, useMemo, useState } from "react";
import {
  ArrowDownUp,
  ChartNoAxesCombined,
  Check,
  ChevronDown,
  ChevronLeft,
  ChevronRight,
  Coins,
  Clock3,
  CreditCard,
  ExternalLink,
  Gift,
  Image as ImageIcon,
  Library,
  LogOut,
  MoreHorizontal,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  UserCog,
  Users,
  X,
} from "lucide-react";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type TemplateCategory } from "@/lib/template-catalog";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string; active: boolean };
type AdminUser = { id: string; name: string; email: string; role: "user" | "admin"; createdAt: string; credits: number };
type AdminPayment = { id: string; orderCode: number; userName: string; userEmail: string; packageName: string; credits: number; amountVnd: number; status: string; createdAt: string; paidAt: string | null };

type AdminPayload = {
  settings: {
    creditPackages: CreditPackage[];
    imageCredits: { "1k": number; "2k": number; "4k": number };
    qwen21ImageCredits: { text1k: number; text2k: number; image1k: number; image2k: number };
    seedream5FlashImageCredits: { text1k: number; text15k: number; text2k: number; image1k: number; image15k: number; image2k: number };
    videoCredits: { "480p": number; "720p": number };
    grokVideoCreditsPerSecond: { "480p": number; "720p": number };
    seedanceVideoCredits: { "480p": number; "720p": number; "1080p": number; "4k": number };
    seedance25VideoCredits: { "480p": number; "720p": number; "1080p": number };
    klingMotionCredits: { "720p": number; "1080p": number };
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
type AdminSectionKey = "users" | "credits" | "payments" | "imports" | "manual" | "monitoring" | "library";

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
  { id: "payments", label: "Payments", eyebrow: "Payments", title: "Payment Operations", description: "Monitor payOS orders, verify pending payments, and keep credit purchases auditable." },
  { id: "imports", label: "Imports", eyebrow: "Imports", title: "Prompt Importer", description: "Control MeiGen sync cadence, launch imports, and run maintenance tasks from a dedicated operations panel." },
  { id: "manual", label: "Manual", eyebrow: "Manual", title: "Manual Prompt Studio", description: "Publish curated prompts with explicit model, media, category, thumbnail, and tag controls." },
  { id: "monitoring", label: "Monitoring", eyebrow: "Monitoring", title: "Run Monitoring", description: "Inspect import history, success rate, and error messages in one clean monitoring view." },
  { id: "library", label: "Library", eyebrow: "Library", title: "Template Library", description: "Audit the published template surface and latest gallery records without mixing in import controls." },
] as const;

const ADMIN_SECTION_ICONS: Record<AdminSectionKey, typeof Users> = {
  users: Users,
  credits: CreditCard,
  payments: Coins,
  imports: Sparkles,
  manual: ImageIcon,
  monitoring: ChartNoAxesCombined,
  library: Library,
};

export default function AdminPage() {
  const router = useRouter();
  const [settings, setSettings] = useState<AdminPayload["settings"] | null>(null);
  const [packageJson, setPackageJson] = useState("[]");
  const [users, setUsers] = useState<AdminUser[]>([]);
  const [payments, setPayments] = useState<AdminPayment[]>([]);
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
  const [creditMode, setCreditMode] = useState<"add" | "subtract">("add");
  const [creditAdjustment, setCreditAdjustment] = useState(100);
  const [paymentLoading, setPaymentLoading] = useState(false);

  useEffect(() => {
    async function load() {
      const [settingsRes, templatesRes, paymentsRes] = await Promise.all([
        apiFetch(apiPath("/api/admin/settings")),
        apiFetch(apiPath("/api/admin/templates")),
        apiFetch(apiPath("/api/admin/payments")),
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
      }

      if (templatesRes.ok) {
        const templatePayload = (await templatesRes.json()) as TemplateSnapshot;
        setTemplateSnapshot(templatePayload);
        setManualImportCount(templatePayload.importSettings.importCount);
      }

      if (paymentsRes.ok) {
        const paymentsPayload = (await paymentsRes.json()) as { payments?: AdminPayment[] };
        setPayments(paymentsPayload.payments || []);
      }

      setStatus("Ready");
    }
    void load();
  }, []);

  const imageCostTotal = useMemo(() => settings ? settings.imageCredits["1k"] + settings.imageCredits["2k"] + settings.imageCredits["4k"] + Object.values(settings.qwen21ImageCredits).reduce((sum, value) => sum + value, 0) + Object.values(settings.seedream5FlashImageCredits).reduce((sum, value) => sum + value, 0) : 0, [settings]);
  const videoCostTotal = useMemo(() => settings ? settings.videoCredits["480p"] + settings.videoCredits["720p"] : 0, [settings]);
  const totalCreditsAllocated = useMemo(() => users.reduce((sum, item) => sum + item.credits, 0), [users]);
  const adminCount = useMemo(() => users.filter((item) => item.role === "admin").length, [users]);
  const featuredTemplateCount = useMemo(() => (templateSnapshot?.templates || []).filter((item) => item.featured).length, [templateSnapshot]);
  const publishedTemplateCount = useMemo(() => (templateSnapshot?.templates || []).filter((item) => item.published).length, [templateSnapshot]);
  const activePackageCount = useMemo(() => (settings?.creditPackages || []).filter((item) => item.active).length, [settings]);
  const paidPayments = useMemo(() => payments.filter((item) => item.status === "PAID"), [payments]);
  const paymentRevenue = useMemo(() => paidPayments.reduce((sum, item) => sum + item.amountVnd, 0), [paidPayments]);
  const pendingPaymentCount = useMemo(() => payments.filter((item) => item.status === "PENDING" || item.status === "MANUAL_REVIEW").length, [payments]);
  const latestImportRun = useMemo(() => templateSnapshot?.runs?.[0] || null, [templateSnapshot]);
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

  const selectedUser = useMemo(() => users.find((item) => item.id === selectedUserId) || null, [users, selectedUserId]);

  const selectedUsers = useMemo(() => users.filter((item) => selectedUserIds.includes(item.id)), [users, selectedUserIds]);
  const selectedCreditsTotal = useMemo(() => selectedUsers.reduce((sum, item) => sum + item.credits, 0), [selectedUsers]);
  const selectedPackage = useMemo(() => settings?.creditPackages.find((item) => item.id === bulkPackageId) || null, [settings, bulkPackageId]);
  const activeSectionMeta = useMemo(() => ADMIN_SECTIONS.find((item) => item.id === activeSection) || ADMIN_SECTIONS[0], [activeSection]);
  const workspaceMode = activeSection === "users" || activeSection === "credits" ? "primary" : activeSection === "imports" || activeSection === "manual" ? "secondary" : "lower";
  const adjustedBalance = useMemo(() => {
    if (!selectedUser) return 0;
    const amount = Math.max(0, Number(creditAdjustment) || 0);
    return Math.max(0, selectedUser.credits + (creditMode === "add" ? amount : -amount));
  }, [selectedUser, creditAdjustment, creditMode]);

  function syncUsers(nextUsers: AdminUser[], nextStatus?: string) {
    setUsers(nextUsers);
    setSelectedUserIds((prev) => prev.filter((id) => nextUsers.some((item) => item.id === id)));
    setCurrentPage((page) => Math.min(page, Math.max(1, Math.ceil(nextUsers.length / USER_PAGE_SIZE))));
    const nextSelected = nextUsers.find((item) => item.id === selectedUserId) || nextUsers[0] || null;
    if (nextSelected) {
      setSelectedUserId(nextSelected.id);
    }
    if (nextStatus) setStatus(nextStatus);
  }

  function selectUser(user: AdminUser) {
    setSelectedUserId(user.id);
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

  async function updateUserCredits(targetUserId: string, nextCredits: number) {
    setUserActionLoading(true);
    setStatus("Updating credits...");
    const res = await apiFetch(apiPath("/api/admin/settings"), {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ userCredit: { userId: targetUserId, credits: Math.max(0, nextCredits) } }),
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
    setStatus("Repairing MeiGen prompts and metadata...");
    const res = await apiFetch(apiPath("/api/admin/templates"), {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ action: "repair-meigen" }),
    });
    const payload = (await res.json().catch(() => ({}))) as { result?: { run?: ImportRun }; snapshot?: TemplateSnapshot };
    if (res.ok && payload.snapshot) {
      setTemplateSnapshot(payload.snapshot);
      setStatus(payload.result?.run?.message || "MeiGen prompts and metadata repaired");
    } else {
      setStatus("Repair MeiGen data failed");
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

  async function refreshPayments() {
    const response = await apiFetch(apiPath("/api/admin/payments"), { cache: "no-store" });
    const payload = (await response.json().catch(() => ({}))) as { payments?: AdminPayment[]; error?: string };
    if (!response.ok) throw new Error(payload.error || "Cannot load payments");
    setPayments(payload.payments || []);
  }

  async function runPaymentAction(action: "reconcile" | "confirm-webhook") {
    setPaymentLoading(true);
    setStatus(action === "confirm-webhook" ? "Registering payOS webhook..." : "Reconciling pending payments...");
    try {
      const response = await apiFetch(apiPath("/api/admin/payments"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action }),
      });
      const payload = (await response.json().catch(() => ({}))) as { error?: string; outcomes?: unknown[] };
      if (!response.ok) throw new Error(payload.error || "Payment action failed");
      await refreshPayments();
      setStatus(action === "confirm-webhook" ? "payOS webhook registered" : `Reconciled ${payload.outcomes?.length || 0} payment(s)`);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : "Payment action failed");
    } finally {
      setPaymentLoading(false);
    }
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
            <span className="admin-sidebar-dot"><ShieldCheck size={22} /></span>
            <div>
              <strong>Escanor Admin</strong>
              <span>Management center</span>
            </div>
          </div>

          <nav className="admin-sidebar-nav" aria-label="Admin navigation">
            {ADMIN_SECTIONS.slice(0, 3).map((item) => {
              const Icon = ADMIN_SECTION_ICONS[item.id];
              return (
                <button key={item.id} type="button" className={`admin-sidebar-link ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}>
                  <Icon size={18} /><span>{item.label}</span>
                </button>
              );
            })}
            <details className="admin-sidebar-group" open={!["users", "credits", "payments"].includes(activeSection)}>
              <summary><span>Content operations</span><ChevronDown size={16} /></summary>
              <div>
                {ADMIN_SECTIONS.slice(3).map((item) => {
                  const Icon = ADMIN_SECTION_ICONS[item.id];
                  return (
                    <button key={item.id} type="button" className={`admin-sidebar-link ${activeSection === item.id ? "active" : ""}`} onClick={() => setActiveSection(item.id)}>
                      <Icon size={18} /><span>{item.label}</span>
                    </button>
                  );
                })}
              </div>
            </details>
          </nav>

          <div className="admin-sidebar-account">
            <span className="admin-sidebar-avatar">A</span>
            <div>
              <strong>Admin</strong>
              <span>{status}</span>
            </div>
            <button type="button" onClick={handleLogout} aria-label="Log out"><LogOut size={17} /></button>
          </div>
        </aside>

        <div className="admin-shell-content-v5">
          <header className="admin-shell-header admin-shell-header-v4">
          <div className="admin-command-card admin-command-card-v4">
            <div className="admin-command-top admin-command-top-v4">
            <div className="admin-command-copy">
              <h1>{activeSectionMeta.title}</h1>
              <p className="admin-status">{activeSectionMeta.description}</p>
            </div>
            <div className="admin-header-actions admin-header-actions-v4">
              <Link href="/user" className="chip-btn ghost">Open Studio <ExternalLink size={16} /></Link>
              <span className="admin-header-avatar">A</span>
            </div>
            </div>
            <div className="admin-live-status" aria-live="polite"><span />{status}</div>
          </div>
          </header>

          {activeSection === "users" ? (
            <div className="admin-user-metrics">
              <article><span className="blue"><Users size={21} /></span><div><small>Accounts</small><strong>{users.length}</strong></div></article>
              <article><span className="violet"><Coins size={21} /></span><div><small>Total credits</small><strong>{formatNumber(totalCreditsAllocated)}</strong></div></article>
              <article><span className="amber"><ShieldCheck size={21} /></span><div><small>Administrators</small><strong>{adminCount}</strong></div></article>
            </div>
          ) : null}

      <section className={`admin-workspace-grid admin-workspace-grid-v4 ${workspaceMode !== "lower" ? "admin-workspace-grid-solo" : "admin-tab-hidden"}`}>
        <div className={activeSection === "users" || activeSection === "credits" ? "admin-primary-stack" : "admin-primary-stack admin-tab-hidden"}>
          <section id="admin-users" className={`admin-card admin-user-console-card admin-user-console-v3 ${activeSection === "users" ? "" : "admin-tab-hidden"}`}>
            <div className="admin-user-toolbar admin-user-toolbar-v3">
              <label className="admin-search-field">
                <Search size={18} />
                <input value={userSearch} onChange={(e) => { setUserSearch(e.target.value); setCurrentPage(1); }} placeholder="Search name, email, or user ID..." />
              </label>
              <label className="admin-toolbar-select">
                <UserCog size={17} />
                <select value={userRoleFilter} onChange={(e) => { setUserRoleFilter(e.target.value as "all" | "user" | "admin"); setCurrentPage(1); }}>
                  <option value="all">All roles</option>
                  <option value="user">Users</option>
                  <option value="admin">Administrators</option>
                </select>
                <ChevronDown size={15} />
              </label>
              <label className="admin-toolbar-select">
                <ArrowDownUp size={17} />
                <select value={userSort} onChange={(e) => { setUserSort(e.target.value as UserSort); setCurrentPage(1); }}>
                  {USER_SORT_OPTIONS.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
                </select>
                <ChevronDown size={15} />
              </label>
            </div>

            <div className={`admin-users-master-detail ${selectedUser ? "" : "detail-closed"}`}>
              <div className="admin-users-table-card">
                <div className="admin-users-table-wrap">
                  <table className="admin-users-table admin-account-table">
                    <thead>
                      <tr>
                        <th className="admin-select-column">
                          <button type="button" className={`admin-table-check ${paginatedUsers.length > 0 && paginatedUsers.every((item) => selectedUserIds.includes(item.id)) ? "active" : ""}`} onClick={toggleVisibleSelection} disabled={!paginatedUsers.length} aria-label="Select current page"><Check size={14} /></button>
                        </th>
                        <th>Account</th>
                        <th>Role</th>
                        <th>Credits</th>
                        <th>Joined</th>
                        <th className="admin-table-action">Action</th>
                      </tr>
                    </thead>
                    <tbody>
                      {paginatedUsers.length === 0 ? (
                        <tr><td colSpan={6} className="admin-users-empty">No matching accounts found.</td></tr>
                      ) : paginatedUsers.map((item) => {
                        const isChecked = selectedUserIds.includes(item.id);
                        const isActive = selectedUser?.id === item.id;
                        return (
                          <tr key={item.id} className={isActive ? "active" : ""}>
                            <td className="admin-select-column"><button type="button" className={`admin-table-check ${isChecked ? "active" : ""}`} onClick={() => toggleUserSelection(item.id)} aria-label={`Select ${item.email}`}><Check size={14} /></button></td>
                            <td>
                              <button type="button" className="admin-account-cell" onClick={() => selectUser(item)}>
                                <span className="admin-user-avatar">{(item.name || item.email).slice(0, 1).toUpperCase()}</span>
                                <span><strong>{item.name}</strong><small>{item.email}</small></span>
                              </button>
                            </td>
                            <td><span className={`admin-role ${item.role}`}>{item.role === "admin" ? "Admin" : "User"}</span></td>
                            <td><strong className="admin-credit-value">{formatNumber(item.credits)}</strong></td>
                            <td><span className="admin-date-value">{formatDateShort(item.createdAt)}</span></td>
                            <td className="admin-table-action"><button type="button" className="admin-detail-button" onClick={() => selectUser(item)}>Details</button></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                </div>

                {selectedUserIds.length ? (
                  <div className="admin-selection-bar">
                    <div><strong>{selectedUserIds.length} selected</strong><span>{formatNumber(selectedCreditsTotal)} credits</span></div>
                    <button type="button" className="admin-primary-button compact" onClick={() => void applyBulkAction("add-default")} disabled={userActionLoading}><Plus size={16} /> Add default</button>
                    <label className="admin-selection-package"><Gift size={16} /><select value={bulkPackageId} onChange={(e) => setBulkPackageId(e.target.value)}>{settings.creditPackages.map((item) => <option key={item.id} value={item.id}>{item.name}</option>)}</select></label>
                    <button type="button" className="admin-secondary-button" onClick={() => void applyBulkAction("set-package")} disabled={userActionLoading || !selectedPackage}>Apply package</button>
                    <details className="admin-bulk-more"><summary aria-label="More bulk actions"><MoreHorizontal size={18} /></summary><div>
                      <button type="button" onClick={() => void applyBulkAction("reset-default")}>Reset default</button>
                      <button type="button" onClick={() => void applyBulkAction("set-zero")}>Set to zero</button>
                      <button type="button" onClick={() => void applyBulkAction("promote-admin")}>Promote to admin</button>
                      <button type="button" onClick={() => void applyBulkAction("demote-user")}>Demote to user</button>
                    </div></details>
                    <button type="button" className="admin-clear-selection" onClick={clearUserSelection}><X size={16} /> Clear</button>
                  </div>
                ) : null}

                <div className="admin-table-footer">
                  <span>{sortedUsers.length} accounts</span>
                  <div>
                    <button type="button" onClick={() => setCurrentPage((page) => Math.max(page - 1, 1))} disabled={visiblePage <= 1} aria-label="Previous page"><ChevronLeft size={17} /></button>
                    <strong>{visiblePage}</strong>
                    <button type="button" onClick={() => setCurrentPage((page) => Math.min(page + 1, pageCount))} disabled={visiblePage >= pageCount} aria-label="Next page"><ChevronRight size={17} /></button>
                  </div>
                </div>
              </div>

              {selectedUser ? (
                <aside className="admin-user-detail admin-user-detail-v3">
                  <div className="admin-detail-title"><strong>Selected account</strong><button type="button" onClick={() => setSelectedUserId("")} aria-label="Close account panel"><X size={18} /></button></div>
                  <div className="admin-user-hero admin-user-hero-v3">
                    <div className="admin-user-avatar large">{(selectedUser.name || selectedUser.email).slice(0, 1).toUpperCase()}</div>
                    <div className="admin-user-identity"><h3>{selectedUser.name}</h3><p>{selectedUser.email}</p><code>ID: {truncateText(selectedUser.id, 30)}</code></div>
                    <span className={`admin-role ${selectedUser.role}`}>{selectedUser.role === "admin" ? "Admin" : "User"}</span>
                  </div>

                  <div className="admin-current-balance"><span><Coins size={20} /></span><div><small>Current balance</small><strong>{formatNumber(selectedUser.credits)} credits</strong></div></div>

                  <form className="admin-credit-adjustment" onSubmit={(event) => { event.preventDefault(); void updateUserCredits(selectedUser.id, adjustedBalance); }}>
                    <div className="admin-section-label"><Coins size={17} /><strong>Adjust credits</strong></div>
                    <div className="admin-credit-mode"><button type="button" className={creditMode === "add" ? "active" : ""} onClick={() => setCreditMode("add")}>Add credits</button><button type="button" className={creditMode === "subtract" ? "active" : ""} onClick={() => setCreditMode("subtract")}>Subtract credits</button></div>
                    <label>Amount<input type="number" min="0" step="0.1" value={creditAdjustment} onChange={(event) => setCreditAdjustment(Number(event.target.value))} /></label>
                    <p>Balance after adjustment: <strong>{formatNumber(adjustedBalance)} credits</strong></p>
                    <button type="submit" className="admin-primary-button full" disabled={userActionLoading}><Coins size={17} /> Confirm adjustment</button>
                    <div className="admin-credit-shortcuts"><button type="button" onClick={() => void updateUserCredits(selectedUser.id, settings.defaultUserCredits)}>Reset default</button><button type="button" onClick={() => void updateUserCredits(selectedUser.id, 0)}>Set to zero</button></div>
                  </form>

                  <details className="admin-detail-disclosure">
                    <summary><span><Gift size={17} /> Service package</span><ChevronDown size={17} /></summary>
                    <div><select value={bulkPackageId} onChange={(event) => setBulkPackageId(event.target.value)}>{settings.creditPackages.map((item) => <option key={item.id} value={item.id}>{item.name} - {formatNumber(item.credits)} credits</option>)}</select><button type="button" className="admin-secondary-button" onClick={() => void applyBulkAction("set-package", [selectedUser.id])} disabled={userActionLoading || !selectedPackage}>Apply package</button></div>
                  </details>
                  <details className="admin-detail-disclosure">
                    <summary><span><ShieldCheck size={17} /> Role and permissions</span><ChevronDown size={17} /></summary>
                    <div><p>Current role: <strong>{selectedUser.role}</strong></p><button type="button" className="admin-secondary-button" onClick={() => void applyBulkAction(selectedUser.role === "admin" ? "demote-user" : "promote-admin", [selectedUser.id])} disabled={userActionLoading}>{selectedUser.role === "admin" ? "Demote to user" : "Promote to admin"}</button></div>
                  </details>
                  <div className="admin-account-meta"><span>Joined</span><strong>{formatDate(selectedUser.createdAt)}</strong></div>
                </aside>
              ) : null}
            </div>
          </section>

          <form id="admin-credits" className={`admin-card admin-credit-console ${activeSection === "credits" ? "" : "admin-tab-hidden"}`} onSubmit={saveSettings}>
            <div className="admin-panel-head">
              <div>
                <p className="admin-kicker">Credit policy</p>
                <h2>Credit Matrix</h2>
                <p className="admin-hint">Manage shared image tiers, dedicated model pricing, video rates, and package distribution from one structured block.</p>
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
                  <label>Image 1K / Seedream Basic 2K<input type="number" value={settings.imageCredits["1k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "1k": Number(e.target.value) } })} /></label>
                  <label>Image 2K / Seedream High 3K<input type="number" value={settings.imageCredits["2k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "2k": Number(e.target.value) } })} /></label>
                  <label>Image 4K / Seedream Ultra 4K<input type="number" value={settings.imageCredits["4k"]} onChange={(e) => setSettings({ ...settings, imageCredits: { ...settings.imageCredits, "4k": Number(e.target.value) } })} /></label>
                  <label>Other Image Edit Extra<input type="number" value={settings.imageEditExtraCost} onChange={(e) => setSettings({ ...settings, imageEditExtraCost: Number(e.target.value) })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Qwen 2.1 image</h3>
                <div className="admin-subgrid">
                  <label>Text to Image 1K<input type="number" min="0" value={settings.qwen21ImageCredits.text1k} onChange={(e) => setSettings({ ...settings, qwen21ImageCredits: { ...settings.qwen21ImageCredits, text1k: Number(e.target.value) } })} /></label>
                  <label>Text to Image 2K<input type="number" min="0" value={settings.qwen21ImageCredits.text2k} onChange={(e) => setSettings({ ...settings, qwen21ImageCredits: { ...settings.qwen21ImageCredits, text2k: Number(e.target.value) } })} /></label>
                  <label>Image to Image 1K<input type="number" min="0" value={settings.qwen21ImageCredits.image1k} onChange={(e) => setSettings({ ...settings, qwen21ImageCredits: { ...settings.qwen21ImageCredits, image1k: Number(e.target.value) } })} /></label>
                  <label>Image to Image 2K<input type="number" min="0" value={settings.qwen21ImageCredits.image2k} onChange={(e) => setSettings({ ...settings, qwen21ImageCredits: { ...settings.qwen21ImageCredits, image2k: Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Seedream 5 Flash image</h3>
                <div className="admin-subgrid">
                  <label>Text to Image 1K<input type="number" min="0" value={settings.seedream5FlashImageCredits.text1k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, text1k: Number(e.target.value) } })} /></label>
                  <label>Text to Image 1.5K<input type="number" min="0" value={settings.seedream5FlashImageCredits.text15k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, text15k: Number(e.target.value) } })} /></label>
                  <label>Text to Image 2K<input type="number" min="0" value={settings.seedream5FlashImageCredits.text2k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, text2k: Number(e.target.value) } })} /></label>
                  <label>Image to Image 1K<input type="number" min="0" value={settings.seedream5FlashImageCredits.image1k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, image1k: Number(e.target.value) } })} /></label>
                  <label>Image to Image 1.5K<input type="number" min="0" value={settings.seedream5FlashImageCredits.image15k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, image15k: Number(e.target.value) } })} /></label>
                  <label>Image to Image 2K<input type="number" min="0" value={settings.seedream5FlashImageCredits.image2k} onChange={(e) => setSettings({ ...settings, seedream5FlashImageCredits: { ...settings.seedream5FlashImageCredits, image2k: Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Video generation</h3>
                <div className="admin-subgrid">
                  <label>Video 480p<input type="number" value={settings.videoCredits["480p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "480p": Number(e.target.value) } })} /></label>
                  <label>Video 720p<input type="number" value={settings.videoCredits["720p"]} onChange={(e) => setSettings({ ...settings, videoCredits: { ...settings.videoCredits, "720p": Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Grok runtime pricing</h3>
                <div className="admin-subgrid admin-subgrid-two">
                  <label>Grok 480p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["480p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "480p": Number(e.target.value) } })} /></label>
                  <label>Grok 720p (credit/sec)<input type="number" step="0.1" value={settings.grokVideoCreditsPerSecond["720p"]} onChange={(e) => setSettings({ ...settings, grokVideoCreditsPerSecond: { ...settings.grokVideoCreditsPerSecond, "720p": Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Seedance 2 video</h3>
                <div className="admin-subgrid">
                  <label>Seedance 480p<input type="number" value={settings.seedanceVideoCredits["480p"]} onChange={(e) => setSettings({ ...settings, seedanceVideoCredits: { ...settings.seedanceVideoCredits, "480p": Number(e.target.value) } })} /></label>
                  <label>Seedance 720p<input type="number" value={settings.seedanceVideoCredits["720p"]} onChange={(e) => setSettings({ ...settings, seedanceVideoCredits: { ...settings.seedanceVideoCredits, "720p": Number(e.target.value) } })} /></label>
                  <label>Seedance 1080p<input type="number" value={settings.seedanceVideoCredits["1080p"]} onChange={(e) => setSettings({ ...settings, seedanceVideoCredits: { ...settings.seedanceVideoCredits, "1080p": Number(e.target.value) } })} /></label>
                  <label>Seedance 4K<input type="number" value={settings.seedanceVideoCredits["4k"]} onChange={(e) => setSettings({ ...settings, seedanceVideoCredits: { ...settings.seedanceVideoCredits, "4k": Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Seedance 2.5 video</h3>
                <div className="admin-subgrid">
                  <label>Seedance 2.5 480p<input type="number" min="0" value={settings.seedance25VideoCredits["480p"]} onChange={(e) => setSettings({ ...settings, seedance25VideoCredits: { ...settings.seedance25VideoCredits, "480p": Number(e.target.value) } })} /></label>
                  <label>Seedance 2.5 720p<input type="number" min="0" value={settings.seedance25VideoCredits["720p"]} onChange={(e) => setSettings({ ...settings, seedance25VideoCredits: { ...settings.seedance25VideoCredits, "720p": Number(e.target.value) } })} /></label>
                  <label>Seedance 2.5 1080p<input type="number" min="0" value={settings.seedance25VideoCredits["1080p"]} onChange={(e) => setSettings({ ...settings, seedance25VideoCredits: { ...settings.seedance25VideoCredits, "1080p": Number(e.target.value) } })} /></label>
                </div>
              </div>

              <div className="admin-form-block">
                <h3>Kling motion control</h3>
                <div className="admin-subgrid admin-subgrid-two">
                  <label>Kling 720p<input type="number" value={settings.klingMotionCredits["720p"]} onChange={(e) => setSettings({ ...settings, klingMotionCredits: { ...settings.klingMotionCredits, "720p": Number(e.target.value) } })} /></label>
                  <label>Kling 1080p<input type="number" value={settings.klingMotionCredits["1080p"]} onChange={(e) => setSettings({ ...settings, klingMotionCredits: { ...settings.klingMotionCredits, "1080p": Number(e.target.value) } })} /></label>
                </div>
              </div>
            </div>

            <div className="admin-subgrid admin-subgrid-two">
              <label>Default User Credits<input type="number" value={settings.defaultUserCredits} onChange={(e) => setSettings({ ...settings, defaultUserCredits: Number(e.target.value) })} /></label>
              <div className="admin-note-box">
                <strong>Policy note</strong>
                <span>Qwen 2.1 and Seedream 5 Flash use dedicated Text/Image rates. Other image models use the shared tier plus the edit surcharge where applicable.</span>
              </div>
            </div>

            <label>Credit Packages (JSON)
              <textarea rows={10} value={packageJson} onChange={(e) => setPackageJson(e.target.value)} placeholder='[{"id":"starter","name":"Starter","credits":500,"priceVnd":49000,"badge":"Khoi dau","active":true}]' />
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
            <div className="admin-user-summary-strip admin-user-summary-strip-v4">
              <article>
                <small>Published templates</small>
                <strong>{publishedTemplateCount}</strong>
              </article>
              <article>
                <small>MeiGen templates</small>
                <strong>{meigenTemplateCount}</strong>
              </article>
              <article>
                <small>Manual prompts</small>
                <strong>{manualTemplateCount}</strong>
              </article>
              <article>
                <small>Latest run</small>
                <strong>{latestImportRun?.status || "idle"}</strong>
              </article>
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
            <div className="admin-user-summary-strip admin-user-summary-strip-v4">
              <article>
                <small>Total templates</small>
                <strong>{templateSnapshot?.templates.length || 0}</strong>
              </article>
              <article>
                <small>Manual prompts</small>
                <strong>{manualTemplateCount}</strong>
              </article>
              <article>
                <small>Featured</small>
                <strong>{featuredTemplateCount}</strong>
              </article>
              <article>
                <small>Source mix</small>
                <strong>{meigenTemplateCount}/{manualTemplateCount}</strong>
              </article>
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

      <section className={activeSection === "payments" || activeSection === "monitoring" || activeSection === "library" ? "admin-lower-grid admin-lower-grid-solo" : "admin-lower-grid admin-tab-hidden"}>
        <section id="admin-payments" className={`admin-card ${activeSection === "payments" ? "" : "admin-tab-hidden"}`}>
          <div className="admin-panel-head">
            <div>
              <p className="admin-kicker">payOS operations</p>
              <h2>Credit Payments</h2>
              <p className="admin-hint">Orders are credited only after a signed webhook or a successful provider reconciliation.</p>
            </div>
            <div className="admin-inline-actions">
              <button type="button" className="chip-btn ghost" disabled={paymentLoading} onClick={() => void runPaymentAction("confirm-webhook")}>Register webhook</button>
              <button type="button" className="chip-btn" disabled={paymentLoading} onClick={() => void runPaymentAction("reconcile")}>Reconcile pending</button>
            </div>
          </div>
          <div className="admin-user-metrics">
            <article><span className="violet"><CreditCard size={21} /></span><div><small>Paid orders</small><strong>{paidPayments.length}</strong></div></article>
            <article><span className="blue"><Coins size={21} /></span><div><small>Revenue</small><strong>{formatNumber(paymentRevenue)}đ</strong></div></article>
            <article><span className="amber"><Clock3 size={21} /></span><div><small>Pending review</small><strong>{pendingPaymentCount}</strong></div></article>
          </div>
          <div className="admin-users-table-wrap">
            <table className="admin-users-table">
              <thead><tr><th>Order</th><th>User</th><th>Package</th><th>Amount</th><th>Status</th><th>Created</th></tr></thead>
              <tbody>
                {payments.length ? payments.map((payment) => <tr key={payment.id}>
                  <td><div className="admin-user-main"><b>#{payment.orderCode}</b><code>{payment.id}</code></div></td>
                  <td><div className="admin-user-main"><b>{payment.userName}</b><span>{payment.userEmail}</span></div></td>
                  <td><div className="admin-user-main"><b>{payment.packageName}</b><span>{formatNumber(payment.credits)} credits</span></div></td>
                  <td>{formatNumber(payment.amountVnd)}đ</td>
                  <td><span className={`admin-role ${payment.status === "PAID" ? "user" : "admin"}`}>{payment.status}</span></td>
                  <td>{formatDate(payment.createdAt)}</td>
                </tr>) : <tr><td colSpan={6} className="admin-users-empty">No payment orders yet.</td></tr>}
              </tbody>
            </table>
          </div>
        </section>
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






