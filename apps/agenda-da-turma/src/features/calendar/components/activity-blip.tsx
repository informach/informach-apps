"use client";

import { cn } from "@informach/ui/lib/utils";
import { getActivityTypeIcon, getDueUrgency } from "@/features/activities/utils";
import {
  getSubjectTextClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";
import { ACTIVITY_TYPE_SHORT_LABELS } from "@/features/unified-activities/activity-types";
import type { TaskRow } from "@/features/unified-activities/task-repository";

type Props = {
  item: TaskRow;
  onSelect: () => void;
};

// Blip clicável que aparece dentro da célula de um dia na grid mensal.
// - Fundo/borda da matéria (chart-N/15 e /40) — identidade visual da matéria.
// - Extras ganham borda dashed sutil pra diferenciar visualmente da turma
//   sem trocar a cor (mesma paleta chart-N, ícone do tipo igual).
// - Sinal de status sobreposto:
//   - done → opacidade reduzida + line-through no texto.
//   - overdue → borda esquerda destructive grossa (lateral pra não trocar a
//     cor da matéria, só sinalizar urgência).
//   - due_soon (hoje/amanhã) → anel sutil chart-4 (laranja "atenção").
//   - upcoming → sem sinal extra.
// - Ícone do tipo (CheckSquare/ClipboardCheck/...) compactíssimo (size-3).
// - Truncate em uma linha — espaço da célula é limitado.

const URGENCY_A11Y_LABEL: Record<string, string> = {
  overdue: "atrasada",
  due_soon: "vence em breve",
  upcoming: "futura",
};

// O rótulo do tipo vem do vocabulário único. Havia aqui um mapa próprio com
// quatro dos oito tipos — `material`, `authorization`, `event` e `study` caíam
// no genérico "atividade" para quem usa leitor de tela, e o mapa era uma
// segunda fonte para uma lista que `activity-types.ts` declara ser única.

export function ActivityBlip({ item, onSelect }: Props) {
  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = item.status === "done";
  const canceled = item.status === "canceled";
  const urgency = getDueUrgency(item.dueAt ?? "", item.status === "done" ? "done" : "pending");
  const isOverdue = urgency === "overdue";
  const isDueSoon = urgency === "due_soon";

  const isExtra = item.profileSubjectId !== null;
  const colorIndex = item.subjectColorIndex ?? 0;
  const subjectName = item.subjectName ?? "sem matéria";

  // `agenda.activities.type` é `text` sem CHECK: uma linha antiga fora do
  // vocabulário precisa degradar, não quebrar o card.
  const typeLabel = ACTIVITY_TYPE_SHORT_LABELS[item.type] ?? "atividade";
  const statusLabel = canceled
    ? "cancelada"
    : isDone
      ? "concluída"
      : (URGENCY_A11Y_LABEL[urgency] ?? URGENCY_A11Y_LABEL.upcoming);
  const sourceLabel = isExtra ? " (fora da escola)" : "";
  const ariaLabel =
    `${typeLabel} de ${subjectName}${sourceLabel}: ${item.title}` +
    `, de ${item.profileName}, ${statusLabel}`;

  return (
    <button
      type="button"
      onClick={(e) => {
        // Evita disparar o handler de "criar atividade" do day-cell pai.
        e.stopPropagation();
        onSelect();
      }}
      className={cn(
        "group flex w-full items-center gap-1 truncate rounded-sm border px-1.5 py-0.5 text-left text-xs",
        "transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring",
        "hover:brightness-95 dark:hover:brightness-110",
        getSubjectTintedClassByIndex(colorIndex),
        // Extras: borda dashed pra diferenciar fonte sem trocar a cor.
        // Mantém a mesma paleta chart-N, só muda o estilo da linha.
        isExtra && "border-dashed",
        isOverdue && "border-l-2 border-l-destructive",
        isDueSoon && "ring-1 ring-chart-4/40",
        (isDone || canceled) && "opacity-60",
      )}
      aria-label={ariaLabel}
    >
      <TypeIcon
        className={cn("size-3 shrink-0", getSubjectTextClassByIndex(colorIndex))}
        aria-hidden
      />
      <span
        className={cn(
          "truncate font-medium text-foreground/90",
          (isDone || canceled) && "line-through text-muted-foreground",
        )}
        aria-hidden
      >
        {item.title}
      </span>
    </button>
  );
}
