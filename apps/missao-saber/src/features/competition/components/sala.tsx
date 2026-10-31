"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Crown, Maximize, Volume2, VolumeX } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";
import { Avatar } from "@/components/avatares";
import { BotaoChapa, LinkChapa } from "@/components/ui/botao-chapa";
import { Confete } from "@/components/ui/confete";
import { Cronometro } from "@/components/ui/cronometro";
import { LerEmVoz } from "@/components/ui/ler-em-voz";
import { Etiqueta } from "@/components/ui/pagina";
import { lembrarSom, prepararSom, somLigado, tocarComemoracao } from "@/components/ui/som";
import { ItemFigure } from "@/features/learning/components/item-figure";
import { ResponseInput } from "@/features/learning/components/response-input";
import { encontrarDesafio } from "@/features/pecas/catalogo";
import { Mesa } from "@/features/pecas/components/mesa";
import type { Montagem } from "@/features/pecas/tipos";
import type { ActionResult } from "@/lib/action";
import { useServerAction } from "@/lib/use-server-action";
import {
  answerTurnAction,
  deleteCompetitionAction,
  endTurnAction,
  startTurnAction,
} from "../actions";
import { PONTOS } from "../constantes";
import type { CompetitionView, VezPublica } from "../service";

/** Semente estável por vez: recarregar a sala não reembaralha as peças. */
function sementeDa(id: string) {
  let h = 2166136261;
  for (const c of id) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return h >>> 0 || 1;
}

export function Sala({ inicial }: { inicial: CompetitionView }) {
  const router = useRouter();
  const pronto = useHydrated();
  const [view, setView] = useState(inicial);
  const [desvio, setDesvio] = useState(0);
  const [mostrando, setMostrando] = useState<string | null>(null);
  const [resposta, setResposta] = useState("");
  const [erro, setErro] = useState("");
  const [som, setSom] = useState(true);
  const [enviando, enviar] = useServerAction();
  const [apagar, setApagar] = useState(false);
  // Quem abre uma competição já encerrada só vê o pódio: a fanfarra é para o fim ao vivo.
  const comemorouPodio = useRef(inicial.status === "finished");
  const [reenviar, setReenviar] = useState<{ vez: VezPublica; montagem: Montagem } | null>(null);

  useEffect(() => setSom(somLigado()), []);
  useEffect(() => setDesvio(Date.parse(view.agora) - Date.now()), [view.agora]);

  const competidor = (id: string) => view.competidores.find((c) => c.id === id);
  const atual = view.vezes.find((v) => !v.resultado) ?? null;
  const exibida = mostrando ? (view.vezes.find((v) => v.id === mostrando) ?? null) : null;
  const fase: "vez" | "pergunta" | "devolutiva" | "podio" = exibida
    ? "devolutiva"
    : !atual
      ? "podio"
      : atual.iniciadaEm
        ? "pergunta"
        : "vez";

  useEffect(() => {
    if (fase === "podio" && !comemorouPodio.current) {
      comemorouPodio.current = true;
      tocarComemoracao("podio");
    }
  }, [fase]);

  const aplicar = (
    resultado: ActionResult<CompetitionView>,
    aoReceber?: (v: CompetitionView) => void,
  ) => {
    if (!resultado.ok) {
      setErro(resultado.error);
      return;
    }
    setErro("");
    setView(resultado.data);
    aoReceber?.(resultado.data);
  };

  const comecar = () => {
    prepararSom();
    setResposta("");
    void enviar(async () => aplicar(await startTurnAction(view.id)));
  };
  const fechou = (vezId: string) => (v: CompetitionView) => {
    const vez = v.vezes.find((x) => x.id === vezId);
    if (!vez?.resultado) return;
    setMostrando(vezId);
    if (vez.resultado === "correct") tocarComemoracao();
  };
  const responder = (vez: VezPublica) => {
    void enviar(async () =>
      aplicar(await answerTurnAction(view.id, { vezId: vez.id, resposta }), fechou(vez.id)),
    );
  };
  const montou = (vez: VezPublica) => (montagem: Montagem) => {
    void enviar(async () => {
      const resultado = await answerTurnAction(view.id, {
        vezId: vez.id,
        resposta: JSON.stringify(montagem),
      });
      // A mesa avisa uma vez só; se o envio falhar, a montagem fica guardada para reenviar.
      setReenviar(resultado.ok ? null : { vez, montagem });
      aplicar(resultado, fechou(vez.id));
    });
  };
  const encerrar = (vez: VezPublica, motivo: "timeout" | "gave_up") => {
    void enviar(async () => {
      // O relógio do aparelho pode chegar a zero um instante antes do servidor.
      for (let tentativa = 0; tentativa < 4; tentativa += 1) {
        const resultado = await endTurnAction(view.id, { vezId: vez.id, motivo });
        if (!resultado.ok) return aplicar(resultado);
        const fechada = resultado.data.vezes.find((v) => v.id === vez.id)?.resultado;
        if (fechada) return aplicar(resultado, fechou(vez.id));
        await new Promise((r) => setTimeout(r, 700));
      }
    });
  };
  const alternarSom = () => {
    lembrarSom(!som);
    setSom(!som);
  };
  const telaCheia = () => {
    if (document.fullscreenElement) void document.exitFullscreen();
    else void document.documentElement.requestFullscreen?.().catch(() => undefined);
  };

  const daVez = (vez: VezPublica) => {
    const doCompetidor = view.vezes.filter(
      (v) => v.competidorId === vez.competidorId && v.tipo === vez.tipo,
    );
    return {
      numero: doCompetidor.findIndex((v) => v.id === vez.id) + 1,
      total: doCompetidor.length,
    };
  };
  const posicao = atual ? atual.posicao + 1 : view.vezes.length;

  return (
    <div className="relative grid gap-5">
      <header className="flex flex-wrap items-center gap-3 rounded-card border border-sombra bg-creme px-4 py-3">
        <h1 className="font-display text-xl font-semibold">{view.titulo}</h1>
        <Etiqueta tom="sol">
          {fase === "podio" ? "Encerrada" : `Vez ${posicao} de ${view.vezes.length}`}
        </Etiqueta>
        <div className="flex-1" />
        <ul aria-label="Placar" className="flex flex-wrap gap-2">
          {view.competidores.map((c) => (
            <li
              key={c.id}
              className={cn(
                "flex items-center gap-2 rounded-full py-1 pr-3 pl-1",
                atual?.competidorId === c.id && fase !== "podio"
                  ? "bg-verde-claro ring-3 ring-verde-solido"
                  : "bg-papel",
              )}
            >
              <Avatar id={c.avatar} tamanho="pp" />
              <span className="font-bold">{c.apelido}</span>
              <span className="font-display text-lg font-semibold">
                {c.pontos}
                <span className="sr-only"> {c.pontos === 1 ? "ponto" : "pontos"}</span>
              </span>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={alternarSom}
          aria-pressed={som}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-controle border-2 border-sombra px-3 font-bold"
        >
          {som ? (
            <Volume2 size={18} aria-hidden="true" />
          ) : (
            <VolumeX size={18} aria-hidden="true" />
          )}
          {som ? "Som ligado" : "Som desligado"}
        </button>
        <button
          type="button"
          onClick={telaCheia}
          className="inline-flex min-h-11 items-center gap-1.5 rounded-controle border-2 border-sombra px-3 font-bold"
        >
          <Maximize size={18} aria-hidden="true" /> Tela cheia
        </button>
      </header>

      {erro && (
        <p role="alert" className="rounded-card border-2 border-coral bg-coral-claro p-4">
          {erro}
          {reenviar && reenviar.vez.id === atual?.id && (
            <button
              type="button"
              className="ml-2 font-semibold underline"
              disabled={enviando}
              onClick={() => montou(reenviar.vez)(reenviar.montagem)}
            >
              Enviar a montagem de novo
            </button>
          )}
        </p>
      )}

      {fase === "vez" && atual && (
        <Vez
          vez={atual}
          competidor={competidor(atual.competidorId)}
          ordem={daVez(atual)}
          desafio={atual.desafioId ? encontrarDesafio(atual.desafioId)?.nome : undefined}
          aoComecar={comecar}
          desabilitado={!pronto || enviando}
        />
      )}

      {fase === "pergunta" && atual?.tipo === "problem" && atual.problema && atual.prazo && (
        <section className="grid gap-6 md:grid-cols-[13rem_minmax(0,1fr)]">
          <aside className="flex flex-col items-center gap-3 text-center">
            {pronto && (
              <Cronometro
                key={atual.id}
                prazo={atual.prazo}
                total={atual.segundos}
                desvio={desvio}
                pausado={enviando}
                aoTerminar={() => encerrar(atual, "timeout")}
              />
            )}
            <p className="font-bold text-tinta-suave">
              Vez de {competidor(atual.competidorId)?.apelido}
              <br />
              Problema {daVez(atual).numero} de {daVez(atual).total}
            </p>
          </aside>
          <form
            className="grid content-start gap-5"
            onSubmit={(e) => {
              e.preventDefault();
              responder(atual);
            }}
          >
            {atual.problema.habilidade && (
              <Etiqueta tom="uva" className="justify-self-start">
                {atual.problema.habilidade}
              </Etiqueta>
            )}
            <h2 className="font-display text-2xl leading-snug font-medium sm:text-3xl">
              {atual.problema.item.prompt}
            </h2>
            <LerEmVoz texto={atual.problema.item.prompt} className="justify-self-start" />
            <ItemFigure figure={atual.problema.item.figure} />
            <ResponseInput
              item={atual.problema.item}
              value={resposta}
              disabled={enviando}
              onChange={setResposta}
            />
            <BotaoChapa
              type="submit"
              medida="g"
              className="justify-self-start"
              disabled={!pronto || enviando || !resposta}
            >
              Responder
            </BotaoChapa>
          </form>
        </section>
      )}

      {fase === "pergunta" && atual?.tipo === "challenge" && atual.prazo && (
        <DesafioDaVez
          vez={atual}
          apelido={competidor(atual.competidorId)?.apelido ?? ""}
          desvio={desvio}
          pronto={pronto}
          enviando={enviando}
          aoMontar={montou(atual)}
          aoTerminar={() => encerrar(atual, "timeout")}
          aoDesistir={() => encerrar(atual, "gave_up")}
        />
      )}

      {fase === "devolutiva" && exibida && (
        <Devolutiva
          vez={exibida}
          apelido={competidor(exibida.competidorId)?.apelido ?? ""}
          proximo={atual ? competidor(atual.competidorId)?.apelido : undefined}
          aoContinuar={() => {
            setMostrando(null);
            setResposta("");
          }}
        />
      )}

      {fase === "podio" && view.podio && <Podio view={view} />}

      <footer className="mt-4 flex flex-wrap items-center gap-3 text-sm">
        <Link href="/familia/competicoes" className="font-semibold underline">
          Voltar às competições
        </Link>
        {apagar ? (
          <span className="flex flex-wrap items-center gap-2">
            Apagar esta competição e o pódio?
            <button
              type="button"
              className="font-semibold underline"
              onClick={() =>
                void enviar(async () => {
                  const r = await deleteCompetitionAction(view.id);
                  if (r.ok) router.push("/familia/competicoes");
                  else setErro(r.error);
                })
              }
            >
              Sim, apagar
            </button>
            <button type="button" className="underline" onClick={() => setApagar(false)}>
              Não
            </button>
          </span>
        ) : (
          <button type="button" className="underline" onClick={() => setApagar(true)}>
            Apagar competição
          </button>
        )}
      </footer>
    </div>
  );
}

type Competidor = CompetitionView["competidores"][number];

function Vez({
  vez,
  competidor,
  ordem,
  desafio,
  aoComecar,
  desabilitado,
}: {
  vez: VezPublica;
  competidor?: Competidor;
  ordem: { numero: number; total: number };
  desafio?: string;
  aoComecar: () => void;
  desabilitado: boolean;
}) {
  const problema = vez.tipo === "problem";
  const tempo = vez.segundos % 60 === 0 ? `${vez.segundos / 60} min` : `${vez.segundos} segundos`;
  return (
    <section className="flex flex-col items-center gap-5 py-8 text-center">
      {competidor && <Avatar id={competidor.avatar} tamanho="g" />}
      <p className="text-lg font-bold text-tinta-suave">
        {problema
          ? `Problema ${ordem.numero} de ${ordem.total}`
          : `Desafio de peças: ${desafio ?? ""}`}
        {competidor ? ` · ${competidor.nivel}` : ""}
      </p>
      <h2 className="font-display text-4xl font-semibold sm:text-5xl">
        É a vez de {competidor?.apelido}
      </h2>
      <p className="text-lg text-tinta-suave">
        {problema ? `${tempo} para responder.` : `${tempo} para montar.`} O tempo começa quando você
        tocar.
      </p>
      <BotaoChapa
        medida="g"
        onClick={aoComecar}
        disabled={desabilitado}
        className="min-w-48 text-2xl"
      >
        Começar
      </BotaoChapa>
    </section>
  );
}

function DesafioDaVez({
  vez,
  apelido,
  desvio,
  pronto,
  enviando,
  aoMontar,
  aoTerminar,
  aoDesistir,
}: {
  vez: VezPublica;
  apelido: string;
  desvio: number;
  pronto: boolean;
  enviando: boolean;
  aoMontar: (m: Montagem) => void;
  aoTerminar: () => void;
  aoDesistir: () => void;
}) {
  const desafio = vez.desafioId ? encontrarDesafio(vez.desafioId) : undefined;
  if (!desafio || !vez.prazo) return null;
  return (
    <section className="grid gap-4">
      <div className="flex flex-wrap items-center gap-4">
        {pronto && (
          <Cronometro
            key={vez.id}
            prazo={vez.prazo}
            total={vez.segundos}
            desvio={desvio}
            pausado={enviando}
            tamanho="p"
            aoTerminar={aoTerminar}
          />
        )}
        <div className="min-w-48 flex-1">
          <p className="font-bold text-tinta-suave">Desafio de {apelido}</p>
          <h2 className="font-display text-2xl font-semibold">{desafio.nome}</h2>
          <p>{desafio.objetivo}</p>
        </div>
        <BotaoChapa tom="contorno" medida="p" onClick={aoDesistir} disabled={enviando}>
          Encerrar e mostrar a solução
        </BotaoChapa>
      </div>
      {pronto && (
        <Mesa
          key={vez.id}
          desafio={desafio}
          semente={sementeDa(vez.id)}
          bloqueada={enviando}
          aoMontar={aoMontar}
        />
      )}
    </section>
  );
}

function Devolutiva({
  vez,
  apelido,
  proximo,
  aoContinuar,
}: {
  vez: VezPublica;
  apelido: string;
  proximo?: string;
  aoContinuar: () => void;
}) {
  const acertou = vez.resultado === "correct";
  const desafio = vez.desafioId ? encontrarDesafio(vez.desafioId) : undefined;
  const pontos = vez.tipo === "problem" ? PONTOS.problema : PONTOS.desafio;
  const titulo = acertou
    ? vez.tipo === "problem"
      ? `Acertou, ${apelido}!`
      : `Montou, ${apelido}!`
    : vez.resultado === "timeout"
      ? "O tempo acabou."
      : vez.resultado === "gave_up"
        ? "Desafio encerrado."
        : "Não foi dessa vez.";
  const titulo2 = acertou
    ? `+${pontos} ${pontos === 1 ? "ponto" : "pontos"}`
    : "Vamos ver o caminho juntos.";
  return (
    <section className="relative grid gap-5" aria-live="polite">
      {acertou && <Confete />}
      {vez.problema && (
        <p className="font-display text-xl text-tinta-suave">{vez.problema.item.prompt}</p>
      )}
      <div
        className={cn(
          "grid gap-3 rounded-heroi border-[3px] p-6",
          acertou ? "border-verde-solido bg-verde-claro" : "border-sol bg-sol-claro",
        )}
      >
        <div className="flex items-center gap-4">
          <span
            aria-hidden="true"
            className={cn(
              "grid size-16 place-items-center rounded-card font-display text-2xl font-bold",
              acertou ? "bg-verde-solido text-sobre-verde" : "bg-sol-solido text-sobre-sol",
            )}
          >
            {acertou ? `+${pontos}` : vez.resultado === "timeout" ? "0:00" : "?"}
          </span>
          <div>
            <h2 className="font-display text-3xl font-semibold">{titulo}</h2>
            <p className="text-lg font-bold">{titulo2}</p>
          </div>
        </div>
        {vez.problema?.devolutiva && (
          <>
            <p className="text-lg">
              Resposta: <b>{vez.problema.devolutiva.solucao}</b>
            </p>
            <p className="text-lg leading-relaxed">{vez.problema.devolutiva.explicacao}</p>
          </>
        )}
        {desafio && <p className="text-lg leading-relaxed">{desafio.estrategia}</p>}
      </div>
      {desafio && !acertou && (
        <Mesa
          key={`${vez.id}-solucao`}
          desafio={desafio}
          semente={sementeDa(vez.id)}
          mostrarSolucao
        />
      )}
      <BotaoChapa tom="uva" medida="g" className="justify-self-start" onClick={aoContinuar}>
        {proximo ? `Próxima: vez de ${proximo}` : "Ver o pódio"}
      </BotaoChapa>
    </section>
  );
}

function Podio({ view }: { view: CompetitionView }) {
  const podio = view.podio ?? [];
  const degraus = [
    { posicao: 2, altura: "h-32", cor: "border-ceu-solido bg-ceu-claro" },
    { posicao: 1, altura: "h-44", cor: "border-sol bg-sol-claro" },
    { posicao: 3, altura: "h-24", cor: "border-coral-solido bg-coral-claro" },
  ];
  return (
    <section className="relative flex flex-col items-center gap-6" aria-labelledby="titulo-podio">
      <Confete />
      <div className="text-center">
        <Etiqueta tom="uva">{view.area}</Etiqueta>
        <h2 id="titulo-podio" className="mt-2 font-display text-5xl font-semibold">
          Pódio
        </h2>
        <p className="mt-2 text-lg text-tinta-suave">
          Parabéns a quem jogou. Cada um respondeu perguntas do próprio nível.
        </p>
      </div>
      <ol aria-label="Classificação" className="flex flex-wrap items-end justify-center gap-3">
        {degraus.map((degrau) =>
          podio
            .filter((c) => c.posicao === degrau.posicao)
            .map((c) => (
              <li key={c.id} className="flex w-44 flex-col items-center gap-2">
                {c.posicao === 1 && (
                  <Crown size={36} aria-hidden="true" className="text-sol-fundo" />
                )}
                <Avatar id={c.avatar} tamanho={c.posicao === 1 ? "g" : "m"} />
                <span className="font-display text-xl font-semibold">{c.apelido}</span>
                <span className="font-bold">
                  {c.pontos} {c.pontos === 1 ? "ponto" : "pontos"}
                </span>
                <div
                  className={cn(
                    "grid w-full place-items-center rounded-t-card border-[3px] border-b-0 font-display text-4xl font-bold",
                    degrau.altura,
                    degrau.cor,
                  )}
                >
                  {c.posicao}º
                </div>
              </li>
            )),
        )}
      </ol>
      <div className="w-full max-w-3xl">
        <h3 id="como-somou" className="pb-2 font-bold">
          Como cada um somou
        </h3>
        <div className="overflow-x-auto rounded-card">
          <table aria-labelledby="como-somou" className="w-full border-collapse bg-creme text-left">
            <thead>
              <tr className="bg-papel">
                <th scope="col" className="px-4 py-2">
                  Posição
                </th>
                <th scope="col" className="px-4 py-2">
                  Quem
                </th>
                <th scope="col" className="px-4 py-2">
                  Problemas certos
                </th>
                <th scope="col" className="px-4 py-2">
                  Desafios montados
                </th>
                <th scope="col" className="px-4 py-2">
                  Pontos
                </th>
              </tr>
            </thead>
            <tbody>
              {podio.map((c) => (
                <tr key={c.id} className="border-t border-sombra">
                  <td className="px-4 py-2">{c.posicao}º</td>
                  <th scope="row" className="px-4 py-2">
                    {c.apelido}
                  </th>
                  <td className="px-4 py-2">
                    {c.acertos} de {c.problemas}
                  </td>
                  <td className="px-4 py-2">
                    {c.desafiosMontados} de {c.desafios}
                  </td>
                  <td className="px-4 py-2 font-bold">{c.pontos}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
      <div className="flex flex-wrap gap-3">
        <LinkChapa href="/familia/competicoes/nova" medida="g">
          Nova competição
        </LinkChapa>
        <LinkChapa href="/familia/competicoes" tom="contorno" medida="g">
          Voltar às competições
        </LinkChapa>
      </div>
    </section>
  );
}
