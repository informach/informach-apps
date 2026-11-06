import type { Metadata } from "next";
import { Lumi } from "@/components/desenhos";

export const metadata: Metadata = { title: "Sem conexão" };

/** Mostrada pelo service worker quando a navegação falha por falta de rede. Pública e sem dados. */
export default function Offline() {
  return (
    <main
      id="conteudo"
      data-area="crianca"
      className="flex min-h-dvh flex-col items-center justify-center gap-5 px-4 text-center"
    >
      <Lumi tamanho={130} humor="calma" />
      <h1 className="font-display text-4xl font-extrabold">Sem internet agora.</h1>
      <p className="max-w-md text-lg font-bold text-tinta-suave">
        Quando a internet voltar, a rotina aparece de novo. Os lembretes precisam da tela aberta.
      </p>
      <a href="/crianca" className="b3 b3-ceu b3-lg">
        Tentar de novo
      </a>
    </main>
  );
}
