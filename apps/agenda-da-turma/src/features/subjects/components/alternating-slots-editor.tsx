"use client";

import { Button } from "@informach/ui/components/button";
import { Input } from "@informach/ui/components/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { Plus, Trash2 } from "lucide-react";
import { todayLocalIso } from "@/features/dashboard/date";
import { type AgendaClassDay, CLASS_DAY_LABEL_FULL, lastOnOrBeforeForDay } from "../class-days";
import type { AlternatingSlotInput } from "../types";

type SubjectOption = { id: string; name: string };

type Props = {
  value: AlternatingSlotInput[];
  onChange: (next: AlternatingSlotInput[]) => void;
  // Apenas dias que estão em classDays podem virar slots quinzenais. Editor
  // filtra pra não deixar marcar slot pra dia que nem é dia de aula.
  classDays: readonly AgendaClassDay[];
  // Outras matérias da turma — opções pro combobox de pareada. Lista NÃO
  // deve incluir a matéria sendo editada (caller filtra).
  turmaSubjects: readonly SubjectOption[];
  disabled?: boolean;
};

// Editor de slots de revezamento quinzenal. Cada slot representa "neste DIA,
// a matéria reveza com OUTRA, alternando 15-em-15 dias". Caller controla
// a lista (state lifted); componente é puro controlled.
export function AlternatingSlotsEditor({
  value,
  onChange,
  classDays,
  turmaSubjects,
  disabled,
}: Props) {
  // Dias já marcados como slots — não pode marcar de novo (UNIQUE no DB).
  const usedDays = new Set(value.map((s) => s.dayOfWeek));
  // Dias disponíveis pra adicionar um novo slot: estão em classDays mas
  // ainda não tem slot.
  const availableDays = classDays.filter((d) => !usedDays.has(d));

  const canAdd =
    !disabled && availableDays.length > 0 && turmaSubjects.length > 0 && availableDays[0] != null;

  const addSlot = () => {
    const day = availableDays[0];
    const firstPaired = turmaSubjects[0];
    if (!day || !firstPaired) return;
    onChange([
      ...value,
      {
        dayOfWeek: day,
        pairedSubjectId: firstPaired.id,
        anchorDate: lastOnOrBeforeForDay(day, todayLocalIso()),
      },
    ]);
  };

  const updateSlot = (index: number, patch: Partial<AlternatingSlotInput>) => {
    onChange(
      value.map((s, i) => {
        if (i !== index) return s;
        const next = { ...s, ...patch };
        // Se o dia mudou, reseta o anchor pro novo default (manter o anchor
        // antigo seria inconsistente — weekday do anchor não bate mais).
        if (patch.dayOfWeek && patch.dayOfWeek !== s.dayOfWeek) {
          next.anchorDate = lastOnOrBeforeForDay(patch.dayOfWeek, todayLocalIso());
        }
        return next;
      }),
    );
  };

  const removeSlot = (index: number) => {
    onChange(value.filter((_, i) => i !== index));
  };

  if (classDays.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Marque os dias de aula acima primeiro pra configurar revezamento quinzenal.
      </p>
    );
  }

  if (turmaSubjects.length === 0) {
    return (
      <p className="text-xs text-muted-foreground">
        Cadastre outras matérias nesta turma primeiro pra configurar revezamento.
      </p>
    );
  }

  return (
    <div className="space-y-3">
      {value.length === 0 ? (
        <p className="text-xs text-muted-foreground">
          Sem revezamento configurado. A matéria acontece toda semana nos dias marcados acima.
        </p>
      ) : null}

      {value.map((slot, index) => {
        // Pra essa linha, os dias disponíveis no Select são: dias em classDays
        // que (não estão usados em outras linhas) OU (são o dia desta linha).
        const slotDayOptions = classDays.filter((d) => d === slot.dayOfWeek || !usedDays.has(d));
        return (
          // biome-ignore lint/suspicious/noArrayIndexKey: slots can't be reordered, index is stable
          <div key={index} className="grid grid-cols-1 gap-2 sm:grid-cols-[1fr_1fr_1fr_auto]">
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Dia</p>
              <Select
                value={slot.dayOfWeek}
                onValueChange={(v) => updateSlot(index, { dayOfWeek: v as AgendaClassDay })}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {slotDayOptions.map((d) => (
                    <SelectItem key={d} value={d}>
                      {CLASS_DAY_LABEL_FULL[d]}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Reveza com</p>
              <Select
                value={slot.pairedSubjectId}
                onValueChange={(v) => updateSlot(index, { pairedSubjectId: v })}
                disabled={disabled}
              >
                <SelectTrigger className="w-full">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {turmaSubjects.map((s) => (
                    <SelectItem key={s.id} value={s.id}>
                      {s.name}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-1">
              <p className="text-xs font-medium text-muted-foreground">Última aula desta matéria</p>
              <Input
                type="date"
                value={slot.anchorDate}
                onChange={(e) => updateSlot(index, { anchorDate: e.target.value })}
                disabled={disabled}
              />
            </div>
            <div className="flex items-end">
              <Button
                type="button"
                variant="ghost"
                size="icon"
                onClick={() => removeSlot(index)}
                disabled={disabled}
                aria-label={`Remover revezamento de ${CLASS_DAY_LABEL_FULL[slot.dayOfWeek]}`}
              >
                <Trash2 className="size-4" aria-hidden />
              </Button>
            </div>
          </div>
        );
      })}

      <Button type="button" variant="outline" size="sm" onClick={addSlot} disabled={!canAdd}>
        <Plus className="mr-1.5 size-4" aria-hidden />
        Adicionar revezamento
      </Button>
    </div>
  );
}
