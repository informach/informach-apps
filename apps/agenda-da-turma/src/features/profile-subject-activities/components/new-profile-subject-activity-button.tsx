"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ProfileSubjectActivityFormDialog } from "./profile-subject-activity-form-dialog";

type Props = {
  profileSubjectId: string;
  profileSubjectName: string;
  disabled?: boolean;
  disabledTitle?: string;
};

export function NewProfileSubjectActivityButton({
  profileSubjectId,
  profileSubjectName,
  disabled,
  disabledTitle,
}: Props) {
  const [open, setOpen] = useState(false);
  return (
    <>
      <Button
        size="sm"
        onClick={() => setOpen(true)}
        disabled={disabled}
        title={disabled ? disabledTitle : undefined}
      >
        <Plus className="mr-1.5 size-4" aria-hidden />
        Nova atividade
      </Button>
      <ProfileSubjectActivityFormDialog
        open={open}
        onOpenChange={setOpen}
        profileSubjectId={profileSubjectId}
        profileSubjectName={profileSubjectName}
      />
    </>
  );
}
