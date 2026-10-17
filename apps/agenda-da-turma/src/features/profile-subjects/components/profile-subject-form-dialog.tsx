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
import { createProfileSubjectAction, updateProfileSubjectAction } from "../actions";
import { type ProfileSubjectFormValues, profileSubjectFormSchema } from "../schemas";
import type { ProfileSubject } from "../types";
import { ExtraClassDaysPicker } from "./extra-class-days-picker";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileId: string;
  subject?: ProfileSubject;
};

const EMPTY_DEFAULTS: ProfileSubjectFormValues = {
  name: "",
  classDays: [],
};

function defaultsFromSubject(subject: ProfileSubject): ProfileSubjectFormValues {
  return {
    name: subject.name,
    classDays: subject.classDays,
  };
}

export function ProfileSubjectFormDialog({ open, onOpenChange, profileId, subject }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = subject !== undefined;

  const form = useForm<ProfileSubjectFormValues>({
    resolver: zodResolver(profileSubjectFormSchema),
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
          updateProfileSubjectAction({
            id: subject.id,
            name: values.name,
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
          if (result.error.code === "DUPLICATE_NAME") {
            form.setError("name", {
              message: "Essa criança já tem uma atividade extra com esse nome",
            });
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
        createProfileSubjectAction({
          profileId,
          name: values.name,
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
        if (result.error.code === "PROFILE_NOT_FOUND") {
          toast.error("Não achamos essa criança.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "DUPLICATE_NAME") {
          form.setError("name", {
            message: "Essa criança já tem uma atividade extra com esse nome",
          });
          return;
        }
        if (result.error.code === "PLAN_LIMIT_REACHED") {
          const { isPro, limit } = result.error;
          toast.error(
            isPro
              ? `Cada criança pode ter até ${limit} atividades extras.`
              : `No plano grátis, cada criança tem ${limit} atividade extra.`,
            {
              description: isPro
                ? "Pause ou exclua uma que não está em uso para abrir espaço."
                : "No Pro, cada criança pode ter até 10.",
            },
          );
          onOpenChange(false);
          return;
        }
        toast.error("Não foi possível criar a matéria.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Matéria criada");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>
            {isEdit ? "Editar atividade extra" : "Nova atividade extra"}
          </DialogTitle>
          <DialogDescription>
            Atividades fora da escola, como jazz, futebol, natação ou reforço. Elas aparecem nas
            matérias do dia junto com as da turma.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="name"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Nome</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Jazz, Futebol, Natação" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <FormField
              control={form.control}
              name="classDays"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Dias da semana</FormLabel>
                  <FormControl>
                    <ExtraClassDaysPicker
                      value={field.value ?? []}
                      onChange={field.onChange}
                      disabled={submitting}
                    />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <DialogFooter>
              <Button
                type="button"
                variant="ghost"
                onClick={() => onOpenChange(false)}
                disabled={submitting}
              >
                Cancelar
              </Button>
              <Button type="submit" disabled={submitting}>
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    Salvando…
                  </>
                ) : isEdit ? (
                  "Salvar"
                ) : (
                  "Criar matéria"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
