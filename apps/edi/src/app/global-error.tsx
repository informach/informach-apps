"use client";
export default function GlobalError({ reset }: { reset: () => void }) {
  return (
    <html lang="pt-BR">
      <body>
        <main>
          <h1>Não foi possível carregar a Suíte Edi.</h1>
          <p>Seu trabalho local permanece preservado.</p>
          <button type="button" onClick={reset}>
            Tentar novamente
          </button>
        </main>
      </body>
    </html>
  );
}
