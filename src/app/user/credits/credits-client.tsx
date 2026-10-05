"use client";

import Link from "next/link";
import { useCallback, useEffect, useMemo, useState } from "react";
import { ArrowRight, Check, CircleAlert, Clock3, Coins, CreditCard, ExternalLink, History, LoaderCircle, ReceiptText, ShieldCheck } from "lucide-react";
import { StudioNavigation } from "@/components/studio-navigation";
import { apiFetch, apiPath } from "@/lib/api-url";
import shellStyles from "../generate.module.css";
import styles from "./credits.module.css";

type CreditPackage = { id: string; name: string; credits: number; priceVnd: number; badge?: string };
type PaymentOrder = {
  id: string;
  orderCode: number;
  packageName: string;
  credits: number;
  amountVnd: number;
  status: string;
  checkoutUrl: string;
  expiresAt: string | null;
  paidAt: string | null;
  createdAt: string;
};
type LedgerEntry = { id: string; delta: number; balanceAfter: number; reason: string; createdAt: string };
type Profile = { credits: number; user?: { name?: string } };

const money = new Intl.NumberFormat("vi-VN", { style: "currency", currency: "VND", maximumFractionDigits: 0 });

function formatDate(value: string) {
  return new Date(value).toLocaleString("vi-VN", { day: "2-digit", month: "2-digit", year: "numeric", hour: "2-digit", minute: "2-digit" });
}

function statusLabel(status: string) {
  const labels: Record<string, string> = {
    PENDING: "Chờ thanh toán",
    PAID: "Đã thanh toán",
    CANCELLED: "Đã hủy",
    EXPIRED: "Hết hạn",
    FAILED: "Thất bại",
    MANUAL_REVIEW: "Cần đối soát",
    REFUNDED: "Đã hoàn tiền",
  };
  return labels[status] || status;
}

function ledgerLabel(reason: string) {
  const labels: Record<string, string> = {
    credit_purchase: "Mua credit",
    generation_charge: "Tạo nội dung AI",
    generation_refund: "Hoàn credit tác vụ lỗi",
    admin_adjustment: "Điều chỉnh bởi quản trị viên",
    signup_bonus: "Credit dùng thử",
  };
  return labels[reason] || reason;
}

export default function CreditsClient() {
  const [packages, setPackages] = useState<CreditPackage[]>([]);
  const [orders, setOrders] = useState<PaymentOrder[]>([]);
  const [transactions, setTransactions] = useState<LedgerEntry[]>([]);
  const [credits, setCredits] = useState(0);
  const [userName, setUserName] = useState("User");
  const [loading, setLoading] = useState(true);
  const [buyingId, setBuyingId] = useState("");
  const [notice, setNotice] = useState<{ tone: "info" | "success" | "error"; text: string } | null>(null);

  const loadData = useCallback(async () => {
    const [profileRes, packageRes, orderRes, ledgerRes] = await Promise.all([
      apiFetch(apiPath("/api/user/profile"), { cache: "no-store" }),
      apiFetch(apiPath("/api/public/credit-packages"), { cache: "no-store" }),
      apiFetch(apiPath("/api/payments/orders"), { cache: "no-store" }),
      apiFetch(apiPath("/api/user/credit-transactions"), { cache: "no-store" }),
    ]);
    if (profileRes.ok) {
      const data = (await profileRes.json()) as Profile;
      setCredits(Number(data.credits || 0));
      setUserName(data.user?.name || "User");
    }
    if (packageRes.ok) setPackages(((await packageRes.json()) as { packages?: CreditPackage[] }).packages || []);
    if (orderRes.ok) setOrders(((await orderRes.json()) as { orders?: PaymentOrder[] }).orders || []);
    if (ledgerRes.ok) setTransactions(((await ledgerRes.json()) as { transactions?: LedgerEntry[] }).transactions || []);
  }, []);

  useEffect(() => {
    let cancelled = false;
    async function bootstrap() {
      try {
        await loadData();
        if (cancelled) return;
        const params = new URLSearchParams(window.location.search);
        const orderCode = params.get("orderCode");
        const paymentState = params.get("payment");
        if (paymentState === "cancel") setNotice({ tone: "info", text: "Anh đã hủy thanh toán. Đơn chưa được cộng credit." });
        if (orderCode) {
          setNotice({ tone: "info", text: "Đang xác nhận giao dịch với payOS..." });
          for (let attempt = 0; attempt < 8 && !cancelled; attempt += 1) {
            const response = await apiFetch(apiPath(`/api/payments/orders/${encodeURIComponent(orderCode)}`), { cache: "no-store" });
            const payload = (await response.json().catch(() => ({}))) as { order?: PaymentOrder; error?: string };
            if (response.ok && payload.order?.status === "PAID") {
              await loadData();
              if (!cancelled) setNotice({ tone: "success", text: `${payload.order.credits.toLocaleString("vi-VN")} credit đã được cộng vào tài khoản.` });
              break;
            }
            if (response.ok && payload.order && ["CANCELLED", "EXPIRED", "FAILED", "MANUAL_REVIEW"].includes(payload.order.status)) {
              setNotice({ tone: payload.order.status === "MANUAL_REVIEW" ? "info" : "error", text: payload.order.status === "MANUAL_REVIEW" ? "Giao dịch đang được đối soát. Credit sẽ được cộng ngay khi số tiền được xác nhận." : `Đơn hàng ${statusLabel(payload.order.status).toLowerCase()}.` });
              break;
            }
            await new Promise((resolve) => setTimeout(resolve, 2000));
          }
        }
      } catch {
        if (!cancelled) setNotice({ tone: "error", text: "Không thể tải dữ liệu thanh toán lúc này." });
      } finally {
        if (!cancelled) setLoading(false);
      }
    }
    void bootstrap();
    return () => { cancelled = true; };
  }, [loadData]);

  async function buyPackage(item: CreditPackage) {
    setBuyingId(item.id);
    setNotice(null);
    try {
      const response = await apiFetch(apiPath("/api/payments/orders"), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ packageId: item.id }),
      });
      const payload = (await response.json().catch(() => ({}))) as { order?: PaymentOrder; error?: string };
      if (!response.ok || !payload.order?.checkoutUrl) throw new Error(payload.error || "Không thể tạo đơn thanh toán.");
      window.location.assign(payload.order.checkoutUrl);
    } catch (error) {
      setNotice({ tone: "error", text: error instanceof Error ? error.message : "Không thể tạo đơn thanh toán." });
      setBuyingId("");
    }
  }

  const paidTotal = useMemo(() => orders.filter((item) => item.status === "PAID").reduce((sum, item) => sum + item.amountVnd, 0), [orders]);

  return (
    <div className={`${shellStyles.page} ${shellStyles.videoPage} ${styles.creditsPage}`}>
      <div className={`${shellStyles.appShell} ${shellStyles.videoAppShell}`}>
        <aside className={`${shellStyles.sidebar} ${shellStyles.videoSidebar}`}>
          <Link href="/" className={shellStyles.logoLink}><span className={shellStyles.logoMark} /><span className={shellStyles.logoText}>VizoAI</span></Link>
          <StudioNavigation active="credits" />
          <div className={shellStyles.sidebarSpacer} />
          <div className={styles.sidebarBalance}>
            <span>Số dư khả dụng</span>
            <strong><Coins size={18} /> {credits.toLocaleString("vi-VN")}</strong>
            <small>Credit mua một lần, không tự gia hạn.</small>
          </div>
          <div className={shellStyles.planBox}>
            <div className={shellStyles.planRow}><span>Tài khoản</span><strong>{userName}</strong></div>
            <div className={shellStyles.planRow}><span>Đã nạp</span><strong>{money.format(paidTotal)}</strong></div>
          </div>
        </aside>

        <main className={`${shellStyles.main} ${shellStyles.videoMain} ${styles.main}`}>
          <header className={styles.topbar}>
            <div><p>Credit wallet</p><h1>Nạp credit</h1><span>Chọn gói, thanh toán qua VietQR và nhận credit ngay sau khi payOS xác nhận.</span></div>
            <div className={styles.balancePill}><Coins size={18} /><span>Số dư</span><strong>{credits.toLocaleString("vi-VN")}</strong></div>
          </header>

          {notice ? <div className={`${styles.notice} ${styles[notice.tone]}`}>{notice.tone === "success" ? <Check size={18} /> : notice.tone === "error" ? <CircleAlert size={18} /> : <LoaderCircle size={18} />}{notice.text}</div> : null}

          <section className={styles.packageSection}>
            <div className={styles.sectionHead}><div><h2>Chọn gói credit</h2><p>Thanh toán một lần, không subscription và không phát sinh gia hạn.</p></div><span><ShieldCheck size={16} /> Xác nhận tự động bởi payOS</span></div>
            <div className={styles.packageGrid}>
              {packages.map((item, index) => (
                <article key={item.id} className={`${styles.packageCard} ${index === 1 ? styles.featured : ""}`}>
                  <div className={styles.packageTop}><span>{item.badge || "Gói credit"}</span>{index === 1 ? <b>Phổ biến</b> : null}</div>
                  <h3>{item.name}</h3>
                  <div className={styles.packageCredits}>{item.credits.toLocaleString("vi-VN")} <small>credit</small></div>
                  <div className={styles.packagePrice}>{money.format(item.priceVnd)}</div>
                  <ul><li><Check size={15} /> Dùng cho toàn bộ model ảnh và video</li><li><Check size={15} /> Không tự động gia hạn</li><li><Check size={15} /> Credit được cộng sau khi thanh toán</li></ul>
                  <button type="button" disabled={Boolean(buyingId)} onClick={() => void buyPackage(item)}>{buyingId === item.id ? <><LoaderCircle size={17} className={styles.spin} /> Đang tạo đơn</> : <><CreditCard size={17} /> Mua gói <ArrowRight size={16} /></>}</button>
                </article>
              ))}
            </div>
          </section>

          <div className={styles.dataGrid}>
            <section className={styles.dataPanel}>
              <div className={styles.panelHead}><div><ReceiptText size={18} /><h2>Đơn thanh toán</h2></div><span>{orders.length} đơn</span></div>
              {loading ? <div className={styles.empty}>Đang tải đơn hàng...</div> : orders.length === 0 ? <div className={styles.empty}>Chưa có đơn thanh toán.</div> : <div className={styles.rows}>{orders.map((order) => <div className={styles.orderRow} key={order.id}><div><strong>{order.packageName}</strong><span>#{order.orderCode} · {formatDate(order.createdAt)}</span></div><div className={styles.orderAmount}><strong>{money.format(order.amountVnd)}</strong><span className={`${styles.status} ${styles[`status${order.status}`]}`}>{statusLabel(order.status)}</span></div>{order.status === "PENDING" && order.checkoutUrl ? <a href={order.checkoutUrl} target="_blank" rel="noreferrer" aria-label="Tiếp tục thanh toán"><ExternalLink size={16} /></a> : null}</div>)}</div>}
            </section>

            <section className={styles.dataPanel}>
              <div className={styles.panelHead}><div><History size={18} /><h2>Biến động credit</h2></div><span>{transactions.length} giao dịch</span></div>
              {loading ? <div className={styles.empty}>Đang tải lịch sử...</div> : transactions.length === 0 ? <div className={styles.empty}>Chưa có biến động credit.</div> : <div className={styles.rows}>{transactions.map((entry) => <div className={styles.ledgerRow} key={entry.id}><span className={`${styles.ledgerIcon} ${entry.delta >= 0 ? styles.positive : styles.negative}`}>{entry.delta >= 0 ? "+" : "−"}</span><div><strong>{ledgerLabel(entry.reason)}</strong><span>{formatDate(entry.createdAt)} · Số dư {entry.balanceAfter.toLocaleString("vi-VN")}</span></div><b className={entry.delta >= 0 ? styles.creditIn : styles.creditOut}>{entry.delta >= 0 ? "+" : ""}{entry.delta.toLocaleString("vi-VN")}</b></div>)}</div>}
            </section>
          </div>

          <div className={styles.securityNote}><Clock3 size={18} /><div><strong>Thanh toán đang chờ?</strong><span>Webhook thường xác nhận trong vài giây. Trang này cũng tự đối soát lại với payOS khi anh quay về.</span></div></div>
        </main>
      </div>
    </div>
  );
}
