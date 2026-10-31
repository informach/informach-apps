import "@fontsource-variable/inter";
import "@fontsource-variable/plus-jakarta-sans";
import type { Metadata, Viewport } from "next";
import { FocusNav } from "@/components/focus-nav";
import { RegistrarServiceWorker } from "@/components/registrar-sw";
import { env } from "@/lib/env";
import { INDEXAVEL } from "@/lib/seo";
import "./globals.css";
import "./bora.css";

export const dynamic = "force-dynamic";
const descricao =
  "Calistenia guiada para a família: instrutor 3D, contagem de repetições pela câmera e progresso para cada pessoa, no celular, no computador ou na TV.";
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Bora Treinar · Calistenia guiada em família", template: "%s · Bora Treinar" },
  description: descricao,
  applicationName: "Bora Treinar",
  robots: INDEXAVEL ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Bora Treinar",
    locale: "pt_BR",
    title: "Bora Treinar · Calistenia guiada em família",
    description: descricao,
  },
  twitter: { card: "summary_large_image", title: "Bora Treinar", description: descricao },
  icons: { icon: [{ url: "/icon.svg", type: "image/svg+xml" }], apple: "/icon.svg" },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#0B0D10",
  colorScheme: "dark",
  viewportFit: "cover",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip" href="#conteudo">
          Pular para o conteúdo
        </a>
        <RegistrarServiceWorker />
        <FocusNav />
        {children}
      </body>
    </html>
  );
}
