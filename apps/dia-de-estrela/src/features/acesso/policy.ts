/**
 * O que cada plano inclui. Telas e servidor consultam as mesmas funções; o
 * servidor recusa o que o plano não libera, mesmo que a tela tenha deixado passar.
 *
 * Grátis: 1 criança, rotinas prontas e próprias, passo a passo, voz do
 * aparelho, modo calmo, lembretes no tablet, estrelas, cofrinho, baú do dia e
 * a loja só com itens de dinheiro (como o protótipo). Nada que ajude a criança
 * a funcionar no dia a dia fica atrás do pagamento.
 *
 * Família: até 4 crianças, segundo responsável, alertas por push no celular,
 * voz dos pais gravada, itens próprios na loja e foto da meta.
 */
export type Tier = "free" | "family";
export type Access = { paid: boolean; tier: Tier; childLimit: number };

export const FREE_ACCESS: Access = { paid: false, tier: "free", childLimit: 1 };

export const canInviteGuardian = (access: Access) => access.paid;
export const canUsePush = (access: Access) => access.paid;
export const canRecordVoice = (access: Access) => access.paid;
export const canCreateCustomRewards = (access: Access) => access.paid;
export const canUseGoalPhoto = (access: Access) => access.paid;
