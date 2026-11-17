"use client";
export default function ErrorPage({ reset }: { reset: () => void }) {
  return (
    <main id="conteudo" className="auth-page">
      <section className="sheet">
        <p className="eyebrow">Minha conta</p>
        <h1>Não conseguimos abrir esta página.</h1>
        <p>Seus dados continuam guardados. Tente carregar novamente.</p>
        <button type="button" onClick={reset}>
          Tentar novamente
        </button>
      </section>
    </main>
  );
}
