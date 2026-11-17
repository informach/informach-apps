"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useServerAction } from "@/lib/use-server-action";
import { selectFamilyAction } from "../context-actions";

export function FamilyContext({
  groups,
  accountUrl,
}: {
  groups: { id: string; name: string }[];
  accountUrl: string;
}) {
  const hydrated = useHydrated();
  const router = useRouter();
  const [message, setMessage] = useState("");
  const [pending, start] = useServerAction();
  return (
    <main id="conteudo" className="mx-auto max-w-xl px-5 py-12">
      <h1 className="font-display text-3xl font-extrabold">
        {groups.length ? "Qual família vamos acompanhar?" : "Prepare sua família"}
      </h1>
      <p className="my-5">
        As pessoas ficam na Minha conta. Aqui você organiza a rotina e acompanha as conquistas de
        cada criança.
      </p>
      {!!groups.length && (
        <form
          className="my-8 grid gap-5"
          onSubmit={(event) => {
            event.preventDefault();
            const id = new FormData(event.currentTarget).get("family");
            if (typeof id !== "string") return;
            start(async () => {
              const result = await selectFamilyAction(id);
              if (!result.ok) return setMessage(result.error);
              router.push("/inicio");
              router.refresh();
            });
          }}
        >
          <label className="grid gap-2 font-bold">
            Família
            <select
              name="family"
              required
              defaultValue=""
              disabled={!hydrated || pending}
              className="min-h-12 rounded-xl border-2 border-linha bg-white px-3"
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
          <button type="submit" className="bp" disabled={!hydrated || pending}>
            {pending ? "Abrindo…" : "Continuar"}
          </button>
        </form>
      )}
      <a className="font-bold underline" href={accountUrl}>
        {groups.length ? "Gerenciar famílias na Minha conta" : "Criar minha família na Minha conta"}
      </a>
      <p role="status" className="mt-4 text-sm">
        {message}
      </p>
    </main>
  );
}
