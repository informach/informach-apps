import { levenshtein, normalize } from "@/features/subjects/utils";

/**
 * Resolve um `subjectHint` (texto livre devolvido pela IA) ao ID de uma
 * matéria existente na turma escolhida pelo usuário. Três passos, do mais
 * conservador ao mais permissivo:
 *
 *   1. **Match exato pós-normalize** (sem acento, lowercase, sem pontuação).
 *      Cobre 100% dos casos quando a IA devolve forma canônica e a matéria
 *      cadastrada também está canônica.
 *
 *   2. **Match por grupo de aliases** (SUBJECT_ALIAS_GROUPS abaixo). Cobre
 *      pares que escolas brasileiras usam intercambiavelmente mas têm
 *      distância de edição alta: "Português" ↔ "Língua Portuguesa", "Mat" ↔
 *      "Matemática", "Ed Física" ↔ "Educação Física", etc. Sem isso a IA
 *      pode devolver "Português" e a turma ter "Língua Portuguesa" e o
 *      combobox ficar vazio mesmo o documento dizendo a matéria explícita.
 *
 *   3. **Distância de edição (Levenshtein) ≤ 3 pós-normalize**. Mesma régua
 *      de `isMinorNameEdit` — cobre erro de digitação ("matemtica" →
 *      "matematica"). NÃO cobre aliases longos (vide passo 2).
 *
 * Quando há mais de um candidato com distância igual no passo 3, retorna o
 * primeiro (lista de matérias da turma é pequena e estável; comportamento
 * determinístico vence o "melhor empate teórico").
 *
 * Pensado para rodar no client (cabe na lista já carregada de
 * `turmasForForm[turmaId].subjects`), mas é puro e roda no server também
 * — usado em `enrich.ts` server-side e nos batch confirm dialogs cliente.
 */
const MAX_MATCH_DISTANCE = 3;

/**
 * Grupos de aliases reconhecidos por escolas brasileiras. Cada grupo é uma
 * lista de strings JÁ NORMALIZADAS (sem acento, lowercase, sem pontuação) —
 * `normalize()` é o helper canônico (`features/subjects/utils.ts`).
 *
 * Match dentro de um grupo é simétrico: se hint vira "portugues" e algum
 * subject vira "lingua portuguesa", ambos pertencem ao grupo de Português
 * e o subject casa.
 *
 * Para adicionar novo alias: edite o grupo correspondente OU adicione um
 * grupo novo. Cada string DEVE ser pré-normalizada (rode `normalize()`
 * mentalmente). Aliases muito curtos (≤ 2 chars, ex.: "lp", "ef", "er")
 * só casam em Pass 2 quando hint OU subject está literal nessa forma — não
 * geram colisões via Levenshtein porque Pass 1 (exato) e Pass 2 (alias)
 * rodam antes.
 */
const SUBJECT_ALIAS_GROUPS: ReadonlyArray<ReadonlyArray<string>> = [
  // Português / Língua Portuguesa
  ["portugues", "lingua portuguesa", "lp"],
  // Matemática
  ["matematica", "matematicas", "mat", "calculo", "aritmetica"],
  // Ciências (Fundamental — Bio/Física/Química unificadas)
  ["ciencias", "ciencias da natureza", "ciencia"],
  // Biologia (Médio — separada de Ciências)
  ["biologia", "bio"],
  // Química
  ["quimica", "qui"],
  // Física
  ["fisica", "fis"],
  // História
  ["historia", "hist"],
  // Geografia
  ["geografia", "geo", "geografia geral"],
  // Educação Física
  ["educacao fisica", "ed fisica", "ed fis", "edu fisica", "ef"],
  // Inglês / Língua Inglesa
  ["ingles", "lingua inglesa", "eng"],
  // Espanhol / Língua Espanhola
  ["espanhol", "lingua espanhola", "esp"],
  // Artes
  ["arte", "artes", "educacao artistica", "arte visual", "artes visuais"],
  // Música
  ["musica", "ed musical", "educacao musical"],
  // Ensino Religioso
  ["ensino religioso", "religiao", "er"],
  // Filosofia
  ["filosofia", "filo"],
  // Sociologia
  ["sociologia", "socio"],
  // Redação / Produção de Texto
  ["redacao", "producao de texto", "producao textual"],
  // Literatura
  ["literatura", "lit"],
  // Informática / Computação
  ["informatica", "computacao", "comp"],
  // Robótica
  ["robotica"],
  // Geometria
  ["geometria", "desenho geometrico"],
] as const;

// Map<normalized_alias, group_index> pra lookup O(1). Construído uma vez no
// boot do módulo; SUBJECT_ALIAS_GROUPS é estático.
const ALIAS_TO_GROUP_INDEX = new Map<string, number>();
for (let i = 0; i < SUBJECT_ALIAS_GROUPS.length; i += 1) {
  const group = SUBJECT_ALIAS_GROUPS[i];
  if (!group) continue;
  for (const alias of group) {
    ALIAS_TO_GROUP_INDEX.set(alias, i);
  }
}

/**
 * Retorna o índice do grupo de aliases ao qual a string normalizada
 * pertence, ou null se não pertencer a nenhum.
 */
function findAliasGroupIndex(normalized: string): number | null {
  return ALIAS_TO_GROUP_INDEX.get(normalized) ?? null;
}

export type SubjectChoice = { readonly id: string; readonly name: string };

export function findClosestSubject<T extends SubjectChoice>(
  subjects: readonly T[],
  hint: string | null | undefined,
): T | null {
  if (!hint) return null;
  const normalizedHint = normalize(hint);
  if (!normalizedHint) return null;

  // Pass 1: igualdade pós-normalize.
  for (const subject of subjects) {
    if (normalize(subject.name) === normalizedHint) {
      return subject;
    }
  }

  // Pass 2: grupo de aliases. Se o hint pertence a algum grupo conhecido,
  // procura o primeiro subject cujo nome normalizado também caia no mesmo
  // grupo. Cobre "Português" ↔ "Língua Portuguesa", "Mat" ↔ "Matemática",
  // etc. — pares com distância de edição grande que escapariam do Pass 3.
  const hintGroupIndex = findAliasGroupIndex(normalizedHint);
  if (hintGroupIndex !== null) {
    for (const subject of subjects) {
      const subjectGroupIndex = findAliasGroupIndex(normalize(subject.name));
      if (subjectGroupIndex === hintGroupIndex) {
        return subject;
      }
    }
  }

  // Pass 3: distância ≤ MAX_MATCH_DISTANCE. Curto-circuito por diferença
  // de tamanho — útil pra listas curtas mas escala bem.
  let best: { subject: T; distance: number } | null = null;
  for (const subject of subjects) {
    const normalizedSubject = normalize(subject.name);
    if (Math.abs(normalizedSubject.length - normalizedHint.length) > MAX_MATCH_DISTANCE) {
      continue;
    }
    const distance = levenshtein(normalizedSubject, normalizedHint);
    if (distance > MAX_MATCH_DISTANCE) continue;
    if (!best || distance < best.distance) {
      best = { subject, distance };
    }
  }

  return best?.subject ?? null;
}
