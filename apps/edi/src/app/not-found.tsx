import Link from "next/link";
import { SimpleHeader } from "../components/site/headers";

export default function NotFound() {
  return (
    <>
      <SimpleHeader />
      <main id="conteudo" className="container section">
        <div className="narrow">
          <span className="eyebrow">Página não encontrada</span>
          <h1 className="display-2">Esta página não está na bancada.</h1>
          <p className="lede">O endereço pode ter mudado. As ferramentas continuam no lugar.</p>
          <div className="actions">
            <Link className="button button--primary" href="/">
              Ver as ferramentas
            </Link>
            <Link className="button button--outline" href="/conta">
              Minha conta
            </Link>
          </div>
        </div>
      </main>
    </>
  );
}
