import type { Metadata, Viewport } from "next";
import { Fredoka, Nunito } from "next/font/google";
import { headers } from "next/headers";
import { RegistrarServiceWorker } from "@/components/registrar-sw";
import { env } from "@/lib/env";
import { INDEXAVEL } from "@/lib/seo";
import "./globals.css";

const nunito = Nunito({
  subsets: ["latin", "latin-ext"],
  weight: ["400", "600", "700", "800"],
  variable: "--font-nunito",
  display: "swap",
});
const fredoka = Fredoka({
  subsets: ["latin", "latin-ext"],
  weight: ["500", "600", "700"],
  variable: "--font-fredoka",
  display: "swap",
});

export const dynamic = "force-dynamic";
const descricao =
  "Raciocínio, matemática e educação financeira em missões autorais para o 6º e 7º ano.";
export const metadata: Metadata = {
  metadataBase: new URL(env.NEXT_PUBLIC_APP_URL),
  title: { default: "Missão Saber · Uma descoberta por dia", template: "%s · Missão Saber" },
  description: descricao,
  applicationName: "Missão Saber",
  robots: INDEXAVEL ? { index: true, follow: true } : { index: false, follow: false },
  openGraph: {
    type: "website",
    siteName: "Missão Saber",
    locale: "pt_BR",
    title: "Missão Saber · Uma descoberta por dia",
    description: descricao,
  },
  twitter: { card: "summary_large_image", title: "Missão Saber", description: descricao },
  icons: {
    icon: [{ url: "/favicon.png", sizes: "32x32", type: "image/png" }],
    apple: [{ url: "/apple-touch-icon.png", sizes: "180x180", type: "image/png" }],
  },
  manifest: "/manifest.webmanifest",
};
export const viewport: Viewport = {
  themeColor: "#17B26A",
  colorScheme: "light dark",
};

/**
 * Aplica a escolha explícita de tema antes da primeira pintura.
 *
 * Sem isso a tela abre clara e pisca para escura depois da hidratação. Quem
 * não escolheu nada não recebe atributo nenhum e fica com `prefers-color-scheme`
 * — inclusive com JavaScript desligado.
 */
const temaAntesDaPintura = `try{var t=localStorage.getItem("ms-tema");if(t==="escuro")document.documentElement.setAttribute("data-theme","dark");else if(t==="claro")document.documentElement.setAttribute("data-theme","light")}catch(e){}`;

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  /* A CSP do proxy é `script-src 'self' 'nonce-…' 'strict-dynamic'`: sem o
     nonce o script inline é bloqueado e a preferência de tema salva não chega
     a ser aplicada. O proxy publica o nonce da requisição em `x-nonce`. */
  const nonce = (await headers()).get("x-nonce") ?? undefined;
  return (
    <html lang="pt-BR" className={`${nunito.variable} ${fredoka.variable}`}>
      <head>
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: script literal e fixo, sem dado de usuário */}
        <script nonce={nonce} dangerouslySetInnerHTML={{ __html: temaAntesDaPintura }} />
      </head>
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
