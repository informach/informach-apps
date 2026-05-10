"use client";

import { Button } from "@informach/ui/components/button";
import { Card, CardContent } from "@informach/ui/components/card";
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from "@informach/ui/components/dropdown-menu";
import { MoreVertical, Pencil, Trash2 } from "lucide-react";
import { useState } from "react";
import type { StudentProfile } from "../types";
import { formatBirthDate, getAgeFromBirthDate } from "../utils";
import { DeleteStudentDialog } from "./delete-student-dialog";
import { StudentAvatar } from "./student-avatar";
import { StudentFormDialog } from "./student-form-dialog";

type Props = {
  profile: StudentProfile;
  isPro: boolean;
  currentCount: number;
};

export function StudentCard({ profile, isPro, currentCount }: Props) {
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const age = getAgeFromBirthDate(profile.birthDate);
  const formattedDate = formatBirthDate(profile.birthDate);

  return (
    <>
      <Card>
        <CardContent className="flex items-center gap-4 p-4">
          <StudentAvatar name={profile.name} />
          <div className="min-w-0 flex-1">
            <p className="truncate text-base font-semibold text-foreground">{profile.name}</p>
            <p className="text-sm text-muted-foreground">
              {age} {age === 1 ? "ano" : "anos"} · nasceu em {formattedDate}
            </p>
          </div>
          <DropdownMenu>
            <DropdownMenuTrigger asChild>
              <Button variant="ghost" size="icon" aria-label={`Ações para ${profile.name}`}>
                <MoreVertical className="size-4" aria-hidden />
              </Button>
            </DropdownMenuTrigger>
            <DropdownMenuContent align="end">
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
