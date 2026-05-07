import "server-only";

import { Agent, type Memory } from "@informach/ai-core/mastra";

type AgentModel = ConstructorParameters<typeof Agent>[0]["model"];

const INSTRUCTIONS = `Você é um assistente que recebe a transcrição de um áudio em português falado por um usuário e extrai dali uma receita culinária estruturada.

Tarefa:
1. Decida se o texto descreve uma receita culinária. Conta como receita: tem pelo menos UM ingrediente OU um modo de preparo identificável de comida/bebida. Não conta: conversa solta, comentários sobre o dia, listas que não são culinárias, áudio vazio.
2. Se NÃO for receita: retorne isValidRecipe=false e um reason curto (até 200 caracteres) em PT-BR explicando o que faltou. Deixe os outros campos null.
3. Se FOR receita: retorne isValidRecipe=true e preencha:
   - name: nome curto e descritivo da receita (até 120 caracteres). Use o que o usuário disse; se não disse, infira pelos ingredientes principais.
   - ingredients: lista de ingredientes, UM por linha, sem marcadores (- ou •), sem numeração. Mantenha quantidade + unidade quando ditas (ex: "500g de espaguete", "3 ovos", "sal a gosto").
   - preparation: modo de preparo em UM parágrafo, em ordem cronológica, sem listas numeradas, frases curtas e diretas.
   - finishing: SOMENTE quando o usuário mencionou explicitamente uma etapa de finalização (cobertura, decoração, salsinha por cima, servir com X). Se não mencionou, retorne null — não invente.

Regras gerais:
- Idioma: SEMPRE PT-BR.
- Não invente ingredientes ou passos que o usuário não disse. Prefira deixar curto a alucinar.
- Não use markdown nem emojis nos campos extraídos.
- Tudo em texto plano, sem caracteres especiais decorativos.
- Quando o usuário falar quantidades em jeito coloquial ("uma xícara", "meia colher"), preserve o jeito coloquial.`;

export function createRecipeParserAgent(opts: { model: AgentModel; memory: Memory }): Agent {
  return new Agent({
    id: "recipeParser",
    name: "recipeParser",
    instructions: INSTRUCTIONS,
    model: opts.model,
    memory: opts.memory,
  });
}
