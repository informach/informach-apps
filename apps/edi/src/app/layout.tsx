import type { Metadata } from "next";
import "@fontsource-variable/plus-jakarta-sans";
import "@fontsource-variable/bricolage-grotesque/opsz.css";
import "@fontsource-variable/jetbrains-mono";
import "./globals.css";
import "../styles/marketing.css";
import "../styles/illustrations.css";
import "../styles/auth.css";
import "../styles/downloads.css";
import "../styles/account.css";

export const metadata: Metadata = {
  title: {
    default: "Suíte Edi · Tudo o que sua aula precisa, numa bancada só",
    template: "%s · Suíte Edi",
  },
  description:
    "Grave e edite a aula pelo texto, capture a tela, trate imagens, organize PDFs e anime vetores. Cinco ferramentas para Windows numa assinatura.",
};

export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        {children}
      </body>
    </html>
  );
}
