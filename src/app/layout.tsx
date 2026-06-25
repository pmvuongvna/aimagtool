import type { Metadata } from "next";
import { JetBrains_Mono, Roboto } from "next/font/google";
import "./globals.css";

const roboto = Roboto({
  variable: "--font-display",
  subsets: ["latin", "latin-ext", "vietnamese"],
});

const jetbrainsMono = JetBrains_Mono({
  variable: "--font-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AI Studio - Text/Image to Image",
  description: "Generate AI images and prepare for AI video with secure server-side Kie API integration.",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className={`${roboto.variable} ${jetbrainsMono.variable}`}>
      <body>{children}</body>
    </html>
  );
}

