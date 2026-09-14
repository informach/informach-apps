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
import { Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useTransition } from "react";
import { useForm } from "react-hook-form";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { updateTurmaAction } from "../actions";
import {
  MAX_TURMA_YEAR,
  MIN_TURMA_YEAR,
  TURMA_GRADES,
  TURMA_SHIFT_LABELS,
  TURMA_SHIFTS,
  type TurmaGrade,
} from "../limits";
import { type UpdateTurmaFormValues, updateTurmaInputSchema } from "../schemas";
import type { TurmaForUser } from "../types";
import { formatGrade } from "../utils";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  turma: TurmaForUser;
};

const CLASS_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

function defaultsFromTurma(turma: TurmaForUser): UpdateTurmaFormValues {
  return {
    turmaId: turma.id,
    grade: turma.grade,
    year: turma.year,
    classLetter: turma.classLetter,
    shift: turma.shift ?? "unspecified",
  };
}

export function EditTurmaDialog({ open, onOpenChange, turma }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();

  const form = useForm<UpdateTurmaFormValues>({
    resolver: zodResolver(updateTurmaInputSchema),
    defaultValues: defaultsFromTurma(turma),
  });

  // Reset apenas em transições closed→open. Mudar `turma` ref durante a edição
  // (ex: parent re-renderiza após `router.refresh()`) zeraria o que o usuário
  // estava digitando.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!open) return;
    form.reset(defaultsFromTurma(turma));
  }, [open]);

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await catchActionResult(() => updateTurmaAction(values));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível salvar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "TURMA_NOT_FOUND") {
          toast.error("Turma já não existe", {
            description: "Pode ter sido removida em outra aba.",
          });
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "FORBIDDEN") {
          toast.error("Só quem criou a turma pode editar.");
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "HAS_OTHER_MEMBERS") {
          toast.error("Outras famílias estão usando essa turma.", {
            description: "Não é mais possível editar. Peça para elas saírem ou crie outra turma.",
          });
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "HAS_ACTIVITIES") {
          toast.error("Turma já tem atividades cadastradas.", {
            description: "Não é mais possível editar. Apague as atividades primeiro.",
          });
          onOpenChange(false);
          router.refresh();
          return;
        }
        if (result.error.code === "CONFLICT_EXISTING_TURMA") {
          toast.error("Já existe uma turma com essa série, ano e letra.", {
            description: "Escolha valores diferentes ou entre nela pelo código.",
          });
          return;
        }
        toast.error("Não foi possível salvar.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      toast.success("Turma atualizada");
      onOpenChange(false);
      router.refresh();
    });
  });

  const handleOpenChange = (next: boolean) => {
    if (!next) form.reset(defaultsFromTurma(turma));
    onOpenChange(next);
  };

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent>
        <DialogHeader>
          <DialogTitle>Editar turma</DialogTitle>
          <DialogDescription>
            Ajuste série, ano e letra. A escola não muda, porque escola diferente é outra turma. Só
            é possível editar enquanto a turma estiver vazia (sem atividades e sem outras famílias).
          </DialogDescription>
        </DialogHeader>

        <Form {...form}>
          <form onSubmit={onSubmit} className="space-y-4">
            <FormField
              control={form.control}
              name="shift"
              render={({ field }) => (
                <FormItem>
                  <FormLabel>Turno</FormLabel>
                  <Select value={field.value ?? "unspecified"} onValueChange={field.onChange}>
                    <FormControl>
                      <SelectTrigger>
                        <SelectValue />
                      </SelectTrigger>
                    </FormControl>
                    <SelectContent>
                      {TURMA_SHIFTS.map((shift) => (
                        <SelectItem key={shift} value={shift}>
                          {TURMA_SHIFT_LABELS[shift]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <FormMessage />
                </FormItem>
              )}
            />
            <div className="grid grid-cols-3 gap-3">
              <FormField
                control={form.control}
                name="grade"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Série</FormLabel>
                    <Select
                      value={field.value}
                      onValueChange={(v) => field.onChange(v as TurmaGrade)}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {TURMA_GRADES.map((g) => (
                          <SelectItem key={g} value={g}>
                            {formatGrade(g)}
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
                name="year"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Ano</FormLabel>
                    <FormControl>
                      <Input
                        type="number"
                        min={MIN_TURMA_YEAR}
                        max={MAX_TURMA_YEAR}
                        {...field}
                        value={field.value}
                        onChange={(e) => field.onChange(Number(e.target.value))}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />

              <FormField
                control={form.control}
                name="classLetter"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Turma</FormLabel>
                    <Select value={field.value} onValueChange={(v) => field.onChange(v)}>
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {CLASS_LETTERS.map((letter) => (
                          <SelectItem key={letter} value={letter}>
                            {letter}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>

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
                Salvar
              </Button>
            </DialogFooter>
          </form>
        </Form>
      </DialogContent>
    </Dialog>
  );
}
