"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { SimpleHeader } from "../components/site/headers";

export default function ErrorPage({ reset }: { reset: () => void }) {
  const hydrated = useHydrated();
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
            <button
              type="button"
              className="button button--primary"
              disabled={!hydrated}
              onClick={reset}
            >
              Tentar novamente
            </button>
          </div>
        </div>
      </main>
    </>
  );
}
