import type { Metadata } from "next";

const TITLE = "Política de Privacidade. Cozya";
const DESCRIPTION =
  "Como o Cozya coleta, usa e protege seus dados, em conformidade com a LGPD (Lei nº 13.709/2018).";
const LAST_UPDATED = "8 de maio de 2026";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-primary">Legal</p>
        <h1 className="text-balance text-3xl font-semibold tracking-tight md:text-4xl">
          Política de Privacidade
        </h1>
        <p className="text-sm text-muted-foreground">Última atualização: {LAST_UPDATED}.</p>
      </header>

      <div className="mt-10 space-y-10 text-base leading-relaxed text-foreground">
        <Section title="1. Quem é o controlador dos seus dados">
          <p>
            <strong>Informach — Núcleo de Aprendizagem Ltda</strong>, CNPJ{" "}
            <strong>43.588.758/0001-03</strong>, é a controladora dos dados pessoais tratados pelo
            Cozya. Esta Política descreve como a gente coleta, usa, compartilha e protege essas
            informações, e quais são os seus direitos enquanto titular dos dados.
          </p>
        </Section>

        <Section title="2. Encarregado pelo tratamento de dados (DPO)">
          <p>
            O canal oficial pra tratar de privacidade, exercer seus direitos e tirar dúvidas sobre
            esta Política é{" "}
            <a className="underline underline-offset-2" href="mailto:contato@casaldevgames.com">
              contato@casaldevgames.com
            </a>
            . A gente responde dentro do prazo previsto na LGPD (até 15 dias para confirmação de
            tratamento e acesso, conforme o art. 19).
          </p>
        </Section>

        <Section title="3. Quais dados coletamos">
          <p>O Cozya coleta apenas o necessário pra operar o serviço:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Dados de cadastro:</strong> nome, e-mail e senha (armazenada como hash, nunca
              em texto puro).
            </li>
            <li>
              <strong>Conteúdo que você cria:</strong> receitas, fotos, textos e áudios enviados pra
              captura por IA.
            </li>
            <li>
              <strong>Dados de uso da IA:</strong> registro de chamadas (qual feature, modelo
              utilizado, contagem de tokens, custo em créditos) pra fins de cobrança e auditoria.
              Não armazenamos prompts e respostas após o processamento, exceto quando você decide
              salvar a receita gerada.
            </li>
            <li>
              <strong>Dados de cobrança:</strong> identificadores Stripe (customer ID, subscription
              ID, status, ciclo). Dados completos de cartão são processados e armazenados
              diretamente pela Stripe; o Cozya não os recebe nem armazena.
            </li>
            <li>
              <strong>Logs técnicos e de auditoria:</strong> registros mínimos de eventos (login,
              alteração de plano, exclusão de conta) pra segurança e cumprimento legal, com PII
              reduzida (e-mail substituído por hash quando possível).
            </li>
          </ul>
        </Section>

        <Section title="4. Para que usamos os dados">
          <ul className="list-disc space-y-2 pl-6">
            <li>operar a sua conta e o serviço de organização de receitas;</li>
            <li>processar capturas e gerações por IA quando solicitadas;</li>
            <li>cobrar assinaturas e pacotes de créditos;</li>
            <li>
              enviar e-mails transacionais (verificação, recuperação de senha, recibos, alertas de
              uso);
            </li>
            <li>prevenir fraude, abuso e ataques contra a plataforma;</li>
            <li>cumprir obrigações legais, fiscais e regulatórias.</li>
          </ul>
        </Section>

        <Section title="5. Bases legais (LGPD art. 7)">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Execução de contrato</strong> (art. 7º, V) para tudo que é necessário pra
              prestar o serviço que você contratou.
            </li>
            <li>
              <strong>Cumprimento de obrigação legal ou regulatória</strong> (art. 7º, II) para
              guarda fiscal de documentos e atendimento a autoridades.
            </li>
            <li>
              <strong>Legítimo interesse</strong> (art. 7º, IX) para segurança, prevenção a fraude e
              melhoria do produto, sempre com avaliação de impacto e minimização de dados.
            </li>
            <li>
              <strong>Consentimento</strong> (art. 7º, I) para qualquer comunicação opcional. Hoje
              não enviamos e-mail marketing; se isso mudar, você será solicitado a optar
              expressamente.
            </li>
          </ul>
        </Section>

        <Section title="6. Com quem compartilhamos">
          <p>
            A gente usa operadores especializados (sub-contratados) pra entregar o serviço. Cada um
            recebe apenas o necessário pra sua função:
          </p>
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Stripe</strong> (Stripe Inc., EUA) para pagamentos e cobrança recorrente.
            </li>
            <li>
              <strong>SendGrid</strong> (Twilio Inc., EUA) para envio de e-mails transacionais.
            </li>
            <li>
              <strong>OpenRouter</strong> (Mintplex Labs, EUA) como gateway pra modelos de IA da
              OpenAI e parceiros, processando os prompts em tempo real e descartando após a
              resposta.
            </li>
            <li>
              <strong>Sentry</strong> (Functional Software Inc., EUA) para monitoramento de erros e
              performance, com filtragem automática de dados sensíveis antes do envio.
            </li>
            <li>
              <strong>Google</strong> (Alphabet Inc., EUA) quando você opta por entrar com Google
              (OAuth).
            </li>
          </ul>
          <p>
            Não vendemos seus dados. Não compartilhamos com anunciantes. Operadores tratam os dados
            sob contrato e em conformidade com leis de proteção aplicáveis.
          </p>
        </Section>

        <Section title="7. Transferência internacional">
          <p>
            Os operadores listados acima processam dados em servidores nos Estados Unidos e na União
            Europeia. As transferências internacionais são realizadas com base na execução do
            contrato (LGPD art. 33, V) e nos padrões contratuais e técnicos adotados pelos próprios
            fornecedores (cláusulas-padrão, criptografia em trânsito, controles de acesso).
          </p>
        </Section>

        <Section title="8. Por quanto tempo guardamos">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Dados da conta e receitas:</strong> enquanto a conta estiver ativa.
            </li>
            <li>
              <strong>Após exclusão da conta:</strong> os dados pessoais são removidos
              imediatamente; o Cozya cancela assinaturas ativas e libera créditos no mesmo processo.
            </li>
            <li>
              <strong>Registros fiscais e de pagamento:</strong> retidos pelo prazo legal de até 5
              anos (Lei nº 8.846/1994 e Código Tributário Nacional), de forma minimizada e
              dissociada quando possível.
            </li>
            <li>
              <strong>Logs de auditoria e segurança:</strong> mantidos por até 12 meses para
              investigação de incidentes.
            </li>
          </ul>
        </Section>

        <Section title="9. Seus direitos como titular (LGPD art. 18)">
          <p>Você pode, a qualquer tempo:</p>
          <ul className="list-disc space-y-2 pl-6">
            <li>confirmar a existência de tratamento e acessar os dados que mantemos;</li>
            <li>
              corrigir dados incompletos, inexatos ou desatualizados pelas configurações da conta;
            </li>
            <li>
              solicitar anonimização, bloqueio ou eliminação de dados desnecessários ou tratados em
              desconformidade;
            </li>
            <li>solicitar portabilidade dos seus dados pra outro fornecedor;</li>
            <li>
              excluir a conta a qualquer momento pela área de configurações; isso cancela qualquer
              assinatura ativa e remove os dados pessoais associados;
            </li>
            <li>obter informação sobre os agentes com quem compartilhamos dados;</li>
            <li>revogar consentimentos previamente dados, quando aplicável;</li>
            <li>opor-se ao tratamento, nos limites da lei.</li>
          </ul>
          <p>
            Pra exercer qualquer direito, escreve pra{" "}
            <a className="underline underline-offset-2" href="mailto:contato@casaldevgames.com">
              contato@casaldevgames.com
            </a>{" "}
            ou usa as opções autosserviço dentro do app. A gente confirma o recebimento e responde
            no prazo legal.
          </p>
        </Section>

        <Section title="10. Cookies e tecnologias semelhantes">
          <p>
            O Cozya usa <strong>apenas cookies essenciais</strong> pro funcionamento do serviço:
            sessão de login (Better Auth), preferências de interface e identificação de transações
            de pagamento. Não usamos cookies de publicidade, rastreamento entre sites ou analytics
            de terceiros. Se isso mudar no futuro, esta Política será atualizada e você será
            notificado.
          </p>
        </Section>

        <Section title="11. Como protegemos seus dados">
          <ul className="list-disc space-y-2 pl-6">
            <li>criptografia em trânsito (TLS 1.2+) em todas as conexões;</li>
            <li>senhas armazenadas como hash com algoritmo moderno;</li>
            <li>rate limiting e bloqueios anti-força-bruta nos endpoints de autenticação;</li>
            <li>política de Content Security Policy (CSP) restrita;</li>
            <li>logs de auditoria imutáveis para eventos sensíveis;</li>
            <li>filtros automáticos de PII antes do envio a serviços de observabilidade;</li>
            <li>acesso interno restrito por função, com autenticação multifator.</li>
          </ul>
          <p>
            Nenhum sistema é 100% seguro. Em caso de incidente que represente risco aos titulares, a
            Informach comunicará a Autoridade Nacional de Proteção de Dados (ANPD) e os titulares
            afetados, conforme a LGPD.
          </p>
        </Section>

        <Section title="12. Crianças e adolescentes">
          <p>
            O Cozya é destinado a maiores de 18 anos. A gente não coleta intencionalmente dados de
            crianças e adolescentes. Se você é responsável por um menor que tenha criado conta sem
            autorização, entre em contato e a gente exclui imediatamente.
          </p>
        </Section>

        <Section title="13. Alterações desta Política">
          <p>
            A gente pode atualizar esta Política para refletir mudanças no produto, em fornecedores
            ou na legislação. Alterações materiais são comunicadas por e-mail com 30 dias de
            antecedência. A versão vigente está sempre disponível em{" "}
            <a className="underline underline-offset-2" href="/privacidade">
              cozya.com.br/privacidade
            </a>
            .
          </p>
        </Section>

        <Section title="14. Contato">
          <p>
            Dúvidas, solicitações de direitos LGPD ou qualquer assunto relacionado a privacidade:{" "}
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
