"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import shellStyles from "../generate.module.css";
import styles from "./history.module.css";

type HistoryItem = {
  id: string;
  mediaType: "image" | "video";
  urls: string[];
  prompt: string;
  createdAt: string;
};

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type ProfileResponse = { userId: string; credits: number; user?: { id: string; name: string } | null };
type HistoryFilter = "all" | "image" | "video";

function formatCredits(value: number) {
  return Number.isInteger(value)
    ? value.toLocaleString("vi-VN")
    : value.toLocaleString("vi-VN", { minimumFractionDigits: 1, maximumFractionDigits: 1 });
}

function formatTime(value: string) {
  return new Date(value).toLocaleString("vi-VN", {
    day: "2-digit",
    month: "2-digit",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function truncate(value: string, max = 110) {
  const clean = value.trim();
  if (clean.length <= max) return clean;
  return `${clean.slice(0, max - 1)}…`;
}

function isVideoUrl(url: string) {
  return /\.(mp4|webm|mov|m3u8)(\?|$)/i.test(url);
}

export default function HistoryClient() {
  const [items, setItems] = useState<HistoryItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState<HistoryFilter>("all");
  const [search, setSearch] = useState("");
  const [credits, setCredits] = useState(0);
  const [userName, setUserName] = useState("User");
  const [activePackage, setActivePackage] = useState<CreditPackage | null>(null);
  const [lightboxItem, setLightboxItem] = useState<HistoryItem | null>(null);
  const [lightboxIndex, setLightboxIndex] = useState(0);

  useEffect(() => {
    let cancelled = false;

    async function bootstrap() {
      try {
        const [profileRes, packageRes, historyRes] = await Promise.all([
          apiFetch(apiPath("/api/user/profile")),
          apiFetch(apiPath("/api/public/credit-packages")),
          apiFetch(apiPath("/api/user/history")),
        ]);

        if (profileRes.ok) {
          const data = (await profileRes.json()) as ProfileResponse;
          if (!cancelled) {
            setCredits(data.credits || 0);
            setUserName(data.user?.name || "User");
          }
        }

        if (packageRes.ok) {
          const data = (await packageRes.json()) as { packages?: CreditPackage[] };
          if (!cancelled) setActivePackage(data.packages?.[0] || null);
        }

        if (historyRes.ok) {
          const data = (await historyRes.json()) as { items?: HistoryItem[] };
          if (!cancelled) {
            setItems((data.items || []).sort((a, b) => new Date(b.createdAt).getTime() - new Date(a.createdAt).getTime()));
          }
        } else if (!cancelled) {
          setItems([]);
        }
      } catch {
        if (!cancelled) setItems([]);
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    void bootstrap();
    return () => {
      cancelled = true;
    };
  }, []);

  const filteredItems = useMemo(() => {
    return items.filter((item) => {
      const matchesType = filter === "all" || item.mediaType === filter;
      const haystack = `${item.prompt} ${item.mediaType}`.toLowerCase();
      const matchesSearch = !search.trim() || haystack.includes(search.trim().toLowerCase());
      return matchesType && matchesSearch;
    });
  }, [items, filter, search]);

  const imageCount = useMemo(() => items.filter((item) => item.mediaType === "image").reduce((sum, item) => sum + item.urls.length, 0), [items]);
  const videoCount = useMemo(() => items.filter((item) => item.mediaType === "video").reduce((sum, item) => sum + item.urls.length, 0), [items]);

  function openItem(item: HistoryItem, index = 0) {
    setLightboxItem(item);
    setLightboxIndex(index);
  }

  const currentLightboxUrl = lightboxItem?.urls[lightboxIndex] || "";
  const currentLightboxIsVideo = currentLightboxUrl ? isVideoUrl(currentLightboxUrl) : false;

  return (
    <div className={shellStyles.page}>
      <div className={shellStyles.appShell}>
        <aside className={shellStyles.sidebar}>
          <Link href="/" className={shellStyles.logoLink}>
            <span className={shellStyles.logoMark} />
            <span className={shellStyles.logoText}>VizoAI</span>
          </Link>

          <nav className={shellStyles.navMenu}>
            <Link className={shellStyles.navItem} href="/user"><span className={shellStyles.navIcon}>⌂</span><span className={shellStyles.navText}>Dashboard</span></Link>
            <Link className={shellStyles.navItem} href="/user"><span className={shellStyles.navIcon}>▧</span><span className={shellStyles.navText}>Tạo ảnh</span></Link>
            <Link className={shellStyles.navItem} href="/user/video"><span className={shellStyles.navIcon}>▶</span><span className={shellStyles.navText}>Tạo video</span></Link>
            <Link className={shellStyles.navItem} href="/user/templates"><span className={shellStyles.navIcon}>▦</span><span className={shellStyles.navText}>Mẫu có sẵn</span></Link>
            <Link className={`${shellStyles.navItem} ${shellStyles.activeNav}`} href="/user/history"><span className={shellStyles.navIcon}>↺</span><span className={shellStyles.navText}>Lịch sử</span></Link>
            <Link className={shellStyles.navItem} href="/admin"><span className={shellStyles.navIcon}>⚙</span><span className={shellStyles.navText}>Cài đặt</span></Link>
          </nav>

          <div className={shellStyles.sidebarSpacer} />

          <div className={shellStyles.upgradeCard}>
            <h3>Lịch sử 7 ngày</h3>
            <p>Ảnh và video chỉ được giữ trong 7 ngày gần nhất để thư viện gọn, nhẹ và dễ tìm lại nội dung vừa tạo.</p>
            <button type="button">Tự động dọn lịch sử</button>
          </div>

          <div className={shellStyles.planBox}>
            <div className={shellStyles.planRow}><span>Gói hiện tại</span><strong>{activePackage?.badge || "Free"}</strong></div>
            <div className={shellStyles.planRow}><span>Credits còn lại</span><strong>{formatCredits(credits)}</strong></div>
          </div>
        </aside>

        <main className={shellStyles.main}>
          <header className={shellStyles.topbar}>
            <div className={shellStyles.search}>
              <span>🔍</span>
              <input value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Tìm prompt, ảnh, video trong 7 ngày gần nhất..." />
              <div className={shellStyles.shortcut}>7D</div>
            </div>

            <div className={shellStyles.topActions}>
              <div className={shellStyles.creditsPill}>⚡ {formatCredits(credits)} Credits</div>
              <div className={shellStyles.userCard}>
                <div className={shellStyles.avatar} />
                <div>
                  <strong>{userName}</strong>
                  <span>{activePackage?.name || "Free Plan"}</span>
                </div>
              </div>
            </div>
          </header>

          <section className={styles.intro}>
            <div>
              <p className={styles.eyebrow}>Recent media</p>
              <h1>Lịch sử tạo ảnh & video</h1>
              <p className={styles.subtitle}>Hiển thị toàn bộ nội dung user đã tạo trong 7 ngày gần nhất. Sau 7 ngày hệ thống sẽ tự động xóa khỏi lịch sử.</p>
            </div>
            <div className={styles.filterTabs}>
              <button type="button" className={`${styles.filterTab} ${filter === "all" ? styles.filterTabActive : ""}`} onClick={() => setFilter("all")}>Tất cả</button>
              <button type="button" className={`${styles.filterTab} ${filter === "image" ? styles.filterTabActive : ""}`} onClick={() => setFilter("image")}>AI Image</button>
              <button type="button" className={`${styles.filterTab} ${filter === "video" ? styles.filterTabActive : ""}`} onClick={() => setFilter("video")}>AI Video</button>
            </div>
          </section>

          <section className={styles.statsRow}>
            <article className={shellStyles.statCard}><div className={`${shellStyles.statIcon} ${shellStyles.statPurple}`}>🖼</div><div><small>Ảnh 7 ngày</small><h3>{imageCount.toLocaleString("vi-VN")}</h3></div></article>
            <article className={shellStyles.statCard}><div className={`${shellStyles.statIcon} ${shellStyles.statBlue}`}>🎬</div><div><small>Video 7 ngày</small><h3>{videoCount.toLocaleString("vi-VN")}</h3></div></article>
            <article className={shellStyles.statCard}><div className={`${shellStyles.statIcon} ${shellStyles.statOrange}`}>📁</div><div><small>Tổng item</small><h3>{items.length.toLocaleString("vi-VN")}</h3></div></article>
          </section>

          <section className={shellStyles.panel}>
            <div className={shellStyles.panelHead}>
              <h2>Thư viện 7 ngày gần nhất</h2>
              <div className={styles.headerNote}>Mới nhất lên đầu · Thumbnail hiển thị đồng đều</div>
            </div>

            {loading ? (
              <div className={shellStyles.loadingBox}><div className={shellStyles.spinner} /><b>Đang tải lịch sử...</b><p>Hệ thống đang gom ảnh và video gần đây của user.</p></div>
            ) : filteredItems.length === 0 ? (
              <div className={shellStyles.emptyState}>Chưa có nội dung nào trong 7 ngày gần nhất phù hợp với bộ lọc hiện tại.</div>
            ) : (
              <div className={styles.historyGrid}>
                {filteredItems.map((item) => {
                  const thumbUrl = item.urls[0] || "";
                  const isVideo = item.mediaType === "video" || isVideoUrl(thumbUrl);
                  return (
                    <button key={item.id} type="button" className={styles.historyCard} onClick={() => openItem(item)}>
                      <div className={styles.historyThumb}>
                        {isVideo ? <video src={thumbUrl} muted playsInline preload="metadata" /> : <img src={thumbUrl} alt={item.prompt} loading="lazy" />}
                        <span className={styles.typeBadge}>{isVideo ? "VIDEO" : "IMAGE"}</span>
                        {isVideo ? <span className={styles.playBadge}>▶</span> : null}
                      </div>
                      <div className={styles.historyBody}>
                        <strong>{truncate(item.prompt || (isVideo ? "Video đã tạo" : "Ảnh đã tạo"))}</strong>
                        <div className={styles.historyMeta}>
                          <span>{formatTime(item.createdAt)}</span>
                          <span>{item.urls.length} file</span>
                        </div>
                      </div>
                    </button>
                  );
                })}
              </div>
            )}
          </section>
        </main>
      </div>

      {lightboxItem ? (
        <div className={shellStyles.lightbox} onClick={() => setLightboxItem(null)}>
          <button className={shellStyles.lightboxClose} onClick={(e) => { e.stopPropagation(); setLightboxItem(null); }}>✕</button>
          {lightboxItem.urls.length > 1 ? <button className={shellStyles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i - 1 + lightboxItem.urls.length) % lightboxItem.urls.length); }}>‹</button> : null}
          {currentLightboxIsVideo ? (
            <video src={currentLightboxUrl} controls autoPlay className={shellStyles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
          ) : (
            <img src={currentLightboxUrl} alt="history preview" className={shellStyles.lightboxMedia} onClick={(e) => e.stopPropagation()} />
          )}
          {lightboxItem.urls.length > 1 ? <button className={shellStyles.lightboxNav} onClick={(e) => { e.stopPropagation(); setLightboxIndex((i) => (i + 1) % lightboxItem.urls.length); }}>›</button> : null}
        </div>
      ) : null}
    </div>
  );
}
