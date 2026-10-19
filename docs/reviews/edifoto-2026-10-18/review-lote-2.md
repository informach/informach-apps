# Review do lote 2

18/10/2026. Fidelidade e consistência, mantendo a interface existente.

Implementado: base afim para redimensionamento não proporcional, avaliador único das posições usado por vetores/GPU/pintura/seleção, máscaras novas vinculadas com opção de desvincular sem mudar o recorte e referências preservadas nas operações da imagem. Bloqueio protege edição, exclusão, propriedades e máscaras. Mesclagem normal preserva pixels; mesclagens dependentes de backdrop são recusadas com explicação, sem rasterização visualmente incorreta. Limites de resolução/memória são verificados antes das operações; importação não reduz silenciosamente o original. O compositor valida framebuffer e reconstrói recursos após restauração do contexto GPU.

Formato v2 (`EDIFOTO2`) preserva bases e vínculo de máscara. Lê v1 sem mudar o comportamento das máscaras legadas. Ao sobrescrever um arquivo v1, conserva `.v1.bak` sem substituir backup existente. O cabeçalho novo impede versões antigas de ignorarem silenciosamente a geometria nova.

O review encontrou uma causa adicional de divergência: upload de máscara alterava o binding da textura fonte. A ordem de upload/binding foi corrigida e entrou na jornada de pixels. A primeira execução de fidelidade detectou esse erro; somente depois da correção o lote foi aprovado. A restauração GPU foi verificada pelo evento real de perda/restauração, com espera pelo próximo frame para concluir o ciclo do evento.

Gates: 28 unitários e typecheck passaram. Integração: 68 verificações anteriores, 10 de segurança, 14 de fidelidade e 10 de chroma passaram sem erros JavaScript em execução estável. A verificação de arquivos no Node confirma preservação da saída e backup v1. Biome sem erros nos arquivos modificados, warnings legados visíveis.

Conclusão: aprovado para simplificação da experiência. Equivalência de todos os blends Adobe, arquivos profissionais e composição por blocos não fazem parte do escopo reduzido. O app conserva limites explícitos, em vez de prometer resolução ilimitada.
