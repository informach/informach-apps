import { INFORMACH_CONTACT } from "@informach/config/contact";
import { PaginaDeTexto } from "@/components/pagina-publica";

export const metadata = { title: "Privacidade" };

export default function Privacidade() {
  return (
    <PaginaDeTexto>
      <p className="text-sm font-bold tracking-[0.12em] text-tinta-suave">
        ÚLTIMA ATUALIZAÇÃO · 11/11/2026
      </p>
      <h1>Privacidade no Recreio, na fase de alfa.</h1>
      <p>
        O Recreio é operado pela Informach Núcleo de Aprendizagem Ltda, CNPJ 43.588.758/0001-03.
        Fale com a gente pelo direct do Instagram, em{" "}
        <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>. Esse
        também é o canal para exercer direitos de privacidade.
      </p>
      <h2>O que guardamos hoje</h2>
      <p>
        Os dados da conta Informach: nome, e-mail, credenciais de autenticação e registros de
        segurança, como sessões e tentativas de acesso. Do Recreio em si, guardamos o seu perfil (o
        apelido e o avatar que você escolheu), em que aparelho ele está em uso e, quando a equipe
        libera os jogos para você, o registro dessa liberação. Os jogos recebem só o perfil, nunca o
        seu e-mail. Nesta fase o Recreio ainda não guarda mundos nem dados de jogo, e não há
        cobrança.
      </p>
      <h2>Para que usamos</h2>
      <p>
        Para autenticar quem entra, proteger a conta contra abuso e cumprir obrigações legais. Os
        códigos de acesso são enviados para o e-mail da conta.
      </p>
      <h2>Serviços de operação</h2>
      <p>
        Railway e Cloudflare hospedam e entregam o serviço; PostgreSQL e Redis sustentam contas,
        sessões e proteção contra abuso. O SendGrid entrega os códigos de acesso. O Sentry recebe
        erros técnicos depois de filtrar identidades e conteúdo. Não vendemos dados nem os
        compartilhamos com anunciantes.
      </p>
      <h2>Seus controles</h2>
      <p>
        Em Conta você vê o e-mail, o perfil e a situação do acesso, e sai da conta. A exclusão ainda
        não é feita pelo portal: peça pelo direct do Instagram. Pelo mesmo canal você pode pedir
        confirmação e acesso aos dados, correção, portabilidade, anonimização, bloqueio ou
        eliminação quando cabível, nos termos da LGPD.
      </p>
      <h2>Quando o Recreio crescer</h2>
      <p>
        Mundos, dados de jogo e assinatura trazem dados novos. Esta página será atualizada antes de
        eles existirem.
      </p>
      <p>
        Consulte também a{" "}
        <a href="https://informach.com.br/privacidade">política geral da Informach</a>.
      </p>
    </PaginaDeTexto>
  );
}
