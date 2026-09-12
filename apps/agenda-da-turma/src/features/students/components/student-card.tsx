"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { GraduationCap, MoreVertical, Pencil, Sparkles, Trash2 } from "lucide-react";
import Link from "next/link";
import { useState } from "react";
import type { StudentProfileWithActiveTurma } from "../types";
import { getAgeFromBirthDate } from "../utils";
import { DeleteStudentDialog } from "./delete-student-dialog";
import { StudentAvatar } from "./student-avatar";
import { StudentFormDialog } from "./student-form-dialog";

type Props = {
  currentUserId: string;
  profile: StudentProfileWithActiveTurma;
  isPro: boolean;
  currentCount: number;
};

function formatTurmaShortLabel(grade: string, classLetter: string): string {
  return `${grade.charAt(0)}º ano ${classLetter}`;
}

export function StudentCard({ profile, isPro, currentCount, currentUserId }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const age = profile.birthDate ? getAgeFromBirthDate(profile.birthDate) : null;
  const ageLabel = age === null ? "" : `${age} ${age === 1 ? "ano" : "anos"} · `;
  const turmaLabel = profile.activeTurma
    ? `${formatTurmaShortLabel(profile.activeTurma.grade, profile.activeTurma.classLetter)} — ${profile.activeTurma.schoolName}`
    : "Sem turma vinculada";

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <StudentAvatar name={profile.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{profile.name}</p>
            <p className="truncate text-sm text-muted-foreground">
              {ageLabel}
              {turmaLabel}
            </p>
          </div>
          {profile.userId === currentUserId ? (
            <DropdownMenu>
              <DropdownMenuTrigger asChild>
                <Button variant="ghost" size="icon" aria-label={`Ações para ${profile.name}`}>
                  <MoreVertical className="size-4" aria-hidden />
                </Button>
              </DropdownMenuTrigger>
              <DropdownMenuContent align="end">
                <DropdownMenuItem asChild>
                  <Link href={`/turmas?perfil=${profile.id}`}>
                    <GraduationCap className="mr-2 size-4" aria-hidden />
                    Gerenciar turmas
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuItem asChild>
                  <Link href={`/perfis/${profile.id}/extras`}>
                    <Sparkles className="mr-2 size-4" aria-hidden />
                    Extracurriculares
                  </Link>
                </DropdownMenuItem>
                <DropdownMenuSeparator />
                <DropdownMenuItem onSelect={() => setEditOpen(true)}>
                  <Pencil className="mr-2 size-4" aria-hidden />
                  Editar
                </DropdownMenuItem>
                <DropdownMenuItem
                  onSelect={() => setDeleteOpen(true)}
                  className="text-destructive focus:text-destructive"
                >
                  <Trash2 className="mr-2 size-4" aria-hidden />
                  Excluir
                </DropdownMenuItem>
              </DropdownMenuContent>
            </DropdownMenu>
          ) : (
            <Button asChild variant="outline" size="sm">
              <Link href={`/recados?perfil=${profile.id}`}>Acompanhar</Link>
            </Button>
          )}
        </CardContent>
      </Card>

      <StudentFormDialog
        open={editOpen}
        onOpenChange={setEditOpen}
        isPro={isPro}
        currentCount={currentCount}
        profile={profile}
      />
      <DeleteStudentDialog
        open={deleteOpen}
        onOpenChange={setDeleteOpen}
        profileId={profile.id}
        profileName={profile.name}
      />
    </>
  );
}
