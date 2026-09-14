import { Mascote } from "@/components/mascote";
import { LinkChapa } from "@/components/ui/botao-chapa";

export default function NotFound() {
  return (
    <main id="conteudo" className="mx-auto max-w-lg px-4 py-16 text-center">
      <Mascote humor="pensando" tamanho="g" className="mx-auto" />
      <h1 className="mt-4 font-display text-2xl font-semibold text-tinta">
        Este caminho não foi encontrado.
      </h1>
      <p className="mt-3 mb-6 text-tinta-suave">
        A missão pode ter mudado de endereço ou pertencer a outra conta.
      </p>
      <LinkChapa href="/hoje" medida="g">
        Voltar à minha jornada
      </LinkChapa>
    </main>
  );
}
