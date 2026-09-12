export const MAX_ACTIVITY_TITLE_LENGTH = 200;
export const MAX_ACTIVITY_DESCRIPTION_LENGTH = 2000;

// Paginação da listagem /atividades (cursor-based, forward-only).
// 30 cobre ~1-2 semanas de atividades por perfil em uso normal.
export const DEFAULT_ACTIVITIES_PAGE_SIZE = 30;
export const MAX_ACTIVITIES_PAGE_SIZE = 100;

// Limite comum de pendências próprias: escolares, extras e ações de recados.
// Concluir libera espaço, mantendo o histórico. Compartilhamentos recebidos não contam.
export const FREE_ACTIVITY_LIMIT = 20;
