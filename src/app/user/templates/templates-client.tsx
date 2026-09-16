"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { Coins, Copy, ExternalLink, Image as ImageIcon, Search, Video, X } from "lucide-react";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateCategory, type TemplateMediaType } from "@/lib/template-catalog";
import { StudioNavigation } from "@/components/studio-navigation";
import shellStyles from "../generate.module.css";
import styles from "./templates.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type ProfileResponse = { userId: string; credits: number; user?: { id: string; name: string } | null };
type TemplatesResponse = { items?: PromptTemplate[]; total?: number; page?: number; pageSize?: number; categoryCounts?: Record<string, number> };

function formatCredits(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("en-US")
    : value.toLocaleString("en-US", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function truncate(value: string, max = 120) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}...`;
}

function isKlingTemplate(item: PromptTemplate) {
  return item.model.toLowerCase().includes("kling");
}

function getTemplateCardMeta(item: PromptTemplate) {
  if (item.source === "meigen") return item.model;
  return [item.aspectRatio, item.model].filter(Boolean).join(" - ");
}

export default function TemplatesClient() {
  const [mediaType, setMediaType] = useState<TemplateMediaType>("image");
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("All");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
  const [page, setPage] = useState(1);
  const [totalTemplates, setTotalTemplates] = useState(0);
  const [categoryCounts, setCategoryCounts] = useState<Record<string, number>>({});
  const pageSize = 20;
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [credits, setCredits] = useState(0);
  const [userName, setUserName] = useState("User");
  const [activePackage, setActivePackage] = useState<CreditPackage | null>(null);
  const [selectedTemplate, setSelectedTemplate] = useState<PromptTemplate | null>(null);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    async function bootstrap() {
      try {
        const [profileRes, packageRes] = await Promise.all([
          apiFetch(apiPath("/api/user/profile")),
          apiFetch(apiPath("/api/public/credit-packages")),
        ]);

        if (profileRes.ok) {
          const data = (await profileRes.json()) as ProfileResponse;
          setCredits(data.credits || 0);
          setUserName(data.user?.name || "User");
        }

        if (packageRes.ok) {
          const data = (await packageRes.json()) as { packages?: CreditPackage[] };
          setActivePackage(data.packages?.[0] || null);
        }
      } catch {}
    }

    void bootstrap();
  }, []);

  useEffect(() => {
    let cancelled = false;
    queueMicrotask(() => { if (!cancelled) setLoading(true); });

    async function loadTemplates() {
      try {
        const params = new URLSearchParams({ mediaType, page: String(page), pageSize: String(pageSize) });
        if (templateCategory !== "All") params.set("category", templateCategory);
        if (search.trim()) params.set("q", search.trim());
        const res = await apiFetch(apiPath(`/api/public/templates?${params.toString()}`));
        const payload = (await res.json()) as TemplatesResponse;
        if (!cancelled) {
          setTemplates(payload.items || []);
          setTotalTemplates(payload.total || 0);
          setCategoryCounts(payload.categoryCounts || {});
        }
      } catch {
        if (!cancelled) setTemplates([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void loadTemplates();
    return () => {
      cancelled = true;
    };
  }, [mediaType, page, pageSize, search, templateCategory]);

  const totalPages = Math.max(1, Math.ceil(totalTemplates / pageSize));

  async function copyPrompt() {
    if (!selectedTemplate) return;
    try {
      await navigator.clipboard.writeText(selectedTemplate.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <div className={`${shellStyles.page} ${shellStyles.videoPage}`}>
      <div className={`${shellStyles.appShell} ${shellStyles.videoAppShell}`}>
        <aside className={`${shellStyles.sidebar} ${shellStyles.videoSidebar}`}>
          <Link href="/" className={shellStyles.logoLink}>
            <span className={shellStyles.logoMark} />
            <span className={shellStyles.logoText}>VizoAI</span>
          </Link>

          <StudioNavigation active="templates" />

          <div className={shellStyles.sidebarSpacer} />

          <div className={shellStyles.upgradeCard}>
            <h3>Upgrade Pro</h3>
            <p>Unlock more prompt packs, more models, and a gallery that keeps updating from curated sources.</p>
            <button type="button">Upgrade now {"->"}</button>
          </div>

          <div className={shellStyles.planBox}>
            <div className={shellStyles.planRow}><span>Current plan</span><strong>{activePackage?.badge || "Free"}</strong></div>
            <div className={shellStyles.planRow}><span>Credits left</span><strong>{formatCredits(credits)}</strong></div>
          </div>
        </aside>

        <main className={`${shellStyles.main} ${shellStyles.videoMain}`}>
          <header className={shellStyles.topbar}>
            <div className={shellStyles.search}>
              <Search size={17} aria-hidden="true" />
              <input value={search} onChange={(e) => { setSearch(e.target.value); setPage(1); }} placeholder="Search templates, tags, models..." />
              <div className={shellStyles.shortcut}>Gallery</div>
            </div>

            <div className={shellStyles.topActions}>
              <div className={shellStyles.creditsPill}><Coins size={16} aria-hidden="true" /> {formatCredits(credits)} Credits</div>
              <div className={shellStyles.userCard}>
                <div className={shellStyles.avatar} />
                <div>
                  <strong>{userName}</strong>
                  <span>{activePackage?.name || "Free Plan"}</span>
                </div>
              </div>
            </div>
          </header>

          <section className={styles.pageIntro}>
            <div>
              <p className={styles.eyebrow}>Prompt Gallery</p>
              <h1>Template gallery</h1>
              <p className={styles.subtitle}>A dedicated inspiration page with masonry cards, tag filters, and a popup preview for prompt plus artwork, similar to MeiGen&apos;s browsing flow.</p>
            </div>
            <div className={styles.modeTabs}>
              <button
                type="button"
                className={`${styles.modeTab} ${mediaType === "image" ? styles.modeTabActive : ""}`}
                onClick={() => { setMediaType("image"); setTemplateCategory("All"); setPage(1); }}
              >
                <ImageIcon size={15} /> AI Image
              </button>
              <button
                type="button"
                className={`${styles.modeTab} ${mediaType === "video" ? styles.modeTabActive : ""}`}
                onClick={() => { setMediaType("video"); setTemplateCategory("All"); setPage(1); }}
              >
                <Video size={15} /> AI Video
              </button>
            </div>
          </section>

          <section className={styles.galleryShell}>
            <aside className={styles.sidebar}>
              <span className={styles.sidebarTitle}>Tags</span>
              <div className={styles.tagList}>
                {TEMPLATE_CATEGORIES.map((category) => (
                  <button
                    key={category}
                    type="button"
                    className={`${styles.tagBtn} ${templateCategory === category ? styles.tagBtnActive : ""}`}
                    onClick={() => { setTemplateCategory(category); setPage(1); }}
                  >
                    {category} <span className={styles.tagCount}>{category === "All" ? (categoryCounts.All || 0) : (categoryCounts[category] || 0)}</span>
                  </button>
                ))}
              </div>
            </aside>

            <div className={styles.galleryContent}>
              {loading ? (
                <div className={styles.emptyState}>Loading template gallery...</div>
              ) : templates.length === 0 ? (
                <div className={styles.emptyState}>No templates matched the current filters.</div>
              ) : (
                <>
                <div className={styles.masonry}>
                  {templates.map((item) => (
                    <button key={item.id} type="button" className={styles.card} onClick={() => setSelectedTemplate(item)}>
                      <img className={styles.cardImage} src={item.thumbnailUrl} alt={item.title} loading="lazy" />
                      <div className={styles.cardOverlay}>
                        <div className={styles.cardMeta}>{getTemplateCardMeta(item)}</div>
                        <strong>{item.title}</strong>
                        <p>{truncate(item.prompt)}</p>
                      </div>
                    </button>
                  ))}
                </div>
                <div className={styles.galleryFooter}>
                  <span>{totalTemplates.toLocaleString("en-US")} templates · Page {Math.min(page, totalPages)} of {totalPages}</span>
                  <div className={styles.pagination}>
                    <button type="button" className={styles.pageBtn} disabled={page <= 1} onClick={() => setPage((current) => Math.max(1, current - 1))}>Previous</button>
                    <span className={styles.pageInfo}>{page} / {totalPages}</span>
                    <button type="button" className={styles.pageBtn} disabled={page >= totalPages} onClick={() => setPage((current) => Math.min(totalPages, current + 1))}>Next</button>
                  </div>
                </div>
                </>
              )}
            </div>
          </section>
        </main>
      </div>

      {selectedTemplate ? (
        <div className={styles.modalBackdrop} onClick={() => setSelectedTemplate(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setSelectedTemplate(null)} aria-label="Close preview"><X size={18} /></button>
            <div className={styles.modalMedia}>
              <img src={selectedTemplate.thumbnailUrl} alt={selectedTemplate.title} />
            </div>
            <div className={styles.modalBody}>
              <div className={styles.modalTopline}>
                <span>{selectedTemplate.source === "meigen" ? "MeiGen" : selectedTemplate.category}</span>
                {selectedTemplate.source !== "meigen" && selectedTemplate.aspectRatio ? <span>{selectedTemplate.aspectRatio}</span> : null}
              </div>
              <h2>{selectedTemplate.title}</h2>
              <div className={styles.modalInfo}>
                <span>{selectedTemplate.model}</span>
                {selectedTemplate.source !== "meigen" ? <span>{selectedTemplate.mediaType === "image" ? "AI Image" : "AI Video"}</span> : null}
              </div>
              {selectedTemplate.source === "meigen" ? (
                <p className={styles.modalMetaText}>
                  Source: MeiGen{selectedTemplate.aspectRatio ? ` - Format ${selectedTemplate.aspectRatio}` : ""}
                </p>
              ) : null}
              <p className={styles.modalPrompt}>{selectedTemplate.prompt}</p>
              {selectedTemplate.tags.length ? (
                <div className={styles.modalTags}>
                  {selectedTemplate.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.copyBtn} onClick={copyPrompt}><Copy size={16} /> {copied ? "Copied" : "Copy prompt"}</button>
                <Link
                  href={selectedTemplate.mediaType === "image" ? `/user?prompt=${encodeURIComponent(selectedTemplate.prompt)}` : isKlingTemplate(selectedTemplate) ? `/user/kling?prompt=${encodeURIComponent(selectedTemplate.prompt)}` : `/user/video?prompt=${encodeURIComponent(selectedTemplate.prompt)}`}
                  className={styles.useBtn}
                >
                  <ExternalLink size={16} /> Open generator
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
