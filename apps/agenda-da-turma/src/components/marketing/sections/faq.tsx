import styles from "../sales.module.css";

const QUESTIONS = [
  [
    "Preciso que a escola use a Agenda da Turma?",
    "Não. Você organiza os recados que já recebe. Fotografe o cartaz, compartilhe a mensagem ou cole o texto; a escola continua usando os canais de sempre.",
  ],
  [
    "Ela busca mensagens sozinha no Teams ou Batista ID?",
    "A entrada é feita por você, compartilhando a mensagem, enviando a foto ou colando o texto. A Agenda organiza esse conteúdo para revisão. Não existe conexão automática com essas plataformas.",
  ],
  [
    "Um cartaz com várias matérias vira uma atividade só?",
    "Não. A leitura separa uma atividade por matéria, por entregável e por prazo. Um cartaz com dois blocos de cinco matérias vira dez atividades, cada uma já ligada à matéria que a criança tem na turma. Você confere tudo antes de salvar.",
  ],
  [
    "Dá para trazer a conversa do grupo da escola?",
    "Dá. Exporte a conversa no WhatsApp e escolha, na tela, só as mensagens que interessam. O que você não marcar não vai para a leitura, porque um grupo de turma tem assunto de outras famílias.",
  ],
  [
    "Preciso ficar tirando foto de cada página?",
    "Não. Você junta até três fotos num recado só, e a Agenda monta o arquivo antes de enviar. Antes cada página era uma importação separada.",
  ],
  [
    "Vou ter que digitar cada tarefa?",
    "Você envia o conteúdo, a IA sugere as atividades e você confere antes de salvar. Também dá para criar ou corrigir uma atividade na mão, quando for mais rápido.",
  ],
  [
    "E se não houver prazo no recado?",
    "Se a matéria estiver no horário da turma, a Agenda sugere a próxima aula dela e diz que a data foi calculada. Sem isso, o prazo fica a confirmar. A leitura nunca inventa uma data que a escola não deu.",
  ],
  [
    "A Agenda ajuda a estudar para a prova?",
    "Sim, se você pedir. No detalhe da prova você escolhe quantas sessões quer, e a Agenda reparte pelos dias mais livres até a véspera. Cancelar a prova cancela as sessões que ainda faltavam.",
  ],
  [
    "Meu filho pode usar?",
    "Existe uma tela só para a criança, com uma atividade por vez e um botão grande de feito. Sem menu, sem cobrança e sem prazo em vermelho. Você passa o telefone e pede de volta segurando o botão de sair.",
  ],
  [
    "Funciona sem internet?",
    "Dá para ler a rotina e marcar como feito. A decisão fica guardada no aparelho, com um aviso de que ainda não subiu, e sobe sozinha quando a rede voltar. Importar um recado novo precisa de conexão.",
  ],
  [
    "Serve para um filho ou para quem cuida sozinho?",
    "Sim. Organizar as atividades e acompanhar os próximos dias já é útil com uma criança. O Pro acrescenta lembretes e mais importações; convidar outro adulto é opcional.",
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
    "E se meus créditos acabarem?",
    "Você continua acompanhando e cadastrando atividades na mão. Para novas importações, espere a próxima franquia mensal do Pro ou veja os pacotes avulsos na sua conta.",
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
