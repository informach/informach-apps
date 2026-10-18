# Incremento 5.8 — cobertura de glifos e fallback verificável

Data: 18/10/2026. Estado: implementado e revisado no perfil de cobertura/fallback descrito abaixo. Sucede o review 5.7 do desenho portátil. Não encerra lote 5, lote 6 ou full review final.

## Problema e contrato implementado

Carregar FontFace não comprova que a fonte contém os caracteres do texto: o motor pode recorrer a outra fonte do sistema. O fluxo precisa diagnosticar cobertura real e oferecer fallback explícito por recursos tipados, sem confundir cobertura cmap com shaping/ligaturas ou suporte a todo Unicode. Arquivos antigos devem continuar abrindo/salvando, com diagnóstico e sem reescrita silenciosa de texto/fontes.

Parser Unicode cmap limitado, com seleção determinística de subtabela (12 antes de 4, não união), segmentos/glifos verificados e variações default/nondefault do formato 14. Dados são capturados em snapshot privado; busca binária não expande planos suplementares. Subtabelas não suportadas e mapeamentos conflitantes do mesmo formato produzem diagnóstico explícito, não cobertura inventada. Comparações entre plataformas, consultas e avaliação de clusters têm orçamento explícito. Não acrescenta bibliotecas/serviços.

## Integração e evidências

Projeto v18/blueprint v7, `fontFallbackIds` em ordem (até sete além da principal), referências/remoção/versionamento e catálogo raiz compartilhados. Painel permite adicionar/remover/reordenar e diagnostica cobertura; render compartilhado define a cadeia CSS por IDs internos. Novos exports/Testar verificam cobertura inicial e texto dinâmico antes de publicar estado, relógio ou DOM; dados históricos continuam abertos/salvos, e blueprints v1–v6 mantêm o comportamento anterior. A exportação de backup JSON não é bloqueada por texto ainda incompleto. Leitura MCP `get_font_coverage` devolve relatório limitado sem bytes das fontes.

Inspeção real de SFNT e cache fraco validado por bytes/identidade; erros de cmap não verificável preservam o motivo. Um cluster inteiro deve ser coberto por uma única fonte, sem somar glifos de fontes distintas. FontFace continua sendo verificação separada. Fixtures reais Noto Sans e Noto Sans Math 3.000 têm hash e licença OFL integral; fontes não foram modificadas. Há provas adversariais para segmentos, seletores, marcas combinantes, planos suplementares, integridade, referências, limites e compatibilidade.

Gates executados: 153 testes do editor, 86 do núcleo, tipos do app/núcleo/tooling, sintaxe, build, 48 jornadas de navegador e integração Next.js SSR/hidratação passaram. A contagem de 86 inclui a revisão posterior que acrescentou recusa de subtabelas conflitantes e preservação do diagnóstico; a rodada integrada de navegador/Next foi repetida depois desse refinamento sobre o rebuild final e passou (48 + 1). Biome focado: zero erros, avisos legados visíveis. Auditoria de produção: zero vulnerabilidades conhecidas na rodada. Essas verificações são locais, não publicação/homologação comercial.

Jornadas reais comprovam diagnóstico e configuração no inspetor, transação somente ao aplicar, undo/redo, recuperação na recarga, isolamento de Testar, carregamento das duas fontes e métricas do glifo suplementar, HTML offline e ZIP React consumido em Vite. Captura de autoria inspecionada em `.cache/edisvg-review/font-fallback-authoring.png`.

A rodada nativa de toda a suíte foi interrompida antes do EdiSVG: timeout do status “Orientação” no OCR do EdiPDF (`apps/edipdf/scripts/native-journey.mts:333`). Esse resultado permanece falho e não certifica a suíte inteira. A rodada oficial selecionando somente EdiSVG (`pnpm edi:test:native edisvg`) terminou aprovada com rebuild próprio: cobertura/fallback, recusa atômica de input, métricas e descarte sob origem file/CSP; desenho/rig/assets/áudio; Save/Open, Save As cancelado, recuperação destacada, React ZIP e gates de licença/expiração/IPC. Captura com as duas fontes ativas inspecionada em `.cache/edi-native-results/edisvg-font-fallback.png`. Nenhum código de outra frente foi alterado para aprovar essa rodada.

Achados corrigidos no review: escolha ambígua de subtabelas Unicode, perda do motivo de cmap não verificável no cache, contador de UI alterado dentro de updater React, rótulo acessível ambíguo do seletor, teste de comando inválido que inicialmente falhava por sessão incorreta, e texto de fixture fora da prancheta por âncora inadequada. O teste de comando agora usa sessão válida e verifica o erro de domínio.

## Limites e próximos gates

Gates deste incremento encerrados no perfil descrito. Continuar semântica/acessibilidade e os demais requisitos, sem reclassificar todo o lote como concluído. Cobertura cmap não certifica shaping, bidi, ligaturas, cores, significado visual ou todos os caracteres Unicode; fontes do sistema são escolha explícita sem promessa de portabilidade. Não houve instalador publicado, commit, merge, push ou deploy nesta revisão.

Referência primária consultada: [OpenType cmap — mapeamento de caracteres, formatos 4/12/14 e escolha de subtabela](https://learn.microsoft.com/en-us/typography/opentype/spec/cmap). Wrapping, texto em caminho, outlines e shaping avançado continuam no escopo de tipografia, não são comprovados pelo parser de cobertura.
