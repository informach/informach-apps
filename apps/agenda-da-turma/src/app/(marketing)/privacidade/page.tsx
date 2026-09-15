import Link from "next/link";

export const metadata = { title: "Dados da família" };
export default function PrivacyPage() {
  return (
    <div className="mx-auto max-w-3xl space-y-6 px-4 py-12">
      <h1 className="text-3xl font-semibold">Como a Agenda usa os dados da família</h1>
      <p>
        Estas informações explicam o funcionamento do app e complementam a{" "}
        <a className="underline" href="https://informach.com.br/privacidade">
          política de privacidade da Informach
        </a>
        .
      </p>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Recados, anexos e inteligência artificial</h2>
        <p>
          Ao adicionar uma atividade a partir de um recado, a mensagem e as páginas ou imagem
          selecionadas são enviadas ao serviço de IA por meio do OpenRouter. O resultado precisa da
          sua revisão antes de entrar na rotina. Esse fluxo não acrescenta o nome ou o nascimento
          cadastrados no perfil à solicitação de extração. Informações pessoais que já estejam na
          mensagem ou no arquivo enviado também serão processadas; confira o conteúdo antes de
          enviar. A data de nascimento é opcional no perfil. As ferramentas de cadastro por matéria
          podem usar os nomes dos perfis e das matérias para ajudar na identificação, sempre com
          confirmação antes de salvar.
        </p>
        <p>
          O anexo original pode ser consultado por 30 dias. Depois disso, o arquivo é removido pela
          rotina de retenção e o acesso ao download é bloqueado. O texto do recado e as atividades
          ficam na conta para consulta do histórico, até a exclusão do perfil ou da conta.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Acesso de outros adultos</h2>
        <p>
          Você escolhe as crianças que um segundo adulto pode acompanhar. Os adultos autorizados
          podem ver e atualizar as atividades dessas crianças. Confira o conteúdo dos documentos
          antes de compartilhar um perfil, pois uma publicação pode mencionar outras pessoas.
          Convites são vinculados ao e-mail indicado e expiram em 72 horas.
        </p>
        <p>
          Participar de uma turma privada exige código de convite. Os grupos são administrados pelos
          próprios responsáveis e não comprovam vínculo oficial com a escola. Revogar um acesso
          impede novas consultas; cópias já exportadas por uma pessoa ou calendário externo não
          podem ser recolhidas pelo app.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Lembretes e calendários</h2>
        <p>
          E-mails e notificações começam desativados. Você decide os canais, o horário do resumo e
          os horários de silêncio. A notificação na tela bloqueada usa texto genérico, sem nome da
          criança. O link de calendário funciona como uma senha: quem tiver o endereço poderá ler os
          eventos, até você revogá-lo.
        </p>
      </section>
      <section className="space-y-2">
        <h2 className="text-xl font-semibold">Métricas, cancelamento e exclusão</h2>
        <p>
          Na página inicial, contamos visualizações, cliques de cadastro e interações com os
          exemplos fictícios. Esses eventos guardam apenas opções da página, como o plano e o
          cenário escolhido, sem identificar o visitante ou criar cookies de acompanhamento. A
          demonstração não envia recados para a IA.
        </p>
        <p>
          As métricas de produto registram eventos como importação, confirmação, conclusão e convite
          aceito. Elas não recebem nomes de crianças nem o texto dos recados. Cancelar a assinatura
          mantém o acesso ao histórico e interrompe as novas automações pagas quando o plano
          termina.
        </p>
        <p>
          Em Conta e dados você pode exportar seus dados e solicitar exclusão por e-mail. A exclusão
          da conta Informach afeta o acesso e os dados vinculados nos outros apps Informach;
          assinaturas desses apps precisam ser encerradas antes. Na Agenda, a exclusão preserva
          atividades já usadas por outras famílias, sem autoria vinculada à sua conta. Dados de
          cobrança seguem as finalidades e retenções descritas na política da Informach.
        </p>
      </section>
      <Link href="/settings/account" className="inline-block min-h-11 text-primary-ink underline">
        Abrir Conta e dados
      </Link>
    </div>
  );
}
