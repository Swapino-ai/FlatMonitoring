import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "FlatMonitoring — přehled nemovitostního portfolia",
  description: "Návratnost investic, dluhy, úspory a daňové podklady pro byty v nájmu.",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="cs">
      <body>{children}</body>
    </html>
  );
}
