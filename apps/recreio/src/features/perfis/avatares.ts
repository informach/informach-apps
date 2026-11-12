/**
 * Avatares que o portal oferece e a inicial que aparece neles. Sem Zod e sem
 * dependência do servidor: os componentes do navegador importam daqui.
 */

/** `padrao` é também o valor inicial da coluna `avatar`. */
export const AVATARES = ["padrao", "sol", "coral", "mar", "ceu", "lua"] as const;
export type Avatar = (typeof AVATARES)[number];

export const NOME_DO_AVATAR: Record<Avatar, string> = {
  padrao: "Noite",
  sol: "Sol",
  coral: "Coral",
  mar: "Mar",
  ceu: "Céu",
  lua: "Lua",
};

/** O que veio do banco pode ser de um conjunto mais antigo: cai no padrão. */
export function avatarConhecido(valor: string): Avatar {
  return AVATARES.find((avatar) => avatar === valor) ?? "padrao";
}

/** A letra que aparece no avatar. */
export function inicialDoApelido(apelido: string): string {
  return ([...apelido.trim()][0] ?? "?").toLocaleUpperCase("pt-BR");
}
