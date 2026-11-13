import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import type { ReactNode } from "react";
import "./globals.css";

const jakarta = localFont({
  src: "./fonts/plus-jakarta-sans-variable.woff2",
  variable: "--font-jakarta",
  weight: "200 800",
  display: "swap",
});
const jetbrains = localFont({
  src: "./fonts/jetbrains-mono-variable.woff2",
  variable: "--font-jetbrains",
  weight: "100 800",
  display: "swap",
});

export const metadata: Metadata = {
  title: { default: "Bastidores", template: "%s · Bastidores" },
  description: "Área restrita da equipe Informach.",
  robots: { index: false, follow: false },
  referrer: "same-origin",
};

export const viewport: Viewport = {
  themeColor: "#173247",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: ReactNode }) {
  return (
    <html lang="pt-BR">
      <body className={`${jakarta.variable} ${jetbrains.variable}`}>{children}</body>
    </html>
  );
}
