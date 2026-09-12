export function noticeErrorMessage(code: string) {
  const messages: Record<string, string> = {
    INVALID_SOURCE_SCOPE:
      "Marque todas as crianças mencionadas no original e que já receberam este recado, ou mantenha o original privado.",
    POSSIBLE_CORRECTIONS:
      "Há uma providência semelhante com outra data. Confira se este recado corrige a anterior ou se é uma nova obrigação.",
    INVALID_CORRECTION:
      "A escolha de correção não corresponde mais à revisão. Confira os itens e selecione novamente.",
    INVALID_PROFILE:
      "Selecione uma criança à qual você tem acesso. Cada recado deve pertencer a uma única família.",
    VERIFY_EMAIL: "Confirme seu e-mail antes de experimentar a importação.",
    AI_DISABLED:
      "A importação está indisponível neste ambiente. Você pode cadastrar as providências manualmente.",
    INVALID_ATTACHMENT: "Use uma imagem JPG, PNG ou WebP, ou um PDF válido, de até 5 MB.",
    SELECT_PDF_PAGES: "Selecione de uma a três páginas válidas do PDF.",
    PROCESSING:
      "Este recado está sendo processado. Aguarde e tente abrir novamente; o envio repetido não inicia outra cobrança.",
    DAILY_LIMIT: "Você atingiu o limite de tentativas de hoje. Tente novamente amanhã.",
    TRIAL_BUSY:
      "O teste gratuito atingiu a capacidade de hoje. Tente amanhã ou cadastre manualmente.",
    TRIAL_ENDED:
      "Você já usou as cinco importações de teste. O Pro inclui 70 créditos por mês; cada recado usa um crédito.",
    NO_ACTIONS:
      "Não encontrei providências claras neste recado. Revise o conteúdo ou cadastre manualmente. A tentativa não consumiu crédito.",
    PARSE_FAILED:
      "Não foi possível organizar o recado. Verifique seu saldo e tente novamente. Você também pode cadastrar manualmente.",
    NOT_READY: "O recado ainda não está pronto para revisão.",
    NOT_FOUND: "Este item não está disponível para sua conta.",
    VERSION_CONFLICT:
      "Outro responsável alterou este item. Atualize a página antes de editar novamente.",
    INVALID_ASSIGNEE: "Esse responsável não tem mais acesso à criança. Escolha outro responsável.",
    PRO_REQUIRED: "Lembretes personalizados e repetição semanal fazem parte do Pro.",
    ACTIVITY_LIMIT_REACHED:
      "O plano gratuito permite 20 pendências próprias. Conclua algumas para liberar espaço; o histórico será mantido.",
    DUPLICATE_IN_REVIEW:
      "Há duas providências iguais para a mesma criança nesta revisão. Remova uma delas.",
    POSSIBLE_DUPLICATES:
      "Já há uma providência com mesmo título, tipo e data. Abra o registro existente para corrigir, ou confirme que deseja outro.",
  };
  return (
    messages[code] ??
    "Não foi possível salvar. Confira os campos ou atualize a página e tente novamente."
  );
}
