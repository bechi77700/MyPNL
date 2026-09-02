import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "MyPNL",
  description: "Dashboard de rentabilité e-commerce multi-boutiques",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="fr">
      <body className="antialiased">{children}</body>
    </html>
  );
}
