# Review do lote 0 do EdiPDF

18/10/2026. Escopo: primeira remediação local de integridade, antes da evolução do motor. Implementação autorizada no [plano](../../../apps/edipdf/PLANO-DE-IMPLEMENTACAO.md).

## Implementado e verificado

- O gerador reconcilia destinos, marcadores, links, widgets e referências a páginas fora da árvore efetiva antes de coletar objetos órfãos. Fixtures com marcador, campo compartilhado e destino nomeado passaram com uma página estrutural e sem stream do texto removido. A navegação válida e o widget da página mantida foram preservados.
- Rascunhos entram no indicador de trabalho pendente. Recuperação confirma todos os rascunhos antes de decidir quais documentos gravar. No Electron real, o rascunho mudou o estado para “Alterações não salvas”, a recuperação alterou os bytes e encerrou o rascunho, sem confirmação falsa.
- Trocar a cor da assinatura mantém o canvas: 1.518 pixels de desenho antes e depois no teste real.
- Compactação de documento e junção direta usam uma operação de escrita de cópia. O main valida autorização do destino e recusa originais abertos, incluindo aliases por hardlink. Teste real de filesystem preservou a origem.
- Junção para revisar e inserção carregam integralmente o conjunto; falha/cancelamento libera fontes temporárias e não aplica um resultado parcial.
- Cobertura visual deixou de usar “apagar” e informa a permanência do conteúdo original.

## Achados do review e tratamento

1. A primeira versão da limpeza de destinos removia `Limits` das folhas. Corrigida para recalcular limites e retirar filhos vazios.
2. A contagem de marcadores precisava respeitar descendentes recolhidos. Corrigida na reconciliação.
3. O acesso a `getForm()` remove XFA na biblioteca atual. A reorganização de XFA agora falha explicitamente antes dessa mutação; suporte local específico continua nos lotes seguintes.
4. A primeira asserção de estado do runner de investigação chegou com caracteres corrompidos pelo transporte PowerShell/Python. Corrigida a asserção do teste; não foi alterada a implementação para satisfazê-la. A repetição passou.
5. Tags/árvores estruturais, formulários importados, edição original, fontes e anotações interoperáveis ainda precisam dos lotes seguintes. O tratamento atual de referências não certifica remoção semântica de todo conteúdo oculto de PDFs complexos. O full review deverá incluir esses casos.

## Gates executados

- `pnpm --filter @informach/edipdf test`: 27 testes aprovados.
- `pnpm --filter @informach/edipdf typecheck`: aprovado.
- `pnpm --filter @informach/edipdf build`: aprovado; build comum restaurado depois da jornada efêmera.
- Biome focado: sem erros, com warnings legados visíveis. Formatação aplicada aos arquivos alterados.
- Investigação Electron derivada do harness existente: edição/salvamento/recuperação, assinatura gráfica, janela de 1100 px, licença offline, expiração e IPC restrito passaram. Perfis/chaves/arquivos de teste isolados; nenhuma instalação ou publicação.

Lote revisado para prosseguir à fundação documental. Não representa full review, conclusão do diagnóstico nem equivalência ao Acrobat. Sem commit/push/deploy/release.
