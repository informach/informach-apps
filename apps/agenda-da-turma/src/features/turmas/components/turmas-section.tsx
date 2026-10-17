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
import { GraduationCap, KeyRound, Plus } from "lucide-react";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState } from "react";
import type { StudentProfile } from "@/features/students/types";
import type { TurmaForUser } from "../types";
import { CreateTurmaDialog } from "./create-turma-dialog";
import { JoinByCodeDialog } from "./join-by-code-dialog";
import { TurmaCard } from "./turma-card";

type Props = {
  turmas: TurmaForUser[];
  /** Crianças da própria conta — a turma é cadastrada por quem matriculou. */
  profiles: StudentProfile[];
  /** A pessoa cuida de crianças de outra família (segundo adulto). */
  caresForOtherFamilies: boolean;
  activeFilter: StudentProfile | null;
  currentUserId: string;
};

export function TurmasSection({
  turmas,
  profiles,
  caresForOtherFamilies,
  activeFilter,
  currentUserId,
}: Props) {
  const router = useRouter();
  const [createOpen, setCreateOpen] = useState(false);
  const [joinOpen, setJoinOpen] = useState(false);

  const handleFilterChange = (value: string) => {
    if (value === "all") {
      router.push("/familia/turmas");
    } else {
      router.push(`/familia/turmas?perfil=${value}`);
    }
  };

  // Quem cuida junto vê as crianças em Crianças, mas a turma é de quem as
  // matriculou: ela é espaço compartilhado com outras famílias, e o card
  // entrega o código, que vincula qualquer criança àquela sala. Dizer isso é
  // melhor do que mostrar "nenhuma turma" com dois botões que recusam.
  if (profiles.length === 0 && caresForOtherFamilies) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              As turmas ficam com quem cadastrou as crianças
            </p>
            <p className="text-sm text-muted-foreground">
              Você acompanha a rotina delas normalmente: as atividades já chegam com a matéria e a
              cor da turma.
            </p>
          </div>
          <Button asChild>
            <Link href="/atividades">Ver as atividades</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  if (profiles.length === 0) {
    return (
      <Card className="rounded-2xl border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <GraduationCap className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Primeiro, a criança
            </p>
            <p className="text-sm text-muted-foreground">
              A turma é de cada criança. Adicione a criança e depois escolha a turma dela.
            </p>
          </div>
          <Button asChild>
            <Link href="/familia">Adicionar criança</Link>
          </Button>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">Mostrar de:</span>
          <Select value={activeFilter?.id ?? "all"} onValueChange={handleFilterChange}>
            <SelectTrigger className="w-auto min-w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">Todas as crianças</SelectItem>
              {profiles.map((p) => (
                <SelectItem key={p.id} value={p.id}>
                  {p.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        <div className="flex gap-2">
          <Button type="button" variant="outline" onClick={() => setJoinOpen(true)}>
            <KeyRound className="mr-2 size-4" aria-hidden />
            Entrar por código
          </Button>
          <Button type="button" onClick={() => setCreateOpen(true)}>
            <Plus className="mr-2 size-4" aria-hidden />
            Nova turma
          </Button>
        </div>
      </div>

      {turmas.length === 0 ? (
        <Card className="rounded-2xl border-dashed">
          <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
            <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
              <GraduationCap className="size-6" aria-hidden />
            </span>
            <div className="space-y-1">
              <p className="text-base font-semibold text-foreground">
                {activeFilter
                  ? `${activeFilter.name} ainda não está em nenhuma turma`
                  : "Nenhuma turma ainda"}
              </p>
              <p className="text-sm text-muted-foreground">
                Crie uma nova turma ou entre em uma existente com o código compartilhado.
              </p>
            </div>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {turmas.map((t) => (
            <TurmaCard key={t.id} turma={t} userProfiles={profiles} currentUserId={currentUserId} />
          ))}
        </div>
      )}

      <CreateTurmaDialog
        open={createOpen}
        onOpenChange={setCreateOpen}
        profiles={profiles}
        defaultProfileId={activeFilter?.id}
      />
      <JoinByCodeDialog
        open={joinOpen}
        onOpenChange={setJoinOpen}
        profiles={profiles}
        defaultProfileId={activeFilter?.id}
      />
    </div>
  );
}
