import type { Metadata } from "next";
import { Tajawal } from "next/font/google";
import "./globals.css";

// NFR-09: Arabic-only UI — Tajawal is a UI-oriented Arabic typeface.
const tajawal = Tajawal({
  variable: "--font-tajawal",
  subsets: ["arabic"],
  weight: ["400", "500", "700"],
});

export const metadata: Metadata = {
  title: "أكاديمية رِواء للمبيعات",
  description: "منصة تدريب وتقييم فريق المبيعات",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ar" dir="rtl" className={`${tajawal.variable} h-full antialiased`}>
      <body className="min-h-full flex flex-col font-sans">{children}</body>
    </html>
  );
}
