export function noticeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    INVALID_SOURCE_SCOPE:
      "Marque todas as crianças de que o recado fala, ou deixe o recado só com você.",
    POSSIBLE_CORRECTIONS:
      "Já existe uma atividade parecida com outra data. Confira se este recado corrige a anterior ou se é uma atividade nova.",
    INVALID_CORRECTION:
      "A correção escolhida não bate mais com o que está na tela. Confira as atividades e escolha de novo.",
    INVALID_PROFILE: "Escolha uma das crianças que você acompanha.",
    INVALID_SUBJECT:
      "Essa matéria não pertence à turma atual da criança. Escolha outra ou deixe sem matéria.",
    VERIFY_EMAIL: "Confirme seu e-mail antes de mandar o primeiro recado.",
    AI_DISABLED: "A leitura de recados está fora do ar agora. Dá para escrever a atividade.",
    INVALID_ATTACHMENT: "Use uma imagem JPG, PNG ou WebP, ou um PDF válido, de até 5 MB.",
    SELECT_PDF_PAGES: "Selecione de uma a três páginas válidas do PDF.",
    PROCESSING:
      "A Agenda ainda está lendo este recado. Espere um pouco e abra de novo. Mandar outra vez não gasta outra leitura.",
    DAILY_LIMIT: "Chegou o limite de leituras de hoje. Amanhã dá para mandar de novo.",
    TRIAL_BUSY:
      "As leituras grátis de hoje acabaram para todo mundo. Tente amanhã ou escreva a atividade.",
    TRIAL_ENDED:
      "Os 5 recados de teste acabaram. No Pro, a Agenda lê 70 recados por mês (ditado conta como dois).",
    NO_ACTIONS:
      "Não achei nenhuma atividade clara neste recado. Confira o conteúdo ou escreva a atividade. Essa tentativa não gastou leitura.",
    PARSE_FAILED: "Não consegui ler o recado. Tente de novo em instantes, ou escreva a atividade.",
    VOICE_TRIAL_SPENT:
      "O ditado de teste acabou. As leituras que restam ficam guardadas para seus recados: mande foto ou mensagem, ou escreva a atividade.",
    INSUFFICIENT_CREDITS:
      "As leituras acabaram. Escreva a atividade, ou veja o Pro e os pacotes de leituras.",
    TRANSCRIBE_FAILED:
      "Não consegui transcrever o áudio. Tente de novo, falando mais perto do microfone.",
    NOT_READY: "A Agenda ainda está lendo este recado.",
    NOT_DRAFT: "Este recado já foi salvo ou descartado. Atualize a página.",
    NOTICE_DISCARDED:
      "Alguém da família descartou este recado. Peça para quem mandou retomar, ou escreva a atividade.",
    NOT_FOUND: "Este item não está disponível para sua conta.",
    VERSION_CONFLICT: "Outro adulto mudou esta atividade agora. Atualize a página e edite de novo.",
    INVALID_ASSIGNEE: "Esse adulto não acompanha mais a criança. Escolha outra pessoa.",
    ALREADY_CANCELED:
      "Esta atividade foi cancelada e o histórico ficou guardado. Se ela voltou a valer, cadastre-a de novo. Assim quem recebeu entende o que aconteceu.",
    SHARE_REQUIRES_PRO:
      "Mandar para a turma faz parte do Pro. Dá para salvar só para a sua família agora.",
    SHARE_NOT_YOURS:
      "Quem mandou esta atividade para a turma foi outra família. Você pode cancelar a sua cópia, mas não tirar da turma.",
    SHARE_ALREADY_ACCEPTED:
      "Outras famílias já receberam esta atividade. Para tirar da turma, cancele a atividade. Assim elas entendem o que aconteceu.",
    SHARED_REQUIRES_SCHOOL_FIELDS:
      "Você mandou esta atividade para a turma, e a turma inteira lê o que você salvar aqui. Mantenha a matéria e a data, ou crie uma atividade só da sua família.",
    PRO_REQUIRED: "Lembretes personalizados e repetição semanal fazem parte do Pro.",
    ACTIVITY_LIMIT_REACHED:
      "O plano grátis tem até 20 atividades em aberto. Marque algumas como feitas para abrir espaço; o histórico fica guardado.",
    DUPLICATE_IN_REVIEW: "Há duas atividades iguais para a mesma criança. Tire uma delas.",
    POSSIBLE_DUPLICATES:
      "Já existe uma atividade com o mesmo nome, tipo e data. Abra a que existe para corrigir, ou confirme que é outra.",
    // Fila offline. Sem estas linhas, uma queda de rede recebia "confira os
    // campos" — conselho que não faz sentido nenhum para quem está sem sinal.
    OFFLINE:
      "Sem conexão, e este aparelho não consegue guardar a mudança para depois. Tente de novo quando a rede voltar.",
    RATE_LIMITED: "Muitas mudanças em pouco tempo. Espere um minuto e tente de novo.",
    WRITE_FAILED: "Não conseguimos salvar agora. A mudança continua guardada e sobe sozinha.",
    KEY_REUSED: "Esta mudança já foi usada para outra atividade. Descarte-a e marque de novo.",
  };
  return (
    messages[code] ??
    "Não foi possível salvar. Confira os campos ou atualize a página e tente de novo."
  );
}
