import Link from "next/link";
import {
  FolderOpen,
  House,
  Image as ImageIcon,
  Video,
  WandSparkles,
} from "lucide-react";
import styles from "@/app/user/generate.module.css";

type StudioSection = "dashboard" | "image" | "video" | "kling" | "templates" | "history" | "styles";

const items = [
  { id: "dashboard", active: ["dashboard"], href: "/user", label: "Home", icon: House },
  { id: "image", active: ["image"], href: "/user#generator", label: "Image", icon: ImageIcon },
  { id: "video", active: ["video"], href: "/user/video", label: "Video", icon: Video },
  { id: "kling", active: ["kling", "styles"], href: "/user/tools", label: "Tools", icon: WandSparkles },
  { id: "history", active: ["history", "templates"], href: "/user/templates", label: "Library", icon: FolderOpen },
] as const;

export function StudioNavigation({ active }: { active: StudioSection }) {
  return (
    <nav className={styles.navMenu} aria-label="Studio navigation">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Link key={item.id} className={`${styles.navItem} ${(item.active as readonly StudioSection[]).includes(active) ? styles.activeNav : ""}`} href={item.href}>
            <span className={styles.navIcon}><Icon size={18} strokeWidth={1.8} /></span>
            <span className={styles.navText}>{item.label}</span>
          </Link>
        );
      })}
    </nav>
  );
}
