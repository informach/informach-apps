"use client";
import { useRouter } from "next/navigation";
import { useState } from "react";
import { Avatar } from "@/components/avatar";
import { comecarPerfilAction } from "@/features/familia/actions";
import { useServerAction } from "@/lib/use-server-action";
import { CamposDoTreino, type JeitoDeTreinar } from "./campos";
import { META_PADRAO } from "./regras";

/** Primeiro acesso do perfil: três perguntas e o Início já sabe o treino do dia. */
export function ComecarPerfil({ perfil }: { perfil: { id: string; name: string; color: string } }) {
  const router = useRouter();
  const [valor, setValor] = useState<JeitoDeTreinar>({
    ritmo: "comecando",
    minutos: 20,
    dias: META_PADRAO,
  });
  const [mensagem, setMensagem] = useState("");
  const [pending, start] = useServerAction();
  const salvar = () =>
    start(async () => {
      const r = await comecarPerfilAction(perfil.id, valor);
      if (!r.ok) return setMensagem(r.error);
      router.push("/inicio");
    });
  return (
    <main className="profiles comecar" id="conteudo">
      <div className="brand">
        <i />
        Bora Treinar
      </div>
      <Avatar profile={perfil} size="5rem" />
      <h1>Oi, {perfil.name}!</h1>
      <p className="muted">
        Três perguntas para o treino do dia caber em você. Dá para mudar depois em "Gerenciar
        perfis".
      </p>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          salvar();
        }}
      >
        <CamposDoTreino valor={valor} aoMudar={setValor} nome={perfil.name} />
        <button type="submit" className="btn primary big" disabled={pending} data-autofocus>
          {pending ? "Salvando…" : "Começar"}
        </button>
        <p role="status" className="form-message">
          {mensagem}
        </p>
      </form>
    </main>
  );
}
