"use client";

import { Button } from "@informach/ui/components/button";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { cn } from "@informach/ui/lib/utils";
import { Check, LogOut } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { DayClosedIllustration } from "@/components/illustrations";
import { submitTaskStatus } from "@/features/offline-queue/client";
import { useQueueOwner } from "@/features/offline-queue/owner";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { kidDueLabel } from "../turn";

type Props = {
  profile: { id: string; name: string };
  todayIso: string;
  todo: ActivityOverviewItem[];
  ahead: ActivityOverviewItem[];
};

/** Quanto tempo o dedo fica no botão de sair. Longo o bastante para não ser toque. */
const EXIT_HOLD_MS = 900;

const DOT_CLASS: Record<number, string> = {
  1: "bg-chart-1",
  2: "bg-chart-2",
  3: "bg-chart-3",
  4: "bg-chart-4",
  5: "bg-chart-5",
};

type Mode = "todo" | "ahead";

/**
 * A tela da criança.
 *
 * O responsável abre e passa o telefone. Uma atividade por vez, tipografia
 * grande e um botão de "Feito!" que não erra o dedo. Sem menu, sem edição, sem
 * cobrança e sem prazo em vermelho (ver `kidDueLabel`). A lista vai até a
 * próxima aula, e quem termina pode adiantar o resto da semana.
 *
 * Feito não tira a atividade da tela: ela fica marcada, com "Desfazer", até a
 * criança tocar em "Próxima". O dedo de uma criança erra, e uma atividade que
 * some no toque errado não tem como voltar.
 *
 * Não há placar e não há comparação com irmãos. O progresso é o da própria
 * criança, no próprio dia.
 *
 * **A conclusão aqui NÃO usa `useCardToggle`**, e isso é escolha, não
 * descuido. O hook chama `router.refresh()` a cada sucesso: no card do adulto
 * isso é o que sincroniza a ordem, mas aqui reordenaria a lista embaixo de uma
 * criança no meio da sessão, a cada "Feito!". O preço é duas implementações do
 * mesmo fluxo, anotado nos dois arquivos: ao mexer em uma, olhe a outra.
 */
export function KidModeScreen({ profile, todayIso, todo, ahead }: Props) {
  const router = useRouter();
  const queueOwner = useQueueOwner();
  /**
   * As listas da sessão, congeladas na chegada. Um `router.refresh()` (o de um
   * conflito, ou o do `OfflineQueueFlusher` quando a fila sobe) traz da rotina
   * só o que está pendente: lida direto das props, a lista perdia o que a
   * criança acabou de fazer, junto com o "Desfazer", e a posição apontava para
   * outra atividade.
   */
  const [lists] = useState(() => ({ todo, ahead }));
  // Das props novas, aproveita-se só o que o servidor sabe agora: as versões, e
  // quais atividades continuam pendentes lá.
  const pendingOnServer = useMemo(
    () => new Map([...todo, ...ahead].map((entry) => [entry.item.id, entry.item.version])),
    [todo, ahead],
  );
  const [mode, setMode] = useState<Mode>("todo");
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [finished, setFinished] = useState(lists.todo.length === 0);
  const [error, setError] = useState("");
  // O que o leitor de tela ouve: uma região viva só, que existe desde o começo.
  const [announcement, setAnnouncement] = useState("");
  /**
   * A versão mais nova que esta tela conhece de cada atividade. Concluir sobe a
   * versão no servidor, e o "Desfazer" que vem logo depois precisa mandar a
   * nova. Vale a maior entre esta e a das props, como em `useCardToggle`.
   */
  const versions = useRef(new Map<string, number>());
  /** Atividades que levaram conflito: o próximo refresh diz como elas estão. */
  const conflicted = useRef(new Set<string>());
  /**
   * Trava enquanto a gravação está no ar: o segundo toque de um duplo toque
   * não pode virar uma segunda gravação, nem desfazer o que ainda não subiu.
   */
  const [saving, setSaving] = useState(false);
  /**
   * "Próxima" nasce no lugar de "Feito!". Sem rede, a gravação vai para a fila
   * em milissegundos e `saving` não segura o segundo toque de um duplo toque,
   * que virava "Próxima" (ou "Terminar") sem dar chance ao "Desfazer". O botão
   * novo espera um instante, à vista, antes de aceitar toque.
   */
  const [settling, setSettling] = useState(false);
  const settleTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  useEffect(
    () => () => {
      if (settleTimer.current) clearTimeout(settleTimer.current);
    },
    [],
  );

  // Depois de um conflito, o servidor decide: se a atividade voltou pendente
  // nas props, ela não está feita; se sumiu delas, está.
  useEffect(() => {
    if (!conflicted.current.size) return;
    const ids = [...conflicted.current];
    conflicted.current.clear();
    setDoneIds((current) => {
      const next = new Set(current);
      for (const id of ids) {
        if (pendingOnServer.has(id)) next.delete(id);
        else next.add(id);
      }
      return next;
    });
  }, [pendingOnServer]);

  const list = mode === "todo" ? lists.todo : lists.ahead;
  const safeIndex = Math.min(index, Math.max(list.length - 1, 0));
  const current = list[safeIndex];
  const doneInList = list.filter((entry) => doneIds.has(entry.item.id)).length;
  const allDone = list.length > 0 && doneInList === list.length;
  const aheadLeft = lists.ahead.filter((entry) => !doneIds.has(entry.item.id)).length;

  const write = useCallback(
    async (entry: ActivityOverviewItem, status: "done" | "pending") => {
      const { id } = entry.item;
      const version = Math.max(
        versions.current.get(id) ?? 0,
        pendingOnServer.get(id) ?? entry.item.version,
      );
      setSaving(true);
      setError("");
      const result = await submitTaskStatus({
        id,
        version,
        status,
        title: entry.item.title,
        userId: queueOwner,
      });
      setSaving(false);
      if (result.ok) {
        // Enfileirado (sem rede) também é sucesso: a decisão está guardada no
        // aparelho, e quem avisa o que ainda não subiu é a barra do layout.
        const value = result.value as { version?: unknown };
        if (typeof value?.version === "number") versions.current.set(id, value.version);
        return true;
      }
      if (result.error.code === "VERSION_CONFLICT") {
        // A versão guardada é a que perdeu: o refresh traz a do servidor.
        versions.current.delete(id);
        conflicted.current.add(id);
      }
      setError(
        result.error.code === "VERSION_CONFLICT"
          ? "Alguém mudou essa atividade agora. Já atualizamos, pode tentar de novo."
          : "Não deu para guardar agora. Tente de novo daqui a pouco.",
      );
      // Sem o refresh, a versão continuaria a do carregamento e todo toque
      // seguinte levaria o mesmo conflito, indefinidamente.
      router.refresh();
      return false;
    },
    [queueOwner, router, pendingOnServer],
  );

  const markDone = useCallback(
    (entry: ActivityOverviewItem) => {
      if (saving) return;
      const { id } = entry.item;
      setDoneIds((ids) => new Set(ids).add(id));
      setAnnouncement(`Feito: ${entry.item.title}`);
      setSettling(true);
      if (settleTimer.current) clearTimeout(settleTimer.current);
      settleTimer.current = setTimeout(() => setSettling(false), 450);
      void write(entry, "done").then((ok) => {
        if (ok) return;
        // Devolve a atividade em vez de fingir que deu certo.
        setDoneIds((ids) => {
          const next = new Set(ids);
          next.delete(id);
          return next;
        });
      });
    },
    [saving, write],
  );

  const undo = useCallback(
    (entry: ActivityOverviewItem) => {
      if (saving) return;
      const { id } = entry.item;
      setDoneIds((ids) => {
        const next = new Set(ids);
        next.delete(id);
        return next;
      });
      setAnnouncement(`Desfeito: ${entry.item.title}`);
      void write(entry, "pending").then((ok) => {
        if (!ok) setDoneIds((ids) => new Set(ids).add(id));
      });
    },
    [saving, write],
  );

  // A próxima que ainda falta, a partir da atual. Com tudo feito, a tela fecha.
  const next = () => {
    if (allDone) {
      setFinished(true);
      return;
    }
    for (let step = 1; step <= list.length; step += 1) {
      const candidate = (safeIndex + step) % list.length;
      const entry = list[candidate];
      if (entry && !doneIds.has(entry.item.id)) {
        setIndex(candidate);
        return;
      }
    }
  };

  const startAhead = () => {
    setMode("ahead");
    const first = lists.ahead.findIndex((entry) => !doneIds.has(entry.item.id));
    setIndex(Math.max(first, 0));
    setFinished(false);
  };

  // O responsável precisa ver o resultado ao voltar: Hoje é renderizada no
  // servidor, e sem isto o que foi feito aqui continuaria lá até recarregar.
  const leave = useCallback(() => {
    router.push(`/dashboard?perfil=${encodeURIComponent(profile.id)}`);
    router.refresh();
  }, [router, profile.id]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-[18px] px-5 pb-6 pt-5">
      <header className="flex items-center gap-3">
        <StudentAvatar name={profile.name} size="lg" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[26px] font-extrabold tracking-[-0.02em]">
            Oi, {profile.name}!
          </p>
          {!finished && list.length > 0 ? (
            <ProgressDots list={list} doneIds={doneIds} currentIndex={safeIndex} />
          ) : null}
        </div>
        <ExitButton onExit={leave} />
      </header>

      {finished || !current ? (
        <FinishedCard
          name={profile.name}
          doneCount={doneIds.size}
          aheadLeft={mode === "todo" ? aheadLeft : 0}
          onAhead={startAhead}
          onLeave={leave}
        />
      ) : (
        <ActivityStage
          key={`${mode}:${current.item.id}`}
          entry={current}
          todayIso={todayIso}
          done={doneIds.has(current.item.id)}
          position={safeIndex + 1}
          total={list.length}
          saving={saving}
          settling={settling}
          isLast={allDone}
          onDone={() => markDone(current)}
          onUndo={() => undo(current)}
          onNext={next}
          onPrev={() => setIndex((safeIndex - 1 + list.length) % list.length)}
          onSkip={() => setIndex((safeIndex + 1) % list.length)}
        />
      )}

      {error ? (
        <p role="alert" className="text-center text-sm font-medium text-destructive-ink">
          {error}
        </p>
      ) : null}
      <p className="sr-only" aria-live="polite">
        {announcement}
      </p>
    </main>
  );
}

/** Uma barra por atividade: feita em verde, a atual escura, as outras claras. */
function ProgressDots({
  list,
  doneIds,
  currentIndex,
}: {
  list: ActivityOverviewItem[];
  doneIds: ReadonlySet<string>;
  currentIndex: number;
}) {
  const done = list.filter((entry) => doneIds.has(entry.item.id)).length;
  return (
    <p className="mt-1.5 flex min-w-0 items-center gap-1 overflow-hidden">
      <span className="sr-only">
        {done} de {list.length} {list.length === 1 ? "feita" : "feitas"}
      </span>
      {list.map((entry, position) => (
        <span
          key={entry.item.id}
          aria-hidden
          className={cn(
            "h-2 w-8 min-w-1 shrink rounded-full",
            doneIds.has(entry.item.id)
              ? "bg-chart-2"
              : position === currentIndex
                ? "bg-foreground"
                : "bg-foreground/15",
          )}
        />
      ))}
    </p>
  );
}

function ActivityStage({
  entry,
  todayIso,
  done,
  position,
  total,
  saving,
  settling,
  isLast,
  onDone,
  onUndo,
  onNext,
  onPrev,
  onSkip,
}: {
  entry: ActivityOverviewItem;
  todayIso: string;
  done: boolean;
  position: number;
  total: number;
  saving: boolean;
  /** "Próxima" acabou de nascer no lugar de "Feito!": ainda não aceita toque. */
  settling: boolean;
  isLast: boolean;
  onDone: () => void;
  onUndo: () => void;
  onNext: () => void;
  onPrev: () => void;
  onSkip: () => void;
}) {
  const item = entry.item;
  // Os botões só agem por JS. Antes de hidratar, o "Feito!" da criança sumia
  // sem nada acontecer (o mesmo defeito do `ready` de `useCardToggle`).
  const hydrated = useHydrated();
  const dot = item.subjectColorIndex !== null ? DOT_CLASS[item.subjectColorIndex] : undefined;

  return (
    <section className="flex flex-1 flex-col gap-[18px]">
      <article className="flex flex-1 flex-col items-center justify-center gap-[18px] rounded-[30px] border border-foreground/15 bg-background p-7 text-center">
        <p className="flex items-center gap-2 text-[17px] font-bold">
          {dot ? <span aria-hidden className={cn("size-3 rounded-full", dot)} /> : null}
          {item.subjectName ?? ACTIVITY_TYPE_LABELS[item.type]}
        </p>
        <h1 className="text-balance text-[38px] font-extrabold leading-[1.08] tracking-[-0.035em]">
          {item.title}
        </h1>
        {item.description ? (
          <p className="max-w-prose whitespace-pre-wrap text-pretty text-lg leading-relaxed text-foreground/85">
            {item.description}
          </p>
        ) : null}
        <p className="text-[19px] text-foreground/80">{kidDueLabel(item.dueAt, todayIso)}</p>
        {done ? (
          <div className="flex flex-col items-center gap-1">
            <span className="inline-flex h-10 items-center gap-2 rounded-full bg-chart-2/15 px-4 font-extrabold text-chart-2-ink">
              <Check className="size-5" aria-hidden />
              Feito
            </span>
            <Button
              type="button"
              variant="ghost"
              onClick={onUndo}
              disabled={!hydrated || saving}
              className="min-h-11 font-bold text-primary-ink"
            >
              Desfazer
            </Button>
          </div>
        ) : null}
      </article>

      {done ? (
        <Button
          type="button"
          variant="outline"
          onClick={onNext}
          disabled={!hydrated || saving || settling}
          className="h-[76px] w-full touch-manipulation rounded-[22px] border-2 border-foreground text-2xl font-extrabold"
        >
          {isLast ? "Terminar" : "Próxima"}
        </Button>
      ) : (
        <Button
          type="button"
          onClick={onDone}
          disabled={!hydrated || saving}
          // `touch-manipulation` tira o atraso de 300 ms e o zoom de duplo toque:
          // o dedo de uma criança repete o toque, e o botão precisa responder ao
          // primeiro sem guardar o segundo.
          className="h-[76px] w-full touch-manipulation rounded-[22px] text-[28px] font-extrabold shadow-solid-primary transition-transform active:translate-y-0.5 active:shadow-none motion-reduce:transition-none [&_svg]:size-8"
        >
          <Check aria-hidden />
          Feito!
        </Button>
      )}

      {total > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Trocar de atividade">
          <Button
            type="button"
            variant="ghost"
            onClick={onPrev}
            disabled={!hydrated}
            className="min-h-12 px-4 text-base font-bold"
          >
            Voltar
          </Button>
          <span className="text-[15px] font-bold tabular-nums text-muted-foreground">
            {position} de {total}
          </span>
          <Button
            type="button"
            variant="ghost"
            onClick={onSkip}
            disabled={!hydrated}
            className="min-h-12 px-4 text-base font-bold"
          >
            Depois
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

function FinishedCard({
  name,
  doneCount,
  aheadLeft,
  onAhead,
  onLeave,
}: {
  name: string;
  doneCount: number;
  /** O que ainda dá para adiantar nesta semana. Zero esconde a pergunta. */
  aheadLeft: number;
  onAhead: () => void;
  onLeave: () => void;
}) {
  const hydrated = useHydrated();
  return (
    <section className="flex flex-1 flex-col gap-4">
      <div className="flex flex-1 flex-col items-center justify-center gap-4 px-3 text-center">
        <DayClosedIllustration className="max-w-[220px]" />
        {doneCount > 0 ? (
          <>
            <h1 className="text-[36px] font-extrabold leading-[1.08] tracking-tight">
              Tudo feito por hoje, {name}!
            </h1>
            <p className="text-lg leading-relaxed text-foreground/80">
              Você cuidou de {doneCount === 1 ? "1 coisa" : `${doneCount} coisas`}. Agora é com quem
              te passou o celular.
            </p>
          </>
        ) : (
          <>
            <h1 className="text-[36px] font-extrabold leading-[1.08] tracking-tight">
              Nada para fazer agora, {name}!
            </h1>
            <p className="text-lg leading-relaxed text-foreground/80">
              Até a próxima aula está tudo em dia.
            </p>
          </>
        )}
        {aheadLeft > 0 ? (
          <div className="w-full space-y-2 rounded-[22px] border border-foreground/15 bg-background p-4">
            <p className="text-lg font-extrabold">Quer adiantar?</p>
            <p className="text-[15px] text-foreground/80">
              {aheadLeft === 1
                ? "Tem mais uma coisa para os próximos dias."
                : `Tem mais ${aheadLeft} coisas para os próximos dias.`}
            </p>
            <Button
              type="button"
              variant="outline"
              onClick={onAhead}
              disabled={!hydrated}
              className="min-h-12 w-full rounded-2xl border-2 border-foreground text-base font-extrabold"
            >
              Adiantar
            </Button>
          </div>
        ) : null}
      </div>
      <Button
        type="button"
        onClick={onLeave}
        disabled={!hydrated}
        className="h-16 w-full rounded-[20px] bg-foreground text-xl font-extrabold text-background hover:bg-foreground/90"
      >
        Devolver o celular
      </Button>
    </section>
  );
}

/**
 * Sair exige segurar o dedo.
 *
 * É um quebra-molas, não uma tranca: qualquer pessoa que segure sai, e não há
 * nada aqui que impeça alguém decidido de navegar para outro lugar. O que ele
 * evita é o toque distraído no meio de uma tarefa. Uma tranca de verdade
 * exigiria PIN guardado por conta, e isso é outra conversa.
 */
function ExitButton({ onExit }: { onExit: () => void }) {
  const [progress, setProgress] = useState(0);
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);
  /**
   * Houve ponteiro de verdade neste ciclo?
   *
   * Um leitor de tela ativa o botão sintetizando `click`, sem `pointerdown` e
   * sem `keydown`, e o adulto que usa TalkBack ficava sem saída do modo
   * criança. O `onClick` abaixo existe para esse caso, e a flag impede que ele
   * atalhe o "segurar" de quem tocou com o dedo.
   */
  const usedPointer = useRef(false);

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  }, []);
  // Dedo que escorregou para fora ou gesto cancelado não viram clique: a flag
  // zera aqui, senão engoliria o próximo clique sintetizado por leitor de tela.
  // Depois do `pointerup` ela fica ligada, porque o `click` vem logo em seguida
  // e precisa saber que foi dedo (é ele que zera).
  const abandon = useCallback(() => {
    stop();
    usedPointer.current = false;
  }, [stop]);

  // Segurar e sair da aba deixaria o intervalo correndo.
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
    usedPointer.current = true;
    if (timer.current) return;
    const startedAt = Date.now();
    timer.current = setInterval(() => {
      const ratio = Math.min(1, (Date.now() - startedAt) / EXIT_HOLD_MS);
      setProgress(ratio);
      if (ratio >= 1) {
        stop();
        onExit();
      }
    }, 40);
  }, [onExit, stop]);

  return (
    <button
      type="button"
      // O nome acessível começa pelo que está escrito no botão (WCAG 2.5.3).
      aria-label="Segure para devolver o celular"
      // `touch-none` para o dedo escorregando não virar rolagem: sem isto um
      // arrasto mínimo durante os 900 ms disparava `pointercancel` e zerava a
      // barra sem explicar nada.
      className="relative flex w-[76px] shrink-0 touch-none select-none flex-col items-center gap-1 overflow-hidden rounded-2xl px-1 py-2 text-[11px] font-bold leading-tight text-muted-foreground focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={abandon}
      onPointerCancel={abandon}
      onClick={() => {
        // Com dedo ou mouse, o clique vem depois do `pointerup` com a flag
        // ligada: soltar antes do tempo não sai, só segurar até o fim. Sem
        // ponteiro, é clique sintetizado por tecnologia assistiva, e sai.
        if (usedPointer.current) {
          usedPointer.current = false;
          return;
        }
        onExit();
      }}
      onKeyDown={(event) => {
        // `repeat` guarda o Enter segurado: sem isto, cada repetição disparava
        // um `push` e um `refresh`.
        if (event.repeat) return;
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          usedPointer.current = false;
          onExit();
        }
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0 bg-primary/25 transition-[height] duration-75 motion-reduce:transition-none"
        style={{ height: `${progress * 100}%` }}
        aria-hidden
      />
      <LogOut className="relative size-[22px]" aria-hidden />
      <span className="relative" aria-hidden>
        Segure para devolver
      </span>
    </button>
  );
}
