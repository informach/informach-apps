"use client";
import { useHydrated } from "@informach/ui/hooks/use-hydrated";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { useServerAction } from "@/lib/use-server-action";
import { selectFamilyAction } from "./context-actions";

export function FamilyContextScreen({
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
    <main className="profiles" id="conteudo">
      <h1>{groups.length ? "Qual família vai treinar?" : "Sua família, em um só lugar"}</h1>
      <p className="muted">
        As pessoas são cadastradas na Minha conta. Aqui, cada perfil mantém seus treinos e seu
        ritmo.
      </p>
      {groups.length > 0 && (
        <form
          className="new-profile"
          onSubmit={(event) => {
            event.preventDefault();
            const groupId = new FormData(event.currentTarget).get("familia");
            if (typeof groupId !== "string") return;
            start(async () => {
              const result = await selectFamilyAction(groupId);
              if (!result.ok) return setMessage(result.error);
              router.push("/perfis");
              router.refresh();
            });
          }}
        >
          <label>
            Família
            <select
              className="field"
              disabled={!hydrated || pending}
              name="familia"
              required
              defaultValue=""
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
          <button type="submit" className="btn primary" disabled={!hydrated || pending}>
            {pending ? "Abrindo…" : "Continuar"}
          </button>
        </form>
      )}
      <a className="btn ghost" href={accountUrl}>
        {groups.length ? "Gerenciar famílias na Minha conta" : "Criar minha família na Minha conta"}
      </a>
      <p role="status" className="form-message">
        {message}
      </p>
    </main>
  );
}
