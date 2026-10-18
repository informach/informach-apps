# Evolução do EdiPDF

Execução autorizada em 18/10/2026 a partir da [análise funcional](../../docs/reviews/edipdf-2026-10-18/analise-funcional.md). A orientação final do titular é concluir o lote atual, documentar o que falta, fazer o full review e publicar. A entrega foi isolada em `release/edipdf-evolution`, baseada na `main` atual, preservando alterações não relacionadas do checkout compartilhado. Commit, integração e publicação estão autorizados, condicionados aos gates da suíte.

Estado vigente: [full review da entrega](../../docs/reviews/edipdf-2026-10-18/full-review-entrega.md), [pendências pós-release](../../docs/reviews/edipdf-2026-10-18/pendencias-pos-release.md) e [matriz de requisitos](../../docs/reviews/edipdf-2026-10-18/cobertura-requisitos.md). O restante deste plano registra a implementação por lotes; os relatos intermediários abaixo não substituem esses três registros atuais.

## Escopo aprovado e exclusões

As funções novas devem funcionar localmente, sem contratação, conta, chave ou serviço externo. Bibliotecas abertas e recursos distribuídos junto do app são dependências locais, sujeitas à revisão de licença e empacotamento. A integração comercial já existente da suíte permanece sob seus contratos.

- Excluídos I05/I06 no que envolve validação criptográfica/cadeia de confiança, assinatura com certificado, A1/A3, carimbo do tempo e verificação online. Detectar assinaturas existentes e avisar sobre alteração continua como proteção de documento, sem declarar validade.
- Excluídos IA remota, tradução/resumo gerativo por API, envio de arquivos para providers, revisão hospedada, convite por e-mail, solicitação/acompanhamento de assinatura e armazenamento documental em nuvem (I20).
- I16–I19 ficam restritos a automações determinísticas, consulta/extração local com referência e preparação de arquivos. Não apresentar busca ou resumo extrativo como modelo generativo.
- Scanner, conversão Office, arquivamento e recursos especializados devem ter implementação e homologação local explícitas. Dependência de hardware ou software instalado deve ser visível; ausência não autoriza simular sucesso.

## Lotes e gates

| Lote | Conteúdo | Estado |
| --- | --- | --- |
| 0 | Integridade inicial: referências a páginas excluídas, rascunhos/recuperação, cópias, importação integral e assinatura gráfica | Implementado e revisado; limites no review |
| 1 | Fundação versionada, comandos iniciais, recuperação automática, anotações nativas e formulários importados | Implementado e revisado; complementos no review |
| 2 | Motor local: edição estrutural, fontes/Unicode, redação/sanitização, senha, objetos e geometria | Implementado e revisado; complementos no review |
| 3 | Leitura, busca, links/marcadores/anexos, interface, preferências, acessibilidade de interação e autoria de formulários | Implementado e revisado; matriz/corpus no review |
| 4 | OCR, conversões locais, compactação por meta, impressão, lotes/tarefas/cancelamento e digitalização | Perfis iniciais implementados e revisados; intervalos/segundo plano e retenção de fontes também aprovados na jornada completa. Complementos e limites no review consolidado, sem full review |
| 2/3 C | Complementos de autoria e compatibilidade | Senhas, autoria, formulários, Form interno, gestos, campos, marcas e assinatura gráfica revisados; corpus amplo e clipboard nativo nas pendências pós-release |
| 5 | Comparação, consulta/extração/automação local, preparação por finalidade, acessibilidade documental e recursos especializados | Adiado por orientação final; escopo e critérios nas pendências pós-release |
| Final | Full review de código/contratos/segurança/UX/roundtrip, gates do app e consumidores afetados, corpus e limites | Review local concluído; testes/tipos/builds e jornada dos seis apps aprovados. Gates remotos/publicação pendentes no full review da entrega |

Cada lote exige testes proporcionais, tipos, build, análise do diff e review registrado com correções antes de avançar. Jornadas Electron usam perfis e fixtures isolados, com as proteções da suíte ativas. Um teste de abertura não substitui validação do conteúdo da saída. Uma função parcial não será registrada como concluída nem ocultada por mensagem de sucesso.

Complementos atuais: [formulários revisados](../../docs/reviews/edipdf-2026-10-18/review-formularios-complemento.md), [clipboard em homologação](../../docs/reviews/edipdf-2026-10-18/review-clipboard-parcial.md) e [capacidade/risco dos Form XObjects](../../docs/reviews/edipdf-2026-10-18/probe-form-objects.md). O teste nativo do clipboard exige uma estação Windows exclusiva; a falta dessa permissão não autoriza usar o clipboard pessoal nem interrompe os demais complementos.

## Histórico da integração e revisão do lote 4

As tarefas usam chamada autenticada no main, `desktop.jobs.begin/check/finish`, MessagePort e workers locais. A fila reserva bytes/quantidade, permite uma etapa de CPU por vez e mostra progresso/interrupção/revisão. Resultados completos e checkpoints ficam protegidos com retomada explícita. A saída exige nova escolha de destino e commit seguro; nenhuma tarefa substitui silenciosamente a revisão aberta.

OCR tem checkpoints por página e retomada parcial após reinício; compactação protege entrada/resultado. Conversões locais têm perfil editável declarado e limites de fidelidade. Divisão/imagens protegem cada arquivo completo, retomam o restante e publicam uma pasta inteira/exclusiva. A jornada interrompeu um lote real e completou cem imagens sem alterar o prefixo. Junção/compactação opcional tem worker, segundo plano, revisão e cópia conferida com campos independentes. Perfis: [conversões](../../docs/reviews/edipdf-2026-10-18/perfil-conversoes.md), [lotes](../../docs/reviews/edipdf-2026-10-18/perfil-lotes.md) e [junção](../../docs/reviews/edipdf-2026-10-18/perfil-juncao.md).

Impressão vetorial conserva texto/aparências e compõe folhas/livreto; preparação, revisão/retomada e PDF salvo passaram. Impressão restrita a 200 dpi também tem jornada local aprovada, com senha em memória, permissão conferida e exportação da tarefa bloqueada no main. Intervalos, segundo plano e retenção de fontes com fechamento da aba passaram na jornada ampliada. Driver, duplex e papel impresso não foram homologados; [perfil de impressão](../../docs/reviews/edipdf-2026-10-18/perfil-impressao.md).

TIFF multipágina tem corpus independente/comparação de pixels e jornada. WIA de uma face tem thread, checkpoint antes da próxima folha e worker em ASAR; enumeração real encontrou zero scanners. Review documental corrigiu seleção WIA 2 para FRONT_ONLY. Aquisição física e duplex continuam pendentes, sem simulação de sucesso; [perfil de digitalização](../../docs/reviews/edipdf-2026-10-18/perfil-digitalizacao.md).

Gates, marcos, correções e complementos obrigatórios ficam no [review intermediário](../../docs/reviews/edipdf-2026-10-18/review-lote-4-parcial.md). Ainda não há full review.

## Estado e continuidade

Estado vigente do complemento: [senhas, escolhas e divisão](../../docs/reviews/edipdf-2026-10-18/review-senhas-escolhas-divisao.md) passaram pela jornada completa, incluindo reinício/gates, e o build normal foi restaurado. As falhas e seus diagnósticos foram preservados. Próxima frente: intervalos/exceções, margens, cabeçalhos/rodapés, estilos e rótulos de numeração e prévias reais por página. O lote 5 e o full review seguem pendentes.

[Marcas e numeração](../../docs/reviews/edipdf-2026-10-18/review-marcas-numeracao-parcial.md) estão implementadas com modelos opcionais, intervalo/exceções, margens/fontes, cabeçalhos/rodapés, estilos/Bates, rótulos PDF e prévia real reutilizável por página. Testes/tipos passaram; jornada integrada em execução. A revisão original é conferida antes do commit; alterações podem ser desfeitas. O aceite nativo e o build normal serão registrados após o encerramento.

O [mapa por requisito](../../docs/reviews/edipdf-2026-10-18/cobertura-requisitos.md) relaciona C01–C16, M01–M16 e I01–I21 aos perfis implementados, complementos pendentes e exclusões. Ele não substitui as evidências e gates de cada review.

Complementos em execução: [senhas](../../docs/reviews/edipdf-2026-10-18/review-senhas-parcial.md), com fronteira C, equivalência de privilégios, limite UTF-8 e autorização de alterações; [escolhas de formulários](../../docs/reviews/edipdf-2026-10-18/review-escolhas-parcial.md), com rótulos/valores, seleção múltipla, autoria e aparência própria. Os testes do app passaram. O fluxo nativo de senhas passou, mas a rodada integrada expirou no encerramento anterior ao reinício; o build normal foi restaurado e uma nova rodada com diagnóstico de saída/listas está em execução. Ainda não há aceite dessa rodada, nem full review.

[Divisão por marcadores/tamanho real](../../docs/reviews/edipdf-2026-10-18/review-divisao-estrategias-parcial.md) também está implementada com planejamento em worker e plano protegido na retomada, com testes/tipos/Biome. A primeira jornada de listas encontrou uma espera ambígua no harness, corrigida; build normal restaurado. A rodada nativa atual reúne senhas/listas/divisão e o reinício obrigatório, sem aceite antecipado.

18/10/2026: lotes [0](../../docs/reviews/edipdf-2026-10-18/review-lote-0.md), [1](../../docs/reviews/edipdf-2026-10-18/review-lote-1.md), [2](../../docs/reviews/edipdf-2026-10-18/review-lote-2.md) e [3](../../docs/reviews/edipdf-2026-10-18/review-lote-3.md) revisados. Busca/leitura, perfil/versões, navegação, formulários e anotações têm jornada Electron reproduzível e recuperação após reinício. OCR e compactação por meta/prévia estão no [review intermediário do lote 4](../../docs/reviews/edipdf-2026-10-18/review-lote-4-parcial.md), incluindo arquivos em lote com destino nativo. O documento de recuperação permanece na versão 1; o envelope de anotações lê v0/v1 e usa v2 comprimido para caixas de texto/modelos grandes. O perfil inicial do lote 4 foi revisado. O [primeiro complemento de autoria](../../docs/reviews/edipdf-2026-10-18/review-autoria.md) passou pela jornada integrada completa; formulários/compatibilidade e demais complementos continuam em execução, antes do lote 5. Os complementos de cada frente continuam obrigatórios. Sem full review ou publicação.
