export const MAX_ACTIVITY_TITLE_LENGTH = 200;
export const MAX_ACTIVITY_DESCRIPTION_LENGTH = 2000;

// Paginação da listagem /atividades (cursor-based, forward-only).
// 30 cobre ~1-2 semanas de atividades por perfil em uso normal.
export const DEFAULT_ACTIVITIES_PAGE_SIZE = 30;
export const MAX_ACTIVITIES_PAGE_SIZE = 100;

// Plano Free pode cadastrar até 20 atividades; Pro é ilimitado. Conta toda
// row em agenda.activities com created_by_user_id = userId, independente
// do status. Excluir libera vaga; marcar como done NÃO libera. Espelha o
// pattern de FREE_RECIPE_LIMIT no cozya.
export const FREE_ACTIVITY_LIMIT = 20;
