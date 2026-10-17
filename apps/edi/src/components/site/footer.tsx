import Link from "next/link";
import { Wordmark } from "./brand";

export function SiteFooter() {
  return (
    <footer className="mat">
      <div className="container site-footer__inner">
        <div className="site-footer__brand">
          <Wordmark />
          <p>Ferramentas criativas para Windows. Um produto Informach.</p>
        </div>
        <nav className="site-footer__nav" aria-label="Rodapé">
          <Link href="/downloads">Downloads</Link>
          <Link href="/conta">Minha conta</Link>
          <a href="https://informach.com.br/termos">Termos</a>
          <a href="https://informach.com.br/privacidade">Privacidade</a>
        </nav>
      </div>
      <span className="ruler" aria-hidden="true" />
    </footer>
  );
}
