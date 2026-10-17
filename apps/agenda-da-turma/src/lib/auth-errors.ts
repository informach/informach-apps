/**
 * O erro do Better Auth em português.
 *
 * O cliente devolve `{ code, message, status }`, e a mensagem vem em inglês
 * ("Invalid email or password"). Ela ia direto para o toast. Aqui cada código
 * conhecido vira uma frase nossa; o que não conhecemos cai no texto que cada
 * tela já escolheu, nunca na mensagem do provedor.
 */
export type AuthClientError = { code?: string; message?: string; status?: number };

const MESSAGES: Record<string, string> = {
  INVALID_EMAIL_OR_PASSWORD: "O e-mail ou a senha não conferem.",
  INVALID_PASSWORD: "A senha não confere.",
  INVALID_EMAIL: "Confira o e-mail digitado.",
  USER_NOT_FOUND: "Não achamos uma conta com esse e-mail.",
  EMAIL_NOT_VERIFIED: "Falta confirmar o e-mail. Entre pela aba Código para receber um.",
  PASSWORD_TOO_SHORT: "A senha precisa de pelo menos 8 caracteres.",
  PASSWORD_TOO_LONG: "A senha pode ter no máximo 72 caracteres.",
  USER_ALREADY_EXISTS: "Já existe uma conta com esse e-mail.",
  INVALID_OTP: "Código inválido. Confira e tente de novo.",
  OTP_EXPIRED: "O código venceu. Peça um novo.",
  TOO_MANY_ATTEMPTS: "Muitas tentativas com o mesmo código. Peça um novo.",
};

export function describeAuthError(error: AuthClientError | null | undefined, fallback: string) {
  if (!error) return fallback;
  if (error.code && MESSAGES[error.code]) return MESSAGES[error.code] as string;
  if (error.status === 429) return "Muitas tentativas seguidas. Espere um minuto e tente de novo.";
  return fallback;
}
