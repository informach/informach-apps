# Executor da migração de fotografias

Plano de implementação autorizado no fechamento F8. A transferência existente
já conserva PG durante envio, reabre o envelope completo e só publica com mundo
parado, tentativa atual e auditoria atômica. Falta compor sua execução limitada.

1. Configuração privada/off por padrão, contexto Railway produtivo ou GitHub
   sintético separados, origem fixa do leitor, fonte explicitamente selecionada,
   captura anterior verificada e limite de lote/prazo.
2. Rota pública mínima de configuração do leitor: fonte, destino técnico e IDs
   de chaves; nunca chaves, URLs de objetos, fotos, famílias ou dados do banco.
   Ela atesta configuração, não disponibilidade do bucket ou leitura de mundos.
3. Scanner SQL somente de leitura admite fotografias PG anteriores ao início da
   captura selecionada, ainda publicada e sem retirada, com prazo recente.
   Essa data não demonstra presença de cada foto no arquivo anterior: o backup
   protege seu ponto no tempo e a transferência autentica os bytes atuais.
   Só seleciona mundos hibernando sem posse aberta; o executor relê os fatos.
4. Executor privado usa exclusão mútua de conexão própria, recursos fechados,
   envio existente e resumo exclusivamente numérico/booleano. Resposta perdida
   continua recuperável e não autoriza perda dos bytes originais.
5. Provas negativas de configuração, backup, limites, concorrência e leitor;
   PostgreSQL, transporte e imagem reais no GitHub. Nenhum teste pesado local.
6. Implantar leitor e conferir sua fonte/configuração antes de mover bytes;
   preparar backup atual, executar lote, conferir leitura pelo contrato do
   servidor Morada publicado e restaurabilidade. Não habilitar modo de leitura
   antigo depois de remover bytes PG sem devolução explícita verificada.

Não foi criado serviço, alterado modo produtivo ou migrado qualquer byte por
este plano. As dez fotografias produtivas continuam no PostgreSQL.
