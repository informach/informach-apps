import { Brand } from "@/components/brand";
import { catalogCourses, catalogGrades } from "@/features/content/catalog";
import { gradeRangeSentence } from "@/features/family/school-year";
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
        <span className="eyebrow">ÚLTIMA ATUALIZAÇÃO · 26/09/2026</span>
        <h1>Termos do Missão Saber.</h1>
        <p>
          O Missão Saber é oferecido pela Informach Núcleo de Aprendizagem Ltda, CNPJ
          43.588.758/0001-03. O serviço é contratado por um responsável maior de 18 anos. Os perfis
          de estudantes ficam vinculados a essa conta. O responsável deve proteger seu acesso e
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
          Individual: R$ 29,90 mensais ou R$ 299 anuais para um estudante. Família: R$ 44,90 mensais
          ou R$ 449 anuais para até três estudantes. No anual, o total é cobrado de uma vez. O
          checkout apresenta o plano, o valor e a recorrência antes da confirmação. A assinatura se
          renova automaticamente no ciclo escolhido até ser cancelada.
        </p>
        <p>
          O portal de cobrança permite consultar pagamentos, atualizar o meio de pagamento e
          solicitar cancelamento. O cancelamento interrompe a próxima renovação e mantém o acesso
          até o fim do período pago. Mudanças que aumentam a capacidade ou antecipam um ciclo podem
          gerar cobrança proporcional imediata, mostrada antes da confirmação. Reduções são
          agendadas para o fim do período; ao passar de Família para Individual, o responsável
          escolhe qual perfil continuará estudando. Os demais históricos ficam guardados.
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
          ou exercício de direitos, use{" "}
          <a href="mailto:contato@casaldevgames.com">contato@casaldevgames.com</a>. Estes termos não
          afastam direitos assegurados ao consumidor. Para compras feitas pela internet, pedidos de
          arrependimento dentro do prazo legal de sete dias podem ser enviados por esse canal.
          Outros reembolsos são analisados conforme o caso e a legislação aplicável.
        </p>
        <p>
          Leia a <a href="/privacidade">política de privacidade do app</a> e os{" "}
          <a href="https://informach.com.br/termos">termos gerais da Informach</a>.
        </p>
      </main>
    </>
  );
}
