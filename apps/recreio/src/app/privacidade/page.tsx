import { INFORMACH_CONTACT } from "@informach/config/contact";
import { PaginaDeTexto } from "@/components/pagina-publica";

export const metadata = { title: "Privacidade" };

export default function Privacidade() {
  return (
    <PaginaDeTexto>
      <p className="text-sm font-bold tracking-[0.12em] text-tinta-suave">
        ÚLTIMA ATUALIZAÇÃO · 15/11/2026
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
        seu e-mail. Também guardamos mundos, seus membros e convites, o progresso do jogo e cópias
        de recuperação para continuar a partida depois de sair ou de uma falha. O alfa fechado não
        tem cobrança e é destinado a adultos convidados pela equipe.
      </p>
      <h2>Para que usamos</h2>
      <p>
        Para autenticar quem entra, proteger a conta contra abuso, permitir o jogo e a recuperação
        do progresso e cumprir obrigações legais. Os códigos de acesso são enviados para o e-mail da
        conta. Registros de segurança identificam operações e permissões; as histórias dos moradores
        não são usadas para publicidade.
      </p>
      <h2>Quando você joga com outras pessoas</h2>
      <p>
        Os membros do mesmo mundo podem ver os apelidos dos participantes e o conteúdo que o jogo
        compartilha naquele mundo. Convites permitem adicionar membros. Use nomes de jogo e evite
        incluir dados pessoais nos nomes de mundos e moradores. Perder o acesso ao jogo não apaga
        automaticamente o mundo ou o progresso das outras pessoas.
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
      <h2>Guarda e pedidos sobre os dados</h2>
      <p>
        Mundos e progresso ficam guardados para a retomada do jogo. Os registros técnicos e as
        cópias de recuperação têm finalidades próprias. Pedidos de exclusão e de informação sobre
        retenção são atendidos pelo suporte: um mundo compartilhado exige preservar os direitos das
        demais pessoas. Novos recursos familiares ou de assinatura terão suas condições informadas
        antes de serem disponibilizados.
      </p>
      <p>
        Consulte também a{" "}
        <a href="https://informach.com.br/privacidade">política geral da Informach</a>.
      </p>
    </PaginaDeTexto>
  );
}
