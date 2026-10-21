# EdiSVG — full review do restante do lote 5

Data: 20/10/2026. Escopo: incrementos 5.24 a 5.36 na branch `feat/edisvg-lote-5-restante` ([PR #29](https://github.com/informach/informach-apps/pull/29)), projeto v23 e blueprint interativo v12. Revisa o que foi implementado e testado. Não atesta paridade com Rive, compatibilidade `.riv`, React Native nem desempenho superior. A trilha técnica de cada perfil está no review do incremento correspondente, que agora também registra os achados deste full review.

## Resultado

Os treze incrementos autorizados em 20/10 estão implementados, cada um com review próprio, testes e commit. O full review revisou a branch inteira em quatro frentes independentes (entrada/exportação, SVG avançado, consumidores/rig e tipografia/lógica) e encontrou 18 defeitos. Todos foram corrigidos com teste de regressão. O CI do PR achou mais um, também corrigido. Nenhum achado foi rebaixado a aviso nem contornado com supressão.

| Incremento | Perfil entregue | Review |
| --- | --- | --- |
| 5.24 | Sequência PNG, GIF, MP4 e WebM desenhados pelo player visual compartilhado | [exportação raster](review-lote-5-exportacao-raster.md) |
| 5.25 | `use`/`symbol` locais importados como cópias editáveis | [use/symbol](review-lote-5-svg-use-symbol.md) |
| 5.26 | Padrões como variante da pintura tipada (projeto v23/blueprint v12) | [padrões](review-lote-5-padroes.md) |
| 5.27 | Filtros tipados, cadeia de até 16 primitivas | [filtros](review-lote-5-filtros.md) |
| 5.28 | Máscaras de luminância e pintadas | [máscaras pintadas](review-lote-5-mascaras-pintadas.md) |
| 5.29 | Trim no SVG animado e na Lottie | [trim nos consumidores](review-lote-5-trim-consumidores.md) |
| 5.30 | Ordem de desenho animável em degraus | [ordem de desenho](review-lote-5-ordem-de-desenho.md) |
| 5.31 | Shaping verificável por features OpenType e direção automática | [shaping e bidi](review-lote-5-shaping-bidi.md) |
| 5.32 | Texto em caminho | [texto em caminho](review-lote-5-texto-em-caminho.md) |
| 5.33 | Malha raster deformável por skin e morph | [malha raster](review-lote-5-malha-raster.md) |
| 5.34 | Nome/descrição acessíveis ligados a inputs e regiões vivas | [semântica dinâmica](review-lote-5-semantica-dinamica.md) |
| 5.35 | Fórmulas declarativas tipadas, sem execução de código | [fórmulas](review-lote-5-formulas.md) |
| 5.36 | Fontes WOFF 1.0/TTC e imagens PNG na Lottie | [fontes externas e imagens](review-lote-5-fontes-externas-lottie-imagens.md) |

## Achados corrigidos

**Entrada, exportação e ferramentas**

1. (A1) Cópias de `use`/`symbol` duplicavam gradientes, recortes, máscaras e filtros definidos dentro do conteúdo copiado, e as definições internas de um `symbol` sumiam junto com ele. Agora as definições vão uma vez para o `defs` raiz e saem das cópias. Dois SVGs novos comparam pixels com o Chromium.
2. (A2) No modo `once`, o último quadro exportado não caía na pose final do clip. O plano de quadros fixa o último instante na duração.
3. (A3) `pnpm edi:open` apagava o perfil temporário com o Electron ainda aberto quando falhava depois de lançar, e um Ctrl+C antes de a janela abrir não limpava nada. A limpeza agora fecha a aplicação lançada em qualquer saída (registrando falha ao fechar), e o tratador de interrupção é registrado antes do build.

**SVG avançado**

4. (B1) O player calculava a pintura herdada das fontes de máscara pintada só dentro de cada escopo de componente; a cena estática herda da prancheta inteira. Um componente dentro de um grupo com `fill-opacity` falhava ao montar com "Recorte/máscara SVG não corresponde à definição tipada". Cada escopo de componente agora parte da pintura herdada no seu viewport. O E2E novo reproduz o erro sem a correção e compara pixels com a cena estática depois dela.
5. (B2) Larguras de contorno com unidade (`pt`, `mm`) eram lidas com `Number()` na região da máscara pintada. Agora são convertidas para px; unidades relativas (`em`, `%`) são recusadas com motivo ao montar o contexto, nunca no meio de um quadro.
6. (B3) O teto de definições de filtro era contado por prancheta, mas o fechamento de componentes publica as definições do projeto juntas. O teto passou a valer para o projeto.
7. (B4) `color-interpolation-filters="auto"` caía em linearRGB; o navegador desenha como sRGB, e a importação passou a fazer o mesmo.
8. (B5) Num padrão com `viewBox`, `patternContentUnits="objectBoundingBox"` era respeitado, mas o SVG o ignora nesse caso. A importação agora usa o espaço do usuário.

**Consumidores e rig**

9. (C1) Numa prancheta com layout responsivo, a ordem de desenho animada e os slots do layout disputavam a ordem dos mesmos filhos. A validação do projeto recusa essa combinação.
10. (C2) O reordenamento do DOM guardava uma âncora fixa e podia mover os membros para depois da sobreposição do editor. Agora ele insere antes do irmão seguinte ao último membro e não mexe quando os membros já saíram do contêiner. E2E com sobreposição.
11. (C3) A dilatação dos recortes por triângulo da malha raster era desigual em ângulos agudos. Cada aresta agora é afastada meio pixel ao longo da normal, com limite de esquadria.
12. (C4) O ponto distante que esconde pontas aparadas na Lottie podia estourar coordenadas sob escalas pequenas. Agora vem da inversa da transformação global composta, com teto de magnitude e alternativa segura.
13. (C5) A restrição "seguir caminho" aceitava como alvo um objeto que não era caminho. Agora exige um `path` com contorno.

**Tipografia e lógica**

14. (D1) Uma fonte hostil podia fazer a leitura de GSUB/GPOS repetir registros compartilhados até explodir o trabalho. A leitura memoriza cada LangSys e tabela de script, remove duplicatas e divide um orçamento único.
15. (D2) A conversão WOFF/TTC não conferia checksums de tabela e descompactava sem limitar a saída. Os checksums são conferidos contra o WOFF e o diretório da coleção; a descompressão em streaming para ao exceder o tamanho declarado e exige o tamanho exato.
16. (D3) Fórmulas podiam apontar para inputs de lista ou cor, que não sabem calcular. Agora são recusadas.
17. (D4) Resultados fora do intervalo de `double` viravam infinito ou NaN. Agora saturam, e NaN vira 0.
18. (D5) A ida e volta texto ↔ árvore perdia números com expoente e escapes de texto. O parser aceita expoente e decodifica escapes como JSON, recusando escapes inválidos.

**Achado do CI do PR**

19. O job `native` do commit do 5.36 falhou antes da jornada Lottie: `native-lottie-journey.mts` roda como ESM puro e passou a importar um valor de um módulo TypeScript sem extensão (`ERR_MODULE_NOT_FOUND`). O import virou somente de tipo, como nos demais scripts nativos, com o filtro de camadas de forma em linha. Todos os scripts nativos do EdiSVG carregam no Node sem tsx.

## Gates e evidências

Depois da última correção, passaram localmente: 177 testes do núcleo `edi-motion`, 288 do app, 117/117 E2E com o renderer construído (Chromium, comparação de pixels com o navegador, `lottie-web` e árvore de acessibilidade), o consumidor Next de produção, tipos do núcleo, do app e das ferramentas, e Biome sem erros nos arquivos da frente. O `pnpm check` da raiz desta máquina acusa erros só em `apps/edipdf/.cache`, artefatos locais fora do Git, e avisos legados de outras frentes.

No commit do 5.36, último antes deste review, todos os gates remotos do PR passaram (CI geral, banco, catálogo, mídia e as atualizações de cada ferramenta), exceto o `native`, que é o achado 19. O resultado final do CI vale pelo commit deste review no PR #29; a jornada nativa completa vale pelo runner Windows.

## Publicação

No commit `9e24ae47`, os 15 checks do PR #29 passaram. A primeira jornada nativa desse commit parou no EdiCaptura ("Synthetic encoder produced no chunk", seguido de prazo de limpeza estourado) antes de chegar ao EdiSVG. O PR não toca o EdiCaptura, e a mesma verificação nativa falhava no EdiCaptura nas três execuções anteriores da `main`. A repetição passou nos seis apps, EdiSVG incluído. Essa intermitência do EdiCaptura fica para a frente desse produto: falta diagnóstico e correção, e ela não foi tratada aqui.

O PR foi mesclado na `main` em `339d6487` em 21/10/2026, e a tag anotada `edi-v0.4.0`, criada com confirmação do titular, aponta para esse commit. O workflow da tag passou na primeira tentativa: revisão, banco, mídia, atualizações dos seis apps e da mídia, instaladores e publicação. A [suíte 0.4.0](https://github.com/informach/edi-releases/releases/tag/edi-v0.4.0) é a mais recente do canal estável e contém seis executáveis Windows x64 e `edi-release.json`. Numa conferência independente feita depois de baixar os sete arquivos, `verifyRelease` validou a assinatura com a chave pública de atualização do ambiente `edi-release`, a versão 0.4.0, o canal estável e o commit-fonte. Cada instalador tem tamanho e SHA-512 iguais aos do manifesto. A atualização instalada de 0.3.0 para 0.4.0 em máquinas de usuários não foi homologada.

## Limites que permanecem

- **Lote 5:** cada perfil acima é estrito e recusa o que fica fora dele com motivo: vídeo com transparência, WOFF2, `use` externo, filtros fora das 16 primitivas, ordem de desenho em SVG/SMIL e Lottie, ordem de desenho com layout responsivo, malha com mais de 16 divisões, imagens com nine-slice ou malha na Lottie, fórmulas sobre listas e cores. Os limites de cada incremento estão no seu review.
- **Lote 6:** adapter React Native real e testes em Android/iOS, bibliotecas/compartilhamento/permissões, colaboração, migração de acervo real e guias de consumo.
- **Rive:** importar/exportar `.riv`, provar compatibilidade com projetos reais e medir autoria e desempenho com benchmarks reproduzíveis. Nada disso foi feito; o produto não deve anunciar paridade nem superioridade.
- **Homologação:** leitores de tela reais, fontes e scripts de usuários, hardware representativo e atualização instalada da suíte ficam fora deste review. O gate nativo local desta máquina tem WMI degradado (registrado no 5.24); a jornada nativa completa vale pelo runner Windows do CI.
