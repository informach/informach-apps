"use client";
import { Button } from "@informach/ui/components/button";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { selectFamilyAction } from "../context-actions";
import type { NotificationDestination } from "../notification-link";

export function FamilyContext({
  groups,
  accountUrl,
  requestedFamilyId,
  destination,
}: {
  groups: { id: string; name: string }[];
  accountUrl: string;
  requestedFamilyId?: string;
  destination?: NotificationDestination;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  return (
    <main className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display text-3xl font-bold">
        {groups.length ? "Qual família vamos acompanhar?" : "Prepare sua família"}
      </h1>
      <p className="my-5 text-muted-foreground">
        As pessoas e os responsáveis ficam na Minha conta. Aqui você organiza a rotina escolar das
        crianças com quem tem acesso.
      </p>
      {groups.length > 0 && (
        <form
          className="my-8 grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const groupId = new FormData(event.currentTarget).get("family");
            if (typeof groupId !== "string") return;
            setMessage("");
            start(async () => {
              try {
                const result = await selectFamilyAction({ groupId });
                if (!result.ok)
                  return setMessage(
                    "Não foi possível abrir esta família. Confira seu acesso na Minha conta.",
                  );
                router.push(
                  groupId === requestedFamilyId && destination ? destination : "/dashboard",
                );
                router.refresh();
              } catch {
                setMessage("Não foi possível abrir a família. Tente novamente.");
              }
            });
          }}
        >
          <label className="grid gap-2 font-semibold">
            Família
            <select
              name="family"
              required
              defaultValue={requestedFamilyId ?? ""}
              disabled={!hydrated || pending}
              className="min-h-12 rounded-xl border bg-background px-3"
            >
              <option value="" disabled>
                Escolha uma família
              </option>
              {groups.map((group) => (
                <option key={group.id} value={group.id}>
                  {group.name}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={!hydrated || pending}>
            {pending ? "Abrindo…" : "Continuar"}
          </Button>
        </form>
      )}
      <a className="font-semibold underline" href={accountUrl}>
        {groups.length ? "Gerenciar famílias na Minha conta" : "Criar minha família na Minha conta"}
      </a>
      <p role="status" className="mt-4 text-sm">
        {message}
      </p>
    </main>
  );
}
