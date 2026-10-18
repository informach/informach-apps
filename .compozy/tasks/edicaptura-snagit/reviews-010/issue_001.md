---
status: resolved
file: apps/edicaptura/src/main/main.cjs
line: 1397
severity: high
author: claude-code
provider_ref:
---

# Issue 001: Exportação individual pode substituir o original da biblioteca

## Review Comment

O callback `file:export` usa diretamente `result.filePath` em `atomicWrite` para imagens e em `copyVideo` para WebM. Não exclui a biblioteca ativa nem seus aliases canônicos. Escolher como destino o PNG original de um projeto faz a exportação retornar sucesso, substituir os bytes originais pelos pixels editados e registrar esse caminho como última saída. O projeto perde sua fonte imutável. A interface permite revelar a pasta/projeto no Explorer e afirma que originais e objetos continuam no projeto local; logo, a biblioteca é um destino alcançável, não uma condição dependente de renderer adulterado.

Reproduzido com o callback **inalterado**, extraído de `main.cjs` entre as chamadas `handle("file:export"` e `handle("control:state"`, avaliado em VM. `Library`, filesystem e `atomicWrite` são reais. Chromium gerou duas imagens PNG válidas de 8×8: original preto e saída vermelha. Somente diálogo, licença, aviso, registro da última saída e decodificação de `pngBytes` ficaram inertes; esta última apenas decodificou o data URL gerado pelo próprio Chromium. Portanto, a prova cobre escolha de destino e escrita real, não diálogo nativo, codec Electron ou publicação em clipboard.

Três execuções, restaurando a fixture original antes de cada uma:

| Destino próprio | Resultado do callback | Original preservado |
| --- | --- | --- |
| `output/export.png`, fora da biblioteca | Sucesso; PNG vermelho | Sim |
| `library/<UUID>.png`, original registrado | Sucesso; PNG vermelho | **Não** |
| `library-alias/<UUID>.png`, junction própria para `library` | Sucesso; PNG vermelho; realpath do pai igual ao da biblioteca | **Não** |

Original: **109 bytes**, SHA256 `d1df53286e1d4b80b302b887e731f19a8e940cc4bddc2d7fee2ef6ba1f5edfd4`. Saída: **106 bytes**, SHA256 `42c7e1292d425feb3b112eeac015bdbdecb1e2666641f30f037750022d486834`. `rememberExport` foi chamado nas três execuções. O probe final terminou com código 0 porque afirmou a reprodução e o controle; não é aprovação do produto. Browser/servidor encerraram antes de remover a junction e a raiz temporária exclusivamente própria. Nenhum arquivo pessoal foi usado.

A escrita direta já existia no Git base `88c1163` (`main.cjs:695`); este é um gap herdado no contrato de preservação explicitamente entregue, não uma regressão atribuída ao EdiFoto ou à fase 5b. A rodada 008 tratou cancelamento/revogação durante o último realpath da exportação QuickVideo; não cobriu este callback nem esta ausência de proteção de destino. Não duplicar 008.

Aplicar uma política comum de destino final que preserve todos os arquivos internos da biblioteca, usando identidade canônica da raiz e do destino, incluindo junctions/case do Windows. Fazer a recusa antes de qualquer substituição e manter a autoridade da biblioteca/sessão durante as operações assíncronas. Conferir as rotas individuais PNG/JPEG/WebP/WebM e a consistência com a proteção já existente em QuickVideo, sem bloquear exportação válida externa. Não basta comparar prefixo textual ou impedir apenas o nome do documento atual: outros originais, sidecars e metadados também são internos.

Regressão necessária: callback real + filesystem real, recusa de destino interno direto/alias sem alterar bytes/SHA do original ou metadados, sem atualizar a última saída; controle externo continua produzindo o arquivo correto. Cobrir troca/revogação da biblioteca se a validação introduzir awaits. O teste deve falhar na fonte congelada antes da correção.

## Triage

- Decision: `VALID`
- Notes: Coordenador leu integralmente o full review e este issue. A prova do callback real com filesystem/Library reais e controle externo confirma substituição direta e por junction, violando o contrato entregue de original imutável. Origem herdada não reduz esse requisito. Correção: política de destino canônico compartilhada pelas saídas individuais, preservando todos os arquivos internos e autoridade depois dos awaits; regressões vermelha/verde e controle externo. Encaminhado na única onda final junto com010/002,Q1,Q2,C1; não resolvido antes da implementação e verificação.

## Resolution — consolidated final checkpoint fix, 18/10/2026

Implemented and locally verified; independent re-review remains pending. `file:export` snapshots the Library/root/editor/mainFrame and retains access and identity through asynchronous work. The app-local typed `export-destination.ts` canonicalizes library, parent and existing target (Windows case/junction included), refuses every internal destination before staging, writes to a generated external staging file, rechecks canonical identity and authority, then calls rename with a synchronous final guard after the last await. All PNG/JPEG/WebP/WebM branches use this policy. QuickVideo's existing independent cancellation/authority guard is unchanged and passed its four native cases.

Actual handler + real Library/filesystem regression failed before the fix (`Missing expected rejection`) and passes after it: 48 internal combinations across four formats/four originals or metadata/direct+junction+case; four external byte-exact controls; 112 authority boundaries covering access, transfer, root, Library, editor, frame and navigation; four deterministic final-realpath/post-await cases isolate revoke/root and preserve an existing output. Original and other internal file SHA values remain unchanged on refusal and rememberExport is not called. Dialog, license provider, raster codec and WebM decoding are deliberately inactive in this deterministic boundary test; real codecs and licensed own-source capture were separately exercised.

Final scoped gates: Node161/161, types/build, Biome18files0errors5baselinewarnings20infos, globalcheck0errors415baselinewarnings82infos/0newwarnings, full11renderer including90selectioncases/180pixeloutputs, media-native0, video-native4/4, licensednative0 with normal child close/cleanup0. New Captura package beta22332 and own resources9.0.2 verified; no installation/publication. Detailed evidence, failures and limitations: [final fix record](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/checkpoint-final-fix.md).

## Independent scoped re-review — 18/10/2026

**ADDRESSED.** O mesmo revisor da FULL review conferiu o delta exato, callback/helper, regressão vermelha/verde e controles. A política comum PNG/JPEG/WebP/WebM recusa todos os destinos internos canônicos, inclusive junction/case, preserva Library/raiz/editor/frame/acesso e executa a última guarda síncrona depois do último await, imediatamente antes de iniciar rename. Staging externo físico e cleanup em finally preservam a fronteira examinada; não se promete rollback após iniciar publicação.

Evidência atribuída conferida:48 recusas internas,4 controles externos exatos,112 pontos de mudança de autoridade e4 casos finais determinísticos, incluindo microtask após o await. Recusas preservam originais/metadados e destino anterior, sem rememberExport. Auditoria própria:434 registros do freeze sem divergência; nove fontes e21 outputs correspondem ao ASAR novo beta22332, que contém política/guardas. Nenhum novo defeito importante confirmado nesta correção.

Diálogo nativo individual de salvar permanece **não exercitado**; a fixture usa destino determinístico. Gates separados verificam licença/codecs, não demonstram esse diálogo. QuickVideo mantém sua proteção independente e quatro casos nativos aprovados. [Append independente no full review](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/full-review.md) preserva o relatório original, os12 rulings, quatro incidentes e demais limites. Pipeline global final/publicação continuam a cargo do coordenador; este aceite escopado não declara esses passos concluídos.
