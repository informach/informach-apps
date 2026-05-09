import type { Metadata } from "next";

const TITLE = "Termos de Uso. Cozya";
const DESCRIPTION =
  "Termos de uso do Cozya, serviço operado pela Informach Núcleo de Aprendizagem Ltda.";
const LAST_UPDATED = "8 de maio de 2026";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
};

export default function TermsOfUsePage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Legal</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Termos de Uso
        </h1>
        <p className="text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}.</p>
      </header>

      <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
        <Section title="1. Quem opera o Cozya">
          <p>
            O Cozya é operado pela <strong>Informach — Núcleo de Aprendizagem Ltda</strong>, pessoa
            jurídica de direito privado inscrita no CNPJ sob o nº{" "}
            <strong>43.588.758/0001-03</strong>. Para falar com a gente sobre estes Termos, use{" "}
            <a className="underline underline-offset-2" href="mailto:contato@casaldevgames.com">
              contato@casaldevgames.com
            </a>
            .
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
            Existem dois planos. No plano <strong>Free</strong>, você cadastra receitas manualmente,
            sem custo, com um limite vitalício de 15 receitas salvas. No plano <strong>Pro</strong>,
            você libera os recursos de IA e recebe créditos mensais pra usá-los.
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
            O plano Pro tem dois ciclos: <strong>R$ 14,90 por mês</strong> ou{" "}
            <strong>R$ 149,00 por ano</strong> (equivalente a aproximadamente R$ 12,42 por mês).
            Cada ciclo Pro inclui <strong>50 créditos de IA renovados todo mês</strong>; no ciclo
            anual, os créditos são liberados a cada 30 dias e expiram ao final do mês corrente. Os
            valores podem ser atualizados mediante aviso prévio com 30 dias.
          </p>
          <p>
            Os pagamentos são processados pela Stripe Payments Brasil Ltda. A Cozya não armazena
            dados completos de cartão. Quando os créditos do mês acabam, você pode esperar a
            renovação ou comprar pacotes avulsos (10, 20 ou 30 créditos extras) que ficam
            disponíveis até o fim do ciclo Pro.
          </p>
          <p>
            Não existe fidelidade. Você pode cancelar a assinatura a qualquer momento direto nas
            configurações da conta. O cancelamento encerra a renovação automática; o acesso ao Pro
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
            <a className="underline underline-offset-2" href="/settings">
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
            Pra dúvidas, solicitações ou notificações relacionadas a estes Termos:{" "}
            <a className="underline underline-offset-2" href="mailto:contato@casaldevgames.com">
              contato@casaldevgames.com
            </a>
            .
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
