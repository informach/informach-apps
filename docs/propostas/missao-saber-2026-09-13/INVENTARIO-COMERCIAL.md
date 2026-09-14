# Inventário do catálogo comercial

Inventário produzido a partir do catálogo carregado pela aplicação em 13/09/2026. A função executável `catalogInventory()` verifica as mesmas contagens e relações nos testes.

## Totais

| Medida | Total |
| --- | ---: |
| Missões de ensino e prática | 61 |
| Bancos reservados | 8 |
| Atividades de ensino e prática | 508 |
| Atividades reservadas | 96 |
| IDs únicos | 604 |
| Assinaturas distintas de enunciado + solução | 604 |
| Tarefas de justificativa | 37 |
| Famílias semânticas de ensino e prática | 271 |
| Famílias semânticas reservadas | 52 |

## Distribuição curricular

| Domínio | Ensino/prática | Avaliação reservada | Total |
| --- | ---: | ---: | ---: |
| Base comum | 300 | 0 | 300 |
| OLITEF | 96 | 24 | 120 |
| Canguru | 42 | 48 | 90 |
| OBMEP | 70 | 24 | 94 |
| **Total** | **508** | **96** | **604** |

O ajuste de quatro atividades acima da referência OBMEP preserva a meta global e decorre das 96 formas reservadas completas. A base comum é compartilhada sem ser recontada por curso.

## Formatos e finalidade

| Formato | Total |
| --- | ---: |
| Alternativas | 457 |
| Resposta numérica | 73 |
| Ordenação | 37 |
| Justificativa formativa | 37 |

| Finalidade | Total |
| --- | ---: |
| Descoberta | 121 |
| Prática guiada | 230 |
| Prática independente | 157 |
| Avaliação reservada | 96 |

## Cobertura por habilidade

| Habilidade | Total de atividades |
| --- | ---: |
| Frações | 64 |
| Porcentagem | 48 |
| Comparação de preços | 46 |
| Planejamento financeiro | 46 |
| Área e perímetro | 52 |
| Simetria e transformações | 50 |
| Contagem organizada | 54 |
| Princípio das gavetas | 46 |
| Probabilidade | 48 |
| Paridade e restos | 50 |
| Padrões e generalização | 50 |
| Lógica e argumentos | 50 |

## Integridade automatizada

O inventário falha nos testes quando encontra ID ou assinatura duplicada, caminho ou pré-requisito não resolvido, sobreposição entre famílias de treino e avaliação, atividade reservada exposta em missão, item de treino incluído em banco reservado, conflito estrutural dentro de uma família, alias estrutural entre famílias ou repetição de família no mesmo banco. Famílias equivalentes conservam a mesma chave entre cursos; números diferentes não aumentam a diversidade. O diagnóstico usa problemas diretos e o simulado usa problemas de verificação de solução, mantendo transferência inédita mesmo após o diagnóstico.

O teste também envia a solução de todas as 604 atividades ao motor e envia todos os distratores das atividades objetivas, verificando o contrato de correção. A conferência item a item é registrada por 604 hashes SHA-256 em `reviewed-catalog.ts`; qualquer item ausente ou alterado invalida o catálogo até nova conferência. Oráculos independentes cobrem os cálculos críticos e as 37 justificativas têm respostas-modelo distintas, completas e vinculadas às rubricas.

As checagens comprovam consistência estrutural e preservação exata do catálogo conferido. A conferência não é apresentada como revisão humana de Helena nem como validação de eficácia com estudantes.
