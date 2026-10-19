# Preparação atômica de campos/fontes — regressão em revisão

A jornada completa passou após a correção; [aceite consolidado](review-gestos-e-campos.md). Os parágrafos seguintes preservam o diagnóstico e o andamento anteriores.

18/10/2026. Achado durante a jornada das alças; complemento do [perfil de formulários](review-formularios-complemento.md). Não substitui o aceite anterior de persistência/fontes, nem é full review.

Dois testes de Tab pararam com foco no segundo campo. O diagnóstico mais recente confirmou documento focado, modal removida, DOM terceiro/primeiro/segundo, campos habilitados e fonte local já visível depois do evento. A espera explícita pelo fechamento da modal era necessária, mas não resolveu sozinha. Não foram alterados TabIndex nem interceptado Tab para forçar o foco esperado.

A revisão encontrou um problema de ciclo de vida: FormLayer conservava o array anterior enquanto a nova página/fonte era obtida. Assim, os controles antigos podiam usar a identidade da nova fonte antes da preparação terminar. Cada campo também carregava sua fonte separadamente e ficava temporariamente desabilitado. A asserção genérica “alguma EdiLocalFont” podia aceitar a fonte regular anterior enquanto a fonte itálica selecionada ainda entrava em carregamento. Essa janela é compatível com o salto observado; o diagnóstico anterior não registrava toda a sequência dos eventos.

A camada agora vincula os controles ao snapshot src/índice/rotação e prepara as fontes antes de publicar o conjunto interativo. Programas iguais têm uma única preparação/lease por página; fontes são validadas sequencialmente, compartilhadas e liberadas no encerramento/troca de origem. Carregamento antigo é abortado e nunca exibe controles no contexto de uma fonte nova. Tipos padrão não precisam de FontFace; formato não suportado mantém aviso explícito de prévia alternativa. O carregamento fica anunciado na camada, e os campos publicados não alternam disabled por carregamento individual.

O teste exige agora a família correspondente ao SHA-256 exato do arquivo itálico escolhido. Também registra eventos de foco/tecla e estado dos campos em caso de falha, sem conteúdo dos valores. A instrumentação existe somente na fixture. **252 testes aprovados**, tipos app/harness/testes, Biome dos arquivos e build normal passaram. A ampliação de corpus de Form XObjects também verificou ocorrência girada/espelhada/skew e BBox de origem deslocada, com pares preservados.

Evidências: `.cache/edipdf-analysis/test-form-preparation-all.txt`, `test-form-geometry.txt`, `typecheck-form-preparation.txt`, `types-form-preparation.txt`, `biome-form-preparation.txt`, `build-form-preparation.txt`. A jornada completa está em execução em `native-form-preparation.txt`. Aguardar resultado, restaurar o build normal e rever as capturas antes de consolidar o aceite.
