import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Brand } from "@/components/brand";

export const metadata = { title: "Termos" };

export default function Termos() {
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
        <h1>Termos do Bora Treinar.</h1>
        <p>
          O Bora Treinar é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. O serviço é contratado por um titular maior de 18 anos. Os perfis de
          quem treina ficam vinculados a essa conta, e o titular acompanha o uso adequado à idade de
          cada pessoa.
        </p>
        <h2>O serviço</h2>
        <p>
          Oferecemos treinos de calistenia (exercícios com o peso do corpo) com instrutor 3D,
          cronômetros, contagem de repetições manual ou pela câmera do aparelho e acompanhamento do
          progresso por perfil. O Primeiro treino, a biblioteca de exercícios e a prática de cada
          exercício contando à mão podem ser usados sem assinatura.
        </p>
        <h2>Saúde e segurança</h2>
        <p>
          O Bora Treinar não é orientação médica nem substitui um profissional de educação física.
          Antes de começar, especialmente com dor, lesão, gestação, doença cardíaca ou outra
          condição de saúde, consulte um profissional. Pare se sentir dor, tontura ou falta de ar.
          Crianças devem treinar com a supervisão de um adulto. Escolha um espaço livre, com piso
          firme e sem obstáculos, e use apoios estáveis nos exercícios que pedem sofá, cadeira ou
          parede. A contagem pela câmera é uma ajuda e pode errar: ela não avalia a segurança do
          movimento.
        </p>
        <h2>Assinatura</h2>
        <p>
          Individual: R$ 24,90 mensais ou R$ 249 anuais para um perfil. Família: R$ 34,90 mensais ou
          R$ 349 anuais para até quatro perfis. No anual, o total é cobrado de uma vez. O checkout
          apresenta o plano, o valor e a recorrência antes da confirmação. A assinatura se renova
          automaticamente no ciclo escolhido até ser cancelada.
        </p>
        <p>
          O portal de cobrança permite consultar pagamentos, atualizar o meio de pagamento e
          solicitar cancelamento. O cancelamento interrompe a próxima renovação e mantém o acesso
          até o fim do período pago. Mudanças que aumentam a capacidade ou antecipam um ciclo podem
          gerar cobrança proporcional imediata, mostrada antes da confirmação. Reduções são
          agendadas para o fim do período; ao passar de Família para Individual, o titular escolhe
          qual perfil continua ativo. Os demais históricos ficam guardados.
        </p>
        <h2>Uso adequado</h2>
        <p>
          Não é permitido tentar contornar controles de acesso, interromper o serviço, automatizar
          consultas abusivas ou usar o conteúdo para violar direitos de terceiros. Podemos limitar
          um acesso que comprometa a segurança ou a disponibilidade e informar o motivo pelo canal
          de suporte quando aplicável.
        </p>
        <h2>Suporte e direitos</h2>
        <p>
          Para suporte, cancelamento, reembolso ou exercício de direitos, mande uma mensagem no
          direct do Instagram, em{" "}
          <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>.
          Estes termos não afastam direitos assegurados ao consumidor. Para compras feitas pela
          internet, pedidos de arrependimento dentro do prazo legal de sete dias podem ser enviados
          por esse canal. Outros reembolsos são analisados conforme o caso e a legislação aplicável.
        </p>
        <p>
          Leia a <Link href="/privacidade">política de privacidade do app</Link> e os{" "}
          <a href="https://informach.com.br/termos">termos gerais da Informach</a>.
        </p>
      </main>
    </div>
  );
}
