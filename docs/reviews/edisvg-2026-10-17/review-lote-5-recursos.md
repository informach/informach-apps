# Review incremental 5.1 — catálogo e imagens

18/10/2026. Revisão intermediária, não fechamento do lote 5 nem full review final. Continuidade do [lote 4 integrado](review-lote-4-integrado.md), na branch `feat/edisvg-evolution`, sem commit, publicação ou alteração comercial.

## Implementação e contrato

Documento canônico v15, com catálogo raiz `assets`. Versões 1–14 continuam aceitas pelo migrador/backup existente; um catálogo ou referência de imagem não pode ser disfarçado como versão anterior. Imagens PNG estáticas e áudio WAV PCM16 possuem IDs SHA-256 dos bytes reais, Base64 canônico e metadados derivados do binário. Limites: 256 recursos, 4 MB agregados, 16 milhões de pixels, até 30 s por áudio e 2,88 milhões de amostras agregadas. O projeto continua limitado a 8 MB UTF-8 serializados.

PNG verifica assinatura, ordem, tamanhos e CRC de todos os chunks. O IDAT passa por inflação incremental limitada, contagem exata de scanlines/Adam7, filtros e Adler-32, antes de entrar em transações síncronas. Isso não é um decodificador gráfico completo: a importação também exige decodificação real na plataforma. Chunks comprimidos de ICC/texto/EXIF não aceitos são removidos **antes** da decodificação na normalização; a possível mudança de cor exige consentimento antes de editar o documento. PNG animado é recusado, não convertido silenciosamente em uma imagem estática. WAV aceita somente RIFF PCM16 normalizado, com limites e alinhamento efetivos; ainda não há mixer/reprodução de áudio nesta etapa.

A aba Recursos importa, renomeia e exclui recursos; insere imagens centralizadas com referência tipada, transformação e dimensão editáveis. Conteúdo idêntico reutiliza o recurso existente. Exclusão com uso ativo é recusada. Arquivo nativo vem exclusivamente de diálogo controlado pelo main, com leitura limitada em um único descritor; o renderer não envia caminhos. O gate de licença continua no SDK e é conferido depois do diálogo/leitura. A importação no navegador usa File limitado. Cancelamento/desmontagem impedem publicação tardia.

Comandos de recursos passam pela mesma transação UI/MCP. `get_assets` e o overview retornam metadados paginados, nunca Base64 implícito. O histórico interna corpos de recursos por identidade, com refcounts para estado atual/passado/futuro: conta os bytes únicos uma vez, conserva o limite de 32 MB/100 edições e libera referências de redo/evicção/reset. Colisões de identidade com conteúdo diferente são recusadas.

SVG/HTML e React reutilizam uma definição de imagem por conteúdo, inclusive após expansão de componentes, sem repetir o corpo a cada instância. O blueprint interativo v3 identifica referências de imagens; v1/v2 permanecem aceitos sem essa extensão. O runtime verifica o viewport/use gerado contra a referência, em vez de relaxar a identidade de todos os elementos. Bindings vetoriais de cor para raster são recusados. Não há rede externa, href arbitrário, script ou HTML autoral.

`@noble/hashes` 2.4.0 e `fflate` 0.8.3 são dependências diretas fixadas do núcleo, com licenças MIT integrais. Já estavam resolvidas no workspace. As demais mudanças concorrentes do lockfile não foram revertidas.

## Achados corrigidos nesta revisão

- Cabeçalhos/CRC sozinhos não verificavam o conteúdo comprimido. Acrescentadas inflação limitada, tamanho, filtros e Adler antes das transações.
- Metadados comprimidos poderiam alcançar parsers nativos durante a normalização. Remoção anterior à decodificação e consentimento explícito sobre perda de perfil.
- Catálogos incorporados multiplicariam os corpos nos checkpoints. Internação com propriedade/refcount real, sem ignorar seu custo no orçamento.
- Renderização de imagem usa viewport SVG + use; o contrato antigo exigia tag DOM igual à tag lógica, impedindo a inicialização React. Corrigido pelo blueprint v3/referência tipada, com verificação correspondente.
- Overview enviaria o novo corpo de recursos implicitamente e mantinha limitações antigas de IK/componentes. Agora usa metadados limitados e informa o perfil vigente.
- Fixtures que artificialmente rebaixavam a versão mantinham campos novos. Agora representam formatos antigos reais; o parser continua recusando conteúdo futuro, inclusive em arquivos v1/v2.

## Evidências desta rodada

- Tipos do editor e núcleo aprovados; build Electron/Vite aprovado.
- 136 testes do editor e 60 do núcleo aprovados.
- 28 E2E reais aprovados em Edge, em rodada conjunta após a correção.
- ZIP React baixado, compilado por consumidor TypeScript independente e executado com o runtime efetivo, sem packages do monorepo/rede. Duas instâncias compartilham uma definição e a prova de pixel recupera vermelho RGBA `[255,0,0,255]` do SVG exportado.
- Next.js 16.4.2: build Turbopack de produção, SSR e hidratação aprovados. Essa prova existente não foi ampliada para fontes/mixer, ainda ausentes.
- Aba Recursos real: importação, referências reutilizadas, undo/redo, reabertura, recusa de exclusão usada/corrupção e cancelamento de conversão preservam o documento.
- Decodificação real/cancelamento/destroy idempotente de bitmaps verificados. Falhas aguardam todas as tarefas de carga antes de liberar bitmaps, evitando recursos entregues após cleanup.

Esta rodada não repetiu a jornada Electron/instalador para recursos. A evidência nativa anterior pertence ao lote 4. Check transversal permanece afetado por edições concorrentes de EdiFoto/EdiPDF; não há alegação de aprovação global.

## Continuidade obrigatória

Fontes incorporadas/shaping/wrapping/texto em caminho, áudio funcional, aparência/SVG avançados, nine-slice, raster triangulado, joystick, consolidação de canais de rig, formatos adicionais, semântica e scripting permanecem no lote 5. React Native, bibliotecas/colaboração/acervo e benchmarks continuam no 6. Catálogo de WAV não equivale a reprodução de áudio. O pacote interativo ainda depende de geometria confiável fornecida pelo compilador, não de um blueprint gráfico completo independente. O review integral só será realizado após os lotes restantes.
