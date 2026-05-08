import "server-only";

/**
 * Prompt para o passo de pesquisa em
 * `cozya.recipe.generate_from_prompt`. Recebe a referência curta do usuário
 * (ex: "bolo de cenoura do Jacquin") e instrui o modelo a procurar a versão
 * mais popular em fontes brasileiras, devolvendo texto puro estruturado que
 * o `recipeParser` agent (Mastra) consegue extrair sem ajuste.
 *
 * Quando nenhuma receita popular for encontrada, o modelo deve responder
 * apenas a string literal `NAO_ENCONTRADA` — o service detecta esse caso e
 * retorna `{ isValidRecipe: false }`, evitando alucinação.
 */
export function buildResearchPrompt(userPrompt: string): string {
  return `Você é um especialista em culinária brasileira. O usuário pediu:

"${userPrompt}"

Tarefa:
1. Identifique a receita que o usuário quer.
2. Faça uma busca na web priorizando fontes em português brasileiro
   (Panelinha, Tudo Gostoso, GNT, Receiteria, blogs de chefs brasileiros).
   Quando o usuário citar um chef específico, prefira fontes oficiais
   ou entrevistas com aquele chef.
3. Escolha a versão mais popular ou mais bem avaliada (mais comentários,
   mais compartilhamentos, classificada como "tradicional"/"clássica").
4. Retorne em texto puro (sem markdown, sem emojis, sem links), em
   português do Brasil, com a estrutura exata:

NOME: <nome>

INGREDIENTES:
<quantidade> <unidade> de <ingrediente>
<...>

MODO DE PREPARO:
<passo 1>
<passo 2>
...

FINALIZAÇÃO (opcional, só se for natural):
<observações de servir/apresentação>

Se nenhuma receita popular brasileira corresponder, responda APENAS a
palavra: NAO_ENCONTRADA`;
}
