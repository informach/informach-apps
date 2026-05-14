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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { toast } from "@informach/ui/components/sonner";
import { Textarea } from "@informach/ui/components/textarea";
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { getActivityTypeLabel } from "@/features/activities/utils";
import { todayLocalIso } from "@/features/dashboard/date";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createProfileSubjectActivityAction, updateProfileSubjectActivityAction } from "../actions";
import {
  type CreateProfileSubjectActivityFormValues,
  createProfileSubjectActivityInputSchema,
} from "../schemas";
import type { ProfileSubjectActivity } from "../types";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profileSubjectId: string;
  profileSubjectName: string;
  activity?: ProfileSubjectActivity;
};

const TYPES: Array<"task" | "exam" | "project" | "reminder"> = [
  "task",
  "exam",
  "project",
  "reminder",
];

function emptyDefaults(profileSubjectId: string): CreateProfileSubjectActivityFormValues {
  return {
    profileSubjectId,
    type: "reminder",
    title: "",
    description: "",
    dueAt: todayLocalIso(),
  };
}

function defaultsFromActivity(a: ProfileSubjectActivity): CreateProfileSubjectActivityFormValues {
  return {
    profileSubjectId: a.profileSubjectId,
    type: a.type,
    title: a.title,
    description: a.description ?? "",
    dueAt: a.dueAt,
  };
}

export function ProfileSubjectActivityFormDialog({
  open,
  onOpenChange,
  profileSubjectId,
  profileSubjectName,
  activity,
}: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const isEdit = activity !== undefined;

  const form = useForm<CreateProfileSubjectActivityFormValues>({
    resolver: zodResolver(createProfileSubjectActivityInputSchema),
    defaultValues: activity ? defaultsFromActivity(activity) : emptyDefaults(profileSubjectId),
  });

  // biome-ignore lint/correctness/useExhaustiveDependencies: reset only on open transitions
  useEffect(() => {
    if (!open) return;
    form.reset(activity ? defaultsFromActivity(activity) : emptyDefaults(profileSubjectId));
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      if (isEdit && activity) {
        const result = await catchActionResult(() =>
          updateProfileSubjectActivityAction({
            id: activity.id,
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
          toast.error("Não foi possível salvar.");
          return;
        }
        toast.success("Atividade atualizada");
        onOpenChange(false);
        router.refresh();
        return;
      }

      const result = await catchActionResult(() =>
        createProfileSubjectActivityAction({
          profileSubjectId,
          type: values.type,
          title: values.title,
          description: values.description,
          dueAt: values.dueAt,
        }),
      );
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível criar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "PROFILE_SUBJECT_NOT_FOUND") {
          toast.error("Matéria não encontrada.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "ACTIVITY_LIMIT_REACHED") {
          const { limit } = result.error;
          toast.error(`Limite de ${limit} atividades atingido no plano Free.`, {
            description: "Conclua ou exclua atividades antigas, ou faça upgrade pro Pro.",
          });
          onOpenChange(false);
          return;
        }
        toast.error("Não foi possível criar.");
        return;
      }
      toast.success("Atividade criada");
      onOpenChange(false);
      router.refresh();
    });
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>{isEdit ? "Editar atividade" : "Nova atividade"}</DialogTitle>
          <DialogDescription>
            Vinculada a <strong>{profileSubjectName}</strong>. Ex: levar uniforme, evento especial,
            recital, prova de faixa.
          </DialogDescription>
        </DialogHeader>
        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="title"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Título</FormLabel>
                  <FormControl>
                    <Input placeholder="Ex: Levar uniforme de jazz" autoFocus {...field} />
                  </FormControl>
                  <FormMessage />
                </FormItem>
              )}
            />

            <div className="grid gap-4 md:grid-cols-2">
              <FormField
                control={form.control}
                name="type"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo</FormLabel>
                    <Select value={field.value} onValueChange={field.onChange}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="Selecione" />
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
                name="dueAt"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Data</FormLabel>
                    <FormControl>
                      <Input type="date" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

            <FormField
              control={form.control}
              name="description"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Observações (opcional)</FormLabel>
                  <FormControl>
                    <Textarea
                      placeholder="Detalhes — material extra, horário diferente, etc."
                      rows={3}
                      {...field}
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
                  "Criar atividade"
                )}
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
