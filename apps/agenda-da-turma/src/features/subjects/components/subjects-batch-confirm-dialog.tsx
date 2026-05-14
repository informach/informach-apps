"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Button } from "@informach/ui/components/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from "@informach/ui/components/dialog";
import { Form, FormControl, FormField, FormItem, FormMessage } from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { toast } from "@informach/ui/components/sonner";
import { Loader2, Plus, Trash2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createSubjectsBatchAction } from "../actions";
import { type AgendaClassDay, normalizeClassDays } from "../class-days";
import { MAX_SUBJECT_NAME_LENGTH, MAX_TEACHER_NAME_LENGTH } from "../limits";
import { ClassDaysPicker } from "./class-days-picker";

export type ParsedSubjectInput = {
  name: string;
  teacherName?: string | null;
  classDays?: AgendaClassDay[] | null;
};

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmaId: string;
  initialSubjects: ParsedSubjectInput[];
};

// Cap defensivo — espelha `createSubjectsBatchInputSchema` no server.
const MAX_ROWS = 40;

const rowSchema = z.object({
  name: z
    .string()
    .trim()
    .min(1, "Informe o nome")
    .max(MAX_SUBJECT_NAME_LENGTH, `Máx ${MAX_SUBJECT_NAME_LENGTH}`),
  teacherName: z
    .string()
    .trim()
    .max(MAX_TEACHER_NAME_LENGTH, `Máx ${MAX_TEACHER_NAME_LENGTH}`)
    .optional(),
  classDays: z
    .array(z.enum(["mon", "tue", "wed", "thu", "fri"]))
    .max(5)
    .default([]),
});

const batchFormSchema = z.object({
  rows: z.array(rowSchema).min(1, "Adicione pelo menos uma matéria").max(MAX_ROWS),
});

type BatchFormValues = z.input<typeof batchFormSchema>;

// Chave de dedup: trim + case-fold + remoção de acentos. Conservadora —
// pega só duplicatas exatas (ex.: "Português" + "português" + " Português ").
// Sinônimos canônicos ("Português" vs "Língua Portuguesa") ficam por conta
// do LLM via instruções.
function canonicalKey(name: string): string {
  return name
    .trim()
    .toLocaleLowerCase("pt-BR")
    .normalize("NFD")
    .replace(/\p{Diacritic}/gu, "");
}

function defaultsFromInitial(initialSubjects: ParsedSubjectInput[]): BatchFormValues {
  if (initialSubjects.length === 0) {
    return { rows: [{ name: "", teacherName: "", classDays: [] }] };
  }
  // Dedup defensivo: mantém a primeira ocorrência e preserva o teacherName
  // do primeiro non-empty (caso LLM tenha caído numa duplicata com prof
  // diferente em uma das ocorrências). Same para classDays: une os dias
  // entre duplicatas pra cobrir o caso de o LLM ter dividido a matéria em
  // duas linhas (ex: "Matemática seg/ter" e "Matemática qui/sex").
  const seen = new Map<
    string,
    { name: string; teacherName: string; classDays: AgendaClassDay[] }
  >();
  for (const s of initialSubjects) {
    const key = canonicalKey(s.name);
    if (!key) continue;
    const existing = seen.get(key);
    const incomingDays = s.classDays ?? [];
    if (existing) {
      if (!existing.teacherName && s.teacherName) {
        existing.teacherName = s.teacherName;
      }
      if (incomingDays.length > 0) {
        existing.classDays = normalizeClassDays([...existing.classDays, ...incomingDays]);
      }
      continue;
    }
    seen.set(key, {
      name: s.name,
      teacherName: s.teacherName ?? "",
      classDays: normalizeClassDays(incomingDays),
    });
  }
  const rows = Array.from(seen.values());
  return {
    rows: rows.length > 0 ? rows : [{ name: "", teacherName: "", classDays: [] }],
  };
}

export function SubjectsBatchConfirmDialog({
  open,
  onOpenChange,
  turmaId,
  initialSubjects,
}: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();

  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: defaultsFromInitial(initialSubjects),
  });

  const { fields, append, remove } = useFieldArray({
    control: form.control,
    name: "rows",
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset apenas em open transitions
  useEffect(() => {
    if (!open) return;
    form.reset(defaultsFromInitial(initialSubjects));
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await catchActionResult(() =>
        createSubjectsBatchAction({
          turmaId,
          subjects: values.rows.map((r) => ({
            name: r.name,
            teacherName: r.teacherName ?? "",
            classDays: r.classDays ?? [],
          })),
        }),
      );

      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível salvar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_A_MEMBER") {
          toast.error("Você precisa estar na turma para cadastrar matérias.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "TURMA_NOT_FOUND") {
          toast.error("Turma não encontrada.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        toast.error("Não foi possível salvar.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }

      const { counts } = result.value;
      const parts: string[] = [];
      if (counts.created > 0) {
        parts.push(`${counts.created} ${counts.created === 1 ? "criada" : "criadas"}`);
      }
      if (counts.merged > 0) {
        parts.push(`${counts.merged} ${counts.merged === 1 ? "atualizada" : "atualizadas"}`);
      }
      if (counts.skipped > 0) {
        parts.push(`${counts.skipped} já existia${counts.skipped === 1 ? "" : "m"}`);
      }
      const message = parts.length > 0 ? parts.join(", ") : "Nada novo cadastrado";

      if (counts.created === 0 && counts.merged === 0) {
        // Tudo skippado — mantém modal aberta pra usuário ajustar.
        toast.warning("Nenhuma matéria nova foi cadastrada.", {
          description: "Todas as matérias dessa lista já existem na turma.",
        });
        return;
      }
      toast.success(message);
      onOpenChange(false);
      router.refresh();
    });
  });

  const canAddMore = fields.length < MAX_ROWS;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Confirmar matérias detectadas pela IA</DialogTitle>
          <DialogDescription>
            Revise e edite a lista antes de salvar. Você pode remover linhas ou adicionar novas
            manualmente. O nome do professor é opcional.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <div className="max-h-[60vh] space-y-3 overflow-y-auto pr-1">
              {fields.map((field, index) => (
                <div
                  key={field.id}
                  className="space-y-2 rounded-md border border-border/60 bg-card/50 p-3"
                >
                  <div className="grid grid-cols-[1fr_1fr_auto] items-start gap-2">
                    <FormField
                      control={form.control}
                      name={`rows.${index}.name`}
                      render={({ field: nameField }) => (
                        <FormItem className="space-y-1">
                          <FormControl>
                            <Input autoComplete="off" placeholder="Matéria" {...nameField} />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <FormField
                      control={form.control}
                      name={`rows.${index}.teacherName`}
                      render={({ field: teacherField }) => (
                        <FormItem className="space-y-1">
                          <FormControl>
                            <Input
                              autoComplete="off"
                              placeholder="Professor(a) (opcional)"
                              {...teacherField}
                              value={teacherField.value ?? ""}
                            />
                          </FormControl>
                          <FormMessage />
                        </FormItem>
                      )}
                    />
                    <Button
                      type="button"
                      variant="ghost"
                      size="icon"
                      onClick={() => remove(index)}
                      disabled={submitting || fields.length === 1}
                      aria-label={`Remover linha ${index + 1}`}
                      className="mt-px"
                    >
                      <Trash2 className="size-4" aria-hidden />
                    </Button>
                  </div>
                  <FormField
                    control={form.control}
                    name={`rows.${index}.classDays`}
                    render={({ field: classDaysField }) => (
                      <FormItem className="space-y-1">
                        <FormControl>
                          <ClassDaysPicker
                            value={classDaysField.value ?? []}
                            onChange={classDaysField.onChange}
                            disabled={submitting}
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() => append({ name: "", teacherName: "", classDays: [] })}
                disabled={!canAddMore || submitting}
              >
                <Plus className="mr-1.5 size-4" aria-hidden />
                Adicionar linha
              </Button>
              <p className="text-xs text-muted-foreground">
                {fields.length} de {MAX_ROWS}
              </p>
            </div>

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                Salvar {fields.length} {fields.length === 1 ? "matéria" : "matérias"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
