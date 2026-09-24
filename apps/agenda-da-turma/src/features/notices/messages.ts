export function noticeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    INVALID_SOURCE_SCOPE:
      "Marque todas as crianças mencionadas no original e que já receberam este recado, ou mantenha o original privado.",
    POSSIBLE_CORRECTIONS:
      "Há uma atividade semelhante com outra data. Confira se este recado corrige a anterior ou se é uma nova obrigação.",
    INVALID_CORRECTION:
      "A escolha de correção não corresponde mais à revisão. Confira os itens e selecione novamente.",
    INVALID_PROFILE:
      "Selecione uma criança à qual você tem acesso. Cada recado deve pertencer a uma única família.",
    INVALID_SUBJECT:
      "Essa matéria não pertence à turma atual da criança. Escolha outra ou deixe sem matéria.",
    VERIFY_EMAIL: "Confirme seu e-mail antes de experimentar a importação.",
    AI_DISABLED:
      "A importação está indisponível neste ambiente. Você pode cadastrar as atividades manualmente.",
    INVALID_ATTACHMENT: "Use uma imagem JPG, PNG ou WebP, ou um PDF válido, de até 5 MB.",
    SELECT_PDF_PAGES: "Selecione de uma a três páginas válidas do PDF.",
    PROCESSING:
      "Este recado está sendo processado. Aguarde e tente abrir novamente; o envio repetido não inicia outra cobrança.",
    DAILY_LIMIT: "Você atingiu o limite de tentativas de hoje. Tente novamente amanhã.",
    TRIAL_BUSY:
      "O teste gratuito atingiu a capacidade de hoje. Tente amanhã ou cadastre manualmente.",
    TRIAL_ENDED:
      "Você já usou as cinco importações de teste. O Pro inclui 70 créditos por mês: um por recado de texto, foto ou PDF, e dois quando você dita.",
    NO_ACTIONS:
      "Não encontrei atividades claras neste recado. Revise o conteúdo ou cadastre manualmente. A tentativa não consumiu crédito.",
    PARSE_FAILED:
      "Não foi possível organizar o recado. Verifique seu saldo e tente novamente. Você também pode cadastrar manualmente.",
    VOICE_TRIAL_SPENT:
      "O ditado de teste acabou. Os créditos que restam ficam guardados para ler seus recados: importe por texto ou foto, ou escreva a atividade.",
    INSUFFICIENT_CREDITS:
      "Seus créditos acabaram. Cadastre a atividade escrevendo, ou assine o Pro para continuar usando a IA.",
    TRANSCRIBE_FAILED:
      "Não consegui transcrever o áudio. Tente de novo, falando mais perto do microfone.",
    NOT_READY: "O recado ainda não está pronto para revisão.",
    NOT_DRAFT: "Este recado já foi salvo ou descartado. Atualize a página.",
    NOTICE_DISCARDED:
      "Este recado foi descartado por alguém da família. Peça a quem importou para retomá-lo, ou cadastre a atividade escrevendo.",
    NOT_FOUND: "Este item não está disponível para sua conta.",
    VERSION_CONFLICT:
      "Outro responsável alterou este item. Atualize a página antes de editar novamente.",
    INVALID_ASSIGNEE: "Esse responsável não tem mais acesso à criança. Escolha outro responsável.",
    ALREADY_CANCELED:
      "Esta atividade foi cancelada e o histórico ficou guardado. Se ela voltou a valer, cadastre-a de novo — assim quem recebeu entende o que aconteceu.",
    SHARE_REQUIRES_PRO:
      "Compartilhar com a turma faz parte do Pro. Você pode salvar a atividade só para a sua família agora e compartilhar depois.",
    SHARE_NOT_YOURS:
      "Quem publicou esta atividade na turma foi outra família. Você pode cancelar a sua cópia, mas não retirá-la da turma.",
    SHARE_ALREADY_ACCEPTED:
      "Outras famílias já receberam esta atividade. Para tirá-la da turma, cancele a atividade — assim elas entendem o que aconteceu.",
    SHARED_REQUIRES_SCHOOL_FIELDS:
      "Você publicou esta atividade na turma, e a turma inteira lê o que você salvar aqui. Mantenha a matéria e o prazo, ou crie uma atividade só da sua família.",
    PRO_REQUIRED: "Lembretes personalizados e repetição semanal fazem parte do Pro.",
    ACTIVITY_LIMIT_REACHED:
      "O plano gratuito permite 20 pendências próprias. Conclua algumas para liberar espaço; o histórico será mantido.",
    DUPLICATE_IN_REVIEW:
      "Há duas atividades iguais para a mesma criança nesta revisão. Remova uma delas.",
    POSSIBLE_DUPLICATES:
      "Já há uma atividade com mesmo título, tipo e data. Abra o registro existente para corrigir, ou confirme que deseja outro.",
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
    "Não foi possível salvar. Confira os campos ou atualize a página e tente novamente."
  );
}
