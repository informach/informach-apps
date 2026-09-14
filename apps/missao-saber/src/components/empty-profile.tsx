import { Mascote } from "./mascote";
import { LinkChapa } from "./ui/botao-chapa";

export function EmptyProfile() {
  return (
    <section className="mx-auto max-w-lg py-10 text-center">
      <Mascote humor="acolhendo" tamanho="g" className="mx-auto" />
      <h1 className="mt-4 font-display text-3xl font-semibold text-tinta">
        Vamos abrir uma nova jornada?
      </h1>
      <p className="mt-3 text-tinta-suave">
        O responsável cria um perfil com apelido e ano escolar. Cada estudante terá seu próprio
        caminho.
      </p>
      <LinkChapa href="/familia" medida="g" className="mt-6">
        Criar perfil de estudante
      </LinkChapa>
    </section>
  );
}
