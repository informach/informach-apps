"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@informach/ui/components/select";
import { ListTodo, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StudentProfile } from "@/features/students/types";
import type { ActivityListItem, TurmaWithSubjectsForForm } from "../types";
import { ActivityCard } from "./activity-card";
import { ActivityFormDialog } from "./activity-form-dialog";

type Props = {
  items: ActivityListItem[];
  profiles: StudentProfile[];
  activeFilter: StudentProfile | null;
  turmasForForm: TurmaWithSubjectsForForm[];
  currentUserId: string;
  isPro: boolean;
};

export function ActivitiesSection({
  items,
  profiles,
  activeFilter,
  turmasForForm,
  currentUserId,
  isPro,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);

  const handleFilterChange = (value: string) => {
    if (value === "all") {
      router.push("/atividades");
    } else {
      router.push(`/atividades?perfil=${value}`);
    }
  };

  if (profiles.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
            <ListTodo className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Crie um perfil de estudante primeiro
            </p>
            <p className="text-sm text-muted-foreground">
              Cada atividade fica vinculada a um perfil — você precisa ter pelo menos um.
            </p>
          </div>
          <Button asChild>
            <Link href="/perfis">Criar perfil</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  const canCreate = turmasForForm.length > 0;

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Filtrar por estudante:</span>
          <Select value={activeFilter?.id ?? "all"} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-auto min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todos</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <Button type="button" onClick={() => setCreateOpen(true)} disabled={!canCreate}>
          <Plus className="mr-2 size-4" aria-hidden />
          Nova atividade
        </Button>
      </div>

      {!canCreate ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListTodo className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                Vincule um perfil a uma turma ativa
              </p>
              <p className="text-sm text-muted-foreground">
                As atividades pertencem a uma turma. Cadastre uma matéria também para começar a
                criar atividades.
              </p>
            </div>
            <Button asChild>
              <Link href="/turmas">Ir para turmas</Link>
            </Button>
          </CardContent>
        </Card>
      ) : items.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary">
              <ListTodo className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {activeFilter
                  ? `Nenhuma atividade para ${activeFilter.name}`
                  : "Nenhuma atividade cadastrada"}
              </p>
              <p className="text-sm text-muted-foreground">
                Adicione tarefas, provas, trabalhos ou lembretes pra organizar a rotina.
              </p>
            </div>
            <Button type="button" onClick={() => setCreateOpen(true)}>
              <Plus className="mr-2 size-4" aria-hidden />
              Nova atividade
            </Button>
          </CardContent>
        </Card>
      ) : (
        <div className="flex flex-col gap-3">
          {items.map((item) => (
            <ActivityCard
              key={item.statusId}
              item={item}
              currentUserId={currentUserId}
              isPro={isPro}
              turmasForForm={turmasForForm}
            />
          ))}
        </div>
      )}

      <ActivityFormDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        turmas={turmasForForm}
        isPro={isPro}
      />
    </div>
  );
}
