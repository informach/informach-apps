import type { Metadata, Viewport } from "next";
import localFont from "next/font/local";
import { RegistrarServiceWorker } from "@/components/registrar-sw";
import { env } from "@/lib/env";
import { INDEXAVEL } from "@/lib/seo";
import "./globals.css";

// Fontes servidas pela própria origem (CSP `font-src 'self'`), licença OFL,
// vindas dos pacotes @fontsource-variable. O subconjunto latino cobre o português.
const baloo = localFont({
  src: "../../node_modules/@fontsource-variable/baloo-2/files/baloo-2-latin-wght-normal.woff2",
  weight: "400 800",
  variable: "--font-baloo",
  display: "swap",
});
const nunito = localFont({
  src: "../../node_modules/@fontsource-variable/nunito/files/nunito-latin-wght-normal.woff2",
  weight: "200 1000",
  variable: "--font-nunito",
  display: "swap",
});

export const dynamic = "force-dynamic";
const descricao =
  "Rotina visual para crianças, com passo a passo falado, lembretes gentis e estrelas que viram recompensa. Feito pensando em crianças autistas e com TDAH, para qualquer família.";
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Dia de Estrela · Rotina com estrelas", template: "%s · Dia de Estrela" },
  description: descricao,
  applicationName: "Dia de Estrela",
  robots: INDEXAVEL ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Dia de Estrela",
    locale: "pt_BR",
    title: "Dia de Estrela · Rotina com estrelas",
    description: descricao,
  },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#FFF8EC",
  colorScheme: "light",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR" className={`${baloo.variable} ${nunito.variable}`}>
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <RegistrarServiceWorker />
        {children}
      </body>
    </html>
  );
}
