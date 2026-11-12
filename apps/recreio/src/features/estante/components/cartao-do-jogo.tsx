import { CapaMorada } from "@/components/desenhos";
import type { CartaoDeJogo } from "../catalogo";

/**
 * Cartão de um jogo na estante: diz em que pé o jogo está e por onde se joga.
 * O jogo abre por um mundo, e os mundos ficam logo abaixo da estante; o cartão
 * aponta para lá. Quem pode jogar é dito acima da estante, pelo estado do
 * acesso; o cartão não repete.
 */
export function CartaoDoJogo({
  jogo,
  jogavel,
}: {
  jogo: CartaoDeJogo;
  /** O perfil pode jogar, o jogo abre e o portal sabe hospedá-lo. */
  jogavel: boolean;
}) {
  return (
    <article className="painel flex flex-col overflow-hidden">
      <div className="relative aspect-[5/3] bg-painel-2">
        {jogo.id === "morada" && <CapaMorada className="absolute inset-0 size-full" />}
        <span className="etiqueta etiqueta-sol absolute top-3 left-3">{jogo.estado}</span>
      </div>
      <div className="flex flex-1 flex-col gap-2 p-5">
        <h2 className="font-display text-2xl font-extrabold tracking-tight">{jogo.nome}</h2>
        <p className="text-tinta-suave">
          {jogavel
            ? `Para jogar, crie um mundo ou abra um dos seus, logo abaixo.`
            : `O ${jogo.nome} não está aberto para jogar agora.`}
        </p>
        <p className="mt-auto pt-2 text-sm text-tinta-suave">Feito para {jogo.aparelhos}.</p>
      </div>
    </article>
  );
}
