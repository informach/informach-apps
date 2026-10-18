---
status: resolved
file: apps/edicaptura/src/editor/canvas.js
line: 458
severity: high
author: claude-code
provider_ref:
---

# Issue 002: Recorte fracionário pode salvar projeto que não reabre

## Review Comment

`CanvasEditor.up()` arredonda origem e extensão do crop independentemente. Um arraste válido até a borda pode produzir `round(x) + round(width)` maior que a largura da imagem. `Library.save` aceita esses metadados, mas `CanvasEditor.prepare` recusa o mesmo projeto ao reabrir com `Recorte fora da imagem original.`. O usuário pode receber confirmação de salvamento para um documento que o editor não consegue carregar.

Reprodução fresca com código real, Chromium isolado em 1366×768 e `Library`/filesystem reais: criar canvas preto próprio de **8×8 pixels**, carregá-lo em `CanvasEditor`, exibir seu canvas em **16×16 CSS px**, sem margem, escolher crop e arrastar com `page.mouse` de **(3,3) até (16,16)**. Isso corresponde a pixels originais **(1,5; 1,5) até (8; 8)**. O snapshot real fica `{x:2,y:2,width:7,height:7}`. Salvar esse snapshot, ler da biblioteca e chamar `prepare` retorna o erro acima: 2+7=9, fora do original de 8 pixels. Não se injetou crop inválido nem se substituiu a lógica geométrica.

| Caso real | Crop persistido | Save | Prepare após read |
| --- | --- | --- | --- |
| Controle: CSS (4,4)→(16,16) | x2/y2/w6/h6 | Sucesso | Aceito |
| Falha: CSS (3,3)→(16,16) | x2/y2/w7/h7 | Sucesso | **Recusado** |
| Controle reverso: CSS (15,15)→(0,0) | x0/y0/w8/h8 | Sucesso | Aceito |

Os três casos preservam o PNG original, 109 bytes/SHA256 `d1df53286e1d4b80b302b887e731f19a8e940cc4bddc2d7fee2ef6ba1f5edfd4`; não se afirma destruição desses pixels. O defeito torna o projeto editado persistido indisponível na reabertura. A prova usa eventos reais do ponteiro, imagem decodificada, `snapshot`, `Library.save/read` e `prepare`. Não exerce IPC Electron, monitor físico ou captura. Resultado final do probe: código 0, nenhum pageerror; browser/servidor encerrados e raiz própria removida.

O arredondamento independente já estava no base `88c1163` (`canvas.js:222–225`); a validação atual de preparação/reabertura torna a inconsistência observável no contrato de integridade entregue. Não é o erro de ponto flutuante de `PhotoCapture.selected` da rodada 005, já resolvido: aquele comparava um retângulo DIP à interseção reconstruída; este nasce no crop de edição e persiste geometria fora do raster. Também não reabre 002/005, que tratava dimensão transformada arredondada para zero.

Quantizar/clamp os limites do crop de forma coerente com os pixels originais e derivar largura/altura desses limites, mantendo positividade e contenção. Preservar a validação de `prepare`; relaxá-la só esconderia os metadados inválidos. Verificar também recortes sucessivos/transformações e a eventual defesa na persistência, sem alterar os pixels originais ou deslocar anotações.

Regressão necessária: percurso real pointer→snapshot→save/read→prepare nas bordas direita/inferior e com zoom/transformações relevantes, incluindo os controles válidos acima, reabertura, undo/redo e dimensões/pixels esperados. O caso fracionário deve falhar contra a fonte congelada antes da correção.

## Triage

- Decision: `VALID`
- Notes: Coordenador leu integralmente o full review e este issue. O percurso real de ponteiro até save/read/prepare confirma arredondamento incoerente que produz crop fora da imagem; controles válidos e original intacto delimitam o defeito. Correção: quantizar limites contidos e derivar extensões positivas, preservando a validação de prepare; regressões reais nas bordas, reabertura/undo/redo e transformações. Encaminhado na única onda final junto com010/001,Q1,Q2,C1, sem duplicar005 nem relaxar validação; não resolvido antes da implementação e verificação.

## Resolution — consolidated final checkpoint fix, 18/10/2026

Implemented and locally verified; independent re-review remains pending. CanvasEditor quantizes/clamps left/top/right/bottom within the current original-coordinate bounds and derives positive width/height from those limits. `prepare` retains its strict geometry validation. The real pointer regression on the frozen pre-fix CanvasEditor reaches snapshot → real Library.save/read → prepare and fails with “Recorte fora da imagem original.”; no invalid rectangle is injected.

Final renderer regression passes nine cases: fractional right/bottom jointly and separately, integer/reverse controls, CSS zoom, quarter-turn rotation, horizontal flip and successive crop. Every case roundtrips real save/read/prepare, checks undo/redo, exact output dimensions/first pixel and original SHA preservation. First fractional case now persists2/2/6/6 on8×8. Browser1366×768 uses only its own generated gradient PNG; Electron IPC, physical monitors and arbitrary transform combinations are outside this focused crop fixture. The full11renderer and final scoped Node/type/build/quality/native/package gates passed; [final fix record](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/checkpoint-final-fix.md) records exact commands, counts, initial failures and limitations.

## Independent scoped re-review — 18/10/2026

**ADDRESSED.** O mesmo revisor da FULL review conferiu a quantização/clamp coerente dos limites e a derivação de extensão positiva dentro dos bounds do original, sem relaxar prepare. O vermelho da fonte congelada chega a pointer→snapshot→Library.save/read→prepare e falha no defeito real; os nove casos verdes cobrem bordas, controles, zoom, rotação, flip e recorte sucessivo com undo/redo, dimensão/pixel e SHA original. Caso fracionário8×8 agora2/2/6/6. Não se injetou crop inválido nem se alteraram pixels originais para obter verde.

O último full11renderer posterior à mudança de fonte/teste foi conferido, sem rerun amplo redundante pelo revisor. Auditoria própria de434 registros e26 deltas exatos sem divergência. Nenhuma nova quebra importante confirmada; Electron IPC, hardware e todas as combinações geométricas não são inferidos da fixture. [Append independente no full review](../../../../docs/propostas/edi-suite-2026-10-16/edicaptura-lotes/full-review.md) contém a disposição e os limites. Pipeline global final do coordenador ainda pendente.
