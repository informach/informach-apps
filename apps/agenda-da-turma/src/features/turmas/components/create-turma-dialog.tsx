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
import { Label } from "@informach/ui/components/label";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { toast } from "@informach/ui/components/sonner";
import { CheckCircle2, Copy, Loader2 } from "lucide-react";
import { useRouter } from "next/navigation";
import { useEffect, useState, useTransition } from "react";
import { useForm } from "react-hook-form";
import type { StudentProfile } from "@/features/students/types";
import { catchActionResult, isActionRejected } from "@/lib/action-result";
import { createOrJoinTurmaAction } from "../actions";
import {
  MAX_TURMA_YEAR,
  MIN_TURMA_YEAR,
  TURMA_GRADES,
  TURMA_SHIFT_LABELS,
  TURMA_SHIFTS,
  type TurmaGrade,
} from "../limits";
import { type CreateTurmaFormValues, createTurmaInputSchema } from "../schemas";
import { formatGrade } from "../utils";
import { AsyncCombobox, type ComboboxOption } from "./async-combobox";

type Props = {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  profiles: StudentProfile[];
  defaultProfileId?: string;
};

const CLASS_LETTERS = "ABCDEFGHIJKLMNOPQRSTUVWXYZ".split("");

export function CreateTurmaDialog({ open, onOpenChange, profiles, defaultProfileId }: Props) {
  const router = useRouter();
  const [submitting, startSubmit] = useTransition();
  const [shareCode, setShareCode] = useState<{ code: string; created: boolean } | null>(null);

  const [stateUf, setStateUf] = useState<string | null>(null);
  const [cityIbge, setCityIbge] = useState<string | null>(null);

  const form = useForm<CreateTurmaFormValues>({
    resolver: zodResolver(createTurmaInputSchema),
    defaultValues: {
      schoolInepCode: "",
      grade: "1ano",
      year: new Date().getFullYear(),
      classLetter: "A",
      shift: "unspecified",
      profileId: defaultProfileId ?? profiles[0]?.id ?? "",
    },
  });

  // Reset apenas em transições closed→open. Sem `profiles`/`defaultProfileId` nas
  // deps, senão `router.refresh()` (após submit) altera a referência de `profiles`,
  // re-dispara este effect e zera o `shareCode`, fazendo o modal "limpar" e voltar
  // pro form em vez de mostrar a tela de sucesso com o código compartilhável.
  // biome-ignore lint/correctness/useExhaustiveDependencies: see comment above
  useEffect(() => {
    if (!open) return;
    form.reset({
      schoolInepCode: "",
      grade: "1ano",
      year: new Date().getFullYear(),
      classLetter: "A",
      shift: "unspecified",
      profileId: defaultProfileId ?? profiles[0]?.id ?? "",
    });
    setStateUf(null);
    setCityIbge(null);
    setShareCode(null);
  }, [open]);

  const fetchStates = async (q: string): Promise<ComboboxOption[]> => {
    const res = await fetch("/api/data/states");
    if (!res.ok) return [];
    const json = (await res.json()) as { states: { uf: string; name: string }[] };
    const opts = json.states.map((s) => ({ value: s.uf, label: `${s.name} (${s.uf})` }));
    if (!q) return opts;
    const norm = q.toLowerCase();
    return opts.filter((o) => o.label.toLowerCase().includes(norm));
  };

  const fetchCities = async (q: string): Promise<ComboboxOption[]> => {
    if (!stateUf) return [];
    const url = new URL("/api/data/cities", window.location.origin);
    url.searchParams.set("state", stateUf);
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = (await res.json()) as { cities: { ibgeCode: string; name: string }[] };
    return json.cities.map((c) => ({ value: c.ibgeCode, label: c.name }));
  };

  const fetchClassLetters = async (q: string): Promise<ComboboxOption[]> => {
    const opts = CLASS_LETTERS.map((l) => ({ value: l, label: l }));
    if (!q) return opts;
    const norm = q.trim().toUpperCase();
    return opts.filter((o) => o.value.startsWith(norm));
  };

  const fetchSchools = async (q: string): Promise<ComboboxOption[]> => {
    if (!cityIbge) return [];
    const url = new URL("/api/data/schools", window.location.origin);
    url.searchParams.set("cityIbge", cityIbge);
    if (q) url.searchParams.set("q", q);
    const res = await fetch(url.toString());
    if (!res.ok) return [];
    const json = (await res.json()) as { schools: { inepCode: string; name: string }[] };
    return json.schools.map((s) => ({ value: s.inepCode, label: s.name }));
  };

  const onSubmit = form.handleSubmit((values) => {
    startSubmit(async () => {
      const result = await catchActionResult(() => createOrJoinTurmaAction(values));
      if (!result.ok) {
        if (isActionRejected(result.error)) {
          toast.error("Não foi possível salvar.", {
            description: "Atualize a página e tente novamente.",
          });
          router.refresh();
          return;
        }
        if (result.error.code === "PROFILE_NOT_FOUND") {
          toast.error("Não achamos essa criança", {
            description: "Escolha uma das crianças da lista.",
          });
          return;
        }
        toast.error("Não foi possível salvar.", {
          description: "Tente novamente em instantes.",
        });
        return;
      }
      setShareCode({ code: result.value.code, created: result.value.created });
      router.refresh();
    });
  });

  const handleClose = (next: boolean) => {
    if (!next) {
      setShareCode(null);
    }
    onOpenChange(next);
  };

  const copyCode = async () => {
    if (!shareCode) return;
    try {
      await navigator.clipboard.writeText(shareCode.code);
      toast.success("Código copiado");
    } catch {
      toast.error("Não foi possível copiar.");
    }
  };

  return (
    <Dialog open={open} onOpenChange={handleClose}>
      <DialogContent className="max-h-[90vh] overflow-y-auto">
        {shareCode ? (
          <>
            <DialogHeader>
              <DialogTitle className="flex items-center gap-2">
                <CheckCircle2 className="size-5 text-primary-ink" aria-hidden />
                {shareCode.created ? "Turma criada" : "Você entrou na turma"}
              </DialogTitle>
              <DialogDescription>
                {shareCode.created
                  ? "A turma foi criada e a criança já está nela, como a turma deste ano."
                  : "A criança entrou na turma que você já tinha criado."}
              </DialogDescription>
            </DialogHeader>

            <div className="space-y-3">
              <p className="text-sm text-muted-foreground">
                Mande este código para as outras famílias da turma. Com ele, elas entram e recebem o que vocês mandarem:
              </p>
              <div className="flex items-center gap-2 rounded-lg border bg-muted/40 p-3">
                <span className="flex-1 font-mono text-2xl tracking-widest">{shareCode.code}</span>
                <Button type="button" variant="outline" size="sm" onClick={copyCode}>
                  <Copy className="mr-2 size-4" aria-hidden />
                  Copiar
                </Button>
              </div>
            </div>

            <DialogFooter>
              <Button type="button" onClick={() => handleClose(false)}>
                Fechar
              </Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <DialogTitle>Nova turma</DialogTitle>
              <DialogDescription>
                A turma junta as famílias da mesma sala. Se outra família já criou, peça o
                convite e entre por código.
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
                <FormField
                  control={form.control}
                  name="profileId"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Criança</FormLabel>
                      <Select value={field.value} onValueChange={field.onChange}>
                        <FormControl>
                          <SelectTrigger>
                            <SelectValue placeholder="Escolha a criança" />
                          </SelectTrigger>
                        </FormControl>
                        <SelectContent>
                          {profiles.map((p) => (
                            <SelectItem key={p.id} value={p.id}>
                              {p.name}
                            </SelectItem>
                          ))}
                        </SelectContent>
                      </Select>
                      <FormMessage />
                    </FormItem>
                  )}
                />

                <div className="grid gap-2">
                  <Label>Estado</Label>
                  <AsyncCombobox
                    value={stateUf}
                    onChange={(uf) => {
                      setStateUf(uf);
                      setCityIbge(null);
                      form.setValue("schoolInepCode", "");
                    }}
                    fetchOptions={fetchStates}
                    placeholder="Selecione o estado"
                    emptyText="Nenhum estado encontrado"
                  />
                </div>

                <div className="grid gap-2">
                  <Label>Cidade</Label>
                  <AsyncCombobox
                    value={cityIbge}
                    onChange={(ibge) => {
                      setCityIbge(ibge);
                      form.setValue("schoolInepCode", "");
                    }}
                    fetchOptions={fetchCities}
                    placeholder={stateUf ? "Selecione a cidade" : "Selecione o estado primeiro"}
                    emptyText="Nenhuma cidade encontrada"
                    disabled={!stateUf}
                    resetKey={stateUf ?? "no-state"}
                  />
                </div>

                <FormField
                  control={form.control}
                  name="schoolInepCode"
                  render={({ field }) => (
                    <FormItem>
                      <FormLabel>Escola</FormLabel>
                      <FormControl>
                        <AsyncCombobox
                          value={field.value || null}
                          onChange={(inep) => field.onChange(inep ?? "")}
                          fetchOptions={fetchSchools}
                          placeholder={
                            cityIbge ? "Selecione a escola" : "Selecione a cidade primeiro"
                          }
                          emptyText="Nenhuma escola encontrada"
                          disabled={!cityIbge}
                          resetKey={cityIbge ?? "no-city"}
                        />
                      </FormControl>
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
                        <FormControl>
                          <AsyncCombobox
                            value={field.value || null}
                            onChange={(letter) => field.onChange(letter ?? "")}
                            fetchOptions={fetchClassLetters}
                            placeholder="A"
                            emptyText="Sem opções"
                            searchPlaceholder="A-Z"
                          />
                        </FormControl>
                        <FormMessage />
                      </FormItem>
                    )}
                  />
                </div>

                <DialogFooter>
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => handleClose(false)}
                    disabled={submitting}
                  >
                    Cancelar
                  </Button>
                  <Button type="submit" disabled={submitting}>
                    {submitting ? (
                      <Loader2 className="mr-2 size-4 animate-spin" aria-hidden />
                    ) : null}
                    Cadastrar turma
                  </Button>
                </DialogFooter>
              </form>
            </Form>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
}
