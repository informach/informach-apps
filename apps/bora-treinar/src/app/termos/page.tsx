import { COMPASSO_POLICY } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import Link from "next/link";
import { Brand } from "@/components/brand";
import { reais } from "@/features/billing/ofertas";
import { getCurrentUser } from "@/lib/auth";

export const metadata = { title: "Termos" };

export default async function Termos() {
  // quem está logado volta ao app, não à página de vendas
  const user = await getCurrentUser();
  return (
    <div className="screen">
      <header className="topbar">
        <Brand />
        <span className="spacer" />
        <Link href={user ? "/inicio" : "/"} className="btn ghost">
          {user ? "Voltar ao app" : "Início"}
        </Link>
      </header>
      <main id="conteudo" className="scroll narrow prosa">
        <span className="eyebrow">ÚLTIMA ATUALIZAÇÃO · 09/11/2026</span>
        <h1>Termos do Bora Treinar.</h1>
        <p>
          O Bora Treinar é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. O serviço é contratado por um titular maior de 18 anos. Os perfis de
          treino são ativados a partir das pessoas da família compartilhada. O adulto responsável
          acompanha o uso adequado à idade e concede acesso aos perfis de forma explícita.
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
          O acesso completo integra o Compasso: {reais(COMPASSO_POLICY.monthlyAmountCents)} por mês
          ou {reais(COMPASSO_POLICY.annualAmountCents)} por ano, para até{" "}
          {COMPASSO_POLICY.capacity.adults} adultos e {COMPASSO_POLICY.capacity.dependents}{" "}
          dependentes. O total anual é cobrado de uma vez. O checkout apresenta valor e recorrência
          antes da confirmação; a assinatura se renova até ser cancelada.
        </p>
        <p>
          O teste do Compasso dura {COMPASSO_POLICY.trialDays} dias, sem cartão, para famílias
          elegíveis. Ao terminar sem assinatura, o acesso volta às funcionalidades gratuitas,
          preservando os históricos. O Bora Treinar não usa créditos de IA.
        </p>
        <p>
          A Minha conta reúne a gestão do Compasso. O cancelamento impede a próxima renovação e
          preserva o período já pago. Trocas entre mensal e anual entram no fim do período vigente.
          Contratos anteriores do Bora mantêm sua cobertura durante a transição e continuam
          disponíveis para consulta e cancelamento.
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
