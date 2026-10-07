"use client";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { Image as ImageIcon, Video, WandSparkles, LoaderCircle } from "lucide-react";
import styles from "@/app/user/generate.module.css";
import transitionStyles from "./studio-tabs.module.css";

const tabs = [
  { id: "image", href: "/user", label: "AI Image", Icon: ImageIcon },
  { id: "video", href: "/user/video", label: "AI Video", Icon: Video },
  { id: "kling", href: "/user/kling", label: "Kling Motion", Icon: WandSparkles },
] as const;
export function StudioTabs({ active }: { active: "image" | "video" | "kling" }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();
  const [destination, setDestination] = useState("");
  return <>
    <nav aria-label="Generation mode" aria-busy={pending} className={`${styles.generatorTabs} ${transitionStyles.tabs} ${active === "kling" ? styles.klingGeneratorTabs : ""}`}>
      {tabs.map(({ id, href, label, Icon }) => <Link key={id} href={href} aria-current={active === id ? "page" : undefined} className={`${styles.generatorTab} ${active === id ? styles.generatorTabActive : styles.generatorTabLink}`} onClick={(event) => {
        if (event.ctrlKey || event.metaKey || event.shiftKey || event.altKey || event.button !== 0 || active === id) return;
        event.preventDefault(); setDestination(label); startTransition(() => router.push(href));
      }}>{pending && destination === label ? <LoaderCircle size={17} className={transitionStyles.spinner} /> : <Icon size={17} />}{label}</Link>)}
    </nav>
    {pending ? <div className={transitionStyles.overlay} role="status" aria-live="polite"><LoaderCircle size={32} className={transitionStyles.spinner} /><span>Đang mở {destination}...</span></div> : null}
  </>;
}
