import type { Metadata } from "next";
import Link from "next/link";
import "@fontsource-variable/plus-jakarta-sans";
import "./globals.css";
export const metadata: Metadata = {
  title: { default: "Suíte Edi — sua bancada criativa", template: "%s · Suíte Edi" },
  description: "Cinco ferramentas criativas em uma assinatura: aula, captura, foto, PDF e SVG.",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="pt-BR">
      <body>
        <a className="skip-link" href="#conteudo">
          Pular para o conteúdo
        </a>
        <header className="suite-header">
          <Link className="wordmark" href="/" aria-label="Suíte Edi, início">
            edi
            <span className="wordmark-bars" aria-hidden="true">
              ▰▰▰▰▰
            </span>
          </Link>
          <nav aria-label="Principal">
            <Link href="/">Ferramentas</Link>
            <Link href="/downloads">Downloads</Link>
            <Link href="/conta">Minha conta</Link>
            <Link href="/conectar">Conectar computador</Link>
          </nav>
          <Link className="button secondary compact" href="/entrar">
            Entrar
          </Link>
        </header>
        <main id="conteudo">{children}</main>
        <footer className="suite-footer">
          <span>Suíte Edi · ferramentas criativas em desenvolvimento</span>
          <span>Windows x64 · seus arquivos continuam com você</span>
        </footer>
      </body>
    </html>
  );
}
