"use client";

import Link from "next/link";
import { useEffect, useMemo, useState } from "react";
import { apiFetch, apiPath } from "@/lib/api-url";
import type { Locale } from "@/lib/locale";
import styles from "@/app/page.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string; active?: boolean };

const copy = {
  en: {
    nav: ["Home", "Image", "Video", "AI Tools", "Pricing", "FAQ"],
    login: "Log in",
    eyebrow: "☀ Solar AI power",
    h1a: "Unleash AI power.",
    h1b: "Create",
    h1c: "extraordinary work.",
    hero: "Escanor helps you generate images, videos, audio, and branded content with speed and quality.",
    start: "Start creating ✨",
    explore: "Explore tools ›",
    proof: "100,000+ users\ncreate with Escanor every day",
    quote: ["I do not seek power.", "Power seeks me."],
    toolsTitle: ["AI Image", "AI Video", "AI Tools", "AI Audio"],
    toolsDesc: [
      "Turn prompts into high-quality visuals in seconds.",
      "Create videos from text or images with smooth motion.",
      "Remove background, upscale, subtitle, and more.",
      "Generate music, voice, and sound effects with AI.",
    ],
    toolsCta: ["Create now →", "Create now →", "Explore →", "Create now →"],
    proTitle: "Upgrade to Escanor Pro",
    proDesc: "Unlock advanced generation and higher limits.",
    proBtn: "Upgrade now ⚡",
    workflowTitle: "Create at the speed of sunlight.",
    workflowDesc: "Simple workflow: prompt, style, generate, and refine.",
    steps: ["Write prompt", "Select style", "Export result"],
    stepsDesc: [
      "Use English or Vietnamese prompts with reusable templates.",
      "Pick ratio, quality, and look: realistic, anime, cinematic, 3D.",
      "Download, upscale, share, or continue editing in your library.",
    ],
    pricingTitle: "Plans",
    pricingDesc: "Start free and scale with higher credits and faster queue.",
    pricingBtn: ["Choose plan", "Choose Pro"],
    priceSuffix: "/package",
    features: ["credits", "AI image generation", "AI video generation", "Priority processing", "No watermark"],
    faqTitle: "Frequently asked questions",
    faqDesc: "Quick answers for new users.",
    faqs: [
      ["What is Escanor?", "Escanor is an AI media platform for creating images, videos, and branded assets."],
      ["How do credits work?", "Each generation consumes credits based on model, quality, and duration."],
      ["Can I use outputs commercially?", "Yes, based on your service terms and package policy."],
    ],
    ctaTitle: "Ready to unlock your creative power?",
    ctaDesc: "Start with Escanor today and turn ideas into production-ready visuals in seconds.",
    ctaBtn: "Start free ✨",
  },
  vi: {
    nav: ["Trang chủ", "Tạo ảnh", "Tạo video", "Công cụ AI", "Gói dịch vụ", "FAQ"],
    login: "Đăng nhập",
    eyebrow: "☀ Sức mạnh của mặt trời",
    h1a: "Giải phóng sức mạnh AI.",
    h1b: "Tạo nên",
    h1c: "điều phi thường.",
    hero: "Escanor giúp bạn tạo hình ảnh, video, âm thanh và nội dung thương hiệu bằng AI nhanh chóng, dễ dùng và đầy cảm hứng.",
    start: "Bắt đầu tạo ngay ✨",
    explore: "Xem công cụ AI ›",
    proof: "Hơn 100.000+ người dùng\nđang sáng tạo mỗi ngày",
    quote: ["Ta không truy tìm sức mạnh.", "Sức mạnh sẽ tự tìm đến ta."],
    toolsTitle: ["Tạo ảnh AI", "Tạo video AI", "Công cụ AI", "Âm thanh AI"],
    toolsDesc: [
      "Biến ý tưởng thành hình ảnh chất lượng cao chỉ trong vài giây.",
      "Tạo video từ văn bản hoặc hình ảnh với chuyển động mượt mà.",
      "Xóa nền, nâng cấp ảnh, tạo phụ đề và nhiều công cụ hữu ích.",
      "Tạo nhạc, giọng nói và âm thanh chất lượng studio bằng AI.",
    ],
    toolsCta: ["Tạo ngay →", "Tạo ngay →", "Khám phá →", "Tạo ngay →"],
    proTitle: "Nâng cấp lên Escanor Pro",
    proDesc: "Mở khóa toàn bộ tính năng cao cấp và giới hạn sáng tạo không giới hạn.",
    proBtn: "Nâng cấp ngay ⚡",
    workflowTitle: "Sáng tạo nhanh như ánh mặt trời.",
    workflowDesc: "Một quy trình đơn giản, dễ hiểu: nhập ý tưởng, chọn phong cách, tạo kết quả và tối ưu bằng bộ công cụ AI.",
    steps: ["Nhập mô tả", "Chọn phong cách", "Tải xuống"],
    stepsDesc: [
      "Viết prompt bằng tiếng Việt hoặc dùng mẫu gợi ý có sẵn cho từng ngành.",
      "Tùy chọn tỷ lệ, chất lượng, phong cách ảnh thực, anime, cinematic, 3D hoặc sản phẩm.",
      "Lưu kết quả, upscale, chia sẻ hoặc tiếp tục chỉnh sửa trong thư viện cá nhân.",
    ],
    pricingTitle: "Gói dịch vụ",
    pricingDesc: "Bắt đầu miễn phí, nâng cấp khi bạn cần thêm tín dụng, chất lượng cao hơn và tốc độ xử lý ưu tiên.",
    pricingBtn: ["Chọn gói", "Chọn Pro"],
    priceSuffix: "/gói",
    features: ["tín dụng", "Tạo ảnh AI", "Tạo video AI", "Ưu tiên xử lý", "Không watermark"],
    faqTitle: "Câu hỏi thường gặp",
    faqDesc: "Một vài thông tin cơ bản để người dùng hiểu nhanh cách hoạt động của escanor.app.",
    faqs: [
      ["Escanor dùng để làm gì?", "Escanor là nền tảng tạo ảnh, video, âm thanh và chỉnh sửa nội dung bằng AI cho creator, marketer và doanh nghiệp."],
      ["Tín dụng hoạt động như thế nào?", "Mỗi lần tạo ảnh, video hoặc nâng cấp chất lượng sẽ tiêu tốn một lượng tín dụng nhất định tùy chất lượng và mô hình AI."],
      ["Có thể dùng ảnh tạo ra cho thương mại không?", "Có thể cấu hình theo điều khoản dịch vụ của bạn. Nên ghi rõ quyền sử dụng theo từng gói để tránh nhầm lẫn."],
    ],
    ctaTitle: "Sẵn sàng đánh thức sức mạnh sáng tạo?",
    ctaDesc: "Bắt đầu với escanor.app ngay hôm nay và biến ý tưởng thành hình ảnh, video, âm thanh chuyên nghiệp chỉ trong vài giây.",
    ctaBtn: "Bắt đầu miễn phí ✨",
  },
} as const;

export default function LandingPage({ locale }: { locale: Locale }) {
  const t = copy[locale];
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
        { id: "free", name: "Free", credits: 100, priceVnd: 0, badge: locale === "vi" ? "Dùng thử" : "Trial" },
        { id: "pro", name: "Escanor Pro", credits: 5000, priceVnd: 199000, badge: locale === "vi" ? "Phổ biến" : "Popular" },
        { id: "biz", name: "Business", credits: 20000, priceVnd: 499000, badge: "Team" },
      ];
    }
    return packages;
  }, [packages, locale]);

  const moneyFmt = new Intl.NumberFormat(locale === "vi" ? "vi-VN" : "en-US", {
    style: "currency",
    currency: "VND",
    maximumFractionDigits: 0,
  });

  const swapLocale = locale === "en" ? "vi" : "en";

  return (
    <div className={styles.page} lang={locale}>
      <header className={styles.header}>
        <nav className={`${styles.container} ${styles.nav}`}>
          <a className={styles.brand} href="#home">
            <span className={styles.sunLogo}>☀</span>
            escanor<span className={styles.dot}>.app</span>
          </a>
          <div className={styles.links}>
            <a className={styles.navActive} href="#home">{t.nav[0]}</a>
            <a href="/user">{t.nav[1]}</a>
            <a href="/user/video">{t.nav[2]}</a>
            <a href="#workflow">{t.nav[3]}</a>
            <a href="#pricing">{t.nav[4]}</a>
            <a href="#faq">{t.nav[5]}</a>
          </div>
          <div className={styles.navActions}>
            <Link href={`/${swapLocale}`} className={styles.btn}>{swapLocale.toUpperCase()}</Link>
            <Link href="/login" className={`${styles.btn} ${styles.btnGold}`}>{t.login}</Link>
          </div>
        </nav>
      </header>

      <main id="home">
        <section className={styles.hero}>
          <div className={styles.heroGlow} />
          <div className={styles.container}>
            <div className={styles.heroContent}>
              <div className={styles.eyebrow}>{t.eyebrow}</div>
              <h1>{t.h1a}<br />{t.h1b} <span className={styles.goldText}>{t.h1c}</span></h1>
              <p>{t.hero}</p>
              <div className={styles.heroActions}>
                <Link href="/register" className={`${styles.btn} ${styles.btnGold}`}>{t.start}</Link>
                <Link href="/user" className={styles.btn}>{t.explore}</Link>
              </div>
            </div>
          </div>
          <div className={styles.quote}><b>“</b><br />{t.quote[0]}<br />{t.quote[1]}<br /><span style={{ float: "right", color: "#f8d981" }}>— Escanor ☀</span></div>
        </section>

        <section id="tools" className={`${styles.container} ${styles.toolsWrap}`}>
          <div className={styles.tools}>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🖼</div><h3>{t.toolsTitle[0]}</h3><p>{t.toolsDesc[0]}</p><Link href="/user">{t.toolsCta[0]}</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🎥</div><h3>{t.toolsTitle[1]}</h3><p>{t.toolsDesc[1]}</p><Link href="/user/video">{t.toolsCta[1]}</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🛠</div><h3>{t.toolsTitle[2]}</h3><p>{t.toolsDesc[2]}</p><Link href="/admin">{t.toolsCta[2]}</Link></article>
            <article className={styles.toolCard}><div className={styles.toolIcon}>🎵</div><h3>{t.toolsTitle[3]}</h3><p>{t.toolsDesc[3]}</p><Link href="/user/tools">{t.toolsCta[3]}</Link></article>
          </div>

          <div className={styles.proBanner}>
            <div><div style={{ fontSize: 30 }}>👑</div><strong>{t.proTitle}</strong><br /><span>{t.proDesc}</span></div>
            <button className={`${styles.btn} ${styles.btnGold}`}>{t.proBtn}</button>
          </div>
        </section>

        <section id="workflow" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>{t.workflowTitle}</h2><p>{t.workflowDesc}</p></div>
            <div className={styles.steps}>{[0, 1, 2].map((idx) => <article key={idx} className={styles.stepCard}><div className={styles.stepNum}>{idx + 1}</div><h3>{t.steps[idx]}</h3><p>{t.stepsDesc[idx]}</p></article>)}</div>
          </div>
        </section>

        <section id="pricing" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>{t.pricingTitle}</h2><p>{t.pricingDesc}</p></div>
            <div className={styles.pricing}>
              {pricing.map((item, idx) => (
                <article key={item.id} className={`${styles.priceCard} ${idx === 1 ? styles.priceCardPro : ""}`}>
                  {item.badge ? <span className={styles.popular}>{item.badge}</span> : null}
                  <h3>{item.name}</h3>
                  <div className={styles.price}>{moneyFmt.format(item.priceVnd)}<small>{t.priceSuffix}</small></div>
                  <ul>
                    <li>{item.credits.toLocaleString(locale === "vi" ? "vi-VN" : "en-US")} {t.features[0]}</li>
                    <li>{t.features[1]}</li>
                    <li>{t.features[2]}</li>
                    <li>{t.features[3]}</li>
                    <li>{t.features[4]}</li>
                  </ul>
                  <button className={`${styles.btn} ${idx === 1 ? styles.btnGold : ""}`}>{idx === 1 ? t.pricingBtn[1] : t.pricingBtn[0]}</button>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="faq" className={styles.section}>
          <div className={styles.container}>
            <div className={styles.sectionHead}><h2>{t.faqTitle}</h2><p>{t.faqDesc}</p></div>
            <div className={styles.faq}>{t.faqs.map((faq) => <article key={faq[0]} className={styles.faqItem}><h3>{faq[0]}</h3><p>{faq[1]}</p></article>)}</div>
          </div>
        </section>

        <section className={styles.section}>
          <div className={`${styles.container} ${styles.cta}`}>
            <h2>{t.ctaTitle}</h2>
            <p>{t.ctaDesc}</p>
            <Link href="/register" className={`${styles.btn} ${styles.btnGold}`}>{t.ctaBtn}</Link>
          </div>
        </section>
      </main>
    </div>
  );
}
