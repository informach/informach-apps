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
  FormDescription,
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
import { Loader2, Lock } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useMemo, useTransition } from "react";
import { useForm } from "react-hook-form";
import { AsyncCombobox, type ComboboxOption } from "@/features/turmas/components/async-combobox";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createActivityAction, updateActivityAction } from "../actions";
import { FREE_ACTIVITY_LIMIT } from "../limits";
import { type CreateActivityFormValues, createActivityInputSchema } from "../schemas";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "../types";
import { buildActivityFormDefaults, formatTurmaShort, getActivityTypeLabel } from "../utils";

type ActivityToEdit = Pick<
  ActivityListItem,
  | "activityId"
  | "type"
  | "title"
  | "description"
  | "dueAt"
  | "turmaId"
  | "subjectId"
  | "visibility"
  | "subjectName"
  | "schoolName"
  | "grade"
  | "classLetter"
>;

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmas: TurmaWithSubjectsForForm[];
  isPro: boolean;
  /**
   * Total de atividades criadas pelo user (qualquer status). Usado pra gate
   * Free no modo criar. Em edit mode, prop é ignorado (default 0).
   */
  currentActivityCount?: number;
  /** Quando presente, abre em modo edição (turma/matéria/visibilidade fixos). */
  activity?: ActivityToEdit;
  /** Pré-seleciona turma quando vier de um contexto filtrado. */
  defaultTurmaId?: string;
  /**
   * Pré-preenche a data de entrega (YYYY-MM-DD). Usado quando o user clica
   * num dia vazio do calendário e abre o form pra criar. Ignorado em modo
   * edição (data vem da própria activity).
   */
  defaultDueAt?: string;
};

const TYPES: Array<"task" | "exam" | "project" | "reminder"> = [
  "task",
  "exam",
  "project",
  "reminder",
];

export function ActivityFormDialog({
  open,
  onOpenChange,
  turmas,
  isPro,
  currentActivityCount = 0,
  activity,
  defaultTurmaId,
  defaultDueAt,
}: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = activity !== undefined;
  // Bloqueia criação no Free quando atingiu o limite. Edit sempre passa
  // (não cria row nova). Pro nunca é bloqueado.
  const limitReached = !isEdit && !isPro && currentActivityCount >= FREE_ACTIVITY_LIMIT;

  // Um único schema valida os campos do form em ambos os modos (create + edit).
  // O `id` da atividade no update vem direto do prop `activity` no submit, não
  // do form state — usar `updateActivityInputSchema` aqui faria a validação
  // falhar silenciosamente porque o form não tem campo `id`.
  // Em modo edit, turmaId/subjectId/visibility ficam no form state com defaults
  // do `activity` (válidos), mesmo não sendo renderizados — passam pelo
  // resolver sem problema.
  const form = useForm<CreateActivityFormValues>({
    resolver: zodResolver(createActivityInputSchema),
    defaultValues: buildActivityFormDefaults({
      activity,
      turmas,
      defaultTurmaId,
      defaultDueAt,
    }),
  });

  // Form reset apenas em transições closed→open. As deps `turmas`/`defaultTurmaId`
  // mudam após `router.refresh()` e zerariam digitação em andamento.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!open) return;
    form.reset(buildActivityFormDefaults({ activity, turmas, defaultTurmaId, defaultDueAt }));
  }, [open]);

  const selectedTurmaId = form.watch("turmaId");
  const subjectsForTurma = useMemo(() => {
    if (!selectedTurmaId) return [];
    return turmas.find((t) => t.turmaId === selectedTurmaId)?.subjects ?? [];
  }, [selectedTurmaId, turmas]);

  // Reset matéria quando troca de turma (a matéria selecionada pode não existir
  // na nova turma). Sem efeito em modo edição (turmaId é fixo).
  useEffect(() => {
    if (isEdit) return;
    const current = form.getValues("subjectId");
    if (current && !subjectsForTurma.some((s) => s.id === current)) {
      form.setValue("subjectId", "", { shouldValidate: false });
    }
  }, [subjectsForTurma, isEdit, form]);

  // Combobox de matéria: filtragem em memória (sem fetch). Casa com o padrão
  // dos comboboxes de estado/cidade/escola do CreateTurmaDialog.
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

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      if (isEdit && activity) {
        const result = await catchActionResult(() =>
          updateActivityAction({
            id: activity.activityId,
            type: values.type,
            title: values.title,
            description: values.description,
            dueAt: values.dueAt,
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
          if (result.error.code === "NOT_FOUND") {
            toast.error("Atividade não encontrada", {
              description: "Pode ter sido removida em outra aba.",
            });
            onOpenChange(false);
            router.refresh();
            return;
          }
          if (result.error.code === "FORBIDDEN") {
            toast.error("Só quem criou a atividade pode editar.");
            onOpenChange(false);
            router.refresh();
            return;
          }
          if (result.error.code === "HAS_ACCEPTANCES") {
            toast.error(
              "Esta atividade já foi aceita por outras famílias e não pode mais ser editada.",
            );
            onOpenChange(false);
            router.refresh();
            return;
          }
          toast.error("Não foi possível salvar.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
        toast.success("Atividade atualizada");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await catchActionResult(() =>
        createActivityAction({
          turmaId: values.turmaId,
          subjectId: values.subjectId,
          type: values.type,
          title: values.title,
          description: values.description,
          dueAt: values.dueAt,
          visibility: values.visibility,
        }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível criar a atividade.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "TURMA_NOT_FOUND") {
          toast.error("Turma não encontrada.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "SUBJECT_NOT_FOUND") {
          toast.error("Matéria não encontrada na turma selecionada.");
          router.refresh();
          return;
        }
        if (result.error.code === "NOT_A_MEMBER") {
          toast.error("Você precisa estar na turma para cadastrar atividades.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "ACTIVITY_LIMIT_REACHED") {
          toast.error("Limite do plano Free atingido", {
            description: `Você já cadastrou ${result.error.current} de ${result.error.limit} atividades. Atualize para Pro pra cadastrar atividades ilimitadas.`,
            action: { label: "Ver planos", onClick: () => router.push("/upgrade") },
          });
          router.refresh();
          return;
        }
        toast.error("Não foi possível criar a atividade.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Atividade criada");
      form.reset(buildActivityFormDefaults({ activity, turmas, defaultTurmaId, defaultDueAt }));
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(buildActivityFormDefaults({ activity, turmas, defaultTurmaId, defaultDueAt }));
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Você pode ajustar o título, a observação, a data e o tipo. Turma, matéria e visibilidade ficam fixas após o cadastro."
              : "Cadastre uma tarefa, prova, trabalho ou lembrete para a turma."}
          </DialogDescription>
        </DialogHeader>

        {limitReached ? (
          <div className="space-y-4">
            <div className="flex flex-col items-center gap-3 rounded-lg border border-border bg-muted/40 p-6 text-center">
              <span className="flex size-11 items-center justify-center rounded-full bg-primary/10 text-primary">
                <Lock className="size-5" aria-hidden />
              </span>
              <div className="space-y-1">
                <p className="text-base font-semibold text-foreground">
                  Você atingiu o limite do plano Free
                </p>
                <p className="text-sm text-muted-foreground">
                  {FREE_ACTIVITY_LIMIT} atividades é o máximo no plano gratuito. Atualize pra Pro e
                  cadastre sem limite.
                </p>
              </div>
              <Button asChild>
                <Link href="/upgrade">Ver planos Pro</Link>
              </Button>
            </div>
            <DialogFooter>
              <Button type="button" variant="outline" onClick={() => handleOpenChange(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </div>
        ) : (
          <Form {...form}>
            <form onSubmit={onSubmit} className="space-y-4">
              {isEdit ? (
                <div className="rounded-md border border-border bg-muted/40 p-3 text-sm">
                  <p className="font-medium text-foreground">{activity.subjectName}</p>
                  <p className="text-muted-foreground">
                    {activity.schoolName} ·{" "}
                    {/* year not in ActivityToEdit, mostra grade+letter apenas */}
                    {activity.grade.replace(/[^0-9]/g, "")}º ano {activity.classLetter}
                  </p>
                  {activity.visibility === "shared_with_turma" ? (
                    <p className="mt-1 text-xs text-muted-foreground">Compartilhada com a turma</p>
                  ) : null}
                </div>
              ) : (
                <>
                  <FormField
                    control={form.control}
                    name="turmaId"
                    render={({ field }) => (
                      <FormItem>
                        <FormLabel>Turma</FormLabel>
                        {turmas.length === 0 ? (
                          <p className="text-sm text-muted-foreground">
                            Você ainda não tem nenhuma turma ativa. Vincule um perfil a uma turma em
                            /turmas antes de criar atividades.
                          </p>
                        ) : (
                          <Select onValueChange={field.onChange} value={field.value}>
                            <FormControl>
                              <SelectTrigger>
                                <SelectValue placeholder="Selecione a turma" />
                              </SelectTrigger>
                            </FormControl>
                            <SelectContent>
                              {turmas.map((t) => (
                                <SelectItem key={t.turmaId} value={t.turmaId}>
                                  {t.schoolName} —{" "}
                                  {formatTurmaShort(t.grade, t.classLetter, t.year)}
                                </SelectItem>
                              ))}
                            </SelectContent>
                          </Select>
                        )}
                        <FormMessage />
                      </FormItem>
                    )}
                  />

                  <FormField
                    control={form.control}
                    name="subjectId"
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
                            initialLabel={
                              field.value
                                ? (subjectsForTurma.find((s) => s.id === field.value)?.name ?? null)
                                : null
                            }
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </>
              )}

              <FormField
                control={form.control}
                name="type"
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
                name="title"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Atividade</FormLabel>
                    <FormControl>
                      <Input
                        autoFocus={!isEdit}
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
                name="description"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Observação</FormLabel>
                    <FormControl>
                      <Textarea
                        placeholder="Detalhes adicionais (opcional)"
                        rows={3}
                        {...field}
                        value={field.value ?? ""}
                      />
                    </FormControl>
                    <FormDescription>Opcional</FormDescription>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="dueAt"
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

              {!isEdit ? (
                <FormField
                  control={form.control}
                  name="visibility"
                  render={({ field }) => (
                    <FormItem className="space-y-2">
                      <FormLabel>Visibilidade</FormLabel>
                      <FormControl>
                        <RadioGroup
                          value={field.value}
                          onValueChange={field.onChange}
                          className="space-y-2"
                        >
                          <label
                            htmlFor="activity-visibility-individual"
                            className="flex items-start gap-3 rounded-md border border-border p-3 cursor-pointer hover:bg-accent/40"
                          >
                            <RadioGroupItem
                              id="activity-visibility-individual"
                              value="individual"
                              className="mt-1"
                            />
                            <div className="text-sm">
                              <p className="font-medium">Só para mim</p>
                              <p className="text-muted-foreground">
                                A atividade fica visível só pra você.
                              </p>
                            </div>
                          </label>
                          <label
                            htmlFor="activity-visibility-shared"
                            className={`flex items-start gap-3 rounded-md border border-border p-3 ${
                              isPro
                                ? "cursor-pointer hover:bg-accent/40"
                                : "cursor-not-allowed opacity-60"
                            }`}
                          >
                            <RadioGroupItem
                              id="activity-visibility-shared"
                              value="shared_with_turma"
                              className="mt-1"
                              disabled={!isPro}
                            />
                            <div className="text-sm flex-1">
                              <div className="flex items-center gap-1.5 font-medium">
                                <span>Compartilhar com a turma</span>
                                {!isPro ? <Badge variant="secondary">Pro</Badge> : null}
                              </div>
                              <p className="text-muted-foreground">
                                Outras famílias da turma podem aceitar a atividade no dashboard.
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
              ) : null}

              <DialogFooter>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => handleOpenChange(false)}
                  disabled={submitting}
                >
                  Cancelar
                </Button>
                <Button type="submit" disabled={submitting || (!isEdit && turmas.length === 0)}>
                  {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                  {isEdit ? "Salvar alterações" : "Criar atividade"}
                </Button>
              </DialogFooter>
            </form>
          </Form>
        )}
      </DialogContent>
    </Dialog>
  );
}
