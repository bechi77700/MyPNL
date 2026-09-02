import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  variable: "--font-inter",
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: "#0a0b0d",
  viewportFit: "cover",
  width: "device-width",
  initialScale: 1,
};

export const metadata: Metadata = {
  applicationName: "MyPNL",
  appleWebApp: { capable: true, statusBarStyle: "black-translucent", title: "MyPNL" },
  formatDetection: { telephone: false },
  title: "MyPNL",
  description: "Dashboard de rentabilité e-commerce multi-boutiques",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr" className={inter.variable}>
      <body>{children}</body>
    </html>
  );
}
