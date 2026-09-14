# Verificação da entrega

```text
VERIFICATION REPORT
-------------------
Claim: Integridade dos arquivos locais, leitura de PDFs, links locais e cálculos dos exemplos.
Command: python -X utf8 docs/propostas/missao-saber-2026-09-13/scripts/verificar_entrega.py
Executed: 2026-09-13T12:29:54.249482+00:00
Exit code: 0
Output summary: 1105 arquivos; 1104 PDFs; 12123 páginas; 692 links locais; 0 erros.
Warnings: 253 PDFs com avisos internos de estrutura; 82 PDFs com alguma página de pouco texto extraível.
Errors: 0
Verdict: PASS
```

O [resultado detalhado](acervo/verificacao.json) contém os arquivos afetados, avisos do parser, cálculos e cobertura. Os PDFs foram preservados exatamente como baixados, com tamanho e SHA-256 conferidos. Avisos internos de estrutura não foram tratados como revisão editorial aprovada: cada uso curricular continua sujeito a inspeção. Páginas com pouco texto podem conter figuras, capas ou digitalizações; essa marca é uma triagem para OCR, não diagnóstico automático de defeito.

## Conferências realizadas

- Todos os arquivos classificados como baixados foram encontrados no disco e tiveram tamanho e hash conferidos.
- Todas as páginas dos PDFs diretos e dos PDFs distintos extraídos do ZIP puderam ser abertas e submetidas à extração textual; a qualidade semântica da extração não foi certificada.
- O ZIP POTI passou pela verificação CRC; membros foram extraídos para nomes locais controlados, sem executar arquivos do pacote.
- Os links locais dos documentos foram conferidos. As fontes web foram consultadas durante a pesquisa; a verificação local não repete todas as requisições externas.
- Os exemplos de descontos e área/perímetro foram recalculados. A garantia de pares dos problemas de cartões foi verificada por enumeração de **80587 combinações**, além dos contraexemplos de minimalidade.
- O cenário econômico foi recalculado: contribuição de R$ 20,14 por conta e 1.242 contas para cobrir R$ 25 mil/mês de custo fixo, sob as premissas da proposta.

## Inspeção visual declarada

Foram renderizadas e inspecionadas seis páginas de seis PDFs: caderno OLITEF N1 p. 3, N2 p. 25, N3 p. 33; Canguru E 2026 p. 2; prova OBMEP 2025 F2 N1 p. 1 e respectivas soluções p. 1. O [registro da amostra](acervo/amostra-visual.json) aponta os originais e as [imagens locais](acervo/previas/).

Nas páginas observadas, os textos e diagramas estavam visíveis e legíveis. A amostra evidenciou a importância de preservar relações espaciais e figuras; a extração textual não basta para interpretá-las. Na licença do caderno N1, o ícone apresenta SA enquanto o texto e a URL indicam ND; a inconsistência foi registrada na política autoral.

## Correspondência com o pedido

| Pedido | Entrega | Limite explícito |
| --- | --- | --- |
| Proposta útil e vendável | Proposta de valor, compradores, alternativas, preços de teste, custos e piloto | Não houve entrevistas nem validação de disposição a pagar |
| Inspiração no Duolingo | Missões, jornada, hábito, revisão e personalização | Matemática também exige aprofundamento e justificativa |
| Estudar Brilliant com a sessão fornecida | Navegação autenticada, dois trechos de aulas, tentativa e ajuda em porcentagens; estudo e requisitos incorporados | Amostra exploratória, sem conclusão de cursos nem avaliação longitudinal do tutor |
| Didática e funcionalidades | Arquitetura pedagógica, experiências, métricas e prioridades | Eficácia do app ainda precisa ser medida |
| Evoluir quiz-escolar ao lado dos outros apps | Análise do legado, portfólio, arquitetura e migração | Nenhum app foi implementado nesta entrega |
| Materiais de todos os anos e níveis | Downloads, origens, hashes e quadro de cobertura | Existem lacunas registradas no acervo; não há alegação de completude universal |
| Conteúdo integralmente autoral | Política de autoria, currículo e três aulas de exemplo | Cursos completos e segunda revisão humana ainda serão produzidos |

O [quadro de cobertura](acervo/cobertura.json) distingue prova, solução, nível, fase e edição. Integridade de arquivo não prova completude histórica, correção de cada gabarito ou licença de uso. Não foram executados build ou testes dos aplicativos, pois a entrega altera documentação, scripts de pesquisa e a exclusão local do acervo no Git, sem modificar o código dos produtos.
