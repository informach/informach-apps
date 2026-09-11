import type { Metadata } from "next";

const TITLE = "Política de Privacidade. Cozya";
const DESCRIPTION = "Como o Cozya trata receitas, planejamento, preferências e dados da conta.";
const LAST_UPDATED = "11 de setembro de 2026";

export const metadata: Metadata = {
  title: TITLE,
  description: DESCRIPTION,
  robots: { index: true, follow: true },
};

export default function PrivacyPolicyPage() {
  return (
    <article className="container mx-auto max-w-3xl px-4 py-16 md:py-24">
      <header className="space-y-3">
        <p className="text-sm font-medium uppercase tracking-wider text-brand-ink">Legal</p>
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
              <strong>Conteúdo que você cria:</strong> receitas, planos semanais, listas de compras,
              progresso de preparo e preferências preenchidas por você. Fotos, textos e áudios
              enviados para IA são processados quando você solicita uma captura.
            </li>
            <li>
              <strong>Dados de uso da IA:</strong> registro de chamadas (qual feature, modelo
              utilizado, contagem de tokens, custo em créditos) pra fins de cobrança e auditoria.
              Não mantemos memória automática de conversas nem inferimos perfil alimentar. A prévia
              resultante fica disponível por 24 horas para recuperar uma solicitação cuja conexão
              caiu; depois é bloqueada e removida na rotina horária. O conteúdo salvo como receita
              permanece no seu acervo. Os dados enviados não são incluídos nos logs de IA.
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
              <strong>OpenRouter e os provedores de modelos selecionados</strong> para processar o
              material enviado à IA. Pesquisas também podem utilizar um serviço de busca web. As
              regras de retenção desses fornecedores dependem do modelo, do provedor e das
              configurações contratadas; não afirmamos descarte imediato por todos eles.
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
            Serviços de pagamento, envio de e-mail e IA podem processar dados fora do Brasil. A
            localização e as condições de tratamento variam conforme o fornecedor e o modelo
            utilizado. Você pode solicitar detalhes sobre esses operadores pelo canal de
            privacidade. As hipóteses legais para transferência internacional estão no art. 33 da{" "}
            <a
              className="underline"
              href="https://www.planalto.gov.br/ccivil_03/_ato2015-2018/2018/lei/l13709compilado.htm"
            >
              LGPD
            </a>
            .
          </p>
        </Section>

        <Section title="8. Por quanto tempo guardamos">
          <ul className="list-disc space-y-2 pl-6">
            <li>
              <strong>Dados da conta e da cozinha:</strong> enquanto a conta estiver ativa ou até
              você solicitar sua exclusão. Rascunhos de IA não salvos têm a janela de recuperação de
              24 horas descrita acima, com limpeza na rotina horária seguinte.
            </li>
            <li>
              <strong>Eventos de uso e diagnóstico de IA:</strong> limpeza após 90 dias pela rotina
              horária. O registro de idempotência sem conteúdo também é mantido por até 90 dias para
              impedir a repetição de uma operação. Pendências de devolução de crédito preservam seus
              identificadores e estado até a reconciliação; depois seguem a limpeza. Eventos não
              contêm ingredientes ou preparo.
            </li>
            <li>
              <strong>Prevenção de repetição do teste:</strong> um identificador derivado do e-mail
              com chave secreta registra o uso do teste. Após excluir a conta, esse identificador
              desvinculado é removido quando completar 365 dias desde a ativação; ele não reinicia o
              benefício ao recriar a mesma conta.
            </li>
            <li>
              <strong>Exclusão:</strong> apagar dados do Cozya remove seu conteúdo da cozinha e
              preserva a conta Informach e a assinatura. Excluir a conta Informach é uma ação
              distinta, confirmada por e-mail, que afeta os aplicativos vinculados. Assinaturas de
              outros aplicativos precisam ser encerradas antes; a do Cozya é cancelada durante o
              processo. Operações de IA em andamento ou com devolução de crédito pendente precisam
              ser concluídas antes da limpeza. Se a limpeza obrigatória falhar, a exclusão não é
              concluída.
            </li>
            <li>
              <strong>Registros fiscais e de pagamento:</strong> a limpeza do Cozya não apaga o
              histórico de cobrança. Esses registros têm tratamento separado para obrigações
              fiscais, contestações e atendimento, conforme o caso.
            </li>
            <li>
              <strong>Logs de auditoria e segurança da conta Informach:</strong> têm retenção
              separada dos eventos de uso da cozinha. Solicite informações ou eliminação pelo canal
              de privacidade; esta rotina não apaga registros compartilhados de segurança.
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
              exportar ou apagar os dados da cozinha e solicitar exclusão da conta Informach em{" "}
              <a className="underline" href="/settings/account">
                Conta e privacidade
              </a>
              , observando o escopo de cada opção;
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
