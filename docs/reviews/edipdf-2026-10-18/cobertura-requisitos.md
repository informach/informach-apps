# Cobertura do diagnóstico e trabalho restante

18/10/2026. Mapa de execução do [diagnóstico](analise-funcional.md), subordinado ao [plano](../../../apps/edipdf/PLANO-DE-IMPLEMENTACAO.md). “Perfil revisado” significa aceite nos casos registrados, sem promessa universal. Contagens, comandos, capturas e falhas ficam nos reviews de cada frente. Não houve full review ou publicação.

## Correções

| Requisito | Implementado/verificado | Continuidade |
| --- | --- | --- |
| C01 — páginas excluídas | Reconciliação de referências, árvore viva e remoção de objetos sem referências; lotes 0/1/4 | Corpus final de tags, destinos e estruturas complexas |
| C02 — conteúdo coberto/substituído | Cobertura identificada como visual; edição estrutural e remoção segura separadas; lote 2 | Não confundir recorte/exclusão editorial com sanitização |
| C03 — rascunhos na recuperação | Estado pendente, confirmação antes de salvar e recuperação/reinício; lotes 0/1/3 | Incluir novos fluxos nos gates finais |
| C04 — formulários ao juntar/inserir | Importação/namespace e valores por fonte, testados na junção; lotes 1/4 | Corpus de campos/widgets/fontes avançados |
| C05 — anotações existentes/editáveis | Importação suportada, AP nativa e envelopes v0/v1/v2; lotes 0/1 e autoria | Tipos externos fora da matriz e arquivos grandes |
| C06 — busca desatualizada | Índice da revisão efetiva, glifos, campos/anotações e desfazer; lotes 2/3 | Corpus complexo de composição/colunas/OCR |
| C07 — Unicode perdido | Noto/fontes locais e recusa de glifos ausentes; autoria/formulários | Escritas complexas, CFF/coleções/fontes variáveis |
| C08 — proteção com perda de estrutura | Descriptografia/cópia estrutural; correção de senhas/fronteira C e privilégios revisada na jornada completa | Matriz ampla de criptografia/arquivos externos |
| C09 — cópia sobre a origem | Destino exclusivo, aliases/hardlinks, cópia e origem protegida; lotes 0/4 | Consumidores compartilhados e empacotamento no full review |
| C10 — ordem visual/saída | Ordem comum e AP nativa; lotes 1/3 | Corpus e mistura de conteúdos/anotações externos |
| C11 — assinatura apagada ao mudar cor | Traços preservados; lotes 0/3 | Complementos de M15 |
| C12 — miniaturas da origem | Revisão confirmada nas miniaturas e controle de retenção; lote 3 | Rascunho ainda aberto não entra na miniatura |
| C13 — junção parcial | Resultado integral ou falha, ordem/revisão e campos independentes; lotes 0/4 | Corpus amplo |
| C14 — tarefas sem ciclo compartilhado | Jobs/ports/fila/checkpoints/retomada nos fluxos longos; lote 4 | Ampliar receitas e novos processamentos sob o mesmo contrato |
| C15 — conflito externo ao salvar | Revisões de arquivo e recusa de conflito, gravação atômica; lote 0 | Gates finais de consumidores/instalador |
| C16 — mensagens incorretas | Perfis, erros, perda de fidelidade e estados reais explicitados nos reviews | Conferir cada função nova e toda a documentação no full review |

## Melhorias

| Requisito | Estado atual | Falta |
| --- | --- | --- |
| M01 — fluxos por tarefa | Entrada, menus, painel e comandos reorganizados | Medir conclusão/erros com uso real e revisar os novos fluxos |
| M02 — descoberta/atalhos | Paleta, termos, nomes acessíveis e atalhos configuráveis | Corpus de descoberta e teclado completo dos novos painéis |
| M03 — leitura/navegação | Estado por aba/Home, layouts e histórico revisados | Corpus de documentos grandes e leitura assistiva |
| M04 — busca | Revisão efetiva e geometria por glifo revisadas | Textos complexos, colunas e OCR amplo |
| M05 — texto/seleção | Caixas, quebra, alinhamento, listas/fontes e alças com gestos revisados | Fluxo multipágina e ortografia local opcional |
| M06 — anotações | Seleção múltipla, grupos, Alt interno, alinhamento, ordem, bloqueio e comentários | Clipboard Windows isolado, interação Alt nativa e agrupamento de histórico em corpus amplo |
| M07 — formulários | Tipos comuns, dados/máscaras, Tab/fontes/preparação atômica e rótulos/valores revisados; coordenadas fracionárias, orientação do controle e alinhamento corrigidos; 64 combinações e campo girado salvo/reaberto conferidos | Corpus de rotação própria/cor/alinhamento/múltiplas aparições e XFA |
| M08 — organizar/juntar/dividir | Intervalos/seletores, grupos explícitos, junção/revisão e divisão por marcadores/tamanho real revisados com retomada | Corpus/performance; substituição com preservação de referências |
| M09 — compactação | Meta real, melhor resultado, qualidade/placements e retomada revisados | Ampliar formatos/perfis de cor com corpus; nunca prometer meta impossível |
| M10 — desempenho | Workers, filas, virtualização e orçamentos implementados | Medições comparáveis de abertura/edição/memória em corpus grande |
| M11 — lotes | Manifesto, progresso, interrupção/retomada e destino exclusivo revisados | Novos modos, relatório final ampliado e repetição dirigida de falhas |
| M12 — impressão | Preparação vetorial/raster restrito, intervalos, livreto e revisão aprovados | Driver, duplex e papel físico; hardware ausente nesta sessão |
| M13 — marcas/numeração | Intervalos/capa/exceções, margens/fontes, cabeçalhos/rodapés, estilos/Bates, rótulos PDF e prévia real aprovados em testes e no percurso nativo; prévia conservada ao rolar opções | Corpus amplo do complemento; gates de publicação no full review |
| M14 — acessibilidade da interface | Foco modal, nomes, teclado/estados e preferências revisados | Novos controles e leitor de tela real/contraste/redução de movimento |
| M15 — assinatura gráfica | Traços vetoriais, cor, data, opt-in, rotação, recorte/limpeza com prévia, posição por mouse/teclado e conjunto limitado à página; perfil nativo aprovado | Corpus de caneta/toque/fotografias/fontes do sistema; gates de publicação no full review |
| M16 — preferências/recentes | Tema/interface/atalhos/painéis, fixação, sessão e retenção | Revisão integrada final e corpus de restauração |

## Implementações

| Requisito | Estado atual | Falta/limite |
| --- | --- | --- |
| I01 — edição real | Texto/imagens/geometria e primeiro perfil de Form interno revisados | Páginas mistas, matrizes/aninhamento/tags/transparência; fontes/escritas complexas |
| I02 — OCR | Local por/eng/spa, orientação/inclinação, revisão, camada pesquisável e retomada | Manuscritos/fotos/tabelas e corpus; preparação ampliada de digitalização |
| I03 — remoção segura | Área/busca, seleção/confirmação, sanitização e cópia obrigatória revisados | Corpus estrutural final; originais/desfazer/snapshots não são apagados por essa função |
| I04 — senha/permissões | AES-256, abertura autorizada e estrutura preservada no perfil revisado | Matriz externa/compatibilidade ampla; permissões não são DRM absoluto |
| I05 — assinaturas existentes | Detecção e aviso de alteração | Validação criptográfica/certificados excluída pelo titular |
| I06 — certificado | Excluído | Não implementar certificado, confiança online ou carimbo do tempo |
| I07 — recuperação/versões | Formato versionado, DPAPI, quotas, origens incorporadas e reinício revisados | Gates finais dos novos fluxos e arquivos grandes |
| I08 — conversões | Perfis editáveis Office/OpenDocument/apresentações/TIFF e tabelas revisados | Corpus Office complexo, edição direta das células e matriz de exportação restrita |
| I09 — comparação | Pendente | Texto/visual, reordenação, OCR, navegação e relatório |
| I10 — autoria de formulários | Texto/checkbox/radio/listas/escolhas/dados, máscaras, sugestão inicial e Tab/fontes | Detecção estática/OCR ampliada, matrizes e XFA; certificados continuam excluídos |
| I11 — navegação/anexos | Marcadores, destinos, links e anexos locais revisados | Corpus de destinos/árvores complexos; nunca executar anexos automaticamente |
| I12 — páginas | CropBox/MediaBox e escala testadas | Substituição preservando destinos/referências e corpus de medidas |
| I13 — acessibilidade documental | Pendente | Tags/idioma/ordem de leitura/alternativas e leitor de tela real |
| I14 — PDF/A/preflight | Pendente | Perfis reais, validador local e relatório; metadados isolados não bastam |
| I15 — scanner | WIA, thread, checkpoint, interface e addon/ASAR; descoberta real conferida | Aquisição física, duplex, limpeza e corpus; sem scanner disponível |
| I16 — intenção | Pendente | Interpretação determinística, prévia, validação e desfazer |
| I17 — leitura assistida | Pendente | Consulta/resumo extrativo com evidência, insuficiência explícita; sem IA remota |
| I18 — extração/conferência | Tabelas com origem/geometria e exportação revisadas | Correção direta, campos/confiança e consistência de datas/valores |
| I19 — preparação por finalidade | Pendente | Receitas configuráveis, prévia, relatório e execução local |
| I20 — compartilhamento online | Excluído | Sem serviços novos, convites ou acompanhamento hospedado |
| I21 — recursos especializados | Perfil inicial de Bates em marcas/numeração, com testes e percurso nativo aprovado | Carimbos, medição, camadas, portfólio, mídia e matriz XFA conforme perfis locais |

As exclusões não cancelam os complementos locais. A falta de hardware/permissão de teste é distinta de código ausente: está registrada sem simular homologação e sem interromper as frentes independentes.
