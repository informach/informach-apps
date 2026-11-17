import { z } from "zod";
import { ErroDoRecreio } from "./erros";

export const VERSAO_DA_RESPONSABILIDADE = "responsabilidade-2026-11-16";
export const MesEAnoSchema = z.strictObject({
  mes: z.number().int().min(1).max(12),
  ano: z.number().int().min(1900).max(9999),
});
export type MesEAno = z.infer<typeof MesEAnoSchema>;
export type FaixaDoMenor = "L" | "6" | "10" | "12" | "14" | "16";

/** O relógio é fornecido pelo servidor; nenhuma idade vem do jogo. */
export function idadeNoMes(nascimento: MesEAno, agora: MesEAno): number {
  MesEAnoSchema.parse(nascimento);
  MesEAnoSchema.parse(agora);
  const meses = (agora.ano - nascimento.ano) * 12 + agora.mes - nascimento.mes;
  if (meses < 0) throw new ErroDoRecreio("ENTRADA_INVALIDA");
  return Math.floor(meses / 12);
}

export function exigirNascimentoDeMenor(nascimento: MesEAno, agora: MesEAno): void {
  if (idadeNoMes(nascimento, agora) >= 18) throw new ErroDoRecreio("ENTRADA_INVALIDA");
}

/** Fazer 18 não converte silenciosamente o perfil protegido em uma conta adulta. */
export function faixasDoMenor(
  nascimento: MesEAno,
  agora: MesEAno,
): {
  social: "ate_12" | "13_17";
  classificacao: FaixaDoMenor;
  precisaContaAdulta: boolean;
} {
  const idade = idadeNoMes(nascimento, agora);
  const classificacao =
    idade >= 16
      ? "16"
      : idade >= 14
        ? "14"
        : idade >= 12
          ? "12"
          : idade >= 10
            ? "10"
            : idade >= 6
              ? "6"
              : "L";
  return {
    social: idade <= 12 ? "ate_12" : "13_17",
    classificacao,
    precisaContaAdulta: idade >= 18,
  };
}
