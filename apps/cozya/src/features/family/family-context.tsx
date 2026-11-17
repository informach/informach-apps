"use client";
import { Button } from "@informach/ui/components/button";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { selectFamilyAction } from "./context-actions";
export function FamilyContext({
  groups,
  selected,
}: {
  groups: { id: string; name: string }[];
  selected: string | null;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [pending, start] = useTransition();
  const [message, setMessage] = useState("");
  return (
    <form
      className="my-6 grid gap-4"
      onSubmit={(event) => {
        event.preventDefault();
        const choice = new FormData(event.currentTarget).get("family");
        if (typeof choice !== "string") return;
        setMessage("");
        start(async () => {
          try {
            const result = await selectFamilyAction({ groupId: choice || null });
            if (!result.ok) return setMessage("Confira seu acesso à família na Minha conta.");
            router.push("/hoje");
            router.refresh();
          } catch {
            setMessage("Não foi possível trocar a família. Tente novamente.");
          }
        });
      }}
    >
      <label className="grid gap-2 font-semibold">
        Assinatura e créditos
        <select
          name="family"
          defaultValue={selected ?? ""}
          disabled={!hydrated || pending}
          className="min-h-12 rounded-xl border bg-background px-3"
        >
          <option value="">Usar apenas os recursos gratuitos</option>
          {groups.map((group) => (
            <option key={group.id} value={group.id}>
              {group.name}
            </option>
          ))}
        </select>
      </label>
      <Button disabled={!hydrated || pending} type="submit">
        {pending ? "Abrindo…" : "Continuar"}
      </Button>
      <p role="status" className="text-sm">
        {message}
      </p>
    </form>
  );
}
