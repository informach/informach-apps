import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { env } from "@/lib/env";
import { INDEXAVEL } from "@/lib/seo";
import "./globals.css";

// Fontes servidas pela própria origem (CSP `font-src 'self'`), licença OFL,
// vindas dos pacotes @fontsource-variable. O subconjunto latino cobre o português.
const bricolage = localFont({
  src: "../../node_modules/@fontsource-variable/bricolage-grotesque/files/bricolage-grotesque-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-bricolage",
  display: "swap",
});
const jakarta = localFont({
  src: "../../node_modules/@fontsource-variable/plus-jakarta-sans/files/plus-jakarta-sans-latin-wght-normal.woff2",
  weight: "200 800",
  variable: "--font-jakarta",
  display: "swap",
});

export const dynamic = "force-dynamic";
const descricao =
  "O Recreio é a plataforma de jogos da Informach. Está em alfa fechado, com acesso por convite da equipe.";
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Recreio · Seu lugar de jogar", template: "%s · Recreio" },
  description: descricao,
  applicationName: "Recreio",
  robots: INDEXAVEL ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Recreio",
    locale: "pt_BR",
    title: "Recreio · Seu lugar de jogar",
    description: descricao,
  },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
};
export const viewport: Viewport = {
  themeColor: "#0F1226",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${bricolage.variable} ${jakarta.variable}`}>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
