"use client";

import { zodResolver } from "@hookform/resolvers/zod";
import { Badge } from "@informach/ui/components/badge";
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
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@informach/ui/components/form";
import { Input } from "@informach/ui/components/input";
import { RadioGroup, RadioGroupItem } from "@informach/ui/components/radio-group";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { toast } from "@informach/ui/components/sonner";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2, Plus, Trash2 } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useTransition } from "react";
import { useFieldArray, useForm } from "react-hook-form";
import { z } from "zod";
import { isValidLocalIsoDate } from "@/features/dashboard/date";
import { AsyncCombobox, type ComboboxOption } from "@/features/turmas/components/async-combobox";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createActivitiesBatchAction } from "../actions";
import { MAX_ACTIVITY_DESCRIPTION_LENGTH, MAX_ACTIVITY_TITLE_LENGTH } from "../limits";
import { findClosestSubject } from "../match-subject";
import type { ActivityType, ParsedActivityInput, TurmaWithSubjectsForForm } from "../types";
import { formatTurmaShort, getActivityTypeLabel, pickInitialTurmaId } from "../utils";

const MAX_ROWS = 20;
const TYPES: Array<ActivityType> = ["task", "exam", "project", "reminder"];

// Form schema do dialog — espelha o schema do server (`createActivitiesBatchInputSchema`)
// mas inclui o campo shadow `subjectHint` que o dialog carrega pra re-rodar o
// fuzzy-match quando o user trocar de turma. Enviado pra action via `.map`
// que descarta o shadow.
const rowFormSchema = z.object({
  turmaId: z.string().uuid("Selecione a turma"),
  subjectId: z.string().uuid("Selecione a matéria"),
  type: z.enum(["task", "exam", "project", "reminder"], {
    message: "Selecione o tipo",
  }),
  title: z
    .string()
    .trim()
    .min(1, "Descreva a atividade")
    .max(MAX_ACTIVITY_TITLE_LENGTH, `Texto muito longo (máx ${MAX_ACTIVITY_TITLE_LENGTH})`),
  description: z
    .string()
    .trim()
    .max(
      MAX_ACTIVITY_DESCRIPTION_LENGTH,
      `Observação muito longa (máx ${MAX_ACTIVITY_DESCRIPTION_LENGTH})`,
    ),
  dueAt: z
    .string()
    .min(1, "Informe a data")
    .regex(/^\d{4}-\d{2}-\d{2}$/, "Data inválida")
    .refine(isValidLocalIsoDate, "Data inválida"),
  // Shadow field — não renderizado, mantém o hint original pro re-match.
  subjectHint: z.string().nullable(),
});

const batchFormSchema = z.object({
  visibility: z.enum(["individual", "shared_with_turma"]),
  activities: z
    .array(rowFormSchema)
    .min(1, "Inclua pelo menos uma atividade")
    .max(MAX_ROWS, `Máximo de ${MAX_ROWS} atividades`),
});

type BatchFormValues = z.input<typeof batchFormSchema>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmas: TurmaWithSubjectsForForm[];
  isPro: boolean;
  /** Atividades detectadas pela IA, prontas pra revisão. */
  initialActivities: ParsedActivityInput[];
};

type RowFormValues = BatchFormValues["activities"][number];

function buildInitialRow(
  parsed: ParsedActivityInput,
  turmas: TurmaWithSubjectsForForm[],
): RowFormValues {
  const turmaId = parsed.resolvedTurmaId ?? pickInitialTurmaId(turmas, undefined);
  const subjectsForTurma = turmaId
    ? (turmas.find((t) => t.turmaId === turmaId)?.subjects ?? [])
    : [];
  const matched = findClosestSubject(subjectsForTurma, parsed.subjectHint);
  return {
    turmaId,
    subjectId: matched?.id ?? "",
    type: parsed.type,
    title: parsed.title,
    description: parsed.description ?? "",
    dueAt: parsed.dueAt ?? "",
    subjectHint: parsed.subjectHint,
  };
}

function buildDefaultValues(
  initialActivities: ParsedActivityInput[],
  turmas: TurmaWithSubjectsForForm[],
): BatchFormValues {
  return {
    visibility: "individual",
    activities:
      initialActivities.length > 0
        ? initialActivities.map((a) => buildInitialRow(a, turmas))
        : [
            {
              turmaId: pickInitialTurmaId(turmas, undefined),
              subjectId: "",
              type: "task" as const,
              title: "",
              description: "",
              dueAt: "",
              subjectHint: null,
            },
          ],
  };
}

export function ActivitiesBatchConfirmDialog({
  open,
  onOpenChange,
  turmas,
  isPro,
  initialActivities,
}: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();

  // Form schema local — espelha o schema da action + campo shadow `subjectHint`.
  // No submit, o `.map` em `onSubmit` descarta o shadow antes de mandar pra
  // server action.
  const form = useForm<BatchFormValues>({
    resolver: zodResolver(batchFormSchema),
    defaultValues: buildDefaultValues(initialActivities, turmas),
  });

  const { fields, append, remove, update } = useFieldArray({
    control: form.control,
    name: "activities",
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset apenas em open transitions; deps mutam de turma-load.
  useEffect(() => {
    if (!open) return;
    form.reset(buildDefaultValues(initialActivities, turmas));
  }, [open]);

  // Troca de turma de uma linha → re-roda fuzzy match contra as matérias da
  // nova turma usando o `subjectHint` shadow. Se não casar, deixa o
  // combobox vazio pro user escolher manualmente.
  const handleTurmaChange = useCallback(
    (index: number, newTurmaId: string) => {
      const current = form.getValues(`activities.${index}`);
      const subjectsForTurma = newTurmaId
        ? (turmas.find((t) => t.turmaId === newTurmaId)?.subjects ?? [])
        : [];
      const matched = findClosestSubject(subjectsForTurma, current.subjectHint);
      update(index, {
        ...current,
        turmaId: newTurmaId,
        subjectId: matched?.id ?? "",
      });
    },
    [form, turmas, update],
  );

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await catchActionResult(() =>
        createActivitiesBatchAction({
          visibility: values.visibility,
          activities: values.activities.map((row) => ({
            turmaId: row.turmaId,
            subjectId: row.subjectId,
            type: row.type,
            title: row.title,
            description: row.description,
            dueAt: row.dueAt,
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
        const code = result.error.code;
        if (code === "PRO_REQUIRED") {
          toast.error("Recurso disponível apenas para assinantes Pro.", {
            action: { label: "Ver planos", onClick: () => router.push("/upgrade") },
          });
          onOpenChange(false);
          return;
        }
        if (code === "TURMA_NOT_FOUND") {
          toast.error(`Turma da atividade ${result.error.index + 1} não foi encontrada.`);
          return;
        }
        if (code === "NOT_A_MEMBER") {
          toast.error(`Você não está na turma da atividade ${result.error.index + 1}.`);
          return;
        }
        if (code === "SUBJECT_NOT_FOUND") {
          toast.error(`Matéria inválida na atividade ${result.error.index + 1}.`);
          return;
        }
        toast.error("Não foi possível salvar.", {
          description: "Tente novamente em instantes.",
        });
      } else {
        const { count } = result.value;
        toast.success(
          `${count} atividade${count === 1 ? "" : "s"} cadastrada${count === 1 ? "" : "s"}`,
        );
        onOpenChange(false);
        router.refresh();
      }
    });
  });

  const canAddMore = fields.length < MAX_ROWS;

  return (
    <Dialog open={open} onOpenChange={(o) => !submitting && onOpenChange(o)}>
      <DialogContent className="max-h-[90vh] overflow-y-auto sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Revise as atividades detectadas pela IA</DialogTitle>
          <DialogDescription>
            Confira e edite cada atividade. Você pode trocar turma/matéria, ajustar a data ou
            remover linhas. Só salva quando tudo estiver certo.
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-5">
            <FormField
              control={form.control}
              name="visibility"
              render={({ field }) => (
                <FormItem className="space-y-2">
                  <FormLabel>Visibilidade (aplica-se a todas)</FormLabel>
                  <FormControl>
                    <RadioGroup
                      value={field.value}
                      onValueChange={field.onChange}
                      className="grid grid-cols-1 gap-2 sm:grid-cols-2"
                    >
                      <label
                        htmlFor="batch-vis-individual"
                        className="flex items-start gap-2 rounded-md border border-border p-3 text-sm cursor-pointer hover:bg-accent/40"
                      >
                        <RadioGroupItem
                          id="batch-vis-individual"
                          value="individual"
                          className="mt-1"
                        />
                        <div>
                          <p className="font-medium">Só para mim</p>
                          <p className="text-xs text-muted-foreground">
                            As atividades ficam visíveis só pra você.
                          </p>
                        </div>
                      </label>
                      <label
                        htmlFor="batch-vis-shared"
                        className={`flex items-start gap-2 rounded-md border border-border p-3 text-sm ${
                          isPro
                            ? "cursor-pointer hover:bg-accent/40"
                            : "cursor-not-allowed opacity-60"
                        }`}
                      >
                        <RadioGroupItem
                          id="batch-vis-shared"
                          value="shared_with_turma"
                          className="mt-1"
                          disabled={!isPro}
                        />
                        <div className="flex-1">
                          <div className="flex items-center gap-1.5 font-medium">
                            <span>Compartilhar com a turma</span>
                            {!isPro ? <Badge variant="secondary">Pro</Badge> : null}
                          </div>
                          <p className="text-xs text-muted-foreground">
                            Outras famílias da turma podem aceitar no dashboard.
                          </p>
                          {!isPro ? (
                            <Link
                              href="/upgrade"
                              className="mt-1 inline-block text-xs font-medium text-primary hover:underline"
                            >
                              Ver planos Pro
                            </Link>
                          ) : null}
                        </div>
                      </label>
                    </RadioGroup>
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="space-y-3">
              {fields.map((field, index) => (
                <ActivityRowCard
                  key={field.id}
                  index={index}
                  form={form}
                  turmas={turmas}
                  onTurmaChange={(newTurmaId) => handleTurmaChange(index, newTurmaId)}
                  onRemove={() => remove(index)}
                  canRemove={fields.length > 1}
                  disabled={submitting}
                />
              ))}
            </div>

            <div className="flex flex-wrap items-center justify-between gap-2">
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={() =>
                  append({
                    turmaId: pickInitialTurmaId(turmas, undefined),
                    subjectId: "",
                    type: "task" as const,
                    title: "",
                    description: "",
                    dueAt: "",
                    subjectHint: null,
                  })
                }
                disabled={!canAddMore || submitting}
              >
                <Plus className="mr-1.5 size-4" aria-hidden />
                Adicionar atividade
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
              <Button type="submit" disabled={submitting || turmas.length === 0}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                Salvar {fields.length} {fields.length === 1 ? "atividade" : "atividades"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}

type RowCardProps = {
  index: number;
  form: ReturnType<typeof useForm<BatchFormValues>>;
  turmas: TurmaWithSubjectsForForm[];
  onTurmaChange: (newTurmaId: string) => void;
  onRemove: () => void;
  canRemove: boolean;
  disabled: boolean;
};

function ActivityRowCard({
  index,
  form,
  turmas,
  onTurmaChange,
  onRemove,
  canRemove,
  disabled,
}: RowCardProps) {
  const selectedTurmaId = form.watch(`activities.${index}.turmaId`);
  const subjectsForTurma = selectedTurmaId
    ? (turmas.find((t) => t.turmaId === selectedTurmaId)?.subjects ?? [])
    : [];

  const fetchSubjectOptions = useCallback(
    (q: string): Promise<ComboboxOption[]> => {
      const norm = q.trim().toLowerCase();
      const filtered = norm
        ? subjectsForTurma.filter((s) => s.name.toLowerCase().includes(norm))
        : subjectsForTurma;
      return Promise.resolve(filtered.map((s) => ({ value: s.id, label: s.name })));
    },
    [subjectsForTurma],
  );

  return (
    <div className="rounded-lg border border-border bg-card p-3 sm:p-4">
      <div className="mb-2 flex items-center justify-between gap-2">
        <p className="text-xs font-medium text-muted-foreground">Atividade {index + 1}</p>
        <Button
          type="button"
          variant="ghost"
          size="icon"
          onClick={onRemove}
          disabled={disabled || !canRemove}
          aria-label={`Remover atividade ${index + 1}`}
        >
          <Trash2 className="size-4" aria-hidden />
        </Button>
      </div>

      <div className="grid gap-3 sm:grid-cols-2">
        <FormField
          control={form.control}
          name={`activities.${index}.turmaId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Turma</FormLabel>
              <Select
                value={field.value}
                onValueChange={(v) => {
                  field.onChange(v);
                  onTurmaChange(v);
                }}
              >
                <FormControl>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione" />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {turmas.map((t) => (
                    <SelectItem key={t.turmaId} value={t.turmaId}>
                      {t.schoolName} — {formatTurmaShort(t.grade, t.classLetter, t.year)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`activities.${index}.subjectId`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Matéria</FormLabel>
              <FormControl>
                <AsyncCombobox
                  value={field.value || null}
                  onChange={(id) => field.onChange(id ?? "")}
                  fetchOptions={fetchSubjectOptions}
                  placeholder={
                    !selectedTurmaId
                      ? "Escolha a turma primeiro"
                      : subjectsForTurma.length === 0
                        ? "Cadastre uma matéria primeiro"
                        : "Selecione a matéria"
                  }
                  searchPlaceholder="Buscar matéria..."
                  emptyText="Nenhuma matéria encontrada"
                  disabled={!selectedTurmaId || subjectsForTurma.length === 0}
                  resetKey={selectedTurmaId || "no-turma"}
                />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`activities.${index}.type`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Tipo</FormLabel>
              <Select onValueChange={field.onChange} value={field.value}>
                <FormControl>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                </FormControl>
                <SelectContent>
                  {TYPES.map((t) => (
                    <SelectItem key={t} value={t}>
                      {getActivityTypeLabel(t)}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <FormMessage />
            </FormItem>
          )}
        />

        <FormField
          control={form.control}
          name={`activities.${index}.dueAt`}
          render={({ field }) => (
            <FormItem>
              <FormLabel>Data de entrega</FormLabel>
              <FormControl>
                <Input type="date" {...field} value={field.value ?? ""} />
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
      </div>

      <FormField
        control={form.control}
        name={`activities.${index}.title`}
        render={({ field }) => (
          <FormItem className="mt-3">
            <FormLabel>Atividade</FormLabel>
            <FormControl>
              <Input
                placeholder="Ex: Fazer páginas 32 e 33 do livro"
                autoComplete="off"
                {...field}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />

      <FormField
        control={form.control}
        name={`activities.${index}.description`}
        render={({ field }) => (
          <FormItem className="mt-3">
            <FormLabel>Observação</FormLabel>
            <FormControl>
              <Textarea
                placeholder="Detalhes adicionais (opcional)"
                rows={2}
                {...field}
                value={field.value ?? ""}
              />
            </FormControl>
            <FormMessage />
          </FormItem>
        )}
      />
    </div>
  );
}
