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

A rodada com etapas fixas `44507142482`/`e77978b9` localizou a falha no
reconhecimento da recusa de foto corrompida, após o rollback já conferido.
O decoder do composto convertia a exceção do callback em I/O genérico. A
regressão `44507438172`/`7e23e873` reproduziu exatamente essa perda de
identidade: 166 casos passaram e um falhou. O callback agora conserva sua
exceção, enquanto a limpeza das chaves continua em `finally`; I/O do próprio
decoder conserva sua classificação. A prova separa recusa não classificada de
sobrescrita real da foto. Nova execução remota ainda obrigatória.

A correção passou em `44507816907`/`bf6fa706`: 167 testes de objetos e tipos,
seguidos da composição no bucket real com queda de backend, inventário integral
após rollback, manifesto divergente, recusa da foto PG corrompida e repetição
idêntica. O recibo original confirmou quinze condições, três GETs restritos ao
prefixo do backup e limpeza dos quatro objetos/cluster/arquivos. ZIP de 1.052
bytes conferido pelo SHA-256 registrado em
[evidência](evidencias/captura-provider-44507816907.json).
A integração anterior `44506197051`/`ee755949` concluiu 1.313 PostgreSQL,
dezesseis nativos e cinco HTTP. Os dezesseis gates e o CI compartilhado da
fonte corrigida estão em execução; nenhum desses resultados autoriza tráfego
restaurado ou aplicação das migrations candidatas.

Os dezesseis gates da fonte corrigida `bf6fa706` concluíram com sucesso em
`44507842698`. A integração posterior `d32c07ae` com a main também repetiu a
prova externa completa em `44509240153`, com ZIP/SHA e limpeza conferidos.
Seus gates gerais/compartilhados e o quality posterior do migrator precisam
ser conferidos separadamente; [controle da integração](integracao-f6-f8-2026-11-19.md).

## Próxima etapa: capacidades temporárias recuperadas

Implementar `scripts/backup/normalizar-capacidades.ts`, chamado somente depois
de comparar o inventário do cluster privado restaurado. Reutilizar a exigência
de socket privado/PostgreSQL 18.6/banco aleatório antes de qualquer escrita e
uma transação com prazos. Recusar perfil de schema desconhecido. Sem cliente de
rede, credencial da origem, ator fictício ou criação de consentimento.

Revogar todos os aparelhos nativos/pareados conservando a primeira revogação e
o contexto infantil. Retirar hashes portadores pareados, pedidos de pareamento,
ingressos/handoffs e permissões transitórias de salvamento; encerrar SIDs abertos
com motivo existente e nextval do cursor; liberar posses antigas, aposentar
instâncias e encerrar presença/visita/sessão visitante. Limpar corpo/referência
de exportações temporárias e conservar metadados/prazos originais. Não apagar
core.users/core.sessions, dados/perfis, concessões, contratos ou períodos pagos.
A fonte restaurada não decide o estado atual desses direitos permanentes.

Provar no GitHub com captura sintética contendo capacidades realmente ativas,
recusa em banco comum antes de mutação, rollback integral por falha antes do
último efeito, zero capacidades restantes, invariância de todas as demais
tabelas e segunda execução sem mudanças. Evidência agregada sem IDs/conteúdo;
a sequência de encerramento pode consumir números em rollback, sem reuso.
Integrar ao executor do cluster frio, preservando as provas anteriores de
fotografia/quarentena/queda/limpeza. `authoritiesNormalizedForTraffic` continua
false: reaplicação F7, identidade/cobrança atuais, capacidades de convite,
chaves/destinos novos e admissão de tráfego ainda não estão comprovados.

A inspeção da candidata 11b9b7a2 encontrou um marcador de patch residual no
array de tabelas e corrigiu a origem antes de qualificá-la. A fixture também
fixa requested_at/expiry do handoff no mesmo instante SQL para respeitar a
janela exata de sessenta segundos, sem relaxar o CHECK. Os gates da correção
precisam passar, inclusive a composição externa com cluster frio.
