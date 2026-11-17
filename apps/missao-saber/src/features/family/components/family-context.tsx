"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { LinkChapa } from "@/components/ui/botao-chapa";
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
      <h1 className="font-display text-3xl font-semibold">
        {groups.length ? "Qual família vai estudar?" : "Prepare sua família"}
      </h1>
      <p className="my-5 text-tinta-suave">
        As pessoas ficam na Minha conta. Aqui você prepara a trilha de cada estudante e acompanha
        suas descobertas.
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
              router.push("/familia");
              router.refresh();
            });
          }}
        >
          <label className="grid gap-2 font-semibold">
            Família
            <select
              disabled={!hydrated || pending}
              name="family"
              required
              defaultValue=""
              className="min-h-12 rounded-card border border-sombra bg-creme px-3"
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
          <button
            type="submit"
            className="min-h-12 rounded-card bg-tinta px-5 font-semibold text-creme"
            disabled={!hydrated || pending}
          >
            {pending ? "Abrindo…" : "Continuar"}
          </button>
        </form>
      )}
      <LinkChapa href={accountUrl} tom="contorno">
        {groups.length ? "Gerenciar famílias na Minha conta" : "Criar minha família na Minha conta"}
      </LinkChapa>
      <p role="status" className="mt-4 text-sm">
        {message}
      </p>
    </main>
  );
}
