"use client";

import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { CheckCircle2, ChevronRight, HelpCircle } from "lucide-react";
import { useEffect, useState } from "react";
import type { StudentProfile } from "@/features/students/types";
import type { TurmaWithSubjectsForForm } from "../types";
import { formatTurmaShort } from "../utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmas: TurmaWithSubjectsForForm[];
  profiles: StudentProfile[];
  /**
   * Turma "vencedora" inferida pelo backend a partir de
   * `studentNameHint`/`subjectHint`. Quando definida, o dialog mostra o
   * palpite como confirmação rápida. Quando `null`, exige seleção
   * obrigatória pelo user.
   */
  guessedTurmaId: string | null;
  onConfirm: (turmaId: string) => void;
};

/**
 * Passo intermediário entre o parse (voz/imagem) e o batch confirm dialog.
 * Tem três comportamentos:
 *
 * 1. `guessedTurmaId` definido → "Identifiquei a turma de [Filho] — [Escola
 *    · 5º A]" com botões "Confirmar" / "Não, escolher outra" (revela select).
 * 2. `guessedTurmaId === null` → "Não consegui identificar a turma. Escolha:"
 *    + select com todas as turmas ativas.
 * 3. `turmas.length === 1` → auto-confirma e chama `onConfirm` sem renderizar
 *    visualmente (pai pode evitar abrir, mas o componente é resiliente).
 *
 * O batch confirm dialog abre logo depois, com a turma escolhida travada
 * no header.
 */
export function TurmaConfirmDialog({
  open,
  onOpenChange,
  turmas,
  profiles,
  guessedTurmaId,
  onConfirm,
}: Props) {
  const [selectedTurmaId, setSelectedTurmaId] = useState<string | null>(null);
  // Quando o user clica "Não, escolher outra", revelamos o select inline em
  // vez de auto-confirmar com o palpite.
  const [overridingGuess, setOverridingGuess] = useState(false);

  // Reset state a cada abertura. Auto-skip quando o user tem 1 turma só
  // (qualquer batch é dela) — chama onConfirm imediatamente e o pai segue
  // pro batch confirm.
  // biome-ignore lint/correctness/useExhaustiveDependencies: só reagimos a open transitions
  useEffect(() => {
    if (!open) {
      setSelectedTurmaId(null);
      setOverridingGuess(false);
      return;
    }
    if (turmas.length === 1) {
      const only = turmas[0];
      if (only) {
        onConfirm(only.turmaId);
        return;
      }
    }
    setSelectedTurmaId(guessedTurmaId);
    setOverridingGuess(false);
  }, [open]);

  const guessedTurma = guessedTurmaId
    ? (turmas.find((t) => t.turmaId === guessedTurmaId) ?? null)
    : null;
  const guessedStudent = guessedTurma
    ? (profiles.find((p) => p.activeTurmaId === guessedTurma.turmaId) ?? null)
    : null;

  const showSelect = guessedTurma === null || overridingGuess;
  const canContinue = showSelect ? !!selectedTurmaId : true;

  const handleConfirm = () => {
    const turmaId = showSelect ? selectedTurmaId : (guessedTurma?.turmaId ?? null);
    if (!turmaId) return;
    onConfirm(turmaId);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>Confirme a turma das atividades</DialogTitle>
          <DialogDescription>
            Antes de revisar as atividades, confirme a qual turma elas pertencem. Todas as
            atividades detectadas vão para essa turma.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-3 py-2">
          {guessedTurma && !overridingGuess ? (
            <div className="rounded-lg border border-chart-2/40 bg-chart-2/10 p-4">
              <div className="flex items-start gap-3">
                <span className="mt-0.5 flex size-8 shrink-0 items-center justify-center rounded-full bg-chart-2/20 text-chart-2">
                  <CheckCircle2 className="size-5" aria-hidden />
                </span>
                <div className="flex-1">
                  <p className="text-sm font-medium text-foreground">
                    Identifiquei a turma{guessedStudent ? ` de ${guessedStudent.name}` : ""}
                  </p>
                  <p className="mt-0.5 text-sm text-muted-foreground">
                    {guessedTurma.schoolName} —{" "}
                    {formatTurmaShort(
                      guessedTurma.grade,
                      guessedTurma.classLetter,
                      guessedTurma.year,
                    )}
                  </p>
                </div>
              </div>
              <div className="mt-3 flex justify-end">
                <Button
                  type="button"
                  variant="ghost"
                  size="sm"
                  className="text-xs"
                  onClick={() => {
                    setOverridingGuess(true);
                    setSelectedTurmaId(null);
                  }}
                >
                  Não, escolher outra
                </Button>
              </div>
            </div>
          ) : (
            <div className="space-y-2">
              <div className="flex items-start gap-2 rounded-lg border border-chart-4/40 bg-chart-4/10 p-3 text-sm">
                <HelpCircle className="mt-0.5 size-4 shrink-0 text-chart-4" aria-hidden />
                <p className="text-foreground">
                  Não consegui identificar a turma. Escolha a qual ela pertence:
                </p>
              </div>
              <Select
                value={selectedTurmaId ?? undefined}
                onValueChange={(v) => setSelectedTurmaId(v)}
              >
                <SelectTrigger>
                  <SelectValue placeholder="Selecione a turma" />
                </SelectTrigger>
                <SelectContent>
                  {turmas.map((t) => {
                    const profile = profiles.find((p) => p.activeTurmaId === t.turmaId);
                    return (
                      <SelectItem key={t.turmaId} value={t.turmaId}>
                        {profile ? `${profile.name} · ` : ""}
                        {t.schoolName} — {formatTurmaShort(t.grade, t.classLetter, t.year)}
                      </SelectItem>
                    );
                  })}
                </SelectContent>
              </Select>
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={() => onOpenChange(false)}>
            Cancelar
          </Button>
          <Button type="button" onClick={handleConfirm} disabled={!canContinue}>
            Confirmar
            <ChevronRight className="ml-1 size-4" aria-hidden />
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}
