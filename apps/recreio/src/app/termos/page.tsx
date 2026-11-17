import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { PaginaDeTexto } from "@/components/pagina-publica";

export const metadata = { title: "Termos" };

export default function Termos() {
  return (
    <PaginaDeTexto>
      <p className="text-sm font-bold tracking-[0.12em] text-tinta-suave">
        ÚLTIMA ATUALIZAÇÃO · 15/11/2026
      </p>
      <h1>Termos do Recreio, na fase de alfa.</h1>
      <p>
        O Recreio é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ 43.588.758/0001-03.
        Esta é uma versão curta, que vale enquanto o Recreio está em alfa fechado, com acesso por
        convite da equipe.
      </p>
      <h2>O que existe hoje</h2>
      <p>
        Nesta fase dá para criar ou usar a conta Informach e entrar no portal. Adultos convidados
        pela equipe podem receber uma liberação temporária para testar o Morada, criar mundos e
        jogar juntos. Não há assinatura à venda nem cobrança no alfa. Recursos e disponibilidade
        ainda estão em teste; uma falha pode exigir reconectar ou refazer alterações recentes.
      </p>
      <h2>Conta</h2>
      <p>
        A conta é a mesma dos outros apps da Informach e deve ser criada por uma pessoa maior de 18
        anos. O alfa não oferece perfis infantis nem pareamento de aparelhos para menores. Cada
        participante usa sua própria conta; não compartilhe códigos de entrada.
      </p>
      <h2>Mundos compartilhados</h2>
      <p>
        O responsável pelo mundo pode convidar outros participantes com acesso liberado. O convite
        não transfere conta, assinatura ou propriedade sobre o progresso de outra pessoa. O fim de
        uma liberação não apaga automaticamente o mundo dos demais membros. Saída de mundos,
        transferência de responsabilidade e pedidos sobre os dados são tratados pelo suporte
        enquanto os controles completos estão em desenvolvimento.
      </p>
      <h2>Uso adequado</h2>
      <p>
        Não é permitido tentar contornar controles de acesso, interromper o serviço ou automatizar
        consultas abusivas. Podemos limitar um acesso que comprometa a segurança ou a
        disponibilidade.
      </p>
      <h2>Antes de qualquer cobrança</h2>
      <p>
        Os termos completos do Recreio, com planos, cobrança e regras dos jogos, serão publicados
        nesta página antes de existir assinatura.
      </p>
      <h2>Suporte e direitos</h2>
      <p>
        Para suporte ou exercício de direitos, mande uma mensagem no direct do Instagram, em{" "}
        <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>. Estes
        termos não afastam direitos assegurados ao consumidor.
      </p>
      <p>
        Valem também os <a href="https://informach.com.br/termos">termos gerais da Informach</a>.
        Leia a <Link href="/privacidade">política de privacidade do Recreio</Link>.
      </p>
    </PaginaDeTexto>
  );
}
