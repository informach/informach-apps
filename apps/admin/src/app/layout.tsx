import type { Metadata, Viewport } from "next";
import { JetBrains_Mono, Plus_Jakarta_Sans } from "next/font/google";
import type { ReactNode } from "react";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({ variable: "--font-jakarta", subsets: ["latin"] });
const jetbrains = JetBrains_Mono({
  variable: "--font-jetbrains",
  subsets: ["latin"],
  weight: ["400", "500", "600"],
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
