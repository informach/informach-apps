/**
 * O painel que ocupa a tela do jogo quando o jogo não está nela: abrindo,
 * perguntando ou explicando por que parou. Só apresentação, para a página do
 * servidor e para o hospedeiro do navegador dizerem a mesma coisa do mesmo
 * jeito.
 */
export function AvisoDoJogo({
  titulo,
  texto,
  children,
}: {
  titulo: string;
  texto?: string;
  /** Os botões do aviso. */
  children?: React.ReactNode;
}) {
  return (
    <div className="painel w-full max-w-md p-6 text-center sm:p-8">
      <h2 className="font-display text-2xl leading-tight font-extrabold tracking-tight">
        {titulo}
      </h2>
      {texto && <p className="mt-3 leading-relaxed text-tinta-suave">{texto}</p>}
      {children && <div className="mt-6 flex flex-wrap justify-center gap-3">{children}</div>}
    </div>
  );
}

/** A moldura da página do jogo: a janela inteira, sem o cabeçalho do portal. */
export function TelaDoJogo({ titulo, children }: { titulo: string; children: React.ReactNode }) {
  return (
    <main id="conteudo" className="fixed inset-0 overflow-hidden bg-fundo">
      <h1 className="sr-only">{titulo}</h1>
      {children}
    </main>
  );
}
