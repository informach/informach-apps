import type { Metadata } from "next";
import { SITE } from "@/lib/site";

const TITLE = "Termos de Uso";
const DESCRIPTION =
  "Termos de uso aplicáveis aos sites e produtos operados pela Informach — Núcleo de Aprendizagem Ltda.";
const LAST_UPDATED = "9 de maio de 2026";

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
        <Section title="1. Quem somos">
          <p>
            Estes Termos são oferecidos pela <strong>{SITE.legalName}</strong>, pessoa jurídica de
            direito privado inscrita no CNPJ sob o nº <strong>{SITE.cnpj}</strong> ("Informach", "a
            gente"). Pra falar com a gente sobre estes Termos, use{" "}
            <a className="underline underline-offset-2" href={`mailto:${SITE.contactEmail}`}>
              {SITE.contactEmail}
            </a>
            .
          </p>
          <p>
            A Informach desenvolve e opera produtos digitais ("apps") com inteligência artificial
            voltados pra resolver dores do dia a dia. Estes Termos cobrem o site institucional{" "}
            <a className="underline underline-offset-2" href={SITE.url}>
              {SITE.url.replace("https://", "")}
            </a>{" "}
            e o serviço de cobrança que dá suporte aos nossos apps. Cada app pode ter Termos
            específicos próprios; nesses casos, os Termos do app prevalecem sobre estes para o que
            for específico do produto.
          </p>
        </Section>

        <Section title="2. O que estes Termos cobrem">
          <p>Estes Termos guarda-chuva se aplicam a:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>navegação e uso do site institucional da Informach;</li>
            <li>relação contratual com a Informach enquanto fornecedora dos apps que ela opera;</li>
            <li>
              o serviço de cobrança e gestão de assinatura via Stripe que dá suporte aos planos
              pagos dos apps;
            </li>
            <li>o canal de contato e atendimento institucional.</li>
          </ul>
          <p>
            Funcionalidades e regras específicas de cada app (limites de uso, recursos de IA,
            pacotes, etc.) ficam descritas nos Termos do próprio app.
          </p>
        </Section>

        <Section title="3. Apps da Informach">
          <p>
            Hoje a Informach opera os apps listados em{" "}
            <a className="underline underline-offset-2" href="/#apps">
              {SITE.url.replace("https://", "")}/#apps
            </a>
            . Outros apps podem ser lançados ao longo do tempo e também serão publicados nessa
            lista.
          </p>
          <p>
            <strong>Termos específicos do Cozya:</strong>{" "}
            <a
              className="underline underline-offset-2"
              href="https://cozya.informach.com.br/termos"
              target="_blank"
              rel="noopener noreferrer"
            >
              cozya.informach.com.br/termos
            </a>
            .
          </p>
        </Section>

        <Section title="4. Cadastro e responsabilidade da conta">
          <p>
            Pra criar conta nos apps você precisa ter pelo menos 18 anos, fornecer informações
            verdadeiras e manter seus dados de acesso em segurança. Você é responsável por toda
            atividade realizada na sua conta. Se notar uso indevido, fala com a gente imediatamente.
          </p>
        </Section>

        <Section title="5. Planos, preços e pagamento">
          <p>
            Os apps da Informach podem ter um plano gratuito e planos pagos (assinatura mensal ou
            anual) e/ou pacotes avulsos. Os preços vigentes são apresentados na página do respectivo
            app antes da contratação e podem ser atualizados mediante aviso prévio com 30 dias.
          </p>
          <p>
            Os pagamentos são processados pela <strong>Stripe Payments</strong>. A Informach não
            armazena dados completos de cartão. As cobranças aparecem no extrato em nome da
            Informach ou da Stripe, conforme configuração do meio de pagamento.
          </p>
          <p>
            Não existe fidelidade. Você pode cancelar a assinatura a qualquer momento direto nas
            configurações do app. O cancelamento encerra a renovação automática; o acesso ao recurso
            pago continua até o fim do período já pago. Pagamentos referentes a períodos já usados
            não são reembolsados, salvo determinação legal em contrário.
          </p>
          {/* TODO(legal): revisar política de reembolso conforme CDC art. 49 (direito de arrependimento em até 7 dias para contratação à distância). */}
        </Section>

        <Section title="6. Uso aceitável">
          <p>Você concorda em não usar o site, os apps ou o serviço de cobrança pra:</p>
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
              fazer engenharia reversa, extrair dados em massa ou usar os serviços pra treinar
              modelos concorrentes;
            </li>
            <li>compartilhar credenciais com terceiros ou criar contas falsas;</li>
            <li>fraudar pagamentos, contestar cobranças legítimas ou abusar de chargebacks.</li>
          </ul>
        </Section>

        <Section title="7. Propriedade intelectual">
          <p>
            Marcas, logos, código-fonte, identidade visual e materiais publicados pela Informach
            (incluindo nos apps e no site institucional) são de propriedade da Informach ou de seus
            licenciantes. Os conteúdos que você cria dentro de um app continuam sendo seus, sujeitos
            aos Termos específicos do app.
          </p>
        </Section>

        <Section title="8. Limitações da inteligência artificial">
          <p>
            Os apps da Informach usam IA para apoiar tarefas. A IA pode cometer erros, inferir
            informações de forma aproximada ou interpretar mal entradas ambíguas. Use os resultados
            como ponto de partida e <strong>não como aconselhamento profissional</strong> (médico,
            jurídico, financeiro, alimentar). Cada app traz limitações específicas em seus próprios
            Termos.
          </p>
        </Section>

        <Section title="9. Disponibilidade e manutenção">
          <p>
            A gente faz esforço razoável pra manter os serviços disponíveis, mas não garante
            funcionamento ininterrupto. Manutenções programadas, falhas de fornecedores externos
            (Stripe, OpenRouter, SendGrid, Sentry e outros listados na Política de Privacidade) ou
            eventos de força maior podem causar indisponibilidade temporária. Os planos atuais não
            incluem SLA contratual.
          </p>
        </Section>

        <Section title="10. Suspensão e encerramento">
          <p>
            A Informach pode suspender ou encerrar uma conta que violar estes Termos ou os Termos
            específicos de um app, sem aviso prévio em casos graves (fraude, abuso, atividade
            ilegal). Você pode encerrar sua conta a qualquer momento via configurações do app; o
            encerramento cancela qualquer assinatura ativa e exclui os dados pessoais conforme a{" "}
            <a className="underline underline-offset-2" href="/privacidade">
              Política de Privacidade
            </a>
            .
          </p>
        </Section>

        <Section title="11. Limitação de responsabilidade">
          <p>
            Na máxima extensão permitida pela legislação brasileira, a responsabilidade total da
            Informach perante você, decorrente do uso dos sites e apps, fica limitada ao valor
            efetivamente pago por você nos 12 meses anteriores ao evento que originou a reclamação.
            A Informach não responde por danos indiretos, lucros cessantes ou perda de dados não
            provocados por dolo ou culpa grave.
          </p>
          {/* TODO(legal): revisar limitação de responsabilidade à luz do CDC para hipóteses em que o contratante é consumidor pessoa física. */}
        </Section>

        <Section title="12. Alterações destes Termos">
          <p>
            A gente pode atualizar estes Termos pra refletir mudanças nos produtos, na lei ou em
            práticas operacionais. Mudanças materiais são comunicadas com antecedência mínima de 30
            dias por e-mail e por aviso no site. Se você continuar usando os serviços após a entrada
            em vigor, considera-se que aceitou a nova versão.
          </p>
        </Section>

        <Section title="13. Foro e legislação aplicável">
          <p>
            Estes Termos são regidos pelas leis da República Federativa do Brasil. Fica eleito o
            foro da comarca da sede da Informach pra dirimir controvérsias decorrentes destes
            Termos, com renúncia a qualquer outro, por mais privilegiado que seja.
          </p>
        </Section>

        <Section title="14. Contato">
          <p>
            Pra dúvidas, solicitações ou notificações relacionadas a estes Termos:{" "}
            <a className="underline underline-offset-2" href={`mailto:${SITE.contactEmail}`}>
              {SITE.contactEmail}
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
