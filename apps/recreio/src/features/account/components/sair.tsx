"use client";
import { LogOut } from "lucide-react";
import { useState } from "react";
import { authClient } from "@/lib/auth-client";

/** Sai da conta neste navegador e volta para a página pública. */
export function Sair() {
  const [pendente, setPendente] = useState(false);
  const [erro, setErro] = useState("");
  async function sair() {
    setPendente(true);
    setErro("");
    try {
      const resultado = await authClient.signOut();
      if (!resultado.error) {
        // Fica "Saindo…" até a página pública carregar.
        window.location.replace("/");
        return;
      }
      setErro("Não foi possível sair agora. Tente de novo.");
    } catch {
      setErro("Não foi possível conectar. Tente de novo em instantes.");
    }
    setPendente(false);
  }
  return (
    <div>
      <button type="button" className="rb rb-vazado" disabled={pendente} onClick={sair}>
        <LogOut className="size-4" aria-hidden="true" />
        {pendente ? "Saindo…" : "Sair da conta"}
      </button>
      <p role="status" className="mt-2 min-h-5 text-sm font-semibold text-coral">
        {erro}
      </p>
    </div>
  );
}
