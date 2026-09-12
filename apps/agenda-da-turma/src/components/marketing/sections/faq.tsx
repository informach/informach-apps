import styles from "../sales.module.css";

const QUESTIONS = [
  [
    "Preciso que a escola use a Agenda da Turma?",
    "Não. Você organiza os recados que já recebe. Copie a mensagem e envie a foto ou o PDF; a escola continua usando seus canais habituais.",
  ],
  [
    "Ela busca mensagens sozinha no Teams ou Batista ID?",
    "A entrada atual é feita por você, copiando a publicação e enviando o anexo. A Agenda organiza esse conteúdo para revisão. Não existe conexão automática com essas plataformas.",
  ],
  [
    "Vou ter que digitar cada tarefa?",
    "Você envia o conteúdo para a IA sugerir as providências e confere antes de salvar. Também pode criar ou corrigir uma providência manualmente.",
  ],
  [
    "E se não houver prazo no recado?",
    "O prazo fica a confirmar. Se escolher uma data de preparação, ela aparece como planejamento da família.",
  ],
  [
    "Serve para um filho ou para quem cuida sozinho?",
    "Sim. Organizar as providências e acompanhar os próximos dias já é útil com uma criança. O Pro acrescenta lembretes e mais importações; convidar outro adulto é opcional.",
  ],
  [
    "Marcar como feito envia a autorização para a escola?",
    "Não. A conclusão registra o acompanhamento da família. Entregas e autorizações continuam sendo feitas no canal oficial da escola.",
  ],
  [
    "As cinco importações renovam todo mês?",
    "Não. São cinco por conta verificada para experimentar. A franquia mensal de créditos faz parte do Pro.",
  ],
  [
    "Como funcionam os lembretes?",
    "No Pro, você configura resumo por e-mail e lembretes. Push depende de compatibilidade e permissão do dispositivo.",
  ],
  [
    "E se meus créditos acabarem?",
    "Você pode continuar acompanhando e cadastrando providências manualmente. Para novas importações, aguarde a próxima franquia mensal do Pro ou consulte os pacotes avulsos disponíveis na sua conta.",
  ],
] as const;
export function Faq() {
  return (
    <section
      id="perguntas"
      className={[styles.wrap, styles.section, styles.faq].join(" ")}
      aria-labelledby="faq-title"
    >
      <div className={styles.faqIntro}>
        <p className={styles.eyebrow}>Antes de começar</p>
        <h2 id="faq-title">Cabe na rotina da sua família?</h2>
        <p>As respostas para você decidir com clareza.</p>
      </div>
      <div>
        {QUESTIONS.map(([question, answer]) => (
          <details key={question}>
            <summary>{question}</summary>
            <p>{answer}</p>
          </details>
        ))}
      </div>
    </section>
  );
}
