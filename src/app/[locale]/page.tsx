import type { Metadata } from "next";
import { notFound } from "next/navigation";
import LandingPage from "@/components/landing-page";
import { isLocale, type Locale } from "@/lib/locale";

type Props = { params: Promise<{ locale: string }> };

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { locale } = await params;
  if (!isLocale(locale)) return {};

  if (locale === "vi") {
    return {
      title: "Escanor AI - Tạo ảnh và video bằng AI",
      description: "Nền tảng tạo ảnh và video AI cho creator và doanh nghiệp.",
      alternates: { canonical: "/vi", languages: { vi: "/vi", en: "/en" } },
    };
  }

  return {
    title: "Escanor AI - Generate images and videos with AI",
    description: "AI platform for fast image and video generation for creators and teams.",
    alternates: { canonical: "/en", languages: { vi: "/vi", en: "/en" } },
  };
}

export function generateStaticParams() {
  return [{ locale: "en" }, { locale: "vi" }];
}

export default async function LocalizedHomePage({ params }: Props) {
  const { locale } = await params;
  if (!isLocale(locale)) notFound();
  return <LandingPage locale={locale as Locale} />;
}

