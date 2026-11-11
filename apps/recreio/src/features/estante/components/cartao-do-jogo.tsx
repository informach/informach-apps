import { CapaMorada } from "@/components/desenhos";
import type { CartaoDeJogo } from "../catalogo";

/**
 * Cartão de um jogo na estante. Nesta fase nenhum jogo abre: o cartão diz em
 * que pé o jogo está. Quem pode jogar é dito acima da estante, pelo estado do
 * acesso; o cartão não repete.
 */
export function CartaoDoJogo({ jogo }: { jogo: CartaoDeJogo }) {
  return (
    <article className="painel flex flex-col overflow-hidden">
      <div className="relative aspect-[5/3] bg-painel-2">
        {jogo.id === "morada" && <CapaMorada className="absolute inset-0 size-full" />}
        <span className="etiqueta etiqueta-sol absolute top-3 left-3">{jogo.estado}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{jogo.nome}</h2>
        <p className="text-tinta-suave">
          Estamos preparando o {jogo.nome}. Ainda não dá para jogar por aqui.
        </p>
        <p className="mt-auto pt-2 text-sm text-tinta-suave">Feito para {jogo.aparelhos}.</p>
      </div>
    </article>
  );
}
