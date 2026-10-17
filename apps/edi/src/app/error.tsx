"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <section className="auth-panel">
      <h1>Vamos tentar novamente.</h1>
      <p className="muted">
        Não foi possível carregar esta área. Seus arquivos no computador não foram alterados.
      </p>
      <button type="button" onClick={reset}>
        Tentar novamente
      </button>
    </section>
  );
}
