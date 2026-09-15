import type { Metadata } from "next";
import { Brand } from "@/components/brand";
import { Mascote } from "@/components/mascote";
import { LinkChapa } from "@/components/ui/botao-chapa";
import { Chapa } from "@/components/ui/chapa";
import { Etiqueta } from "@/components/ui/pagina";

export const metadata: Metadata = { title: "Sem conexão" };

/**
 * Página que o service worker mostra quando a navegação falha por falta de
 * rede. É pública e não depende de dados: qualquer consulta aqui falharia
 * pelo mesmo motivo que trouxe o visitante até esta tela.
 */
export default function Offline() {
  return (
    <main id="conteudo" className="mx-auto max-w-2xl px-4 py-12 sm:px-8">
      <Brand />
      <Chapa tom="ceu" className="mt-8 text-center">
        <Mascote humor="descansando" tamanho="m" className="mx-auto" />
        <Etiqueta tom="ceu" className="mt-3">
          Sem conexão agora
        </Etiqueta>
        <h1 className="mt-3 font-display text-2xl leading-tight font-semibold text-tinta sm:text-3xl">
          A internet saiu para dar uma volta.
        </h1>
        <p className="mx-auto mt-3 max-w-lg text-tinta">
          Nada do que você já respondeu se perdeu: cada tentativa confirmada foi gravada no servidor
          no momento em que você enviou. Quando a conexão voltar, a missão continua exatamente de
          onde parou.
        </p>
        <p className="mx-auto mt-3 max-w-lg text-sm text-tinta-suave">
          As missões não ficam guardadas neste aparelho de propósito. O celular da casa costuma ser
          compartilhado, e o percurso de um estudante não deve ficar legível a partir de outro
          perfil.
        </p>
        <LinkChapa href="/hoje" medida="g" className="mt-6">
          Tentar de novo
        </LinkChapa>
      </Chapa>
    </main>
  );
}
