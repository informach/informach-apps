# Full review da entrega do EdiPDF

18/10/2026. Revisão em andamento para concluir o lote atual e publicar, conforme orientação do titular. O escopo restante está em [pendências pós-release](pendencias-pos-release.md). Não há alegação de substituição integral do Acrobat ou conformidade PDF/A/PDF/UA.

## Integridade e segurança

Revisados os contratos main/preload/renderer, origem e licença nos IPCs, permissões de leitura, destinos escolhidos, cópias sem substituição do original, escrita atômica e commit exclusivo de diretórios. As extensões documentais adicionais no SDK continuam exigindo seleção explícita; executáveis permanecem recusados. O histórico, a sessão, as assinaturas opcionais e os checkpoints usam armazenamento protegido e validação de formato. Entradas corrompidas são reportadas e preservadas para reparação explícita.

O motor local valida operações e limites antes de abrir recursos nativos. A fronteira de senha considera bytes UTF-8 e privilégios de administração, inclusive PDF com senha de abertura vazia; novas senhas com aliases ambíguos são recusadas. Remoção por busca exige conferência e cópia sanitizada. Documentos restritos não obtêm exportação por meio de tarefas de impressão ou retomada. Não houve mudança de chaves comerciais, autenticação, cobrança ou serviços remotos nesta frente.

## Funcionalidade e experiência

O corpus automatizado cobre montagem sem páginas excluídas retidas, edição original, fontes/Unicode, ocorrência isolada de Form XObject, parágrafos, pixels recortados, dados/aparências de formulários, senhas, marcas/rótulos e tarefas locais. A revisão visual conferiu leitura, fontes dos campos, formulários, conversões e prévias. A última extensão conserva a prévia de marcas durante a rolagem, compõe a rotação do controle com a página e acrescenta limpeza/recorte/posicionamento de assinatura com proteção contra mudança do documento.

Assinaturas gráficas não utilizam certificado. A prévia de posição mostra a revisão atual da página; o ponto escolhido e a largura são ajustados para conter assinatura e data. Imagens são preparadas sem alterar o original, preservando cores e removendo o branco pelo canal mínimo, sem eliminar amarelo por luminância. A biblioteca local exige opção explícita. Recorte vazio é recusado e alterações invalidam a preparação anterior.

## Evidências e gates

- Checkout de desenvolvimento: 275 testes do app aprovados, tipos e build aprovados. Marcas/numeração passaram pela jornada completa, incluindo retomada de OCR, fechamento normal e três reaberturas após saída forçada (`native-close-paths.txt`). Não houve alteração especulativa do SDK nem remoção de locks para passar essa rodada.
- A primeira extensão de cancelamento de assinatura falhou porque o helper emitia `pointercancel` no body, embora a captura real direcione o evento ao canvas. O cenário foi corrigido para o alvo capturado, mantendo a verificação de ausência de pixels/traços. O produto também cancela o gesto ao perder foco/captura ou desmontar.
- Checkout de publicação: criado de `origin/main`, sem transportar alterações de EdiFoto/EdiSVG do checkout compartilhado; atualizações já integradas no SDK foram preservadas. Integração do harness EdiPDF adaptada ao harness atual.
- Checkout isolado: `pnpm install --frozen-lockfile` aprovado; `pnpm check` aprovado com 366 warnings e 72 infos, sem erros; `pnpm typecheck` aprovado nas 21 tarefas e no tooling; `pnpm test` aprovado nas 21 tarefas e nos 43 testes do tooling (EdiPDF: 275, SDK desktop: 68); `pnpm audit --prod` com zero vulnerabilidades conhecidas. As verificações foram repetidas quando correções de integração alteraram o código.
- A integração revelou acesso a arrays sem validação explícita sob o compilador/configuração do tooling. Foram acrescentadas verificações de coordenadas, referências e resultados, preservando operações válidas. O worker de OCR e seus binários são gerados no postinstall a partir das dependências fixadas/modelos verificados; ficam fora do Git e do lint de código próprio, como os assets PDF.js existentes. Nenhuma regra de qualidade do código próprio foi desabilitada.
- A rodada `release-native-final.txt` aprovou os perfis anteriores, marcas/rolagem e o controle de formulário rotacionado, mas encontrou sobreposição da prévia girada da assinatura. O [review do complemento](review-assinatura-campos.md) registra a correção e a nova rodada, mantendo cliques normais e a verificação de pixels.
- Pendentes neste registro: encerramento da rodada nativa final; build dos consumidores e build normal final do EdiPDF; gates remotos, instalação/atualização e conferência dos sete assets publicados. A primeira tentativa isolada também encontrou timeout no fixture compartilhado do gerenciador de instalações antes de iniciar o EdiPDF; a repetição passou por esse fixture sem alterar seu timeout. Os resultados serão registrados antes de declarar publicação concluída.

Nenhum documento pessoal foi utilizado; não houve acesso ao clipboard pessoal, digitalização de papel ou impressão física. As limitações de equipamento, compatibilidade e recursos adiados são explícitas na documentação de pendências.
