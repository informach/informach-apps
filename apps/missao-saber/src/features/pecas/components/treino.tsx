"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import Link from "next/link";
import { useCallback, useEffect, useRef, useState } from "react";
import { BotaoChapa } from "@/components/ui/botao-chapa";
import { Confete } from "@/components/ui/confete";
import { tocarComemoracao } from "@/components/ui/som";
import { formatarTempo } from "@/lib/texto";
import { useServerAction } from "@/lib/use-server-action";
import { registrarMontagemAction } from "../actions";
import { encontrarDesafio } from "../catalogo";
import type { Montagem } from "../tipos";
import { Mesa } from "./mesa";

/** Treino livre no laboratório: sem tempo-limite, com o tempo à vista e o registro do que foi montado. */
export function Treino({ desafioId, profileId }: { desafioId: string; profileId: string }) {
  const desafio = encontrarDesafio(desafioId);
  const pronto = useHydrated();
  const [rodada, setRodada] = useState(0);
  const [semente, setSemente] = useState(0);
  const [solucao, setSolucao] = useState(false);
  const [resultado, setResultado] = useState<{ segundos: number; melhor: number } | null>(null);
  const [erro, setErro] = useState("");
  const [enviando, enviar] = useServerAction();
  const inicio = useRef(0);
  const [agora, setAgora] = useState(0);

  // Semente e relógio só no aparelho: cada treino começa com outra arrumação.
  const iniciar = useCallback(() => {
    setSemente(1 + Math.floor(Math.random() * (2 ** 31 - 2)));
    inicio.current = Date.now();
    setAgora(Date.now());
  }, []);
  useEffect(() => iniciar(), [iniciar]);
  useEffect(() => {
    if (resultado || solucao) return;
    const relogio = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(relogio);
  }, [resultado, solucao]);

  if (!desafio) return null;
  const decorridos = Math.max(0, Math.round((agora - inicio.current) / 1000));

  const montou = (montagem: Montagem) => {
    const segundos = Math.round((Date.now() - inicio.current) / 1000);
    tocarComemoracao();
    void enviar(async () => {
      const resposta = await registrarMontagemAction({ profileId, desafioId, montagem, segundos });
      if (resposta.ok) setResultado({ segundos, melhor: resposta.data.melhor });
      else {
        setResultado({ segundos, melhor: segundos });
        setErro(resposta.error);
      }
    });
  };
  const recomecar = () => {
    setResultado(null);
    setSolucao(false);
    setErro("");
    setRodada((r) => r + 1);
    iniciar();
  };

  return (
    <div className="relative grid gap-5">
      {resultado && <Confete />}
      <div className="flex flex-wrap items-center gap-3">
        <p className="rounded-full bg-creme px-4 py-1.5 font-display text-lg font-semibold tabular-nums">
          <span className="sr-only">Tempo: </span>
          {formatarTempo(resultado ? resultado.segundos : decorridos)}
        </p>
        {!resultado && !solucao && (
          <BotaoChapa tom="contorno" medida="p" onClick={() => setSolucao(true)} disabled={!pronto}>
            Ver a solução
          </BotaoChapa>
        )}
        {(resultado || solucao) && (
          <BotaoChapa tom="ceu" medida="p" onClick={recomecar}>
            Montar de novo
          </BotaoChapa>
        )}
      </div>

      {resultado && (
        <section
          aria-live="polite"
          className="rounded-card border-2 border-verde bg-verde-claro p-5"
        >
          <h2 className="font-display text-2xl font-semibold">
            Montou em {formatarTempo(resultado.segundos)}!
          </h2>
          <p className="mt-1">Seu melhor tempo neste desafio: {formatarTempo(resultado.melhor)}.</p>
          <p className="mt-3">{desafio.estrategia}</p>
          {erro && <p className="mt-3 text-sm">{erro}</p>}
          <Link href="/laboratorio/pecas" className="mt-4 inline-block font-semibold underline">
            Escolher outro desafio
          </Link>
        </section>
      )}
      {solucao && (
        <section aria-live="polite" className="rounded-card border-2 border-sol bg-sol-claro p-5">
          <h2 className="font-display text-xl font-semibold">Uma solução</h2>
          <p className="mt-1">{desafio.estrategia}</p>
        </section>
      )}

      {pronto && semente > 0 ? (
        <Mesa
          key={rodada}
          desafio={desafio}
          semente={semente}
          mostrarSolucao={solucao}
          bloqueada={!!resultado || enviando}
          aoMontar={montou}
        />
      ) : (
        <div className="grid h-72 place-items-center rounded-card border border-sombra bg-[#ECE6D3] text-tinta-suave">
          Preparando a mesa…
        </div>
      )}
    </div>
  );
}
