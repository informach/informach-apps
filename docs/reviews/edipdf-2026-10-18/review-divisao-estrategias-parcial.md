# Review de divisão por marcadores e tamanho

Estado vigente: perfil aprovado na jornada completa, com cópias reais relidas; [review consolidado](review-senhas-escolhas-divisao.md). O registro abaixo conserva o estado de implementação anterior ao aceite.

18/10/2026. Complemento de M08 implementado com testes/tipos/Biome; jornada nativa em execução. Sem aceite antecipado, full review ou publicação.

O diálogo oferece nível de marcadores e tamanho máximo por arquivo. Marcadores do nível escolhido iniciam partes por destino local, em ordem de página. Destinos repetidos são consolidados; páginas anteriores ao primeiro marcador são mantidas. Nível sem marcadores ou destino não local é recusado. Títulos nunca se tornam caminhos de arquivos.

O modo por tamanho compõe PDFs reais com o mesmo gravador usado na saída, verifica os bytes e conserva cada página uma vez, em ordem. Não estima tamanho a partir da origem. Como compressão não precisa ser monotônica, o planejamento procura uma combinação conferida sem prometer o menor número de arquivos. A página isolada que excede a meta exige limite maior ou compactação; o app não elimina conteúdo nem rasteriza para cumprir a meta. Cada arquivo final e cada detalhe protegido voltam a ser conferidos contra o limite.

O plano resolvido entra no primeiro checkpoint. Retomadas reutilizam os grupos protegidos, recusam alteração de ajustes/origem e conservam o prefixo já concluído. Antes de resolver o plano não há arquivos completos para recuperar. Há etapa de planejamento explícita, sem porcentagem inventada. Cancelar o worker encerra essa etapa como nas demais operações em worker.

Limites: origem de 64 MB/mil páginas; cem partes; tamanho entre 1 KB e 32 MB; até mil composições de conferência/dois minutos de planejamento. Continuam os limites do ZIP, retenção e publicação exclusiva do [perfil de lotes](perfil-lotes.md). As partes preservam metadados/anexos globais e reiniciam rótulos personalizados de página, com aviso. O gravador canônico conserva aparências sem atualizar o relógio dos metadados, garantindo que medida e saída usem o mesmo processo.

Cinco testes novos conferem níveis/prefácio/destinos repetidos, destino não local, bytes reais e releitura dos PDFs, recusas de plano incompleto/parte acima da meta, retomada sem replanejar ou alterar o prefixo e interrupção antes de checkpoint. Os testes anteriores de lotes também passaram, incluindo campos, referências, ordem descendente e commit exclusivo. **265 testes do app aprovados**, tipos app/harness/testes e Biome da frente aprovados. Evidências: `.cache/edipdf-analysis/test-split-strategies.txt`, `test-split-strategies-all.txt`, `typecheck-split-strategies.txt`, `types-split-strategies.txt`, `biome-split-reviewed.txt`.

A jornada `native-split-strategies.txt` acrescenta os controles reais, recusa de página acima do tamanho, revisão/planos protegidos e pastas salvas com bytes idênticos ao arquivo revisado. Inclui novamente autoria de rótulos/valores, senhas, regressões completas e reinício. A restauração do build normal e o resultado serão registrados após o fim.

Pendências: aceite nativo da rodada; corpus externo/performance dos novos modos; substituição de páginas com preservação de referências; relatório/repetição dirigida de falhas e demais complementos do mapa. Sem contratação ou serviços externos.
