import { Brand } from "@/components/brand";
export default function Privacy() {
  return (
    <>
      <header className="flex items-center justify-between gap-4 border-b-2 border-sombra px-4 py-4 sm:px-8">
        <Brand />
        <a
          href="/"
          className="font-semibold text-tinta-suave underline underline-offset-4 hover:text-tinta"
        >
          Início
        </a>
      </header>
      <main id="conteudo" className="prosa">
        <span className="eyebrow">ÚLTIMA ATUALIZAÇÃO · 13/09/2026</span>
        <h1>Privacidade, com clareza.</h1>
        <p>
          O Missão Saber é operado pela Informach — Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. Contato:{" "}
          <a href="mailto:contato@casaldevgames.com">contato@casaldevgames.com</a>. Esse também é o
          canal para exercer direitos de privacidade.
        </p>
        <h2>Conta do responsável e perfis</h2>
        <p>
          A conta Informach usa nome do responsável, e-mail, credenciais de autenticação e registros
          de segurança. O perfil do estudante usa apelido, ano escolar, avatar e trilha. Não pedimos
          nome completo do estudante, escola, CPF ou data exata de nascimento. O responsável
          confirma a criação do perfil e sua autorização. O tratamento deve atender ao melhor
          interesse da criança ou do adolescente; somente o responsável possui conta e credenciais.
        </p>
        <h2>O que guardamos para ensinar</h2>
        <p>
          Guardamos missões e suas versões, respostas, uso de pistas, datas, estratégias trabalhadas
          e anotações do caderno. Esses dados sustentam a retomada, as revisões e o relatório
          familiar. Relatos de erro são encaminhados à manutenção de conteúdo. Evite incluir dados
          pessoais em campos livres.
        </p>
        <h2>Para que usamos e em qual base</h2>
        <p>
          Usamos os dados da conta, da assinatura e do estudo para executar o serviço contratado,
          autenticar o responsável, personalizar o percurso, preservar o histórico e atender
          solicitações. Também tratamos registros estritamente necessários para segurança, prevenção
          a abuso, cumprimento de obrigações legais e exercício de direitos. Quando a legislação
          exigir consentimento, ele pode ser revogado pelo responsável, sem afetar o tratamento
          anterior legítimo. Em todas as decisões sobre dados de crianças e adolescentes, prevalece
          seu melhor interesse.
        </p>
        <h2>Quem acessa</h2>
        <p>
          Os perfis pertencem à conta do responsável. Não existem perfis públicos, ranking entre
          crianças, anúncios, chat entre alunos ou tutor de IA livre nesta versão. O conteúdo
          pedagógico e o progresso do Missão Saber ficam separados dos dados de outros apps
          Informach. A autenticação utiliza a conta compartilhada Informach.
        </p>
        <h2>Serviços de operação</h2>
        <p>
          Railway e Cloudflare hospedam e entregam o serviço; PostgreSQL e Redis sustentam dados,
          sessão e proteção contra abuso. O SendGrid entrega códigos de acesso e mensagens
          transacionais ao responsável. A Stripe processa assinaturas; dados completos de cartão são
          preenchidos em sua página segura e não chegam ao Missão Saber. O Sentry recebe erros
          técnicos após filtragem de identidades, respostas, cadernos e corpos de requisição.
          Respostas e cadernos não são enviados a modelos de IA. Não vendemos dados nem os
          compartilhamos com anunciantes.
        </p>
        <h2>Cookies e dados no aparelho</h2>
        <p>
          Usamos cookies de sessão e de seleção de perfil para manter o acesso e o contexto do
          estudante. A demonstração pública funciona sem salvar respostas no servidor. O aplicativo
          autenticado precisa de internet; não promete funcionamento offline.
        </p>
        <h2>Seus controles</h2>
        <p>
          Na área Família, com acesso confirmado recentemente, é possível exportar os dados, sair da
          conta, gerenciar a assinatura ou encerrar o Missão Saber e apagar seus dados pedagógicos.
          O cancelamento pelo portal de cobrança preserva o histórico. A exclusão de dados
          pedagógicos não exclui a conta Informach nem os dados de outros produtos. Solicitações de
          exclusão da conta compartilhada devem ser feitas ao suporte.
        </p>
        <p>
          Você pode pedir confirmação e acesso aos dados, correção, portabilidade, informação sobre
          compartilhamentos, anonimização, bloqueio ou eliminação quando cabível, revogação de
          consentimento e oposição ao tratamento, nos termos da LGPD. Use os controles do app ou o
          e-mail de contato acima.
        </p>
        <h2>Conservação</h2>
        <p>
          Perfis e histórico pedagógico permanecem enquanto a família os conserva, inclusive após
          cancelar a assinatura. A exclusão remove esses dados do banco ativo. Cópias residuais
          deixam de existir conforme a rotação dos backups, cujo maior prazo operacional atual é de
          89 dias. Registros financeiros, antifraude e de segurança podem permanecer pelo tempo
          necessário ao cumprimento de obrigação legal, exercício de direitos e proteção do serviço.
          Eles não são usados para reconstruir o histórico pedagógico apagado.
        </p>
        <p>
          Consulte também a{" "}
          <a href="https://informach.com.br/privacidade">política geral da Informach</a>.
        </p>
      </main>
    </>
  );
}
