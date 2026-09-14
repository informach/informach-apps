# Matriz curricular comercial

Data de consolidação: 13/09/2026. Esta matriz descreve o recorte vendido nesta versão: 6º e 7º anos, com OLITEF N1, Canguru E, Canguru B e OBMEP N1. Os nomes das olimpíadas identificam a finalidade de preparação independente; todas as atividades publicadas são autorais.

## Base compartilhada

| Habilidade | Pré-requisito conceitual | Progressão observável | Uso nas trilhas |
| --- | --- | --- | --- |
| Frações e referência | Divisão em partes iguais | parte/todo → equivalência → operações e escala → comparação argumentada | quatro trilhas |
| Porcentagem | frações decimais e multiplicação | base → parte e taxa → mudanças sucessivas → cálculo inverso | OLITEF N1 |
| Comparação de preços | divisão e unidades | preço unitário → custos adicionais → quantidade útil e custo de uso | OLITEF N1 |
| Planejamento financeiro | adição e subtração | entradas/saídas → metas → restrições, reserva e replanejamento | OLITEF N1 |
| Área e perímetro | medidas e multiplicação | contorno/cobertura → decomposição → escala e medida indireta | Canguru E/B e OBMEP N1 |
| Simetria e transformações | localização em malha | reflexão → rotação/translação → composição | Canguru E/B |
| Contagem organizada | listagem e multiplicação | lista exaustiva → escolhas em etapas → casos e restrições | Canguru E/B e OBMEP N1 |
| Princípio das gavetas | divisão e teto | primeira repetição → pior caso → garantias e classes de resto | OBMEP N1 |
| Probabilidade | fração e contagem | casos equiprováveis → etapas → modelo e frequência | OLITEF N1 e Canguru B |
| Paridade e restos | divisão inteira | paridade → classes de resto → ciclos | Canguru B e OBMEP N1 |
| Padrões e generalização | operações e posição | regra verbal → termo geral → diferenças e recorrência | Canguru E e OBMEP N1 |
| Lógica e argumentos | leitura de condições | pistas → implicação → negação, contradição e contraexemplo | Canguru E/B e OBMEP N1 |

Cada habilidade tem cinco missões de progressão; frações tem uma sexta missão porque o laboratório dos quatro formatos foi preservado como ponte explícita. Os pré-requisitos estão gravados por ID no catálogo. A recomendação percorre a ordem do curso e pode recuperar uma habilidade vencida sem transformar pré-requisito em bloqueio burocrático.

## Percursos contratados

| Curso | Faixa publicada | Habilidades | Missões no percurso | Diferenciação |
| --- | --- | ---: | ---: | --- |
| Dinheiro com propósito | OLITEF N1, 6º e 7º | 5 | 26 | decisões financeiras, porcentagens, comparação e planejamento |
| Olhar de explorador | Canguru E, 6º | 6 | 24 | quatro camadas por habilidade, maior apoio visual e descoberta |
| Conectar ideias | Canguru B, 7º | 7 | 36 | cinco camadas, restos, probabilidade e argumentos integrados |
| Pensar além da conta | OBMEP N1, 6º e 7º | 7 | 36 | estratégias, contagem, garantias e justificativas progressivas |

Os caminhos são listas explícitas de IDs montadas a partir de `progressionBySkill`; nenhuma decisão de próxima missão depende de um sufixo no nome. O percurso Canguru E termina após quatro camadas por habilidade no recorte atual. O Canguru B usa as cinco camadas e acrescenta paridade e probabilidade.

## Estrutura didática das missões

As 61 missões alternam descoberta, prática guiada, aplicação independente, ordenação de método e justificativa. Cada nova missão comercial contém dez atividades: duas de descoberta, quatro de prática guiada, duas aplicações independentes, uma organização de estratégia e uma justificativa. As 25 missões preservadas foram validadas no mesmo contrato e conservam seus IDs para manter histórico e snapshots.

Pistas seguem três níveis: lembrar a ideia, aplicá-la ao caso e mostrar a resolução guiada. Em avaliações, as pistas e a correção ficam indisponíveis até a conclusão. Tarefas abertas registram reflexão e não fabricam acerto ou domínio.

## Avaliações reservadas

Cada curso possui dois bancos separados de 12 atividades:

- `bank:diagnostic:<curso>` orienta o ponto de partida;
- `bank:exam:<curso>` observa transferência depois do estudo.

São 96 IDs e assinaturas de atividade distintos, organizados em 52 famílias semânticas efetivamente usadas. O catálogo dispõe de até três estruturas diretas por habilidade para diagnóstico e três estruturas de verificação de solução para simulado. Suas famílias começam com `<habilidade>:assess:`, preservam a mesma chave em cursos equivalentes e não se sobrepõem às famílias de treino. Trocar nomes ou números mantém a família e não aumenta a diversidade.

O snapshot registra banco, versão e famílias exatos. O perfil acumula a exposição entre cursos e percursos incompletos: depois que uma família foi vista, a interface passa a chamar a nova composição de prática ou percurso misto, sem anunciar uma avaliação totalmente inédita. Diagnóstico e simulado usam famílias semanticamente diferentes, por isso o diagnóstico não consome artificialmente a novidade da avaliação de transferência.

## Limites de alegação

O catálogo não contém PDF, imagem, nome de personagem, número ou enunciado retirado de prova oficial. Os materiais baixados ficam no acervo de pesquisa para entender competências, profundidade e formatos. Concluir o percurso não garante inscrição, classificação ou medalha, e a oferta não anuncia outros anos ou níveis ainda não implementados.
