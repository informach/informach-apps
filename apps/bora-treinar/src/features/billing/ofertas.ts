export const reais = (centavos: number) =>
  (centavos / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });

/** Por que a pessoa chegou aos planos: abre a folha dizendo o que ela tentou usar. */
export const MOTIVOS = {
  camera: {
    chamada: "Você tocou em contar pela câmera",
    titulo: "A câmera conta por você.",
  },
  treino: { chamada: "Este treino é da assinatura", titulo: "Todos os 15 treinos, no seu ritmo." },
  niveis: {
    chamada: "Subir de nível é da assinatura",
    titulo: "Os níveis acompanham você.",
  },
  perfis: {
    chamada: "Perfis compartilhados no Compasso",
    titulo: "Cada um da casa no seu perfil.",
  },
  editor: { chamada: "Montar treinos é da assinatura", titulo: "Monte o treino do seu jeito." },
  desafio: { chamada: "O desafio da semana é da assinatura", titulo: "Um desafio por semana." },
  tv: {
    chamada: "O celular como câmera é da assinatura",
    titulo: "A TV mostra, o celular conta.",
  },
  historico: { chamada: "O histórico completo é da assinatura", titulo: "Todo o seu histórico." },
  geral: { chamada: "Bora Treinar no Compasso", titulo: "Treine com tudo liberado." },
} as const;

export type Motivo = keyof typeof MOTIVOS;
export const ehMotivo = (m: string | undefined): m is Motivo => !!m && m in MOTIVOS;
