"use client";

import { Button } from "@informach/ui/components/button";
import { cn } from "@informach/ui/lib/utils";
import { Check, ChevronLeft, ChevronRight, LogOut, PartyPopper } from "lucide-react";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { DayClosedIllustration } from "@/components/illustrations";
import { setNoticeStatusAction } from "@/features/notices/actions";
import { StudentAvatar } from "@/features/students/components/student-avatar";
import { getSubjectIcon, getSubjectTintedClassByIndex } from "@/features/subjects/utils";
import { ACTIVITY_TYPE_LABELS } from "@/features/unified-activities/activity-types";
import type { ActivityOverviewItem } from "@/features/unified-activities/overview-types";
import { getActivityPresentation } from "@/features/unified-activities/presentation";
import { catchActionResult } from "@/lib/action-result";

type Props = {
  profile: { id: string; name: string };
  todo: ActivityOverviewItem[];
  todayIso: string;
};

/** Quanto tempo o dedo fica no botão de sair. Longo o bastante para não ser toque. */
const EXIT_HOLD_MS = 900;

/**
 * A tela da criança.
 *
 * O responsável abre e passa o telefone. Uma atividade por vez, tipografia
 * grande, a cor da matéria ocupando a tela e um botão de "Feito!" que não erra
 * o dedo. Sem menu, sem edição, sem cobrança — e sem prazo em vermelho: para
 * quem tem oito anos, "atrasada" não é informação, é susto. A criança vê o que
 * há para hoje; a negociação sobre o que atrasou é dos adultos.
 *
 * Não há placar e não há comparação com irmãos. O progresso é o da própria
 * criança, no próprio dia.
 */
export function KidModeScreen({ profile, todo, todayIso }: Props) {
  const router = useRouter();
  const [doneIds, setDoneIds] = useState<ReadonlySet<string>>(new Set());
  const [index, setIndex] = useState(0);
  const [error, setError] = useState("");

  const remaining = todo.filter((entry) => !doneIds.has(entry.item.id));
  const finished = remaining.length === 0;
  const current = remaining[Math.min(index, Math.max(remaining.length - 1, 0))];
  const total = todo.length;
  const doneCount = doneIds.size;

  const complete = useCallback((entry: ActivityOverviewItem) => {
    const { id, version } = entry.item;
    setDoneIds((current) => new Set(current).add(id));
    setIndex(0);
    setError("");
    void (async () => {
      const result = await catchActionResult(() =>
        setNoticeStatusAction({ id, version, status: "done" }),
      );
      if (!result.ok) {
        // Devolve a atividade em vez de fingir que deu certo: a criança volta
        // a ver o mesmo card, e o recado é sobre a rede, não sobre ela.
        setDoneIds((current) => {
          const next = new Set(current);
          next.delete(id);
          return next;
        });
        setError("Não deu para guardar agora. Tente de novo daqui a pouco.");
      }
    })();
  }, []);

  // O responsável precisa ver o resultado ao voltar: a rotina dele é server
  // rendered, e sem isto os cards concluídos aqui continuariam lá até o próximo
  // carregamento.
  const leave = useCallback(() => {
    router.push(`/dashboard?perfil=${encodeURIComponent(profile.id)}`);
    router.refresh();
  }, [router, profile.id]);

  return (
    <main className="mx-auto flex min-h-dvh w-full max-w-lg flex-col gap-5 px-4 py-5">
      <header className="flex items-center gap-3">
        <StudentAvatar name={profile.name} size="sm" className="shrink-0" />
        <div className="min-w-0 flex-1">
          <p className="truncate text-xl font-extrabold tracking-tight">{profile.name}</p>
          <p className="text-sm text-muted-foreground">
            {total === 0
              ? "Nada para hoje"
              : `${doneCount} de ${total} ${total === 1 ? "feita" : "feitas"}`}
          </p>
        </div>
        <ExitButton onExit={leave} />
      </header>

      {total > 0 ? (
        <div
          className="h-3 overflow-hidden rounded-full bg-muted"
          role="progressbar"
          aria-valuemin={0}
          aria-valuemax={total}
          aria-valuenow={doneCount}
          aria-label={`${doneCount} de ${total} atividades feitas`}
        >
          <div
            className="h-full rounded-full bg-chart-2 transition-[width] duration-500 ease-out motion-reduce:transition-none"
            style={{ width: `${total === 0 ? 0 : (doneCount / total) * 100}%` }}
          />
        </div>
      ) : null}

      {finished ? (
        <FinishedCard name={profile.name} doneCount={doneCount} onLeave={leave} />
      ) : current ? (
        <ActivityStage
          key={current.item.id}
          entry={current}
          todayIso={todayIso}
          position={index + 1}
          remainingCount={remaining.length}
          onDone={() => complete(current)}
          onPrev={() => setIndex((value) => Math.max(0, value - 1))}
          onNext={() => setIndex((value) => Math.min(remaining.length - 1, value + 1))}
        />
      ) : null}

      {error ? (
        <p role="alert" className="text-center text-sm font-medium text-destructive">
          {error}
        </p>
      ) : null}
    </main>
  );
}

function ActivityStage({
  entry,
  todayIso,
  position,
  remainingCount,
  onDone,
  onPrev,
  onNext,
}: {
  entry: ActivityOverviewItem;
  todayIso: string;
  position: number;
  remainingCount: number;
  onDone: () => void;
  onPrev: () => void;
  onNext: () => void;
}) {
  const item = entry.item;
  const presentation = getActivityPresentation(item.type);
  const TypeIcon = presentation.icon;
  const SubjectIcon = item.subjectName ? getSubjectIcon(item.subjectName) : TypeIcon;
  const surface =
    item.subjectColorIndex !== null
      ? getSubjectTintedClassByIndex(item.subjectColorIndex)
      : presentation.surface;

  return (
    <section className="flex flex-1 flex-col gap-5">
      <article
        className={cn(
          "flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl border-2 p-6 text-center",
          surface,
        )}
      >
        <span className="flex size-24 items-center justify-center rounded-3xl bg-background/70">
          <SubjectIcon className="size-12 text-foreground" aria-hidden />
        </span>
        <div className="space-y-2">
          {item.subjectName ? (
            <p className="text-sm font-bold uppercase tracking-[0.08em] text-foreground/70">
              {item.subjectName}
            </p>
          ) : null}
          <h1 className="text-balance text-3xl font-extrabold leading-tight tracking-tight">
            {item.title}
          </h1>
          <p className="inline-flex items-center gap-1.5 rounded-full bg-background/70 px-3 py-1 text-sm font-semibold">
            <TypeIcon className="size-4" aria-hidden />
            {ACTIVITY_TYPE_LABELS[item.type]}
          </p>
        </div>
        {item.description ? (
          <p className="max-w-prose whitespace-pre-wrap text-pretty text-lg leading-relaxed text-foreground/90">
            {item.description}
          </p>
        ) : null}
        <p className="text-sm font-medium text-foreground/70">
          {/*
            Sem vermelho e sem "atrasada". O prazo vencido continua existindo
            para os adultos, na rotina; aqui ele só vira "é para hoje".
          */}
          {item.dueAt === null || item.dueAt <= todayIso ? "É para hoje" : "É para esta semana"}
        </p>
      </article>

      <Button
        type="button"
        onClick={onDone}
        className="h-16 w-full rounded-2xl text-lg font-extrabold shadow-solid-primary transition-transform active:translate-y-0.5 active:shadow-none motion-reduce:transition-none [&_svg]:size-7"
      >
        <Check aria-hidden />
        Feito!
      </Button>

      {remainingCount > 1 ? (
        <nav className="flex items-center justify-between" aria-label="Trocar de atividade">
          <Button
            variant="ghost"
            onClick={onPrev}
            disabled={position === 1}
            className="h-12 rounded-xl"
          >
            <ChevronLeft aria-hidden />
            Anterior
          </Button>
          <span className="text-sm font-semibold tabular-nums text-muted-foreground">
            {position} de {remainingCount}
          </span>
          <Button
            variant="ghost"
            onClick={onNext}
            disabled={position === remainingCount}
            className="h-12 rounded-xl"
          >
            Depois
            <ChevronRight aria-hidden />
          </Button>
        </nav>
      ) : null}
    </section>
  );
}

function FinishedCard({
  name,
  doneCount,
  onLeave,
}: {
  name: string;
  doneCount: number;
  onLeave: () => void;
}) {
  return (
    <section className="flex flex-1 flex-col items-center justify-center gap-5 rounded-3xl border-2 border-chart-2/40 bg-chart-2/10 p-8 text-center">
      {doneCount > 0 ? (
        <>
          <PartyPopper className="size-12 text-chart-2-ink" aria-hidden />
          <DayClosedIllustration className="max-w-[180px]" />
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Acabou, {name}!</h1>
            <p className="text-lg text-muted-foreground">
              {doneCount === 1
                ? "Você cuidou de 1 atividade hoje."
                : `Você cuidou de ${doneCount} atividades hoje.`}
            </p>
          </div>
        </>
      ) : (
        <>
          <DayClosedIllustration className="max-w-[180px]" />
          <div className="space-y-2">
            <h1 className="text-3xl font-extrabold tracking-tight">Nada para hoje!</h1>
            <p className="text-lg text-muted-foreground">Dia livre, {name}. Aproveite.</p>
          </div>
        </>
      )}
      <Button onClick={onLeave} variant="outline" className="h-14 rounded-2xl text-base font-bold">
        Devolver o telefone
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

  const stop = useCallback(() => {
    if (timer.current) clearInterval(timer.current);
    timer.current = null;
    setProgress(0);
  }, []);

  // Segurar e sair da aba deixaria o intervalo correndo.
  useEffect(() => stop, [stop]);

  const start = useCallback(() => {
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
    <Button
      type="button"
      variant="ghost"
      size="icon"
      aria-label="Segurar para sair do modo criança"
      className="relative size-12 shrink-0 overflow-hidden rounded-2xl"
      onPointerDown={start}
      onPointerUp={stop}
      onPointerLeave={stop}
      onPointerCancel={stop}
      // Teclado não segura: quem chega por teclado é adulto, e Enter sai direto.
      onKeyDown={(event) => {
        if (event.key === "Enter" || event.key === " ") {
          event.preventDefault();
          onExit();
        }
      }}
    >
      <span
        className="absolute inset-x-0 bottom-0 bg-primary/25 transition-[height] duration-75 motion-reduce:transition-none"
        style={{ height: `${progress * 100}%` }}
        aria-hidden
      />
      <LogOut className="relative size-5" aria-hidden />
    </Button>
  );
}
