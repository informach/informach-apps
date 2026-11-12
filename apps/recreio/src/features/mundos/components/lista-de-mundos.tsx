import type { ResumoDeMundo } from "@informach/recreio/contrato";
import Link from "next/link";
import { contagemDeMembros, rotuloDoPapel } from "../texto";

/** Os mundos do perfil num jogo, como aparecem na estante. */
export function ListaDeMundos({ mundos }: { mundos: ResumoDeMundo[] }) {
  if (mundos.length === 0)
    return <p className="text-tinta-suave">Você ainda não participa de nenhum mundo.</p>;
  return (
    <ul className="grid gap-3 sm:grid-cols-2">
      {mundos.map((mundo) => (
        <li key={mundo.id}>
          <Link
            href={`/mundos/${mundo.id}`}
            className="painel flex h-full flex-col gap-1 p-4 transition-colors hover:bg-painel-2"
          >
            <span className="font-display text-xl font-bold [overflow-wrap:anywhere]">
              {mundo.nome}
            </span>
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
          </Link>
        </li>
      ))}
    </ul>
  );
}
