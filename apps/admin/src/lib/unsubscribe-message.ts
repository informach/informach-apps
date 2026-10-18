/**
 * Resposta do link de descadastro, pela categoria do e-mail de onde a pessoa
 * veio. Aviso de queda é operacional e continua chegando; o resumo da semana
 * obedece ao descadastro; e-mail de acesso (código para entrar ou ativar as
 * duas etapas) continua, porque sem ele não dá para entrar.
 */
export function unsubscribeMessage(category: string): string {
  if (category === "admin.weekly-summary")
    return "Pronto: o resumo da semana não chega mais para você. Os avisos de queda de serviço continuam chegando, porque fazem parte da operação e não obedecem ao descadastro.";
  if (category === "admin.alert")
    return "Os avisos de queda de serviço fazem parte da operação e continuam chegando, mesmo com o descadastro. Só o resumo da semana pode ser desligado, pelo link no rodapé dele.";
  if (category.startsWith("auth."))
    return "Os e-mails de acesso, como os códigos para entrar e para ativar as duas etapas, continuam chegando, porque sem eles não dá para entrar.";
  return "Preferência registrada.";
}
