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
import { toast } from "@informach/ui/components/sonner";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createSubjectAction, updateSubjectAction } from "../actions";
import { type SubjectFormValues, subjectFormSchema } from "../schemas";
import type { Subject } from "../types";
import { ClassDaysPicker } from "./class-days-picker";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turmaId: string;
  subject?: Subject;
};

const EMPTY_DEFAULTS: SubjectFormValues = {
  name: "",
  teacherName: "",
  classDays: [],
};

function defaultsFromSubject(subject: Subject): SubjectFormValues {
  return {
    name: subject.name,
    teacherName: subject.teacherName ?? "",
    classDays: subject.classDays,
  };
}

function describeFilled(filled: { teacherName: boolean; classDays: boolean }): string {
  const parts: string[] = [];
  if (filled.teacherName) parts.push("o professor");
  if (filled.classDays) parts.push("o horário");
  if (parts.length === 0) return "";
  if (parts.length === 1) return parts[0] as string;
  return `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}`;
}

export function SubjectFormDialog({ open, onOpenChange, turmaId, subject }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = subject !== undefined;

  const form = useForm<SubjectFormValues>({
    resolver: zodResolver(subjectFormSchema),
    defaultValues: subject ? defaultsFromSubject(subject) : EMPTY_DEFAULTS,
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open transitions
  useEffect(() => {
    if (!open) return;
    form.reset(subject ? defaultsFromSubject(subject) : EMPTY_DEFAULTS);
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      if (isEdit && subject) {
        const result = await catchActionResult(() =>
          updateSubjectAction({
            id: subject.id,
            name: values.name,
            teacherName: values.teacherName,
            classDays: values.classDays,
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
            toast.error("Matéria não encontrada", {
              description: "Pode ter sido removida em outra aba.",
            });
            onOpenChange(false);
            router.refresh();
            return;
          }
          if (result.error.code === "FORBIDDEN") {
            toast.error("Só quem criou essa matéria pode editar.");
            onOpenChange(false);
            router.refresh();
            return;
          }
          if (result.error.code === "NAME_CHANGE_TOO_BIG") {
            form.setError("name", {
              message:
                "Outras famílias já usam essa matéria. Só ajustes pequenos no nome são permitidos (acento, caixa, erro de digitação).",
            });
            return;
          }
          if (result.error.code === "DUPLICATE") {
            form.setError("name", { message: "Já existe uma matéria com esse nome nesta turma" });
            return;
          }
          toast.error("Não foi possível salvar.", {
            description: "Tente novamente em instantes.",
          });
          return;
        }
        toast.success("Matéria atualizada");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await catchActionResult(() =>
        createSubjectAction({
          turmaId,
          name: values.name,
          teacherName: values.teacherName,
          classDays: values.classDays,
        }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível criar a matéria.", {
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
        toast.error("Não foi possível criar a matéria.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      // Como turmas são compartilhadas e a regra é fill-in-blank, "criar"
      // matéria que já existe na turma faz merge — distinguimos pelo status
      // pra dar feedback transparente em vez de surpreender o user.
      const { status, filled } = result.value;
      if (status === "created") {
        toast.success("Matéria criada");
      } else if (status === "merged_filled") {
        const filledDescription = describeFilled(filled);
        toast.success(`${values.name} já existia.`, {
          description: filledDescription
            ? `Adicionamos ${filledDescription} que estava faltando.`
            : "Atualizamos os campos que estavam em branco.",
        });
      } else {
        toast.success(`${values.name} já estava cadastrada nesta turma.`);
      }
      form.reset(EMPTY_DEFAULTS);
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) {
      form.reset(subject ? defaultsFromSubject(subject) : EMPTY_DEFAULTS);
    }
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar matéria" : "Nova matéria"}</DialogTitle>
          <DialogDescription>
            {isEdit
              ? "Atualize o nome ou o professor responsável."
              : "Cadastre uma matéria para esta turma. Todos os membros poderão usá-la nas tarefas."}
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome da matéria</FormLabel>
                  <FormControl>
                    <Input autoFocus placeholder="Ex: Matemática" autoComplete="off" {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="teacherName"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Professor(a)</FormLabel>
                  <FormControl>
                    <Input
                      placeholder="Ex: Carla Souza"
                      autoComplete="off"
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
              name="classDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias de aula</FormLabel>
                  <FormControl>
                    <ClassDaysPicker
                      value={field.value ?? []}
                      onChange={field.onChange}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormDescription>
                    Opcional. Usado pra calcular datas de entrega automaticamente quando você
                    cadastra uma atividade sem data.
                  </FormDescription>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="outline"
                onClick={() => handleOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? <Loader2 className="mr-2 size-4 animate-spin" aria-hidden /> : null}
                {isEdit ? "Salvar alterações" : "Criar matéria"}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
