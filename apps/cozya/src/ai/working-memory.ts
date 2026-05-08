/**
 * Template de working memory do cozya. Persiste por `resource` (ou seja, por
 * usuário) entre todos os threads do mesmo `userId`. O agente lê e atualiza
 * este bloco automaticamente quando working memory está habilitado em
 * `Memory({ options: { workingMemory: { enabled, scope: "resource", template } } })`.
 *
 * Markdown deliberadamente curto: campos demais empurram o agente a inventar
 * (ou a inflar tokens em todo prompt). Quando vazio, o agente sabe que não há
 * informação registrada — não é encorajado a especular.
 */
export const COZYA_WORKING_MEMORY_TEMPLATE = `# Perfil culinário do usuário

## Restrições alimentares
- Alergias:
- Restrições religiosas/éticas (ex.: kosher, halal, vegano):
- Outras:

## Preferências
- Cozinhas favoritas:
- Sabores que evita:
- Equipamentos disponíveis (ex.: airfryer, panela elétrica):

## Notas livres
-
`;

/**
 * Builder do thread id usado em `agent.generate({ memory: { thread, resource } })`.
 * Threads são per-feature por usuário — assim trocas conversacionais de uma
 * feature (refine) não vazam na timeline de outra (parse de URL). Working
 * memory continua compartilhada entre threads via `scope: "resource"`.
 *
 * Resource id é o próprio `userId` — alinha com `withCredits({ owner: { type: "user", id } })`.
 */
export function cozyaThreadId(userId: string, feature: string): string {
  return `cozya:${feature}:${userId}`;
}
