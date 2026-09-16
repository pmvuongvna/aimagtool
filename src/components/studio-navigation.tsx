import Link from "next/link";
import {
  GalleryHorizontalEnd,
  History,
  Image as ImageIcon,
  LayoutDashboard,
  Palette,
  Settings2,
  Video,
  WandSparkles,
} from "lucide-react";
import styles from "@/app/user/generate.module.css";

type StudioSection = "dashboard" | "image" | "video" | "kling" | "templates" | "history" | "styles";

const items = [
  { id: "dashboard", href: "/user", label: "Dashboard", icon: LayoutDashboard },
  { id: "image", href: "/user#generator", label: "Create image", icon: ImageIcon },
  { id: "video", href: "/user/video", label: "Create video", icon: Video },
  { id: "kling", href: "/user/kling", label: "Kling Motion", icon: WandSparkles },
  { id: "templates", href: "/user/templates", label: "Templates", icon: GalleryHorizontalEnd },
  { id: "history", href: "/user/history", label: "History", icon: History },
  { id: "styles", href: "/user#styles", label: "Styles", icon: Palette },
] as const;

export function StudioNavigation({ active }: { active: StudioSection }) {
  return (
    <nav className={styles.navMenu} aria-label="Studio navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.id} className={`${styles.navItem} ${active === item.id ? styles.activeNav : ""}`} href={item.href}>
            <span className={styles.navIcon}><Icon size={16} strokeWidth={1.8} /></span>
            <span className={styles.navText}>{item.label}</span>
          </Link>
        );
      })}
      <Link className={styles.navItem} href="/admin">
        <span className={styles.navIcon}><Settings2 size={16} strokeWidth={1.8} /></span>
        <span className={styles.navText}>Settings</span>
      </Link>
    </nav>
  );
}
