# Normalização offline após recuperar a captura

Estado: próximo incremento em candidata; nenhum banco/objeto de produção alterado.

A comparação do inventário comprova a restauração ANTES da normalização. Ela
não autoriza servir permissões antigas ou consultar o bucket original.
A primeira etapa materializa as fotografias autenticadas em PG no cluster
novo e privado, sem credencial do banco de origem ou acesso ao objeto vivo.

- Admitir somente o cluster privado do executor (PostgreSQL 18.6, socket
  próprio, sem listen TCP, banco aleatório de recuperação). Recusar banco de
  CI comum ou serviço original antes de qualquer escrita.
- Comparar o inventário completo do índice com o cabeçalho do composto,
  autenticar cada foto de até 4 MiB e conferir todos os vínculos SQL.
- Em transação offline, devolver bytes verificados a `storage=pg`; preservar
  revisão/tick/formato/SHA e conferir leitura nativa dos bytes. Falha reverte
  o lote inteiro. Todas as referências bucket precisam desaparecer.
- Conservar os recibos de origem em estado `quarantined`, com data e estado
  anterior próprios, inclusive a primeira data de retirada. Destacar vínculos,
  retirar envelopes/tokens, nunca apagar essas evidências ou enviar DELETE à
  origem. O estado novo também é ignorado pelos scanners antigos.
- Capturas restauradas não conservam prova de admissão na base atual: fixar
  `protocol_version=0` (controle legado/recuperado, sem garantia de ausência).
  O número não é versão do formato do arquivo nem substitui sua fonte assinada.
  Admissão/retomada/scanners recusam esse controle até conciliação explícita;
  apenas novos writers na base corrente emitem `1`.
- Esta transformação pode ser repetida quando PG e recibos já correspondem às
  mesmas referências autenticadas. Divergência não é sobrescrita silenciosa.

Objetos normalizados NÃO tornam o banco apto ao tráfego. Revogar autoridades,
reaplicar ledger F7, conferir identidade atual, destinos/chaves, processos e
retenção continuam etapas obrigatórias. A recuperação compartilhada segue
isolada; não restaurar todos os apps sobre o PostgreSQL original para liberar
só o Recreio. Provas no GitHub usam dados sintéticos e apagam seus clusters.

A primeira prova externa passou em `44501616990`/`f9b6727b`: uma foto recuperada
em PG, uma referência de origem quarentenada, um controle antigo desabilitado,
zero operações/referências bucket restantes; segunda execução idêntica. O ZIP
foi conferido por SHA/tamanho e a limpeza confirmada. Não normaliza autoridades.
A primeira checagem de tipos `44501131053` encontrou só o tipo dos parâmetros
SQL de um teste; a correção usa o tipo do builder de UPDATE, sem casts.

A revisão de conexão acrescenta espera explícita pelo callback transacional
antes de devolver arquivos/chaves emprestados: `begin` pode rejeitar antes do
callback na perda do backend. A CLI exclusiva de homologação passa a injetar
queda depois das escritas, comparar todo o inventário após rollback, recusar
manifesto divergente e recusar foto PG corrompida sem sobrescrita silenciosa.
Estes casos posteriores exigem nova prova; não pertencem ao recibo anterior.
Diagnósticos usam somente enum fixa, nunca mensagens/cause/SQL/conteúdo/chaves.

A injeção posterior falhou em `44504197654`/`bc957b7f`, com diagnóstico
`SQL_57P01` e limpeza dos objetos confirmada. A prova passa a encerrar o
cliente atingido pelo FATAL antes de inspecionar o rollback por conexão nova,
restrita ao mesmo socket/banco privado e encerrada antes da remoção do cluster.
Não repete escritas desconhecidas nem altera a API operacional para ensaios.
A correção ainda depende de nova execução remota.
