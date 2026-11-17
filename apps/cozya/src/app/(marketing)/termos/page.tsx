import { COMPASSO_POLICY } from "@informach/config/collections";
import { INFORMACH_CONTACT } from "@informach/config/contact";
import type { Metadata } from "next";

const TITLE = "Termos de Uso. Cozya";
const DESCRIPTION =
  "Termos de uso do Cozya, serviço operado pela Informach Núcleo de Aprendizagem Ltda.";
const LAST_UPDATED = "10 de novembro de 2026";
const money = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
};

export default function TermsOfUsePage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-ink">Legal</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Termos de Uso
        </h1>
        <p className="text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}.</p>
      </header>

      <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
        <Section title="1. Quem opera o Cozya">
          <p>
            O Cozya é operado pela <strong>Informach Núcleo de Aprendizagem Ltda</strong>, pessoa
            jurídica de direito privado inscrita no CNPJ sob o nº{" "}
            <strong>43.588.758/0001-03</strong>. Para falar com a gente sobre estes Termos, mande
            uma mensagem no direct do Instagram, em <DirectLink />.
          </p>
          <p>
            Ao criar uma conta ou usar o Cozya, você concorda com estes Termos de Uso e com nossa{" "}
            <a className="underline underline-offset-2" href="/privacidade">
              Política de Privacidade
            </a>
            . Se não concordar, por favor não utilize o serviço.
          </p>
        </Section>

        <Section title="2. O que é o Cozya">
          <p>
            O Cozya é um serviço web que ajuda você a capturar, organizar e cozinhar receitas. A
            captura pode ser manual ou apoiada por inteligência artificial: você sobe uma foto, fala
            no microfone, cola um texto ou descreve em uma frase, e a IA estrutura a receita.
          </p>
          <p>
            O acesso gratuito permite cadastrar manualmente até 15 receitas. O Cozya faz parte do{" "}
            <strong>Compasso</strong>, assinatura que inclui os aplicativos web participantes, com
            até {COMPASSO_POLICY.capacity.adults} adultos e {COMPASSO_POLICY.capacity.dependents}{" "}
            dependentes. Recreio, Morada e Suíte Edi são produtos separados. O Compasso libera o
            planejamento de refeições e o acervo sem esse limite. Na Minha conta, você pode iniciar
            explicitamente um teste de {COMPASSO_POLICY.trialDays} dias, sem cartão ou renovação
            automática, com {COMPASSO_POLICY.ai.trialCredits} créditos compartilhados de IA. Depois
            do teste, receitas, preparo e listas já criadas continuam acessíveis.
          </p>
        </Section>

        <Section title="3. Cadastro e responsabilidade da conta">
          <p>
            Pra criar conta você precisa ter pelo menos 18 anos, fornecer informações verdadeiras e
            manter seus dados de acesso em segurança. Você é responsável por toda atividade
            realizada na sua conta. Se notar uso indevido, fala com a gente imediatamente.
          </p>
        </Section>

        <Section title="4. Planos, preços e pagamento">
          <p>
            O Compasso custa <strong>{money(COMPASSO_POLICY.monthlyAmountCents)} por mês</strong> ou{" "}
            <strong>{money(COMPASSO_POLICY.annualAmountCents)} por ano</strong>. Inclui{" "}
            <strong>{COMPASSO_POLICY.ai.monthlyCredits} créditos de IA por mês</strong>,
            compartilhados entre os aplicativos participantes e os adultos da família selecionada. A
            franquia renova mensalmente, inclusive no plano anual, sem acumular para o mês seguinte.
            Os valores podem ser atualizados mediante aviso prévio com 30 dias.
          </p>
          <p>
            Os pagamentos são processados pela Stripe Payments Brasil Ltda. A Cozya não armazena
            dados completos de cartão. Quando os créditos do mês acabam, você pode esperar a
            renovação ou comprar recargas na Minha conta:{" "}
            {COMPASSO_POLICY.ai.packs
              .map((pack) => `${pack.credits} créditos por ${money(pack.amountCents)}`)
              .join("; ")}
            . Os créditos comprados não vencem e podem ser usados mesmo sem assinatura ativa. Cada
            tarefa mostra o máximo de créditos a reservar antes do uso; o excedente é liberado ao
            concluir, e tarefas sem resultado válido não consomem créditos. Os saldos anteriores
            conservam a validade e o poder de uso durante a migração.
          </p>
          <p>
            Não existe fidelidade. Você pode cancelar a assinatura a qualquer momento direto nas
            Minha conta. O cancelamento encerra a renovação automática; o acesso ao Compasso
            continua até o fim do período já pago. Pagamentos referentes a períodos já usados não
            são reembolsados.
          </p>
        </Section>

        <Section title="5. Uso aceitável">
          <p>Você concorda em não usar o Cozya pra:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              publicar ou armazenar conteúdo ilegal, abusivo, difamatório ou que viole direitos de
              terceiros;
            </li>
            <li>
              tentar burlar limites técnicos, automatizar chamadas de IA fora da interface oficial
              ou explorar vulnerabilidades;
            </li>
            <li>
              fazer engenharia reversa, extrair dados em massa ou usar o serviço pra treinar modelos
              concorrentes;
            </li>
            <li>compartilhar credenciais com terceiros ou criar contas falsas.</li>
          </ul>
        </Section>

        <Section title="6. Suas receitas e seu conteúdo">
          <p>
            As receitas, preferências, refeições e listas do Cozya pertencem à sua conta individual.
            Selecionar uma família compartilha a cobertura e a carteira de créditos; isso não dá ao
            outro adulto acesso ao seu conteúdo culinário.
          </p>
          <p>
            As receitas e textos que você cria continuam sendo seus. Pra prestar o serviço, você
            concede ao Cozya uma licença não exclusiva, mundial e gratuita pra armazenar, processar,
            transmitir e exibir esse conteúdo enquanto sua conta estiver ativa. Essa licença termina
            quando você apaga o conteúdo ou encerra a conta, ressalvada a retenção mínima exigida
            por lei (ver Política de Privacidade).
          </p>
        </Section>

        <Section title="7. Limitações da inteligência artificial">
          <p>
            A IA do Cozya pode cometer erros: confundir ingredientes, inferir quantidades
            aproximadas ou interpretar mal um print mal iluminado. Use os resultados como ponto de
            partida.{" "}
            <strong>Não confie na IA pra orientação nutricional, médica ou alergênica.</strong> Se
            você tem alergia, intolerância ou restrição alimentar, valide os ingredientes antes de
            cozinhar.
          </p>
        </Section>

        <Section title="8. Disponibilidade do serviço">
          <p>
            Faremos esforço razoável pra manter o Cozya disponível, mas não garantimos funcionamento
            ininterrupto. Manutenções programadas, falhas de fornecedores externos (Stripe,
            OpenRouter, SendGrid) ou eventos de força maior podem causar indisponibilidade
            temporária. O plano atual não inclui SLA contratual.
          </p>
        </Section>

        <Section title="9. Suspensão e encerramento">
          <p>
            A gente pode suspender ou encerrar uma conta que violar estes Termos, sem aviso prévio
            em casos graves (fraude, abuso, atividade ilegal). Você pode encerrar a conta a qualquer
            momento via{" "}
            <a className="underline underline-offset-2" href="/settings/account">
              configurações da conta
            </a>
            ; o encerramento cancela qualquer assinatura ativa e exclui os dados pessoais conforme a
            Política de Privacidade.
          </p>
        </Section>

        <Section title="10. Limitação de responsabilidade">
          <p>
            Na máxima extensão permitida pela legislação brasileira, a responsabilidade total da
            Informach perante você, decorrente do uso do Cozya, fica limitada ao valor efetivamente
            pago por você nos 12 meses anteriores ao evento que originou a reclamação. Não nos
            responsabilizamos por danos indiretos, lucros cessantes ou perda de dados não provocados
            por dolo ou culpa grave nossa.
          </p>
        </Section>

        <Section title="11. Alterações destes Termos">
          <p>
            A gente pode atualizar estes Termos pra refletir mudanças no produto, na lei ou nos
            preços. Mudanças materiais são comunicadas com antecedência mínima de 30 dias por
            e-mail. Se você continuar usando o serviço após a entrada em vigor, considera-se que
            aceitou a nova versão.
          </p>
        </Section>

        <Section title="12. Foro e legislação aplicável">
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
            foro da comarca da sede da Informach pra dirimir controvérsias decorrentes destes
            Termos, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
        </Section>

        <Section title="13. Contato">
          <p>
            Pra dúvidas, solicitações ou notificações relacionadas a estes Termos: direct do
            Instagram, em <DirectLink />.
          </p>
        </Section>
      </div>
    </article>
  );
}

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="space-y-4">
      <h2 className="text-xl font-semibold tracking-tight md:text-2xl">{title}</h2>
      <div className="space-y-3 text-muted-foreground">{children}</div>
    </section>
  );
}

/** Canal público de contato: o direct do Instagram, nunca um endereço de e-mail. */
function DirectLink() {
  return (
    <a className="underline underline-offset-2" href={INFORMACH_CONTACT.directMessageUrl}>
      @{INFORMACH_CONTACT.instagramHandle}
    </a>
  );
}
