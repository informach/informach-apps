import { Suspense } from "react";
import { Downloads } from "@/features/releases/downloads";
export const dynamic = "force-dynamic";
export default function DownloadsPage() {
  return (
    <section className="content-card">
      <p className="eyebrow">SUA BANCADA NO WINDOWS</p>
      <h1>Leve suas ferramentas com você.</h1>
      <p>
        Comece pelo Edi Hub. As atualizações são verificadas pela chave da suíte e baixadas
        automaticamente. Este piloto ainda não tem certificado de publicador reconhecido pelo
        Windows: a instalação pode exibir alertas ou ser bloqueada pelas políticas do computador.
      </p>
      <Suspense fallback={<p role="status">Consultando a versão disponível…</p>}>
        <Downloads />
      </Suspense>
    </section>
  );
}
