import Link from "next/link";
import { ArrowRight, Crown, type LucideIcon } from "lucide-react";
import { StudioNavigation } from "@/components/studio-navigation";
import styles from "@/app/user/generate.module.css";

type InfoAction = {
  href: string;
  label: string;
  description: string;
  icon: LucideIcon;
};

type StudioInfoPageProps = {
  active: "dashboard" | "kling" | "history";
  eyebrow: string;
  title: string;
  description: string;
  actions: InfoAction[];
};

export function StudioInfoPage({ active, eyebrow, title, description, actions }: StudioInfoPageProps) {
  return (
    <div className={`${styles.page} ${styles.videoPage}`}>
      <div className={`${styles.appShell} ${styles.videoAppShell}`}>
        <aside className={`${styles.sidebar} ${styles.videoSidebar}`}>
          <Link href="/" className={styles.logoLink}>
            <span className={styles.logoMark} />
            <span className={styles.logoText}>VizoAI</span>
          </Link>
          <StudioNavigation active={active} />
          <div className={styles.sidebarSpacer} />
          <div className={styles.planBox}>
            <div className={styles.planRow}><span>Workspace</span><strong>AI Studio</strong></div>
          </div>
        </aside>

        <main className={`${styles.main} ${styles.videoMain}`}>
          <header className={styles.infoTopbar}>
            <Link href="/user#upgrade" className={styles.upgradeButton}><Crown size={17} /> Nâng cấp</Link>
          </header>

          <section className={styles.infoHero}>
            <span className={styles.heroEyebrow}>{eyebrow}</span>
            <h1>{title}</h1>
            <p>{description}</p>
          </section>

          <section className={styles.infoActionGrid}>
            {actions.map((action) => {
              const Icon = action.icon;
              return (
                <Link key={action.href} href={action.href} className={styles.infoActionCard}>
                  <span className={styles.infoActionIcon}><Icon size={22} /></span>
                  <span className={styles.infoActionCopy}>
                    <strong>{action.label}</strong>
                    <small>{action.description}</small>
                  </span>
                  <ArrowRight size={18} />
                </Link>
              );
            })}
          </section>
        </main>
      </div>
    </div>
  );
}
