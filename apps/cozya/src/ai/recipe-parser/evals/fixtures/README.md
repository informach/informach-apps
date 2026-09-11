# Origem das imagens

As cinco imagens são materiais sintéticos autorais criados para testes do Cozya em 11/09/2026, reproduzíveis por `scripts/generate-eval-fixtures.ps1`. Não contêm páginas de livros/blogs de terceiros. A variante de caderno usa a fonte Segoe Print; não é uma amostra real de caligrafia humana. Os nomes dos quatro primeiros arquivos preservam os IDs históricos do dataset.

Os textos e quantidades esperados estão no gerador e em `dataset.ts`. A paisagem é uma ilustração geométrica sem receita. A página danificada representa quantidades ilegíveis e precisa ser recusada.

Este conjunto verifica extração, medidas e rejeição em condições controladas. Não comprova segurança culinária nem desempenho sobre fotos reais. Antes de divulgar qualidade para manuscritos, incorporar amostras reais autorizadas e revisão humana, mantendo registro da permissão e da transcrição conferida.

As duas buscas na web têm fonte e disponibilidade externas ao teste. São avaliadas em duas dimensões: fidelidade ao pedido/fonte (ou recusa explícita sem entregar receita errada) e disponibilidade de uma receita correspondente, registrada como 0 ou 1. A referência pode conter uma recusa segura; isso não representa 100% de sucesso de busca. Falha de provedor, fonte forjada ou receita que omita um requisito sempre reprovam. Um snapshot também reprova quando nenhuma busca entrega resultado. As execuções seguintes comparam a disponibilidade de cada caso com a referência, além dos critérios críticos. Essa distinção foi introduzida depois que a busca de torta encontrou uma fonte sem o chantilly pedido; o produto passou a recusar essa divergência sem consumir crédito.

Execução: `EVAL_PREFLIGHT=1` verifica arquivos sem chamar modelos; `EVAL_SNAPSHOT=1` só grava uma nova referência após todos os casos passarem; execução normal exige baseline completo. Chamadas de avaliação são pagas e não usam créditos de clientes. Custos retornados pelo provedor ficam em `tmp/evals-latest.json`; ausência de custo significa desconhecido.
