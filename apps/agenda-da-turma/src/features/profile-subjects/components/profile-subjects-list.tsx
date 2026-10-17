"use client";

import { Tabs, TabsList, TabsTrigger } from "@informach/ui/components/tabs";
import { useState } from "react";
import type { ProfileSubjectWithCounts } from "../types";
import { ProfileSubjectCard } from "./profile-subject-card";

type Props = {
  profileId: string;
  subjects: ProfileSubjectWithCounts[];
};

type Tab = "active" | "paused";

export function ProfileSubjectsList({ profileId, subjects }: Props) {
  const [tab, setTab] = useState<Tab>("active");

  const active = subjects.filter((s) => s.status === "active");
  const paused = subjects.filter((s) => s.status === "paused");
  const visible = tab === "active" ? active : paused;

  return (
    <div className="space-y-4">
      <Tabs value={tab} onValueChange={(v) => setTab(v as Tab)}>
        <TabsList>
          <TabsTrigger value="active">Ativas ({active.length})</TabsTrigger>
          <TabsTrigger value="paused">Pausadas ({paused.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      {visible.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {tab === "active"
            ? "Nenhuma atividade extra ativa. Natação, inglês, reforço: adicione a primeira."
            : "Nenhuma atividade extra pausada agora."}
        </p>
      ) : (
        <div className="space-y-3">
          {visible.map((s) => (
            <ProfileSubjectCard key={s.id} subject={s} profileId={profileId} />
          ))}
        </div>
      )}
    </div>
  );
}
