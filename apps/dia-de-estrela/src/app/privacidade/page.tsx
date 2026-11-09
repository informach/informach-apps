import { INFORMACH_CONTACT } from "@informach/config/contact";
import { PaginaDeTexto } from "@/components/pagina-publica";

export const metadata = { title: "Privacidade" };

export default function Privacidade() {
  return (
    <PaginaDeTexto>
      <p className="text-sm font-extrabold tracking-[0.12em] text-tinta-suave">
        ÚLTIMA ATUALIZAÇÃO · 06/11/2026
      </p>
      <h1>Privacidade, com clareza.</h1>
      <p>
        O Dia de Estrela é operado pela Informach Núcleo de Aprendizagem Ltda, CNPJ
        43.588.758/0001-03. Fale com a gente pelo direct do Instagram, em{" "}
        <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>. Esse
        também é o canal para exercer direitos de privacidade.
      </p>
      <h2>Conta do adulto e dados das crianças</h2>
      <p>
        A conta Informach usa nome do titular, e-mail, credenciais de autenticação e registros de
        segurança. De cada criança guardamos só um apelido e uma cor. Não pedimos nome completo,
        idade, data de nascimento, foto da criança, escola ou dados de saúde. O titular cadastra as
        crianças e responde pelo uso; o tratamento atende ao melhor interesse delas.
      </p>
      <h2>O que guardamos</h2>
      <p>
        As rotinas que a família monta (tarefas, horários, passos, o que separar), as tarefas
        marcadas a cada dia, o extrato de estrelas, os itens da loja e os pedidos, a meta de cada
        criança, o estado dos lembretes do dia e os alertas enviados aos pais. Isso sustenta a tela
        da criança, o acompanhamento dos pais e o cofrinho.
      </p>
      <h2>Voz gravada e foto da meta (plano Família)</h2>
      <p>
        Um adulto pode gravar a própria voz chamando a criança para uma tarefa (até 15 segundos) e
        escolher uma foto do item da meta. Esses arquivos ficam no nosso banco de dados, só são
        servidos para a própria família e saem quando a tarefa, a meta ou a conta são apagadas. A
        foto é reduzida no próprio aparelho antes de ser enviada.
      </p>
      <h2>O aparelho da criança</h2>
      <p>
        O tablet (ou celular) da criança é conectado por um código de uso único, válido por dez
        minutos, e fica conectado por 30 dias, renovados enquanto é usado. Ele guarda só um cookie
        com a credencial do aparelho e a criança escolhida; os pais podem desconectá-lo em Ajustes.
        A área dos pais nesse aparelho abre com um PIN, guardado apenas como hash, com limite de
        tentativas. A voz que lê as tarefas é a do próprio aparelho, e nenhum áudio da criança é
        gravado.
      </p>
      <h2>Alertas no celular</h2>
      <p>
        No plano Família, os adultos podem receber alertas quando uma tarefa passa do horário sem
        ser marcada. A notificação não mostra o nome da criança nem o nome da tarefa na tela
        bloqueada. O envio passa pelo serviço de notificações do navegador (Google, Apple, Mozilla
        ou Microsoft).
      </p>
      <h2>Para que usamos e em qual base</h2>
      <p>
        Usamos os dados da conta, da assinatura e das rotinas para executar o serviço contratado,
        autenticar os adultos, mostrar a rotina, avisar os pais e preservar o histórico. Também
        tratamos registros estritamente necessários para segurança, prevenção a abuso, cumprimento
        de obrigações legais e exercício de direitos.
      </p>
      <h2>Quem acessa</h2>
      <p>
        Os dados pertencem à família: o titular e, se ele convidar, um segundo responsável. Não há
        perfis públicos, ranking entre famílias, anúncios ou chat. Os dados do Dia de Estrela ficam
        separados dos dados de outros apps Informach; a autenticação usa a conta compartilhada
        Informach.
      </p>
      <h2>Serviços de operação</h2>
      <p>
        Railway e Cloudflare hospedam e entregam o serviço; PostgreSQL e Redis sustentam dados,
        sessões, atualizações em tempo real e proteção contra abuso. O SendGrid entrega códigos de
        acesso e mensagens de cobrança. A Stripe processa assinaturas; dados de cartão são
        preenchidos na página segura dela e não chegam ao Dia de Estrela. O Sentry recebe erros
        técnicos depois de filtrar identidades, nomes e conteúdo. Não vendemos dados nem os
        compartilhamos com anunciantes.
      </p>
      <h2>Seus controles</h2>
      <p>
        Em Ajustes é possível exportar os dados em JSON, desconectar aparelhos, trocar o PIN,
        remover o segundo responsável, apagar crianças (com a rotina e as estrelas delas), sair da
        conta e pedir a exclusão da conta Informach, com confirmação por e-mail. Você pode pedir
        confirmação e acesso aos dados, correção, portabilidade, anonimização, bloqueio ou
        eliminação quando cabível, revogação de consentimento e oposição ao tratamento, nos termos
        da LGPD.
      </p>
      <h2>Conservação</h2>
      <p>
        Rotinas, estrelas e metas ficam enquanto a família as conserva, inclusive depois de cancelar
        a assinatura. O estado dos lembretes e os alertas são apagados em sete dias. A exclusão
        remove os dados do banco ativo; cópias residuais deixam de existir conforme a rotação dos
        backups, cujo maior prazo operacional atual é de 89 dias.
      </p>
      <p>
        Consulte também a{" "}
        <a href="https://informach.com.br/privacidade">política geral da Informach</a>.
      </p>
    </PaginaDeTexto>
  );
}
