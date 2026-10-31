import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata = { title: "Privacidade" };

export default function Privacidade() {
  return (
    <div className="screen">
      <header className="topbar">
        <Brand />
        <span className="spacer" />
        <Link href="/" className="btn ghost">
          Início
        </Link>
      </header>
      <main id="conteudo" className="scroll narrow prosa">
        <span className="eyebrow">ÚLTIMA ATUALIZAÇÃO · 31/10/2026</span>
        <h1>Privacidade, com clareza.</h1>
        <p>
          O Bora Treinar é operado pela Informach Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. Fale com a gente pelo direct do Instagram, em{" "}
          <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>.
          Esse também é o canal para exercer direitos de privacidade.
        </p>
        <h2>A câmera não sai do aparelho</h2>
        <p>
          A contagem pela câmera roda inteira no navegador do aparelho: o detector de pose analisa o
          vídeo ali mesmo e só o resultado (uma repetição contada, uma parcial, um aviso de postura)
          é usado. O vídeo e as imagens nunca são enviados ao nosso servidor nem a terceiros. Quando
          o celular é usado como câmera da TV, ele também conta no próprio aparelho e envia à TV só
          esses eventos de contagem, por uma conexão que dura no máximo três horas e se abre com um
          código de uso único válido por dez minutos.
        </p>
        <h2>Conta do titular e perfis</h2>
        <p>
          A conta Informach usa nome do titular, e-mail, credenciais de autenticação e registros de
          segurança. Cada perfil guarda apenas um apelido e uma cor. Não pedimos nome completo, data
          de nascimento, peso, altura, fotos ou dados de saúde de quem treina. O titular confirma a
          criação dos perfis; o tratamento de dados de crianças e adolescentes atende ao seu melhor
          interesse.
        </p>
        <h2>O que guardamos</h2>
        <p>
          Guardamos os treinos concluídos (data, duração, modo de contagem, séries, repetições,
          segundos de isometria e avisos de execução), o nível de cada perfil nas trilhas, as
          conquistas, os treinos montados pela família, o desafio da semana e as preferências de
          lembrete. Esses dados sustentam o progresso, os recordes, o placar e o resumo semanal.
          Treinos feitos sem internet ficam guardados no próprio aparelho só até poderem ser salvos
          na conta.
        </p>
        <h2>Para que usamos e em qual base</h2>
        <p>
          Usamos os dados da conta, da assinatura e dos treinos para executar o serviço contratado,
          autenticar o titular, personalizar os treinos, preservar o histórico e atender
          solicitações. Também tratamos registros estritamente necessários para segurança, prevenção
          a abuso, cumprimento de obrigações legais e exercício de direitos.
        </p>
        <h2>Quem acessa</h2>
        <p>
          Os perfis pertencem à conta do titular. Não há perfis públicos, ranking entre famílias,
          anúncios ou chat. O placar do desafio aparece só para a própria família. Os dados do Bora
          Treinar ficam separados dos dados de outros apps Informach; a autenticação usa a conta
          compartilhada Informach.
        </p>
        <h2>Serviços de operação</h2>
        <p>
          Railway e Cloudflare hospedam e entregam o serviço; PostgreSQL e Redis sustentam dados,
          sessão, pareamento e proteção contra abuso. O SendGrid entrega códigos de acesso,
          mensagens de cobrança e, se o titular ativar, lembretes de treino e o resumo semanal, que
          podem ser desligados em Conta ou pelo link do próprio e-mail. A Stripe processa
          assinaturas; dados completos de cartão são preenchidos em sua página segura e não chegam
          ao Bora Treinar. O Sentry recebe erros técnicos após filtragem de identidades, nomes e
          corpos de requisição. Não vendemos dados nem os compartilhamos com anunciantes.
        </p>
        <h2>Cookies e dados no aparelho</h2>
        <p>
          Usamos cookies de sessão, de escolha do perfil e, no celular pareado, de credencial do
          pareamento. No aparelho ficam também preferências do player (som, contagem em voz) e a
          fila de treinos feitos sem internet. O service worker guarda os arquivos do app e do
          detector de pose, nunca páginas com dados da família.
        </p>
        <h2>Seus controles</h2>
        <p>
          Em Conta, com acesso confirmado recentemente, é possível exportar os dados em JSON, sair
          da conta, gerenciar a assinatura, encerrar o Bora Treinar e apagar seus dados de treino ou
          excluir a conta Informach, com confirmação por e-mail. Perfis podem ser apagados em
          Gerenciar perfis, junto com seu histórico. O cancelamento pelo portal de cobrança preserva
          o histórico.
        </p>
        <p>
          Você pode pedir confirmação e acesso aos dados, correção, portabilidade, informação sobre
          compartilhamentos, anonimização, bloqueio ou eliminação quando cabível, revogação de
          consentimento e oposição ao tratamento, nos termos da LGPD.
        </p>
        <h2>Conservação</h2>
        <p>
          Perfis e histórico de treinos permanecem enquanto a família os conserva, inclusive após
          cancelar a assinatura. A exclusão remove esses dados do banco ativo; cópias residuais
          deixam de existir conforme a rotação dos backups, cujo maior prazo operacional atual é de
          89 dias. Registros financeiros e de segurança podem permanecer pelo tempo necessário ao
          cumprimento de obrigação legal e à proteção do serviço.
        </p>
        <p>
          Consulte também a{" "}
          <a href="https://informach.com.br/privacidade">política geral da Informach</a>.
        </p>
      </main>
    </div>
  );
}
