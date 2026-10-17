import { Toaster } from "@informach/ui/components/sonner";
import { ThemeProvider } from "@informach/ui/components/theme-provider";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import { env } from "@/lib/env";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
  weight: ["400", "500", "600", "700", "800"],
  display: "swap",
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#006FFD" },
    { media: "(prefers-color-scheme: dark)", color: "#006FFD" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  // Cada página declara só o próprio nome; o sufixo da marca vem daqui.
  // A base dos endereços absolutos: sem ela, a imagem de compartilhamento e o
  // canônico da página de vendas saíam relativos, e o WhatsApp não mostrava
  // figura nenhuma no link.
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Agenda da Turma", template: "%s · Agenda da Turma" },
  description: "Organize tarefas, provas e recados dos seus filhos em um só lugar.",
  applicationName: "Agenda da Turma",
  appleWebApp: {
    capable: true,
    title: "Agenda da Turma",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // A nonce is unique to this render. Reading request headers opts public pages
  // into dynamic rendering too; a statically cached script cannot share it.
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" suppressHydrationWarning>
      <body className={jakarta.variable} suppressHydrationWarning>
        <ThemeProvider nonce={nonce}>
          {children}
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  );
}
