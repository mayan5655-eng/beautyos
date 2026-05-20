import type { Metadata } from "next";
import Link from "next/link";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "BeautyOS - מערכת ניהול",
  description: "מערכת ניהול לקוסמטיקאיות בישראל",
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
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col relative">
        {children}
        <Link
          href="/dashboard/marketing"
          style={{
            position: "fixed",
            bottom: "24px",
            left: "24px",
            background: "linear-gradient(135deg, #a855f7 0%, #ec4899 100%)",
            color: "white",
            padding: "14px 22px",
            borderRadius: "50px",
            boxShadow: "0 10px 25px rgba(168, 85, 247, 0.4)",
            fontWeight: "600",
            fontSize: "14px",
            textDecoration: "none",
            zIndex: 9999,
            display: "flex",
            alignItems: "center",
            gap: "8px",
            transition: "transform 0.2s",
          }}
        >
          ✨ צרי קמפיין AI
        </Link>
      </body>
    </html>
  );
}
