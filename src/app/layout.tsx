import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

// Brand typeface: gufi.io's stylesheet uses "Inter Display" (SIL Open Font License).
// Inter's optical-size axis covers Display (opsz 32 for headings, see globals.css).
const inter = Inter({ variable: "--font-inter", subsets: ["latin", "latin-ext"], axes: ["opsz"] });

export const metadata: Metadata = {
  title: { default: "Güfi OS", template: "%s · Güfi OS" },
  description: "The internal operating system of Güfi.",
  robots: { index: false, follow: false },
};

export const viewport: Viewport = { themeColor: "#ff3f76" };

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className={`${inter.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col">{children}</body>
    </html>
  );
}
