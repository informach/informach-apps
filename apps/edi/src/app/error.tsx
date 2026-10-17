"use client";
import { SimpleHeader } from "../components/site/headers";

export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <>
      <SimpleHeader />
      <main id="conteudo" className="container section">
        <div className="narrow">
          <span className="eyebrow">Algo saiu do lugar</span>
          <h1 className="display-2">Vamos tentar de novo.</h1>
          <p className="lede">
            Não foi possível carregar esta área. Seus arquivos no computador não foram alterados.
          </p>
          <div className="actions">
            <button type="button" className="button button--primary" onClick={reset}>
              Tentar novamente
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
