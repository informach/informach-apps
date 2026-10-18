# Integração remota do checkpoint Captura — 18/10/2026

Após o aceite de 5b/fix1, a branch `feat/edicaptura-snagit` incorporou localmente `origin/main` em `27ac84cf94e6dc14696f67fe4d68426ec1219587`, por fast-forward a partir de `88c1163d9ca32f3310da77ac853dc71012d3fe7b`. Os quatro commits recebidos são da evolução/publicação EdiFoto. Não houve mudança de fonte EdiPDF nem implementação de OCR. Este registro não declara commit/push deste checkpoint, publicação desktop ou aprovação do review final.

## Preservação e atribuição

Antes da integração, foram preservados em cópias binárias verificadas os 44 arquivos locais modificados e os 126 novos, além dos blobs anteriores e recebidos dos 105 caminhos remotos. A baseline imutável conferiu 3.899 arquivos sem divergências. Toda a árvore pessoal `.claude` foi excluída antes de ler, copiar ou calcular hashes. Os artefatos ignorados permaneceram no lugar; baselines/freezes nomeados e nove entradas do pacote aceito beta29880 foram conferidos separadamente. Capturas antigas não foram abertas, copiadas nem recalculadas.

Os quatro caminhos sobrepostos foram reconciliados: guia Edi, estado do repositório, lockfile e runner nativo. As cópias originais mantêm seus bytes; somente entradas temporárias do merge tiveram CRLF normalizado para LF. Estado e lockfile combinaram automaticamente. No guia foram conservados os comandos/limites Captura e a jornada EdiFoto. No runner foram mantidos o acompanhamento de processos/saída/limpeza do Captura e os destinos Pictures, recuperação durável e fechamento EdiFoto. O lockfile combina exatamente as dependências locais Captura com a remoção remota do SDK Anthropic do Foto, sem atualização de versões.

Depois do fast-forward, os 166 arquivos locais sem sobreposição permaneciam idênticos. A correção de preservação das novas evidências alterou deliberadamente dois workflows desse conjunto; os outros 164 continuam idênticos. Os 101 caminhos recebidos fora das sobreposições permanecem iguais ao conteúdo Git remoto, incluindo a remoção de um arquivo. Fontes do Foto, PDF e packages não receberam correções adicionais desta integração.

## Correções específicas da integração

- O catch genérico de diagnóstico recebido do remoto poderia capturar a página do Captura após uma falha de origem/dimensões. Agora o Captura encerra esse caminho sem consultar a página; mantém a falha e verifica o fechamento normal antes da limpeza. Foto e demais apps conservam o diagnóstico de suas páginas próprias.
- Cada execução nativa cria uma pasta exclusiva `run-*` em `.cache/edi-native-results`, preservando evidências anteriores. Os workflows `edi-native` e `edi-release` coletam `**/*.png`. Não foi preciso modificar fontes dos apps nem mover evidências antigas.
- A verificação dos dois helpers Foto continua restrita ao PID vivo da fixture, caminho esperado do app, PID dos controles e destino temporário exato. Sua consulta interna da linha de comando serve somente a essa autorização e não é impressa, armazenada nem estendida a outros processos. A jornada usa preferências no perfil descartável, sem conexão/execução dos clientes reais de IA.

## Verificações atribuídas à integração

- O teste executa o catch real extraído do runner. Antes da correção: 2 falhas Captura e 7 casos aprovados. Depois: nenhuma leitura da página após os dois erros sintéticos; os demais apps mantêm screenshot e propagação de falhas. A regressão de pastas usa filesystem real e confere os globs dos dois workflows. Tooling final: 60 testes, sem falha.
- Tipos do tooling e do EdiFoto: exit 0. Biome dos dois arquivos de código da integração e da jornada Foto: três arquivos, sem alterações/diagnósticos. Testes Node EdiFoto: 36 aprovados; warning preexistente `MODULE_TYPELESS_PACKAGE_JSON` mantido.
- `pnpm edi:test:native edifoto edicaptura ediaula edisvg edipdf edi-hub`: exit 0, builds dos seis consumidores e execução serial com perfis/chaves efêmeros. Todos encerraram normalmente com código 0, sem sinal/falha; o filho da rolagem também. Limpeza final confirmada.
- Foto confirmou salvar/reabrir, cancelar Salvar como, rascunho durável com conteúdo exato, PNG e original preservado. Captura confirmou perfis próprios, reprodução autorizada, vídeo 64×48 com ACK de disco/controlador, coberturas opacas, fonte própria, anotação/temporizador/cancelamento e rolagem vertical/horizontal com eixo confirmado, pixels exatos e ausência de roda tardia.
- `pnpm --filter @informach/edifoto test:e2e`: exit 0, sete suítes e 177 verificações no navegador, sem erros de página. Executado depois do encerramento dos runners nativos; o backend de testes é em memória, sem clientes reais de IA ou conteúdo pessoal.

O full review do checkpoint e os gates de publicação permanecem separados. A revisão independente deve avaliar este delta junto das entregas anteriormente aceitas. Reconsultar o remoto antes do push; um fetch novo que avance a main exige nova integração.

## Limites que permanecem

O modo ativo sem garantia atômica de origem não foi executado. Mixed-DPI/HDR/dock/suspensão, clipboard global, áudio físico, instalação/upgrade e condições extremas de armazenamento não foram homologados. O novo log nativo não apresentou WGC/GetFrame; isso não explica nem resolve os diagnósticos históricos ou o timeout de retomada. Os avisos esperados de cancelamento/restrição de licença permanecem registrados.

A integração não repete nem apaga os incidentes anteriores: amostragem automatizada de origem inesperada antes da detecção em 4d, interrupção sem nova inspeção depois disso, limpeza antiga bloqueada por revisão automática e exposição anterior de credencial em saída privada com rotação ainda não confirmada. Esses fatos e seus limites devem continuar explícitos no review final; nenhum segredo ou conteúdo daquela captura foi reaberto nesta etapa.

O [handoff Captura/PDF](continuidade-edicaptura-edipdf.md) continua vigente: 5c e lotes 6–8 adiados, base OCR comum a planejar com o EdiPDF atualizado e cada ferramenta independente na instalação.

## Correção da revisão 009 — 18/10/2026

A revisão independente encontrou uma falha no ciclo de encerramento do runner: a configuração de Pictures podia rejeitar depois do lançamento, antes do bloco que pede o fechamento normal. A raiz era preservada corretamente, mas o processo próprio permanecia vivo. O achado 009/001 foi corrigido colocando essa configuração no início do try por aplicativo, antes dos diálogos, mantendo o acompanhamento imediato do filho.

A regressão executa o fluxo real do runner com operações externas inertes: a configuração rejeitada pede um único fechamento e a limpeza aguarda a saída verificada; se o fechamento rejeita com o filho vivo, preserva a raiz e propaga os erros. Os dois casos falharam antes da correção e passaram depois. Tooling final: 62 testes, tipos e Biome aprovados. Os seis consumidores nativos foram reconstruídos e executados novamente, em sequência, com saídas normais e limpeza confirmada; evidências em uma nova pasta própria, sem sobrescrever a rodada anterior. Não houve alteração nas fontes dos apps, SDK, lockfile ou workflows. O re-review independente desta correção e o full review do checkpoint ainda são etapas distintas e pendentes.


## Aceite independente da integração

009/001 foi corrigido e aceito no re-review: SPEC e QUALITY/SECURITY ACCEPT, zero novos achados. O responsável leu o relatório integral e manteve os limites físicos/históricos. Testes de lifecycle comprovam fechamento solicitado e verificado antes da limpeza, ou retenção da raiz com todos os erros quando close falha. O novo gate sequencial dos seis apps confirmou encerramento normal; não equivale a frequência física da falha modelada ou homologação nativa geral. Full review do checkpoint e gates finais continuam separados.
