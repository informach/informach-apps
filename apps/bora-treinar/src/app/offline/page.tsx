import type { Metadata } from "next";
import { Brand } from "@/components/brand";

export const metadata: Metadata = { title: "Sem conexão" };

/**
 * Página que o service worker mostra quando a navegação falha por falta de
 * rede. É pública e não depende de dados.
 */
export default function Offline() {
  return (
    <main className="profiles" id="conteudo">
      <Brand />
      <h1>Sem internet agora.</h1>
      <p className="muted lead">
        Treinos concluídos sem conexão ficam guardados neste aparelho e são salvos sozinhos quando a
        internet voltar.
      </p>
      <a href="/perfis" className="btn primary big">
        Tentar de novo
      </a>
    </main>
  );
}
