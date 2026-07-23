import type { Metadata, Viewport } from "next";
import { Cormorant_Garamond, Heebo, Inter, Assistant, Frank_Ruhl_Libre } from "next/font/google";
import "./globals.css";
import PWARegister from "./pwa-register";

// Elegant Latin serif for display headings (Latin glyphs only).
const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

// Legacy Hebrew sans — kept so any lingering literal references keep resolving.
const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

// Premium Latin UI face (numerals, prices, labels, Latin copy).
const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Modern Hebrew UI face — the workhorse for body/RTL copy.
const assistant = Assistant({
  variable: "--font-assistant",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700", "800"],
});

// Elegant Hebrew display serif for headings — feminine, high-end, real Hebrew.
const frankRuhl = Frank_Ruhl_Libre({
  variable: "--font-frank",
  subsets: ["hebrew", "latin"],
  weight: ["400", "500", "600", "700", "900"],
});

export const metadata: Metadata = {
  title: "BloomOS — Beauty Business OS",
  description: "Beauty Business OS",
  applicationName: "BloomOS",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    title: "BloomOS",
    statusBarStyle: "default",
  },
  icons: {
    apple: "/icons/apple-touch-icon.png",
  },
};

export const viewport: Viewport = {
  themeColor: "#5B3E67",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="he"
      dir="rtl"
      className={[
        cormorant.variable,
        heebo.variable,
        inter.variable,
        assistant.variable,
        frankRuhl.variable,
        "h-full antialiased",
      ].join(" ")}
    >
      <body className="min-h-full flex flex-col relative">
        <PWARegister />
        {children}
      </body>
    </html>
  );
}
