import type { PlanoDeDireitos } from "./preparacao-contrato";

/** O plano completo continua íntegro por SHA. Consentimento compara vínculos
 * e autoridade; fotografias/diário/cerca são capturados novamente pelo executor
 * sob trava. Progresso automático não deve tornar a prévia impossível de usar. */
function escopo(plano: PlanoDeDireitos) {
  return {
    tipo: plano.tipo,
    contaId: plano.contaId,
    perfis: plano.perfis,
    mundos: plano.mundos.map((m) => ({
      id: m.id,
      jogo: m.jogo,
      gestao: m.gestao,
      outrosParticipantes: m.outrosParticipantes,
    })),
    ...(plano.formato === "recreio-previa-encerramento-v2"
      ? {
          formato: plano.formato,
          revisaoDaParticipacao: plano.revisaoDaParticipacao,
          financeiro: plano.financeiro,
        }
      : {}),
  };
}
export function mesmoEscopoDeDireitos(anterior: PlanoDeDireitos, atual: PlanoDeDireitos) {
  return JSON.stringify(escopo(anterior)) === JSON.stringify(escopo(atual));
}
