"use client";

import { cn } from "@informach/ui/lib/utils";
import type { ActivityListItem } from "@/features/activities/types";
import { getActivityTypeIcon, getDueUrgency } from "@/features/activities/utils";
import {
  getSubjectTextClassByIndex,
  getSubjectTintedClassByIndex,
} from "@/features/subjects/utils";

type Props = {
  item: ActivityListItem;
  onSelect: () => void;
};

// Blip clicável que aparece dentro da célula de um dia na grid mensal.
// - Fundo/borda da matéria (chart-N/15 e /40) — identidade visual da matéria.
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

const TYPE_A11Y_LABEL: Record<string, string> = {
  task: "tarefa",
  exam: "prova",
  project: "projeto",
  reminder: "recado",
};

export function ActivityBlip({ item, onSelect }: Props) {
  const TypeIcon = getActivityTypeIcon(item.type);
  const isDone = item.status === "done";
  const urgency = getDueUrgency(item.dueAt, item.status);
  const isOverdue = urgency === "overdue";
  const isDueSoon = urgency === "due_soon";

  // Label completa pra screen reader. A cor da matéria já não é acessível
  // por canal visual; o nome da matéria precisa entrar verbalmente. O
  // status (concluída/atrasada/vence em breve) entra pra que o user de SR
  // saiba o sinal visual sem precisar ver borda/ring.
  const typeLabel = TYPE_A11Y_LABEL[item.type] ?? "atividade";
  const statusLabel = isDone
    ? "concluída"
    : (URGENCY_A11Y_LABEL[urgency] ?? URGENCY_A11Y_LABEL.upcoming);
  const ariaLabel =
    `${typeLabel} de ${item.subjectName}: ${item.title}` +
    ` — ${item.studentProfileName} — ${statusLabel}`;

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
        getSubjectTintedClassByIndex(item.subjectColorIndex),
        isOverdue && "border-l-2 border-l-destructive",
        isDueSoon && "ring-1 ring-chart-4/40",
        isDone && "opacity-60",
      )}
      aria-label={ariaLabel}
    >
      <TypeIcon
        className={cn("size-3 shrink-0", getSubjectTextClassByIndex(item.subjectColorIndex))}
        aria-hidden
      />
      <span
        className={cn(
          "truncate font-medium text-foreground/90",
          isDone && "line-through text-muted-foreground",
        )}
        aria-hidden
      >
        {item.title}
      </span>
    </button>
  );
}
