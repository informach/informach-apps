# Review do lote 1 do EdiPDF

18/10/2026. Fundação documental local, continuidade do [lote 0](review-lote-0.md).

## Resultado

- Formato de recuperação v1 com schema e limites para páginas, anotações, fontes, metadados e rascunhos. Fontes incorporadas à recuperação; reabertura não depende de caminhos externos.
- Recuperação automática serializada, com debounce de 750 ms, arquivo atômico e proteção `safeStorage` do Windows. Documentos recuperáveis aparecem no Início; recuperação abre um novo destino, preservando o PDF salvo. Arquivo inválido não vira documento vazio e permanece disponível no disco.
- Anotações novas usam objetos nativos PDF com appearance vetorial e metadados de edição v1 validados. O editor reabre comentários/textos/marcações/formas/imagens próprios sem duplicar a aparência. Comentários, formas e marcações externas suportadas são importados; tipos não suportados permanecem no PDF.
- Formulários importados têm árvore AcroForm registrada e namespace por fonte, com prevenção de colisões. Widgets são reassociados às páginas efetivas; homônimos mantêm valores independentes nas duas modalidades de junção. Duplicação compartilha os campos originais explicitamente.
- Gravação de arquivo aberto verifica o digest da versão em disco antes do commit; conflito preserva a versão externa e orienta Salvar como.
- Transações tipadas de páginas, anotações e metadados validam o lote antes de publicar a revisão. Excluir, duplicar e mover páginas na UI usam esse núcleo.
- Dependências locais acrescentadas: Zod `4.6.7` (versão já usada na raiz) e fflate `0.8.3` (mesma versão do EdiSVG, destinada aos formatos locais). Sem provider ou serviço contratado.

## Review e correções

1. A cópia de páginas pode deixar o `/P` do widget apontando para outra cópia indireta da página original. O teste com campos homônimos detectou a perda. Corrigida a associação ao `page.ref` efetivo antes da reconciliação.
2. A preparação de impressão/imagem precisa manter as appearances nativas, enquanto a visualização editável precisa destacá-las da origem. Criada a opção explícita de saída no carregador, evitando perder anotações na exportação.
3. A revisão encontrou risco de exceção do snapshot fora da fila assíncrona. A geração e gravação agora fazem parte da operação tratada da fila, com orientação de falha ao usuário.
4. O primeiro teste visual contava a lista de anotações com a ferramenta Texto ativa, que mostra propriedades de ferramenta. Corrigido o estado de interação do teste.
5. Uma espera assíncrona de IPC no `waitForFunction` avançou antes da gravação. Trocada por observação real de IPC com prazo limitado. O problema era no runner; não foram acrescentados delays à implementação para esconder a falha.
6. O cleanup de um teste com documento sujo esperava um diálogo de encerramento. O harness de investigação agora encerra seu processo descartável explicitamente e aguarda o evento de saída, sem alterar o fluxo comercial do app.

## Evidências

- 32 testes Node aprovados, incluindo batches inválidos sem mutação, três ciclos de anotações, formulários homônimos, snapshots inválidos e conflito externo. Tipos/build aprovados durante a implementação.
- Electron real: anotação salva/fechada/reaberta manteve texto e objetos editáveis; rascunho foi salvo automaticamente em `.bin`, sem conteúdo em claro; recarga do renderer mostrou o trabalho recuperável; o texto foi recuperado e salvo por diálogo nativo em outro PDF, preservando o original.
- Licença offline assinada, expiração e negação de IPC continuaram passando no harness derivado. Sem dados pessoais, instalação ou publicação.
- Biome focado sem erros, com warnings legados. Alterações restritas ao EdiPDF e entradas próprias do lockfile; trabalhos anteriores do EdiSVG/SDK preservados.

## Limites para os lotes seguintes

Ainda faltam história persistente de versões, políticas de retenção/preferências, cobertura externa completa de anotações, buscas sobre o estado editado e organização de todos os comandos. Texto livre nativo é anotação; edição de texto original e extração do corpo exigem o motor do lote 2. OCR, senha, redação, tags/PDF/A e demais lotes permanecem abertos. Este review não aprova equivalência ao Acrobat nem o full review final.
