"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useState } from "react";
import styles from "./page.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };

const categoryTabs = ["Tất cả", "Ảnh AI", "Video AI", "Nghệ thuật", "Chân dung", "Phong cảnh", "Kiến trúc", "Sản phẩm"];

export default function HomePage() {
  const router = useRouter();
  const [activeTab, setActiveTab] = useState("Tất cả");
  const [prompt, setPrompt] = useState("");
  const [generating, setGenerating] = useState(false);
  const [packages, setPackages] = useState<CreditPackage[]>([]);

  useEffect(() => {
    async function loadPackages() {
      const res = await fetch("/api/public/credit-packages");
      if (!res.ok) return;
      const payload = (await res.json()) as { packages?: CreditPackage[] };
      setPackages(payload.packages || []);
    }
    void loadPackages();
  }, []);

  function handleGenerate() {
    if (!prompt.trim()) return;
    setGenerating(true);
    setTimeout(() => {
      setGenerating(false);
      router.push(`/user?prompt=${encodeURIComponent(prompt.trim())}`);
    }, 650);
  }

  return (
    <div className={styles.page}>
      <header className={styles.navbar}>
        <div className={styles.container}>
          <div className={styles.navInner}>
            <a href="#home" className={styles.brand}><span className={styles.logo} />AIStudio</a>
            <nav className={styles.navLinks}>
              <a href="#home">Trang chủ</a><a href="#tools">Tạo ảnh</a><a href="#tools">Tạo video</a><a href="#pricing">Gói dịch vụ</a>
            </nav>
            <div className={styles.navActions}>
              <Link href="/login" className={styles.outlineBtn}>Đăng nhập</Link>
              <Link href="/register" className={`${styles.primaryBtn} ${styles.smallPrimary}`}>Đăng ký</Link>
            </div>
          </div>
        </div>
      </header>

      <main id="home">
        <section className={`${styles.container} ${styles.hero}`}>
          <div>
            <div className={styles.badge}>✦ Sức mạnh AI — Sáng tạo không giới hạn</div>
            <h1>Tạo ảnh & video bằng AI <span className={styles.gradientText}>nhanh, đẹp, chuyên nghiệp</span></h1>
            <p>Biến ý tưởng thành nội dung chất lượng cao chỉ trong vài giây.</p>
            <div className={styles.heroActions}>
              <Link href="/register" className={styles.primaryBtn}>Bắt đầu tạo ngay ✨</Link>
              <Link href="/user" className={styles.ghostBtn}>Khám phá công cụ</Link>
            </div>
            <div className={styles.trustRow}><span>⚡ Không cần kỹ năng</span><span>⏱ Tiết kiệm thời gian</span><span>💎 Chất lượng cao</span><span>🔒 Bảo mật dữ liệu</span></div>
          </div>

          <div className={styles.mediaBoard}>
            <div className={styles.mediaGrid}>
              <div className={styles.mediaCard}><img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=900&q=80" alt="AI Image Preview" /><span className={styles.mediaLabel}>AI Image</span></div>
              <div className={styles.mediaCard}><img src="https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=900&q=80" alt="AI Video Preview" /><span className={styles.mediaLabel}>AI Video</span><button className={styles.playBtn} aria-label="Play video">▶</button><span className={styles.videoControls} /></div>
            </div>
            <div className={styles.promptBox}><input type="text" placeholder="✦ Mô tả ý tưởng của bạn..." value={prompt} onChange={(e) => setPrompt(e.target.value)} /><button className={styles.primaryBtn} onClick={handleGenerate}>{generating ? "✨ Đang tạo..." : "🚀 Tạo ngay"}</button></div>
          </div>
        </section>

        <section id="tools" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionTitle}><h2>Công cụ nổi bật</h2><p>Tạo ảnh, video và chỉnh sửa nội dung AI trong một nơi.</p></div>
            <div className={styles.tools}>
              <article className={styles.toolCard}><div className={styles.toolIcon}>🖼</div><div><b>Tạo ảnh AI</b><span>Text/Image to Image.</span></div></article>
              <article className={styles.toolCard}><div className={styles.toolIcon}>▶</div><div><b>Tạo video AI</b><span>Text/Image to Video.</span></div></article>
              <article className={styles.toolCard}><div className={styles.toolIcon}>🪄</div><div><b>Chỉnh sửa ảnh</b><span>Nâng cấp, thay đổi phong cách.</span></div></article>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionTitle}><h2>Khám phá cảm hứng cộng đồng</h2></div>
            <div className={styles.tabs}>{categoryTabs.map((tab) => <button key={tab} className={`${styles.tab} ${activeTab === tab ? styles.active : ""}`} onClick={() => setActiveTab(tab)}>{tab}</button>)}</div>
            <div className={styles.gallery}>
              <article className={`${styles.galleryCard} ${styles.tall}`}><img src="https://images.unsplash.com/photo-1496440737103-cd596325d314?auto=format&fit=crop&w=700&q=80" alt="Fantasy Castle" /><div className={styles.galleryCaption}><b>Lâu đài huyền ảo</b><span>Phong cảnh AI</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1517841905240-472988babdf9?auto=format&fit=crop&w=700&q=80" alt="Portrait" /><div className={styles.galleryCaption}><b>Chân dung điện ảnh</b><span>Portrait AI</span></div></article>
              <article className={`${styles.galleryCard} ${styles.tall}`}><img src="https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=700&q=80" alt="Cyber city" /><div className={styles.galleryCaption}><b>Thành phố tương lai</b><span>Video AI</span></div></article>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionTitle}><h2>Gói credit</h2><p>Có thể cấu hình trong trang Admin và áp dụng ngay toàn hệ thống.</p></div>
            <div className={styles.steps}>
              {packages.map((item) => (
                <article key={item.id} className={styles.stepCard}>
                  <div className={styles.stepNumber}>{item.badge || "Gói"}</div>
                  <h3>{item.name}</h3>
                  <p>{item.credits.toLocaleString("vi-VN")} credits</p>
                  <p><b>{item.priceVnd.toLocaleString("vi-VN")}đ</b></p>
                </article>
              ))}
            </div>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}><div className={styles.footerInner}><div className={styles.footerBrand}><span className={styles.logo} />AIStudio</div><div>© 2026 AIStudio. All rights reserved.</div></div></div>
      </footer>
    </div>
  );
}
