import { Toaster } from "@informach/ui/components/sonner";
import { ThemeProvider } from "@informach/ui/components/theme-provider";
import type { Metadata, Viewport } from "next";
import { Plus_Jakarta_Sans } from "next/font/google";
import { headers } from "next/headers";
import type { ReactNode } from "react";
import "./globals.css";

const jakarta = Plus_Jakarta_Sans({
  variable: "--font-jakarta",
  subsets: ["latin"],
});

export const viewport: Viewport = {
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#FF7A3D" },
    { media: "(prefers-color-scheme: dark)", color: "#FF7A3D" },
  ],
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
};

export const metadata: Metadata = {
  title: "Cozya",
  description:
    "Sua semana à mesa. Organize suas receitas, planeje refeições e marmitas e gere a lista de compras.",
  applicationName: "Cozya",
  appleWebApp: {
    capable: true,
    title: "Cozya",
    statusBarStyle: "black-translucent",
  },
  formatDetection: { telephone: false },
};

export default async function RootLayout({ children }: { children: ReactNode }) {
  // Lê o nonce per-request injetado pelo `apps/cozya/src/proxy.ts` em
  // `x-nonce`. `next-themes` (via wrapper @informach/ui) aceita `nonce` prop
  // e o aplica ao <script> inline anti-FOUC — sem isso, o CSP
  // `script-src 'self' 'nonce-...' 'strict-dynamic'` bloqueia o script.
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
