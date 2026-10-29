import type { Metadata, Viewport } from "next";
import { Noto_Sans_JP, Schibsted_Grotesk } from "next/font/google";
import "./globals.css";

// Type from design.md: Schibsted Grotesk for everything, Noto Sans JP for Japanese replies.
const grotesk = Schibsted_Grotesk({ variable: "--font-grotesk", subsets: ["latin"], weight: ["400", "500", "600", "800", "900"] });
const notoJp = Noto_Sans_JP({ variable: "--font-jp", subsets: ["latin"], weight: ["400", "600", "800"], preload: false });

export const metadata: Metadata = {
  title: "Munbang Stationery, minded by Night Desk",
  description: "A fictional Korean stationery shop on the PayPal sandbox, run overnight by Night Desk, an AI shopkeeper.",
};

export const viewport: Viewport = { width: "device-width", initialScale: 1, themeColor: "#f6f6f2" };

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="en" className={`${grotesk.variable} ${notoJp.variable}`}>
      <body>{children}</body>
    </html>
  );
}
