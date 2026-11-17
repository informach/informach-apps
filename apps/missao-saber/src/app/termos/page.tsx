import { COMPASSO_POLICY } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import { Brand } from "@/components/brand";
import { catalogCourses, catalogGrades } from "@/features/content/catalog";
import { gradeRangeSentence } from "@/features/family/school-year";

const brl = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
export const metadata = { title: "Termos de uso" };

export default function Terms() {
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
        <span className="eyebrow">ÚLTIMA ATUALIZAÇÃO · 09/11/2026</span>
        <h1>Termos do Missão Saber.</h1>
        <p>
          O Missão Saber é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. O serviço é contratado por um responsável maior de 18 anos. Os perfis
          de estudantes pertencem ao contexto familiar compartilhado. Cada responsável acessa apenas
          os estudantes e ações explicitamente autorizados. O responsável deve proteger seu acesso e
          acompanhar o uso adequado à idade.
        </p>
        <h2>O serviço</h2>
        <p>
          Oferecemos conteúdo autoral de preparação independente para desafios escolares{" "}
          {gradeRangeSentence(catalogGrades)}. São {catalogCourses.length} trilhas voltadas às
          competências cobradas na OBMEP Mirim, na OBMEP, no Canguru de Matemática Brasil e na
          OLITEF. Trilhas da mesma faixa compartilham fundamentos, e as primeiras missões de cada
          trilha podem ser experimentadas antes da assinatura.
        </p>
        <h2>Assinatura</h2>
        <p>
          O acesso completo integra o Compasso: {brl(COMPASSO_POLICY.monthlyAmountCents)} por mês ou{" "}
          {brl(COMPASSO_POLICY.annualAmountCents)} por ano, para até{" "}
          {COMPASSO_POLICY.capacity.adults} adultos e {COMPASSO_POLICY.capacity.dependents}{" "}
          dependentes. No anual, o total é cobrado de uma vez. O checkout apresenta valor e
          recorrência antes da confirmação. A assinatura se renova até ser cancelada.
        </p>
        <p>
          O teste do Compasso dura {COMPASSO_POLICY.trialDays} dias, sem cartão, para famílias
          elegíveis. Ao terminar sem assinatura, o acesso volta às funcionalidades gratuitas,
          preservando os históricos.
        </p>
        <p>
          A central da conta permite consultar e cancelar a assinatura. O portal seguro permite
          atualizar o meio de pagamento e consultar comprovantes. O cancelamento interrompe a
          próxima renovação e mantém o acesso até o fim do período pago. Registros de contratos
          anteriores são preservados, sem nova contratação automática.
        </p>
        <h2>Aprendizagem e conteúdo</h2>
        <p>
          Os resultados são formativos. Não prometemos medalha, classificação, aprovação nem
          substituição da escola. Justificativas abertas podem ser registradas no caderno, mas não
          recebem correção humana ilimitada ou nota oficial. O serviço não tem vínculo com a OBMEP,
          a OBMEP Mirim, o Canguru de Matemática Brasil ou a OLITEF, nem com as instituições que as
          organizam.
        </p>
        <p>
          O responsável não deve tentar contornar controles de acesso, interromper o serviço,
          automatizar consultas abusivas ou usar o conteúdo para violar direitos de terceiros.
          Podemos limitar um acesso que comprometa a segurança ou a disponibilidade e informar o
          motivo pelo canal de suporte quando aplicável.
        </p>
        <h2>Suporte e direitos</h2>
        <p>
          Problemas de conteúdo podem ser relatados na missão. Podemos pausar uma atividade durante
          uma correção, preservando o histórico já realizado. Para suporte, cancelamento, reembolso
          ou exercício de direitos, mande uma mensagem no direct do Instagram, em <DirectLink />.
          Estes termos não afastam direitos assegurados ao consumidor. Para compras feitas pela
          internet, pedidos de arrependimento dentro do prazo legal de sete dias podem ser enviados
          por esse canal. Outros reembolsos são analisados conforme o caso e a legislação aplicável.
        </p>
        <p>
          Leia a <a href="/privacidade">política de privacidade do app</a> e os{" "}
          <a href="https://informach.com.br/termos">termos gerais da Informach</a>.
        </p>
      </main>
    </>
  );
}

/** Canal público de contato: o direct do Instagram, nunca um endereço de e-mail. */
function DirectLink() {
  return <a href={INFORMACH_CONTACT.directMessageUrl}>@{INFORMACH_CONTACT.instagramHandle}</a>;
}
