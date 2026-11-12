import type { ResumoDeMundo } from "@informach/recreio/contrato";
import Link from "next/link";
import { contagemDeMembros, rotuloDoPapel } from "../texto";

/**
 * Os mundos do perfil num jogo, como aparecem na estante. Com `jogarEm` (o id
 * de um jogo que o portal sabe abrir, para quem tem o direito de jogar), cada
 * mundo ganha o caminho para o jogo.
 */
export function ListaDeMundos({ mundos, jogarEm }: { mundos: ResumoDeMundo[]; jogarEm?: string }) {
  if (mundos.length === 0)
    return <p className="text-tinta-suave">Você ainda não participa de nenhum mundo.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {mundos.map((mundo) => (
        <li key={mundo.id} className="painel flex h-full flex-col gap-1 p-4">
          <Link
            href={`/mundos/${mundo.id}`}
            className="font-display text-xl font-bold underline-offset-4 [overflow-wrap:anywhere] hover:underline"
          >
            {mundo.nome}
          </Link>
          {mundo.resumo && (
            <span className="text-sm text-tinta-suave [overflow-wrap:anywhere]">
              {mundo.resumo.titulo}
              {mundo.resumo.subtitulo ? `, ${mundo.resumo.subtitulo}` : ""}
            </span>
          )}
          <span className="mt-auto pt-2 text-sm text-tinta-suave">
            {rotuloDoPapel(mundo.papel)}, {contagemDeMembros(mundo.membros)}
            {mundo.abertoAgora ? ", aberto agora" : ""}
          </span>
          {jogarEm !== undefined && (
            <div className="mt-3">
              {/* Um `<a>` comum, não o `Link`: a página do jogo tem política de
                  segurança própria, e ela só vale num documento carregado do zero. */}
              <a
                href={`/jogar/${encodeURIComponent(jogarEm)}?mundo=${mundo.id}`}
                aria-label={`Jogar em ${mundo.nome}`}
                className="rb rb-sol"
              >
                Jogar
              </a>
            </div>
          )}
        </li>
      ))}
    </ul>
  );
}
