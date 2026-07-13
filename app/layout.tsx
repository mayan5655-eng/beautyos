import type { Metadata } from "next";
import { Cormorant_Garamond, Heebo } from "next/font/google";
import "./globals.css";

const cormorant = Cormorant_Garamond({
  variable: "--font-cormorant",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700"],
});

const heebo = Heebo({
  variable: "--font-heebo",
  subsets: ["hebrew", "latin"],
  weight: ["300", "400", "500", "600", "700"],
});

export const metadata: Metadata = {
  title: "BloomOS - Beauty Business OS",
  description: "Beauty Business OS",
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
      className={cormorant.variable + " " + heebo.variable + " h-full antialiased"}
    >
      <body className="min-h-full flex flex-col relative">
        {children}
      </body>
    </html>
  );
}