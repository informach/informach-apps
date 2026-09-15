import type { ReactNode } from "react";
import { OfflineBanner } from "@/components/app-shell/offline-banner";
import { redirectIfUnauthenticated } from "@/lib/auth";

/**
 * O shell do modo criança: nenhum.
 *
 * Fica fora do grupo `(app)` de propósito. Ali moram o cabeçalho com "Seja
 * Pro", o menu do avatar e o rodapé de navegação — tudo endereçado ao
 * responsável, e tudo a um toque de distância de uma criança com o telefone na
 * mão. Aqui a tela é só a atividade.
 *
 * A sessão continua sendo exigida: o modo criança é uma vista dos dados da
 * família, não um acesso público.
 */
export default async function KidLayout({ children }: { children: ReactNode }) {
  await redirectIfUnauthenticated();
  return (
    <div className="min-h-dvh bg-app-ground">
      {/* O único elemento de shell que sobrevive aqui: uma criança marcando
          "feito" sem rede precisa saber que não foi ela que errou. */}
      <OfflineBanner />
      {children}
    </div>
  );
}
