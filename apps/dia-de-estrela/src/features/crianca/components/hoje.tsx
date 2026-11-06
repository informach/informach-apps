"use client";
import { ArrowRight, Check, Lock, Play, Timer, Volume2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Bau, Estrela, Lumi } from "@/components/desenhos";
import { Icone } from "@/components/icone";
import { dataPorExtenso, relogioDa, saudacao } from "@/domain/relogio";
import {
  criancaPodeMarcar,
  type EventoLembrete,
  falaDoLembrete,
  MIN,
  proximoLembrete,
  type RegistroLembrete,
  type Tarefa,
  visaoDoDia,
} from "@/domain/rotina";
import { marcarTarefaAction, registrarLembreteAction } from "../actions";
import { pedirTelaCheia, useTelaAcesa } from "../aparelho";
import type { DiaDaCrianca } from "../dados";
import { audioLiberado, falar, falarTarefa, festa, liberarAudio, pararVoz, sino } from "../som";
import { Cabecalho } from "./cabecalho";
import { Conquista, type ResultadoConquista } from "./conquista";
import { Lembrete } from "./lembrete";
import { PassoAPasso } from "./passos";

type TarefaDia = DiaDaCrianca["tarefas"][number];

function useAgora(intervalo = 10_000) {
  const [agora, setAgora] = useState(() => Date.now());
  useEffect(() => {
    const id = setInterval(() => setAgora(Date.now()), intervalo);
    return () => clearInterval(id);
  }, [intervalo]);
  return agora;
}

/** Junta o que o servidor sabe dos lembretes com o que este aparelho já tocou. */
function juntar(
  servidor: Record<string, RegistroLembrete>,
  local: Record<string, RegistroLembrete>,
): Record<string, RegistroLembrete> {
  const ids = new Set([...Object.keys(servidor), ...Object.keys(local)]);
  const saida: Record<string, RegistroLembrete> = {};
  for (const id of ids) {
    const s = servidor[id];
    const l = local[id];
    const lastDueAt = Math.max(s?.lastDueAt ?? 0, l?.lastDueAt ?? 0) || null;
    saida[id] = {
      warnedAt: s?.warnedAt ?? l?.warnedAt ?? null,
      dueCount: Math.max(s?.dueCount ?? 0, l?.dueCount ?? 0),
      lastDueAt,
      snoozeUntil: s?.snoozeUntil ?? null,
      nudgeAt: s?.nudgeAt && s.nudgeAt > (lastDueAt ?? 0) ? s.nudgeAt : null,
    };
  }
  return saida;
}

export function Hoje({ dados, varias }: { dados: DiaDaCrianca; varias: boolean }) {
  const router = useRouter();
  const agoraMs = useAgora();
  const relogio = useMemo(() => relogioDa(agoraMs, dados.timezone), [agoraMs, dados.timezone]);
  const [comecou, setComecou] = useState(false);
  const [locais, setLocais] = useState<Record<string, RegistroLembrete>>({});
  const [marcadasAqui, setMarcadasAqui] = useState<Set<string>>(() => new Set());
  const [evento, setEvento] = useState<EventoLembrete | null>(null);
  const [passos, setPassos] = useState<TarefaDia | null>(null);
  const [conquista, setConquista] = useState<ResultadoConquista | null>(null);
  const [confirmar, setConfirmar] = useState<TarefaDia | null>(null);
  const [erro, setErro] = useState<string | null>(null);
  const marcando = useRef(false);
  const { ajustes, child } = dados;

  useEffect(() => setComecou(audioLiberado()), []);
  useTelaAcesa(comecou);

  // Virou o dia na casa: busca as tarefas do dia novo.
  useEffect(() => {
    if (relogio.data !== dados.relogio.data) router.refresh();
  }, [relogio.data, dados.relogio.data, router]);

  const feitas = useMemo(
    () => new Set([...dados.feitas.map((f) => f.taskId), ...marcadasAqui]),
    [dados.feitas, marcadasAqui],
  );
  const registros = useMemo(() => juntar(dados.registros, locais), [dados.registros, locais]);
  const visao = useMemo(
    () => visaoDoDia(dados.tarefas, feitas, relogio),
    [dados.tarefas, feitas, relogio],
  );
  const porId = useMemo(() => new Map(dados.tarefas.map((t) => [t.id, t])), [dados.tarefas]);

  // O motor de lembretes: um aviso por vez, só depois do "Começar o dia".
  useEffect(() => {
    if (!comecou || evento || passos || conquista || !dados.allowed) return;
    const ev = proximoLembrete(dados.tarefas, feitas, registros, ajustes, relogio);
    if (!ev) return;
    const id = ev.tarefa.id;
    setLocais((l) => ({
      ...l,
      [id]:
        ev.tipo === "aviso"
          ? { ...(l[id] ?? { dueCount: 0 }), warnedAt: relogio.ms }
          : {
              ...(l[id] ?? { dueCount: 0 }),
              dueCount: (registros[id]?.dueCount ?? 0) + 1,
              lastDueAt: relogio.ms,
            },
    }));
    setEvento(ev);
    void registrarLembreteAction({ childId: child.id, taskId: id, tipo: ev.tipo });
    if (ajustes.sound) sino();
    if (ajustes.voice) {
      const texto = falaDoLembrete(ev, child.name, ajustes.warnBefore);
      const tarefa = porId.get(id);
      setTimeout(
        () =>
          ev.tipo === "agora" && tarefa
            ? void falarTarefa(id, tarefa.hasVoice, texto)
            : falar(texto),
        ajustes.sound ? 1300 : 0,
      );
    }
  }, [
    comecou,
    evento,
    passos,
    conquista,
    dados.tarefas,
    dados.allowed,
    feitas,
    registros,
    ajustes,
    relogio,
    child,
    porId,
  ]);

  // O aviso some se a tarefa for marcada (aqui, no celular dos pais ou pelos passos).
  useEffect(() => {
    if (evento && feitas.has(evento.tarefa.id)) setEvento(null);
  }, [evento, feitas]);

  const marcar = useCallback(
    async (tarefa: TarefaDia) => {
      if (marcando.current) return;
      marcando.current = true;
      setErro(null);
      pararVoz();
      const r = await marcarTarefaAction({ childId: child.id, taskId: tarefa.id });
      marcando.current = false;
      setPassos(null);
      setConfirmar(null);
      if (!r.ok) {
        setErro(r.error);
        return;
      }
      setMarcadasAqui((s) => new Set(s).add(tarefa.id));
      if (ajustes.sound) {
        if (ajustes.calm) sino(true);
        else festa();
      }
      setConquista({
        titulo: tarefa.title,
        estrelas: r.data.stars,
        pendente: r.data.pending,
        bau: r.data.chest?.stars ?? null,
      });
    },
    [child.id, ajustes.sound, ajustes.calm],
  );

  const abrir = (t: TarefaDia) => {
    if (t.steps.length) setPassos(t);
    else setConfirmar(t);
  };

  if (!comecou)
    return (
      <button
        type="button"
        className="grid min-h-dvh w-full place-items-center bg-ceu-claro px-6 text-center"
        onClick={() => {
          liberarAudio();
          pedirTelaCheia();
          setComecou(true);
        }}
      >
        <span className="flex flex-col items-center gap-4">
          <Lumi tamanho={160} humor="feliz" />
          <span className="font-display text-5xl font-extrabold sm:text-6xl">
            Oi, {child.name}!
          </span>
          <span className="b3 b3-folha b3-lg px-10">
            <Play className="size-6" aria-hidden="true" /> Começar o dia
          </span>
          <span className="max-w-sm font-bold text-tinta-suave">
            Um toque libera o som dos lembretes e deixa a tela acesa.
          </span>
        </span>
      </button>
    );

  if (passos)
    return (
      <PassoAPasso
        tarefa={passos}
        nome={child.name}
        voz={ajustes.voice}
        podeTerminar={criancaPodeMarcar(passos, dados.tarefas, feitas, relogio)}
        aoVoltar={() => setPassos(null)}
        aoTerminar={() => void marcar(passos)}
      />
    );

  const foco = visao.foco ? porId.get(visao.foco.id) : undefined;
  const proxima = visao.proxima ? porId.get(visao.proxima.id) : undefined;
  const total = dados.tarefas.length;

  return (
    <div className="mx-auto flex min-h-dvh max-w-[1400px] flex-col gap-5 px-4 py-4 sm:px-6 sm:py-6 lg:px-8">
      <Cabecalho
        nome={child.name}
        cor={child.color}
        titulo={`${saudacao(relogio)}, ${child.name}!`}
        subtitulo={dataPorExtenso(relogio.data)}
        aba="hoje"
        estrelas={dados.saldo}
        trocar={varias}
      />
      {!dados.allowed && (
        <p className="chapa p-4 font-bold">
          Esta tela está pausada. Peça para um adulto ver o plano em Ajustes.
        </p>
      )}
      {erro && (
        <p
          role="status"
          className="chapa border-laranja bg-laranja-clara p-3 font-bold text-laranja-escuro"
        >
          {erro}
        </p>
      )}
      <div className="grid flex-1 gap-5 md:grid-cols-[minmax(0,1fr)_19rem] lg:grid-cols-[minmax(0,1fr)_25rem]">
        <div className="flex min-w-0 flex-col gap-5">
          {foco ? (
            <CartaoAgora
              tarefa={foco}
              comecou={visao.focoComecou}
              nome={child.name}
              agoraMs={relogio.ms}
              podeMarcar={criancaPodeMarcar(foco, dados.tarefas, feitas, relogio)}
              aoOuvir={() =>
                foco.steps.length
                  ? falar(`${foco.title}. Primeiro passo: ${foco.steps[0]?.text ?? ""}`)
                  : void falarTarefa(
                      foco.id,
                      foco.hasVoice,
                      `${child.name}, agora é: ${foco.title}`,
                    )
              }
              aoComecar={() => abrir(foco)}
              aoMarcar={() => void marcar(foco)}
              som={ajustes.sound}
            />
          ) : (
            <TudoFeito total={total} />
          )}
          {foco && <PrimeiroDepois tarefa={foco} depois={proxima} />}
        </div>
        {total > 0 && (
          <Trilha
            tarefas={dados.tarefas}
            itens={visao.itens}
            feitas={visao.feitas}
            podeMarcar={(t) => criancaPodeMarcar(t, dados.tarefas, feitas, relogio)}
            pendentes={
              new Set(dados.feitas.filter((f) => f.status === "pending").map((f) => f.taskId))
            }
            aoAbrir={abrir}
          />
        )}
      </div>

      {confirmar && (
        <Confirmar
          tarefa={confirmar}
          podeMarcar={criancaPodeMarcar(confirmar, dados.tarefas, feitas, relogio)}
          aoFechar={() => setConfirmar(null)}
          aoMarcar={() => void marcar(confirmar)}
        />
      )}
      {evento && (
        <Lembrete
          evento={evento}
          nome={child.name}
          agoraMs={relogio.ms}
          timezone={dados.timezone}
          ajustes={ajustes}
          aoOuvir={() => {
            const texto = falaDoLembrete(evento, child.name, ajustes.warnBefore);
            const t = porId.get(evento.tarefa.id);
            evento.tipo === "agora" && t ? void falarTarefa(t.id, t.hasVoice, texto) : falar(texto);
          }}
          aoFechar={() => {
            pararVoz();
            setEvento(null);
          }}
          aoComecar={() => {
            const t = porId.get(evento.tarefa.id);
            pararVoz();
            setEvento(null);
            if (t?.steps.length) setPassos(t);
          }}
          aoMarcar={() => {
            const t = porId.get(evento.tarefa.id);
            setEvento(null);
            if (t) void marcar(t);
          }}
        />
      )}
      {conquista && (
        <Conquista
          resultado={conquista}
          nome={child.name}
          calmo={ajustes.calm}
          feitas={visao.feitas}
          total={total}
          proxima={visao.foco && !feitas.has(visao.foco.id) ? visao.foco : undefined}
          aoContinuar={() => setConquista(null)}
        />
      )}
    </div>
  );
}

function CartaoAgora({
  tarefa,
  comecou,
  nome,
  agoraMs,
  podeMarcar,
  aoOuvir,
  aoComecar,
  aoMarcar,
  som,
}: {
  tarefa: TarefaDia;
  comecou: boolean;
  nome: string;
  agoraMs: number;
  podeMarcar: boolean;
  aoOuvir: () => void;
  aoComecar: () => void;
  aoMarcar: () => void;
  som: boolean;
}) {
  const fala = tarefa.steps.length
    ? `Bora, ${nome}? São ${tarefa.steps.length} passos. Eu leio cada um com você.`
    : comecou
      ? `Bora, ${nome}? Quando terminar, toque em "Já fiz".`
      : `Daqui a pouco tem ${tarefa.title.toLowerCase()}.`;
  return (
    <section className="chapa flex flex-col gap-5 border-ceu-borda p-5 shadow-[0_8px_0_var(--de-ceu-borda)] sm:p-7">
      <div className="flex flex-wrap items-center justify-between gap-2">
        <span
          className={`rounded-full px-4 py-1.5 text-sm font-extrabold tracking-[0.08em] ${
            comecou ? "bg-ceu-escuro text-white" : "bg-ceu-claro text-ceu-escuro"
          }`}
        >
          {comecou ? "AGORA" : "PRÓXIMA"} · {tarefa.time}
        </span>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-estrela-clara px-3 py-1.5 font-extrabold text-estrela-texto">
          <Estrela tamanho={20} /> vale {tarefa.stars} {tarefa.stars === 1 ? "estrela" : "estrelas"}
        </span>
      </div>
      <div className="flex items-center gap-4 sm:gap-6">
        <span className="grid size-24 shrink-0 place-items-center rounded-[2rem] bg-ceu-escuro text-white shadow-[0_7px_0_#1a4a86] sm:size-32 lg:size-36">
          <Icone
            nome={tarefa.icon}
            className="size-12 sm:size-16 lg:size-[4.5rem]"
            strokeWidth={2.1}
          />
        </span>
        <div className="min-w-0">
          <h2 className="font-display text-4xl leading-[1.02] font-extrabold sm:text-5xl lg:text-6xl">
            {tarefa.title}
          </h2>
          {tarefa.detail && (
            <p className="mt-1 text-lg font-bold text-tinta-suave sm:text-xl">{tarefa.detail}</p>
          )}
          <div className="mt-2 flex flex-wrap gap-2">
            {tarefa.steps.length > 0 && (
              <span className="rounded-full bg-ceu-claro px-3 py-1 text-sm font-extrabold text-ceu-escuro">
                {tarefa.steps.length} passos
              </span>
            )}
            {tarefa.durationMin && (
              <Cronometro minutos={tarefa.durationMin} agoraMs={agoraMs} som={som} />
            )}
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Lumi tamanho={72} className="shrink-0" />
        <p className="rounded-2xl bg-ceu-claro px-4 py-3 text-lg font-bold">{fala}</p>
      </div>
      <div className="grid grid-cols-2 gap-3 sm:flex">
        <button type="button" className="b3 b3-branco b3-lg px-5" onClick={aoOuvir}>
          <Volume2 className="size-6" aria-hidden="true" /> Ouvir
        </button>
        {tarefa.steps.length > 0 ? (
          <>
            <button
              type="button"
              className="b3 b3-claro b3-lg px-5"
              disabled={!podeMarcar}
              onClick={aoMarcar}
            >
              <Check className="size-6" aria-hidden="true" /> Já fiz
            </button>
            <button
              type="button"
              className="b3 b3-folha b3-lg col-span-2 flex-1"
              onClick={aoComecar}
            >
              <Play className="size-6" aria-hidden="true" /> Começar
            </button>
          </>
        ) : (
          <button
            type="button"
            className="b3 b3-folha b3-lg flex-1"
            disabled={!podeMarcar}
            onClick={aoMarcar}
          >
            <Check className="size-6" aria-hidden="true" /> Já fiz!
          </button>
        )}
      </div>
    </section>
  );
}

/** Timer visual que avisa com o sino quando acaba (o protótipo só mudava o texto). */
function Cronometro({ minutos, agoraMs, som }: { minutos: number; agoraMs: number; som: boolean }) {
  const [inicio, setInicio] = useState<number | null>(null);
  const [agora, setAgora] = useState(agoraMs);
  const avisou = useRef(false);
  useEffect(() => {
    if (inicio === null) return;
    const id = setInterval(() => setAgora(Date.now()), 1000);
    return () => clearInterval(id);
  }, [inicio]);
  const restante = inicio === null ? minutos * MIN : Math.max(0, inicio + minutos * MIN - agora);
  useEffect(() => {
    if (inicio !== null && restante === 0 && !avisou.current) {
      avisou.current = true;
      if (som) sino();
      falar("O tempo acabou!");
    }
  }, [inicio, restante, som]);
  if (inicio === null)
    return (
      <button
        type="button"
        onClick={() => {
          avisou.current = false;
          setAgora(Date.now());
          setInicio(Date.now());
        }}
        className="inline-flex min-h-9 items-center gap-1.5 rounded-full bg-ceu-claro px-3 text-sm font-extrabold text-ceu-escuro"
      >
        <Timer className="size-4" aria-hidden="true" /> Timer de {minutos} min
      </button>
    );
  const min = Math.ceil(restante / MIN);
  return (
    <span
      role="timer"
      className={`inline-flex min-h-9 items-center gap-1.5 rounded-full px-3 text-sm font-extrabold ${
        restante === 0 ? "bg-folha-clara text-folha-escura" : "bg-estrela-clara text-estrela-texto"
      }`}
    >
      <Timer className="size-4" aria-hidden="true" />
      {restante === 0 ? "Acabou o tempo!" : `faltam ${min} min`}
    </span>
  );
}

function PrimeiroDepois({ tarefa, depois }: { tarefa: Tarefa; depois?: Tarefa }) {
  const texto = tarefa.thenText ?? depois?.title;
  if (!texto) return null;
  return (
    <section className="chapa flex items-center gap-3 p-4 sm:gap-5 sm:px-6">
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-ceu-claro text-ceu-escuro sm:size-14">
          <Icone nome={tarefa.icon} className="size-6 sm:size-7" />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">PRIMEIRO</p>
          <p className="truncate font-display text-xl font-extrabold">{tarefa.title}</p>
        </div>
      </div>
      <ArrowRight className="size-7 shrink-0 text-tinta-suave" aria-label="depois" />
      <div className="flex min-w-0 flex-1 items-center gap-3">
        <span className="grid size-12 shrink-0 place-items-center rounded-2xl bg-estrela text-estrela-texto shadow-[0_4px_0_var(--de-estrela-escura)] sm:size-14">
          <Icone
            nome={tarefa.thenText ? "star" : (depois?.icon ?? "star")}
            className="size-6 sm:size-7"
          />
        </span>
        <div className="min-w-0">
          <p className="text-xs font-extrabold tracking-[0.12em] text-tinta-suave">
            DEPOIS{!tarefa.thenText && depois ? ` · ${depois.time}` : ""}
          </p>
          <p className="truncate font-display text-xl font-extrabold">{texto}</p>
        </div>
      </div>
    </section>
  );
}

function TudoFeito({ total }: { total: number }) {
  return (
    <section className="chapa flex flex-col items-center gap-3 p-8 text-center">
      <Lumi tamanho={140} humor="feliz" />
      <h2 className="font-display text-4xl font-extrabold sm:text-5xl">
        {total ? "Tudo feito por hoje!" : "Nada marcado para hoje"}
      </h2>
      <p className="text-lg font-bold text-tinta-suave">
        {total ? "Você completou o dia. Pode descansar." : "Aproveite o dia."}
      </p>
      {total > 0 && <Bau largura={110} aberto />}
    </section>
  );
}

function Trilha({
  tarefas,
  itens,
  feitas,
  podeMarcar,
  pendentes,
  aoAbrir,
}: {
  tarefas: TarefaDia[];
  itens: { tarefa: Tarefa; estado: "feita" | "agora" | "atrasada" | "por-vir" }[];
  feitas: number;
  podeMarcar: (t: Tarefa) => boolean;
  pendentes: Set<string>;
  aoAbrir: (t: TarefaDia) => void;
}) {
  const porId = new Map(tarefas.map((t) => [t.id, t]));
  // Zigue-zague da trilha só com espaço sobrando (tablet deitado, computador).
  const deslocamento = ["lg:ml-0", "lg:ml-8", "lg:ml-16", "lg:ml-8"];
  return (
    <aside className="chapa flex flex-col gap-4 p-5">
      <div className="flex items-baseline justify-between">
        <h2 className="font-display text-2xl font-extrabold sm:text-3xl">Minha trilha</h2>
        <span className="font-extrabold text-tinta-suave">
          {feitas} de {itens.length}
        </span>
      </div>
      <ol className="flex flex-col gap-2">
        {itens.map(({ tarefa, estado }, i) => {
          const t = porId.get(tarefa.id);
          if (!t) return null;
          const liberada = estado === "feita" || podeMarcar(t);
          const estilo =
            estado === "feita"
              ? "bg-folha-botao text-white shadow-[0_5px_0_var(--de-folha-sombra)]"
              : estado === "agora"
                ? "bg-ceu-escuro text-white shadow-[0_5px_0_#1a4a86] pulso"
                : estado === "atrasada"
                  ? "bg-laranja-clara text-laranja-escuro shadow-[0_5px_0_#ffc2a6]"
                  : "border-[3px] border-linha-forte bg-white text-tinta-suave shadow-[0_5px_0_var(--de-linha-forte)]";
          return (
            <li key={t.id} className={deslocamento[i % 4]}>
              <button
                type="button"
                disabled={estado === "feita" || !liberada}
                onClick={() => aoAbrir(t)}
                className="flex w-full items-center gap-3 rounded-2xl p-1 text-left disabled:cursor-default"
              >
                <span className={`grid size-14 shrink-0 place-items-center rounded-full ${estilo}`}>
                  {estado === "feita" ? (
                    <Check className="size-7" strokeWidth={3.5} aria-hidden="true" />
                  ) : !liberada ? (
                    <Lock className="size-5" aria-hidden="true" />
                  ) : (
                    <Icone nome={t.icon} className="size-6" />
                  )}
                </span>
                <span className="min-w-0">
                  <span className="block text-sm font-extrabold text-tinta-suave">
                    {t.time}
                    {estado === "agora" ? " · AGORA" : ""}
                    {estado === "feita" && pendentes.has(t.id) ? " · esperando o ok" : ""}
                  </span>
                  <span
                    className={`block truncate font-display text-lg font-extrabold ${estado === "feita" ? "text-tinta-suave" : ""}`}
                  >
                    {t.title}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ol>
      {itens.length > 0 && (
        <div className="mt-auto flex items-center gap-3 rounded-2xl bg-creme p-3">
          <Bau largura={60} aberto={feitas === itens.length} />
          <div className="flex-1">
            <p className="font-display text-lg font-extrabold">
              Baú do dia · {feitas} de {itens.length}
            </p>
            <div className="h-4 overflow-hidden rounded-full bg-linha-forte">
              <div
                className="h-full rounded-full bg-estrela transition-[width] duration-500"
                style={{ width: `${Math.round((feitas / itens.length) * 100)}%` }}
              />
            </div>
          </div>
        </div>
      )}
    </aside>
  );
}

function Confirmar({
  tarefa,
  podeMarcar,
  aoFechar,
  aoMarcar,
}: {
  tarefa: TarefaDia;
  podeMarcar: boolean;
  aoFechar: () => void;
  aoMarcar: () => void;
}) {
  return (
    <div
      className="fixed inset-0 z-40 grid place-items-end bg-tinta/50 p-3 sm:place-items-center"
      role="dialog"
      aria-modal="true"
      aria-label={tarefa.title}
    >
      <div className="chapa entra w-full max-w-md p-6 text-center">
        <span className="mx-auto grid size-20 place-items-center rounded-3xl bg-ceu-escuro text-white">
          <Icone nome={tarefa.icon} className="size-10" />
        </span>
        <h2 className="mt-3 font-display text-3xl font-extrabold">{tarefa.title}</h2>
        <p className="mt-1 text-lg font-bold text-tinta-suave">
          {podeMarcar
            ? "Você já fez essa tarefa?"
            : `Ainda não é a vez dela. Ela é às ${tarefa.time}.`}
        </p>
        <div className="mt-5 grid grid-cols-2 gap-3">
          <button type="button" className="b3 b3-claro" onClick={aoFechar}>
            {podeMarcar ? "Ainda não" : "Tá bom"}
          </button>
          {podeMarcar && (
            <button type="button" className="b3 b3-folha" onClick={aoMarcar}>
              <Check className="size-5" aria-hidden="true" /> Já fiz!
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
