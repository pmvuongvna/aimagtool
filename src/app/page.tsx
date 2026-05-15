"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import styles from "./page.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string; active?: boolean };

export default function HomePage() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);

  useEffect(() => {
    async function loadPackages() {
      const res = await apiFetch(apiPath("/api/public/credit-packages"));
      if (!res.ok) return;
      const payload = (await res.json()) as { packages?: CreditPackage[] };
      setPackages(payload.packages || []);
    }
    void loadPackages();
  }, []);

  const pricing = useMemo(() => {
    if (packages.length === 0) {
      return [
        { id: "free", name: "Free", credits: 100, priceVnd: 0, badge: "Dùng thử" },
        { id: "pro", name: "Escanor Pro", credits: 5000, priceVnd: 199000, badge: "Phổ biến" },
        { id: "biz", name: "Business", credits: 20000, priceVnd: 499000, badge: "Team" },
      ];
    }
    return packages;
  }, [packages]);

  return (
    <div className={styles.page}>
      <header className={styles.header}>
        <nav className={`${styles.container} ${styles.nav}`}>
          <a className={styles.brand} href="#home">
            <span className={styles.sunLogo}>☀</span>
            escanor<span className={styles.dot}>.app</span>
          </a>

          <div className={styles.links}>
            <a className={styles.navActive} href="#home">Trang chủ</a>
            <a href="/user">Tạo ảnh</a>
            <a href="/user/video">Tạo video</a>
            <a href="#workflow">Công cụ AI</a>
            <a href="#pricing">Gói dịch vụ</a>
            <a href="#faq">FAQ</a>
          </div>

          <div className={styles.navActions}>
            <div className={styles.credit}>⚡ 12,450</div>
            <div className={styles.sunToggle}>☀</div>
            <Link href="/login" className={`${styles.btn} ${styles.btnGold}`}>Đăng nhập</Link>
          </div>
        </nav>
      </header>

      <main id="home">
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <div className={styles.eyebrow}>☀ Sức mạnh của mặt trời</div>
              <h1>
                Giải phóng sức mạnh AI.<br />
                Tạo nên <span className={styles.goldText}>điều phi thường.</span>
              </h1>
              <p>Escanor giúp bạn tạo hình ảnh, video, âm thanh và nội dung thương hiệu bằng AI nhanh chóng, dễ dùng và đầy cảm hứng.</p>
              <div className={styles.heroActions}>
                <Link href="/register" className={`${styles.btn} ${styles.btnGold}`}>Bắt đầu tạo ngay ✨</Link>
                <Link href="/user" className={styles.btn}>Xem công cụ AI ›</Link>
              </div>

              <div className={styles.socialProof}>
                <div className={styles.faces}><div className={styles.face} /><div className={styles.face} /><div className={styles.face} /><div className={styles.face} /></div>
                <span>Hơn 100.000+ người dùng<br />đang sáng tạo mỗi ngày</span>
              </div>
            </div>
          </div>

          <div className={styles.quote}>
            <b>“</b><br />
            Ta không truy tìm sức mạnh.<br />
            Sức mạnh sẽ tự tìm đến ta.<br />
            <span style={{ float: "right", color: "#f8d981" }}>— Escanor ☀</span>
          </div>
        </section>

        <section id="tools" className={`${styles.container} ${styles.toolsWrap}`}>
          <div className={styles.tools}>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🖼</div><h3>Tạo ảnh AI</h3><p>Biến ý tưởng thành hình ảnh chất lượng cao chỉ trong vài giây.</p><Link href="/user">Tạo ngay →</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🎥</div><h3>Tạo video AI</h3><p>Tạo video từ văn bản hoặc hình ảnh với chuyển động mượt mà.</p><Link href="/user/video">Tạo ngay →</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🛠</div><h3>Công cụ AI</h3><p>Xóa nền, nâng cấp ảnh, tạo phụ đề và nhiều công cụ hữu ích.</p><Link href="/admin">Khám phá →</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🎵</div><h3>Âm thanh AI</h3><p>Tạo nhạc, giọng nói và âm thanh chất lượng studio bằng AI.</p><Link href="/user/tools">Tạo ngay →</Link></article>
          </div>

          <div className={styles.proBanner}>
            <div>
              <div style={{ fontSize: 30 }}>👑</div>
              <strong>Nâng cấp lên <b>Escanor Pro</b></strong><br />
              <span>Mở khóa toàn bộ tính năng cao cấp và giới hạn sáng tạo không giới hạn.</span>
            </div>
            <button className={`${styles.btn} ${styles.btnGold}`}>Nâng cấp ngay ⚡</button>
          </div>
        </section>

        <section id="workflow" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}>
              <h2>Sáng tạo nhanh như ánh mặt trời.</h2>
              <p>Một quy trình đơn giản, dễ hiểu: nhập ý tưởng, chọn phong cách, tạo kết quả và tối ưu bằng bộ công cụ AI.</p>
            </div>

            <div className={styles.steps}>
              <article className={styles.stepCard}><div className={styles.stepNum}>1</div><h3>Nhập mô tả</h3><p>Viết prompt bằng tiếng Việt hoặc dùng mẫu gợi ý có sẵn cho từng ngành.</p></article>
              <article className={styles.stepCard}><div className={styles.stepNum}>2</div><h3>Chọn phong cách</h3><p>Tùy chọn tỷ lệ, chất lượng, phong cách ảnh thực, anime, cinematic, 3D hoặc sản phẩm.</p></article>
              <article className={styles.stepCard}><div className={styles.stepNum}>3</div><h3>Tải xuống</h3><p>Lưu kết quả, upscale, chia sẻ hoặc tiếp tục chỉnh sửa trong thư viện cá nhân.</p></article>
            </div>
          </div>
        </section>

        <section id="gallery" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>Cảm hứng từ cộng đồng</h2><p>Những tác phẩm nổi bật được tạo ra bởi cộng đồng Escanor.</p></div>

            <div className={styles.gallery}>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1500534314209-a25ddb2bd429?auto=format&fit=crop&w=600&q=85" alt="Landscape" /><div className={styles.galleryCaption}><b>Hoàng hôn trên núi</b><span>AI Image</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1518709268805-4e9042af2176?auto=format&fit=crop&w=600&q=85" alt="Castle" /><div className={styles.galleryCaption}><b>Lâu đài ánh sáng</b><span>Fantasy</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1519608487953-e999c86e7455?auto=format&fit=crop&w=600&q=85" alt="City" /><div className={styles.galleryCaption}><b>Thành phố neon</b><span>AI Video</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1496440737103-cd596325d314?auto=format&fit=crop&w=600&q=85" alt="Portrait" /><div className={styles.galleryCaption}><b>Chân dung nghệ thuật</b><span>Portrait</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1446776811953-b23d57bd21aa?auto=format&fit=crop&w=600&q=85" alt="Astronaut" /><div className={styles.galleryCaption}><b>Phi hành gia</b><span>Sci-fi</span></div></article>
              <article className={styles.galleryCard}><img src="https://images.unsplash.com/photo-1518837695005-2083093ee35b?auto=format&fit=crop&w=600&q=85" alt="Ocean" /><div className={styles.galleryCaption}><b>Cây mặt trời</b><span>Concept Art</span></div></article>
            </div>
          </div>
        </section>

        <section id="pricing" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>Gói dịch vụ</h2><p>Bắt đầu miễn phí, nâng cấp khi bạn cần thêm tín dụng, chất lượng cao hơn và tốc độ xử lý ưu tiên.</p></div>

            <div className={styles.pricing}>
              {pricing.map((item, idx) => (
                <article key={item.id} className={`${styles.priceCard} ${idx === 1 ? styles.priceCardPro : ""}`}>
                  {item.badge ? <span className={styles.popular}>{item.badge}</span> : null}
                  <h3>{item.name}</h3>
                  <p>{idx === 0 ? "Dành cho người mới trải nghiệm công cụ." : idx === 1 ? "Phù hợp creator, shop online và marketer." : "Dành cho đội nhóm sản xuất nội dung số lượng lớn."}</p>
                  <div className={styles.price}>{item.priceVnd.toLocaleString("vi-VN")}đ<small>/gói</small></div>
                  <ul>
                    <li>{item.credits.toLocaleString("vi-VN")} tín dụng</li>
                    <li>Tạo ảnh AI đa tỉ lệ</li>
                    <li>Tạo video AI chất lượng cao</li>
                    <li>Ưu tiên xử lý nhanh</li>
                    <li>Không watermark</li>
                  </ul>
                  <button className={`${styles.btn} ${idx === 1 ? styles.btnGold : ""}`}>{idx === 1 ? "Chọn Pro" : "Chọn gói"}</button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>Câu hỏi thường gặp</h2><p>Một vài thông tin cơ bản để người dùng hiểu nhanh cách hoạt động của escanor.app.</p></div>
            <div className={styles.faq}>
              <article className={styles.faqItem}><h3>Escanor dùng để làm gì?</h3><p>Escanor là nền tảng tạo ảnh, video, âm thanh và chỉnh sửa nội dung bằng AI cho creator, marketer và doanh nghiệp.</p></article>
              <article className={styles.faqItem}><h3>Tín dụng hoạt động như thế nào?</h3><p>Mỗi lần tạo ảnh, video hoặc nâng cấp chất lượng sẽ tiêu tốn một lượng tín dụng nhất định tùy chất lượng và mô hình AI.</p></article>
              <article className={styles.faqItem}><h3>Có thể dùng ảnh tạo ra cho thương mại không?</h3><p>Có thể cấu hình theo điều khoản dịch vụ của anh. Nên ghi rõ quyền sử dụng theo từng gói để tránh nhầm lẫn.</p></article>
            </div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.container} ${styles.cta}`}>
            <h2>Sẵn sàng đánh thức sức mạnh sáng tạo?</h2>
            <p>Bắt đầu với escanor.app ngay hôm nay và biến ý tưởng thành hình ảnh, video, âm thanh chuyên nghiệp chỉ trong vài giây.</p>
            <Link href="/register" className={`${styles.btn} ${styles.btnGold}`}>Bắt đầu miễn phí ✨</Link>
          </div>
        </section>
      </main>

      <footer className={styles.footer}>
        <div className={styles.container}>
          <div className={styles.footerGrid}>
            <div>
              <a className={styles.brand} href="#home"><span className={styles.sunLogo}>☀</span>escanor<span className={styles.dot}>.app</span></a>
              <p>Nền tảng sáng tạo nội dung bằng AI lấy cảm hứng từ sức mạnh mặt trời: mạnh mẽ, rực rỡ và khác biệt.</p>
            </div>
            <div><h4>Sản phẩm</h4><a href="/user">Tạo ảnh AI</a><a href="/user/video">Tạo video AI</a><a href="/user/tools">Âm thanh AI</a><a href="/admin">Công cụ chỉnh sửa</a></div>
            <div><h4>Tài nguyên</h4><a href="#">Blog</a><a href="#">Hướng dẫn prompt</a><a href="#">Cộng đồng</a><a href="#">API Docs</a></div>
            <div><h4>Công ty</h4><a href="#">Về chúng tôi</a><a href="#pricing">Bảng giá</a><a href="#">Liên hệ</a><a href="#">Tuyển dụng</a></div>
            <div><h4>Pháp lý</h4><a href="#">Điều khoản</a><a href="#">Chính sách bảo mật</a><a href="#">Cookie</a><a href="#">Bản quyền</a></div>
          </div>
          <div className={styles.footerBottom}><span>© 2026 escanor.app. All rights reserved.</span><span>Made with ☀ for creators.</span></div>
        </div>
      </footer>
    </div>
  );
}




