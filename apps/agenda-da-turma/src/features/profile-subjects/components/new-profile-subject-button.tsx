"use client";

import { Button } from "@informach/ui/components/button";
import { Plus } from "lucide-react";
import { useState } from "react";
import { ProfileSubjectFormDialog } from "./profile-subject-form-dialog";

type Props = {
  profileId: string;
  disabled: boolean;
  disabledTitle?: string;
};

export function NewProfileSubjectButton({ profileId, disabled, disabledTitle }: Props) {
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
        Nova matéria
      </Button>
      <ProfileSubjectFormDialog open={open} onOpenChange={setOpen} profileId={profileId} />
    </>
  );
}
