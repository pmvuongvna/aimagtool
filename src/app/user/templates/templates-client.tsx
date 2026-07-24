"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import { TEMPLATE_CATEGORIES, type PromptTemplate, type TemplateCategory, type TemplateMediaType } from "@/lib/template-catalog";
import shellStyles from "../generate.module.css";
import styles from "./templates.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type ProfileResponse = { userId: string; credits: number; user?: { id: string; name: string } | null };

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
  return [item.aspectRatio, item.model].filter(Boolean).join(" Â· ");
}

export default function TemplatesClient() {
  const [mediaType, setMediaType] = useState<TemplateMediaType>("image");
  const [templateCategory, setTemplateCategory] = useState<TemplateCategory>("All");
  const [templates, setTemplates] = useState<PromptTemplate[]>([]);
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
    setLoading(true);

    async function loadTemplates() {
      try {
        const res = await apiFetch(apiPath(`/api/public/templates?mediaType=${mediaType}`));
        const payload = (await res.json()) as { items?: PromptTemplate[] };
        if (!cancelled) {
          setTemplates(payload.items || []);
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
  }, [mediaType]);

  useEffect(() => {
    setTemplateCategory("All");
  }, [mediaType]);

  const filteredTemplates = useMemo(() => {
    return templates.filter((item) => {
      const matchesCategory = templateCategory === "All" || item.category === templateCategory || item.tags.includes(templateCategory);
      const haystack = `${item.title} ${item.prompt} ${item.model} ${item.tags.join(" ")}`.toLowerCase();
      const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
      return matchesCategory && matchesSearch;
    });
  }, [search, templateCategory, templates]);

  async function copyPrompt() {
    if (!selectedTemplate) return;
    try {
      await navigator.clipboard.writeText(selectedTemplate.prompt);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 1400);
    } catch {}
  }

  return (
    <div className={shellStyles.page}>
      <div className={shellStyles.appShell}>
        <aside className={shellStyles.sidebar}>
          <Link href="/" className={shellStyles.logoLink}>
            <span className={shellStyles.logoMark} />
            <span className={shellStyles.logoText}>VizoAI</span>
          </Link>

          <nav className={shellStyles.navMenu}>
            <Link className={shellStyles.navItem} href="/user"><span className={shellStyles.navIcon}>D</span><span className={shellStyles.navText}>Dashboard</span></Link>
            <Link className={shellStyles.navItem} href="/user"><span className={shellStyles.navIcon}>I</span><span className={shellStyles.navText}>Image</span></Link>
            <Link className={shellStyles.navItem} href="/user/video"><span className={shellStyles.navIcon}>V</span><span className={shellStyles.navText}>Video</span></Link>
            <Link className={shellStyles.navItem} href="/user/kling"><span className={shellStyles.navIcon}>K</span><span className={shellStyles.navText}>Kling Motion</span></Link>
            <Link className={`${shellStyles.navItem} ${shellStyles.activeNav}`} href="/user/templates"><span className={shellStyles.navIcon}>T</span><span className={shellStyles.navText}>Templates</span></Link>
            <Link className={shellStyles.navItem} href="/user/history"><span className={shellStyles.navIcon}>H</span><span className={shellStyles.navText}>History</span></Link>
            <Link className={shellStyles.navItem} href="/user#styles"><span className={shellStyles.navIcon}>S</span><span className={shellStyles.navText}>Styles</span></Link>
            <Link className={shellStyles.navItem} href="/admin"><span className={shellStyles.navIcon}>A</span><span className={shellStyles.navText}>Settings</span></Link>
          </nav>

          <div className={shellStyles.sidebarSpacer} />

          <div className={shellStyles.upgradeCard}>
            <h3>Upgrade Pro</h3>
            <p>Unlock more prompt packs, more models, and a gallery that keeps updating from curated sources.</p>
            <button type="button">Upgrade now â†’</button>
          </div>

          <div className={shellStyles.planBox}>
            <div className={shellStyles.planRow}><span>Current plan</span><strong>{activePackage?.badge || "Free"}</strong></div>
            <div className={shellStyles.planRow}><span>Credits left</span><strong>{formatCredits(credits)}</strong></div>
          </div>
        </aside>

        <main className={shellStyles.main}>
          <header className={shellStyles.topbar}>
            <div className={shellStyles.search}>
              <span>ðŸ”</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search templates, tags, models..." />
              <div className={shellStyles.shortcut}>Gallery</div>
            </div>

            <div className={shellStyles.topActions}>
              <div className={shellStyles.creditsPill}>âš¡ {formatCredits(credits)} Credits</div>
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
              <p className={styles.subtitle}>A dedicated inspiration page with masonry cards, tag filters, and a popup preview for prompt plus artwork, similar to MeiGen's browsing flow.</p>
            </div>
            <div className={styles.modeTabs}>
              <button
                type="button"
                className={`${styles.modeTab} ${mediaType === "image" ? styles.modeTabActive : ""}`}
                onClick={() => setMediaType("image")}
              >
                AI Image
              </button>
              <button
                type="button"
                className={`${styles.modeTab} ${mediaType === "video" ? styles.modeTabActive : ""}`}
                onClick={() => setMediaType("video")}
              >
                AI Video
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
                    onClick={() => setTemplateCategory(category)}
                  >
                    {category}
                  </button>
                ))}
              </div>
            </aside>

            <div className={styles.galleryContent}>
              {loading ? (
                <div className={styles.emptyState}>Loading template gallery...</div>
              ) : filteredTemplates.length === 0 ? (
                <div className={styles.emptyState}>No templates matched the current filters.</div>
              ) : (
                <div className={styles.masonry}>
                  {filteredTemplates.map((item) => (
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
              )}
            </div>
          </section>
        </main>
      </div>

      {selectedTemplate ? (
        <div className={styles.modalBackdrop} onClick={() => setSelectedTemplate(null)}>
          <div className={styles.modal} onClick={(e) => e.stopPropagation()}>
            <button type="button" className={styles.modalClose} onClick={() => setSelectedTemplate(null)}>âœ•</button>
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
                  Source: MeiGen{selectedTemplate.aspectRatio ? ` Â· Format ${selectedTemplate.aspectRatio}` : ""}
                </p>
              ) : null}
              <p className={styles.modalPrompt}>{selectedTemplate.prompt}</p>
              {selectedTemplate.tags.length ? (
                <div className={styles.modalTags}>
                  {selectedTemplate.tags.map((tag) => <span key={tag}>{tag}</span>)}
                </div>
              ) : null}
              <div className={styles.modalActions}>
                <button type="button" className={styles.copyBtn} onClick={copyPrompt}>{copied ? "Copied" : "Copy prompt"}</button>
                <Link
                  href={selectedTemplate.mediaType === "image" ? `/user?prompt=${encodeURIComponent(selectedTemplate.prompt)}` : isKlingTemplate(selectedTemplate) ? `/user/kling?prompt=${encodeURIComponent(selectedTemplate.prompt)}` : `/user/video?prompt=${encodeURIComponent(selectedTemplate.prompt)}`}
                  className={styles.useBtn}
                >
                  Open generator
                </Link>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

