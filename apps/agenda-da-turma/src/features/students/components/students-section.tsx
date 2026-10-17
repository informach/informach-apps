"use client";

import { Card, CardContent } from "@informach/ui/components/card";
import { Users } from "lucide-react";
import Link from "next/link";
import { TurmaInviteButton } from "@/features/turmas/components/turma-invite-button";
import { SHEET_LINK } from "@/features/unified-activities/components/activity-list";
import type { StudentProfileWithActiveTurma } from "../types";
import { NewStudentButton } from "./new-student-button";
import { StudentCard } from "./student-card";

export type Caretakers = {
  /** O nome de quem está vendo a tela. */
  you: string;
  /** O segundo adulto, quando há um, e as crianças que ele vê. */
  other: { name: string; sees: string[] } | null;
  /** Convites mandados e ainda sem resposta. */
  pendingInvites: number;
};

type Props = {
  currentUserId: string;
  profiles: StudentProfileWithActiveTurma[];
  /** "Natação às terças e sábados", por criança; `null` mostra a escola. */
  extrasByProfile?: Record<string, string | null>;
  isPro: boolean;
  currentCount: number;
  limit: number;
  /** Só para quem cadastrou as crianças; `null` esconde a folha. */
  caretakers: Caretakers | null;
  /** As turmas em que alguma criança da casa está agora, para chamar outras famílias. */
  turmaInvites: Array<{ id: string; code: string; label: string }>;
};

/** As iniciais do adulto ("AN", "LE"), no círculo cinza da prancha. */
function AdultInitials({ name }: { name: string }) {
  const first = name.trim().split(/\s+/)[0] ?? name;
  return (
    <span
      aria-hidden
      className="flex size-9 shrink-0 items-center justify-center rounded-full bg-card text-[13px] font-extrabold uppercase"
    >
      {first.slice(0, 2)}
    </span>
  );
}

function listNames(names: string[]) {
  if (names.length <= 1) return names.join("");
  return `${names.slice(0, -1).join(", ")} e ${names[names.length - 1]}`;
}

export function StudentsSection({
  profiles,
  extrasByProfile = {},
  isPro,
  currentCount,
  limit,
  currentUserId,
  caretakers,
  turmaInvites,
}: Props) {
  if (profiles.length === 0) {
    return (
      <Card className="rounded-[20px] border-dashed">
        <CardContent className="flex flex-col items-center justify-center gap-3 py-12 text-center">
          <span className="flex size-12 items-center justify-center rounded-full bg-primary/10 text-primary-ink">
            <Users className="size-6" aria-hidden />
          </span>
          <div className="space-y-1">
            <p className="text-base font-semibold text-foreground">
              Nenhuma criança por aqui ainda
            </p>
            <p className="text-sm text-muted-foreground">
              Comece pelo nome. A rotina de cada criança fica separada.
            </p>
          </div>
          <NewStudentButton isPro={isPro} currentCount={currentCount} limit={limit} />
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-3">
      {profiles.map((profile) => (
        <StudentCard
          currentUserId={currentUserId}
          key={profile.id}
          profile={profile}
          extras={extrasByProfile[profile.id] ?? null}
          isPro={isPro}
          currentCount={currentCount}
        />
      ))}

      {/* Para todo mundo: o plano é da conta, e quem cuida junto em outra casa
          também pode cadastrar os próprios filhos. */}
      <NewStudentButton
        isPro={isPro}
        currentCount={currentCount}
        limit={limit}
        appearance="dashed"
      />

      {caretakers ? (
        <section
          aria-labelledby="quem-cuida"
          className="overflow-hidden rounded-[20px] border border-foreground/15 bg-background"
        >
          <div className="flex items-baseline justify-between gap-3 px-[18px] pb-1.5 pt-4">
            <h2 id="quem-cuida" className="text-[19px] font-bold">
              Quem cuida junto
            </h2>
            <Link href="/familia/adultos" className={SHEET_LINK}>
              {caretakers.other || caretakers.pendingInvites ? "Mudar" : "Convidar"}
            </Link>
          </div>
          <ul>
            <li className="flex items-center gap-3 border-t border-foreground/15 px-[18px] py-3 text-[15px]">
              <AdultInitials name={caretakers.you} />
              <span>
                <b>{caretakers.you}</b> · você
              </span>
            </li>
            {caretakers.other ? (
              <li className="flex items-center gap-3 border-t border-foreground/15 px-[18px] py-3 text-[15px]">
                <AdultInitials name={caretakers.other.name} />
                <span>
                  <b>{caretakers.other.name}</b> ·{" "}
                  {caretakers.other.sees.length
                    ? `vê ${listNames(caretakers.other.sees)}`
                    : "ainda não vê nenhuma criança"}
                </span>
              </li>
            ) : null}
            {caretakers.pendingInvites ? (
              <li className="border-t border-foreground/15 px-[18px] py-3 text-[15px] text-muted-foreground">
                {caretakers.pendingInvites === 1
                  ? "Um convite esperando resposta"
                  : `${caretakers.pendingInvites} convites esperando resposta`}
              </li>
            ) : null}
            {!caretakers.other && !caretakers.pendingInvites ? (
              <li className="border-t border-foreground/15 px-[18px] py-3 text-[15px] text-muted-foreground">
                {isPro
                  ? "Por enquanto, só você. Dá para chamar mais um adulto, com o login dele."
                  : "Por enquanto, só você. No Pro, mais um adulto acompanha com o login dele."}
              </li>
            ) : null}
          </ul>
        </section>
      ) : null}

      {turmaInvites.map((turma) => (
        <section
          key={turma.id}
          aria-labelledby={`turma-${turma.id}`}
          className="flex items-center gap-3 rounded-[20px] border border-foreground/15 bg-background px-[18px] py-4"
        >
          <div className="min-w-0 flex-1 text-[15px] leading-[1.45]">
            <h2 id={`turma-${turma.id}`} className="font-bold">
              Turma do {turma.label}
            </h2>
            <p className="text-muted-foreground">
              Chame outras famílias com um link. Quem entra recebe o que vocês mandam.
            </p>
          </div>
          <TurmaInviteButton code={turma.code} label={turma.label} />
        </section>
      ))}
    </div>
  );
}
