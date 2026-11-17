# Salvamento restrito no fim da autorização

Plano de F3 em implementação. Não habilitar famílias, cobrança ou pausa
automática com base no modelo ou no aviso antecipado isolados.

## Contrato

A concessão infantil continua de até 60 segundos e termina no horário,
orçamento ou mudança do dia. A margem de salvamento não é tempo de gameplay.
Uma capacidade distinta, emitida enquanto a sessão está autorizada, permite
somente concluir a persistência e encerrar o mesmo SID por até 30 segundos
depois da concessão. Não aceita novos comandos, entrada em mundo, conquistas,
renovação, administração ou abertura de outra partida.

Usar token EdDSA com `typ` próprio e escopo exclusivo `salvar`, vinculado a
recibo persistido, perfil, jogo, SID, versão da política e aparelho original.
Os verificadores de ingresso e sessão recusam esse tipo. Token, corpo e hashes
de conteúdo nunca entram em auditoria, URL, DOM, logs ou armazenamento web.
O prazo assinado e o persistido são limites cumulativos, relidos ao final.

A autorização atual de identidade/aparelho é compartilhada com gameplay:
login ou pareamento vigentes, geração, responsável, perfil ativo, banimento
e política atual. A capacidade não sobrevive a logout, revogação, mudança
de perfil, política ou responsável, nem a uma sessão sucessora. Perda de
direito comercial pode permitir salvar dentro do prazo, sem restaurar acesso.
Retorno idempotente de um recibo concluído nunca reexecuta uma escrita.

Dados de perfil usam somente gravação com revisão/CAS, cotas e preservação
de conflitos existentes. Um lote final tem chaves únicas e tamanho total
limitado; falha não declara sucesso. Conflitos conservados devem ser informados
para resolução ao voltar, sem escolher uma versão silenciosamente. O mesmo
motor de dados atende a chamada normal e a finalização já autorizada; não
copiar o writer ou criar um acesso genérico a transações.

Mundos são confirmados somente pela instância autenticada e pela posse atual:
pausar comandos daquele SID, concluir sua fila admitida, persistir fotografia
íntegra cobrindo o diário e confirmar cerca/revisão/sequência. Outros membros
continuam. Um booleano do navegador não é prova. A integração genérica faz a
homologação; Morada continua com a capacidade que seu adapter realmente oferece.

## Incrementos e arquivos

1. Modelo aditivo em `packages/db/src/schema/recreio-salvamento.ts`, export
   e geração remota por `db-generate.yml`; revisar SQL, snapshot e proveniência.
   Nenhuma alteração manual em arquivos gerados, backfill de sessões abertas
   ou execução de sementes. Aplicar antes de consumidores e conservar no rollback.
2. Tipo/claims próprios em `packages/recreio/src/contrato/tokens.ts`, emissor
   e verificação restrita; contratos de finalização e limites no mesmo package.
   Negativas de troca de tipo/audiência/perfil/prazo e compatibilidade antiga.
3. Extrair somente a admissão comum de identidade/aparelho do kernel existente,
   preservando ordem de travas. Gameplay conserva cobrança/conteúdo/tempo.
   Finalização exige o recibo e verifica o mesmo SID/aparelho/PV e a ausência
   de sucessor, sob o mutex de sessão e antes de escrever dados.
4. Emitir/renovar o recibo e token na transação normal da concessão. Recuperar
   abertura devolve somente o recibo do SID já aberto, sem criar concessão.
   Um deploy antigo continua válido com o novo recurso desligado.
5. Finalizador de perfil, rotas restritas e extensão do SDK. Serializar a fila,
   conservar o corpo/recibo em resposta incerta e repetir somente a mesma
   operação. Encerramento, prova, auditoria e dados confirmam atomicamente.
6. Finalizador de mundo pela API das instâncias; consumidor genérico e jornadas
   reais de tempo, rede e outro membro. Nenhuma tolerância global de JWT ou
   método que transforme a capacidade de salvar em sessão de jogo.
7. Integrar aviso/pausa, finalização e mensagens do host; expurgar recibos em
   lotes limitados; agregar separadamente o tempo de salvar após o corte.
   Na mudança do dia, exigir nova admissão: nunca renovar o intervalo anterior.

## Verificação e aceite

Somente no GitHub, com PostgreSQL descartável e navegadores reais. Conferir:
tempo/horário/dia; token normal vencido recusado; capacidade restrita só persiste;
revogação e política concorrentes; sucessor; replay com mesmo corpo e recusa
de corpo divergente; conflito; auditoria com falha/espera; expiração durante
trava; posse perdida, fotografia corrompida e outro membro ativo. Testar falha
de rede depois do commit sem duplicar dados ou declarar salvamento inexistente.
Os consumidores compartilhados e os sete gates do Recreio precisam de evidência
aplicável à fonte final, seguida de implantação e conferência de configuração.

Este plano não é entrega. F1 e F4–F11 permanecem no registro principal.

## Preparação candidata

Modelo `70fb884c`, gerado no GitHub em `44060168275`, artefato `14317712495`.
Copiados e conferidos sem edição manual:

- `0177_whole_tomas.sql`: 5.676 bytes,
  SHA-256 `928c8bf90cd72c7c643485dddd383248e53295f7679e3f91d48a12f0c551760d`.
- `0177_snapshot.json`: 766.432 bytes,
  SHA-256 `cf6a04e5e8bfc336ca05a40885e0f8c38429e16589f104ad07d32d1aa59f1a21`.
- Journal: 27.022 bytes,
  SHA-256 `ffe01215e0a48045b722867bd837e3aadeaa965f16b52d45024d6320d992d15a`.

Somente tabela nova, FKs/constraints e índices sobre tabela vazia. Não há
backfill nem mudança de constraints existentes. As seis provas do modelo
verificam correlação, margem, ciclo terminal (inclusive NULL em CHECK), prova
de mundo, expiração e ausência de reabertura ao remover o recibo.

O primeiro incremento de contratos acrescenta tipo/escopo restritos, prazo
criptográfico exato, emissor e verificadores, além do lote final limitado e
sem chaves duplicadas. Ainda não emite capacidade em sessão real, não expõe
rota e não persiste pela margem. Nenhuma configuração de produção habilita
o modelo. Os gates da candidata ainda precisam ser executados.

`5eebd6b` passou nos sete gates `44061099972`, incluindo as seis provas do
modelo e a separação criptográfica de tipos/escopos. O CI compartilhado
`44061099338` ainda está em execução. 0177 continua privada, sem aplicação
em produção; a fonte efetiva do portal é `668dde1` com os dois modos `off`.

## Writer de perfil em candidata

O próximo incremento extrai a admissão comum de identidade/aparelho, sem
retirar direito comercial, conteúdo ou prazos do kernel de gameplay. O novo
finalizador exige capacidade própria, recibo, versão, dispositivo e prazo
atuais. Só aceita `left`, `expired` ou `access_lost` como encerramentos anteriores;
revogação, transferência e barreira de troca são recusadas. O cursor de
encerramento detecta também um sucessor que já tenha terminado, sob o mutex
do perfil, sem ordenar UUIDs ou depender da hora do navegador.

O motor CAS é extraído sem duplicação para a transação já admitida. Lote,
conflitos preservados, recibo, fim da sessão e auditoria confirmam juntos.
Repetição exige o mesmo hash e não executa o writer. Limite de dez pedidos por
perfil/minuto precede ler o corpo de até 2 MiB. A rota usa apenas o novo tipo
Bearer; token normal não vale nessa rota e a capacidade não vale nas rotas
de gameplay. A emissão automática/renovação do recibo e o consumidor do SDK
ainda não estão ligados.

As provas HTTP/banco verificam concessão expirada com relógio real, replay,
corpo divergente, conflito, aparelho/política/sucessor/barreira, tipo incorreto,
recibo de outro SID, falha de auditoria e espera atravessando o prazo. A prova
de espera usa uma sequence descartável para comprovar que o trigger foi
executado antes da recusa, mesmo após rollback. Ainda sem gates deste writer.

Na rodada `3a83891`/`44063593446`, a integração passou, mas a compilação dos
demais gates parou porque a fixture de revogação usava um campo das concessões
na tabela de aparelhos. A fixture deve mudar somente `revokedAt`; não alterar
o schema para acomodar o teste. A candidata também limita a margem a trinta
segundos de um encerramento antecipado, mesmo quando a concessão assinada iria
até mais tarde. Nova prova de HTTP cobre esse fato. Nova rodada completa pendente.

## Emissão negociada em candidata

O campo opcional `suportaSalvamento: true` negocia a capacidade na abertura,
somente com modo de checkpoint ligado e título que declare suporte. Sem essa
negociação, a abertura e todas as renovações conservam a forma anterior.
A renovação atualiza o prazo do mesmo recibo; recuperação só reassina o recibo
do SID que já existe, sem estender seus prazos nem registrar nova emissão.
Criação, assinatura, auditoria e concessão normal são atômicas. A margem continua
separada do token normal. O host e SDK ainda não solicitam a nova capacidade.

Arquivos: `salvamento/emissao-repository.ts`, composição na emissão/renovação,
contratos opcionais e provas HTTP de negociação, compatibilidade, recuperação
e rollback da auditoria. Auditoria nova registra somente IDs técnicos na criação,
sem repetir eventos em renovações. Ainda faltam a espera limitada antes de um
sucessor, o consumidor do SDK, o finalizador do servidor de mundo e as jornadas
de pausa automática. Não ativar a flag a partir dessa etapa isolada.

## Consulta restrita em candidata

`GET /api/sdk/v1/sessao/salvamento` usa o tipo próprio e a mesma admissão
atual do finalizador; continua disponível depois que a concessão normal termina,
dentro da margem. Responde somente estado técnico e prazo efetivo, sem hashes,
chaves, progresso ou conteúdo. Não renova, não modifica o recibo e não toma
a trava global dos encerramentos. Consulta e conclusão compartilham um núcleo
privado com operações discriminadas; a leitura não recebe callback de escrita.
Recibo ainda pendente de um SID sucedido é recusado também na leitura.

Provas adicionais: leitura antes/depois do commit, igualdade do recibo antes e
depois da consulta, recusa após revogação/política/barreira/sucessor e leitura
enquanto outra transação conserva o cursor global. As assinaturas de sessão
e ingresso continuam incompatíveis com a rota. Consumidor do SDK ainda pendente.

`6acd97c` passou nos sete gates `44064371128`; `8dd7ae3` passou nos sete gates
`44065394934`, incluindo emissão negociada, compatibilidade, recuperação e
rollback da emissão. Essas rodadas não incluem a consulta restrita descrita
acima. A produção está na integração `2475661`, com 0176/177 recibos e modos
desligados; 0177 e todos os escritores de salvamento continuam privados.

## Consumidor do SDK em candidata

A consulta restrita de `e5724ca` passou nos sete gates `44067205297`.
O SDK negocia a capacidade apenas com `salvamentoRestrito: true`, conserva a
capacidade atualizada nas renovações e expõe consulta e conclusão separadas.
A conclusão copia e ordena o lote antes da rede, suspende a renovação e usa
somente o token restrito, inclusive depois do corte da sessão normal.
Chamadas simultâneas iguais compartilham um pedido; conteúdo divergente é
recusado. Resposta indisponível admite uma repetição do lote idêntico; recusa
definitiva não repete. Somente a confirmação positiva dispensa a saída normal.

As novas provas cobrem cópia dos bytes, coalescência, perda de resposta,
compatibilidade e atualização do token. A integração usa o SDK e handlers
reais: perde a primeira resposta depois do commit e exige uma única versão e
um único evento de conclusão. Esse consumidor ainda aguarda gates próprios.
O host não solicita a capacidade; pausa automática, servidor de mundo e espera
antes do sucessor continuam pendentes. Não ativar os modos em produção.

## Leitor da margem antes de nova abertura, em candidata

A abertura consulta recibos pendentes do perfil sob o mesmo mutex do
finalizador, antes de consumir ingresso, encerrar o antecessor ou emitir outro
SID. Concessão vencida ou saída antecipada elegível conserva a margem, limitada
ao menor prazo entre o recibo e trinta segundos do encerramento. A recusa
`saving` não amplia prazo nem confirma persistência. Também vale ao mudar de
jogo e ao desligar o modo depois de uma emissão. Revogação explícita, política
divergente e recibos já sucedidos não prendem a abertura à margem histórica.
Um recibo confirmado ou vencido libera nova admissão normal.

O SDK pode aguardar essa recusa com o mesmo ingresso/prova na reconexão, sem
solicitar substituição de outro aparelho. Mantém os tetos anteriores de espera
e tentativas. Provas de banco cobrem consumo intacto, leitura do commit final,
saída antecipada, prazo vencido, revogação e concorrência com o finalizador.
A fixture de sucessor histórico é inserida diretamente: a API nova deve
impedir justamente a corrida que aquela negativa ainda precisa recusar.
Índices de busca e retenção entram na homologação de carga antes da ativação.

Reprodução `ef033e3`/`44069290332`: as três aberturas indevidas falharam como
esperado; 497 outros testes passaram. A primeira candidata `d5eedcd` falhou
no remoto ao passar `Date` sem encoder em SQL interpolado. O corretivo usa
comparadores de coluna do Drizzle e ISO com tipo explícito na expressão de
intervalo. Não usar a rodada falha como evidência de autorização ou produção.

## Finalização do mundo em duas fases, em candidata

A API das instâncias acrescenta `salvarSessao`, separada do checkpoint de troca,
no cliente estendido `ClienteDoHostComSalvamento`. O segredo/instância e a posse
atuais autorizam apenas o SID já vinculado ao mundo daquele jogo. A capacidade
restrita é derivada do recibo negociado no banco, sem expor token ao servidor do
jogo. Perfil, aparelho, login/geração, política e sucessor continuam conferidos.

`preparar` encerra gameplay uma vez e devolve o estado/prazo efetivo. Repetir
não move o encerramento nem amplia a margem. A instância deve suspender comandos
e esvaziar a fila antes de pedir a preparação. Depois persiste fotografia atual;
`concluir` exige foto posterior ao encerramento, da cerca vigente, cobrindo o
diário atual e com bytes/tamanho/SHA íntegros. A comparação de datas acontece
no PostgreSQL, conservando a precisão dos carimbos. O checkpoint de troca usa
o mesmo verificador de fotografia, conservando seu próprio início do pedido.

Somente a prova, o recibo terminal e a auditoria confirmam juntos. Replay usa
o mesmo hash/prova e não para os demais membros que continuaram após o commit.
Posse e prazo são conferidos também depois da auditoria. A nova rota interna
não aceita a credencial de navegador. As provas HTTP cobrem ambas as fases,
replay, foto antiga/corrompida, cobertura do diário, instância/cerca incorretas,
prazo, revogação e rollback de auditoria. Outra prova espera a posse vencer
durante a auditoria e exige a execução do trigger antes da recusa/rollback.
Consumidor genérico e pausa automática ainda não estão integrados nesta etapa.

O consumidor do SDK `2ee5fa2` passou nos sete gates `44068901779`. A candidata
de margem com comparadores corrigidos ainda aguarda sua rodada completa.

## Consumidor de mundo e margem de reconexão, em candidata

`a0dea7b` passou nos sete gates `44070463024`, e o finalizador de mundo
`5eb83c7` passou nos sete gates `44071355167`. Ambos continuam privados.

O contador genérico sinaliza suporte na conexão normal já autenticada, sem
enviar outra identidade ou segredo. O servidor pausa comandos antes da fila,
prepara o mesmo SID, fotografa e confirma pela API das instâncias. Conserva a
prova em resposta incerta; só uma recusa explícita de cobertura permite outra
fotografia. Falha não confirma o recibo e conserva uma margem local limitada.

Queda de transporte permite cinco segundos para reconectar o mesmo SID, sujeito
à sua autorização ainda vigente. A volta cancela a espera; sem volta, a instância
tenta finalizar antes de liberar o mundo. Expiração/encerramento elegível corta
comandos e inicia a finalização. Logout, revogação e troca não recebem essa
exceção. Nenhum caminho renova o token ou a posse além da autorização existente.

A extensão do cliente pode solicitar essa finalização e manter sua tela até a
consulta do recibo. O SDK tem parada explícita da parte de gameplay; consultar
recibo terminal também encerra a renovação. Foi identificado e corrigido outro
leitor: as operações de mundo agora recusam localmente um SDK já encerrado,
como dados e conquistas. A autoridade do servidor continua obrigatória.

Nova jornada remota usa o SDK real, ingresso por cookie, WebSocket/instância
reais e outro navegador: derruba a conexão, consulta o recibo terminal e exige
que outro morador continue avançando. Não inventa confirmação ou resposta HTTP.
Integração da pausa no hospedeiro e finalizador do jogo sem mundos ainda pendentes.

## Integração do hospedeiro em execução

`features/jogar/finalizacao.ts` coordena parar o SDK, drenar/finalizar o módulo
e consultar o recibo do servidor por no máximo trinta segundos. Confirmação do
módulo isolada nunca basta. O hospedeiro conserva o módulo em falha e permite
repetir o mesmo salvamento ou sair com aviso explícito de progresso incerto.
Saída voluntária e corte compartilham a operação; eventos repetidos não criam
outro lote. Logout/troca/permissão revogada conservam seu encerramento próprio.

O jogo de perfil implementa `finalizar` com fila drenada e lote CAS; não grava
um estado antes de concluir a leitura inicial. O hospedeiro só negocia com o
modo ligado e jogo capaz; Morada continua manual. A prova no navegador deve
cortar a sessão após uma escrita normal incerta, exigir o recibo final e
reabrir os dados/conflitos. Também deve perder a resposta final real após o
commit e recusar a afirmação de sucesso enquanto o recibo ainda estiver pronto.

O consumidor `55cced7` passou nos sete gates `44073841379`. A rodada anterior
`8ad7fbd` falhou antes de jogar porque o apelido da fixture excedia vinte
caracteres; o contrato de cadastro permaneceu intacto.

A candidata do hospedeiro conserva o módulo enquanto confirma; falha permite
repetir ou voltar com aviso de incerteza. Fechamento abrupto tenta concluir com
`keepalive`, sem prometer que o navegador manterá o processo. Nova abertura
aguarda a margem do servidor por até 35 segundos, com relógio fixado na primeira
tentativa; checkpoint de troca conserva 30 segundos. Esse tempo adicional de
espera não renova a concessão ou a capacidade de salvar.

Foi corrigida outra lacuna do cliente interno: ao reabrir, versões em conflito
agora aparecem para escolha explícita, sem continuar silenciosamente a aceita.
Finalização com lote vazio reconhece conflitos já duráveis e devolve
`conflicted`, sem sobrescrever ou duplicar essas versões. A integração de banco
confere igualdade das versões antes/depois. A jornada de reabertura exige uma
escolha antes de continuar.

A nova jornada de corte perde uma resposta normal depois do commit, bloqueia
o pedido final real para verificar que o módulo continua montado e depois perde
também a primeira resposta final. Só o recibo confirmado libera a desmontagem;
reabrir exige uma única revisão/versão aceita. Essas mudanças do hospedeiro,
conflitos e espera ampliada ainda aguardam seus gates.

## Agregado e índices em preparação

O próximo schema acrescenta `saving_milliseconds` ao agregado diário infantil,
com zero inicial e limite técnico separado. O writer deve somar, uma vez por
recibo, o intervalo entre o corte efetivo e o carimbo do recibo confirmado.
Esse valor não entra no orçamento nem nas decisões de gameplay e não pretende
medir entrega da resposta ao navegador. O dia é o da concessão original,
inclusive se a margem atravessar meia-noite. Retenção continua trinta dias.
Nenhum menor foi ativado na produção; a coluna não inventa duração histórica.

Índices adicionais atendem recibos prontos por perfil/prazo e sucessores por
perfil/cursor. A migration será gerada no GitHub sem edição manual. Aplicação
depende do SQL revisado, gates, backup atual e inventário de linhas/volume para
avaliar a construção do índice de sessões no PostgreSQL compartilhado. Rollback
conserva coluna e índices; não desfazer recibos nem agregados já confirmados.

Geração `44075875535`, fonte `a320357463bdec3cc6aa4bf919e5d854107651d9`,
artefato `14323934138`. ZIP conferido por SHA
`eeeaa397df0d2a9956436aa32ca2882af16979a67bcb579824170093f5f72bc6`.
Arquivos copiados sem edição, com tamanho/hash da proveniência conferidos:
0178_regular_manta.sql (643 B,
`725b267260e5d894c4ea8be9f7445437e02a4cffa9eb298750f6e0e5a09ea061`),
snapshot `bf04b2b15af35d54f2dd27a7f3903be3885636758e40da8c22c5e7656e16c059`
e journal `06082661407faa621a3794cd51bfa2d9d42d720b752dc637e0777e2854b40329`.
Somente coluna aditiva, dois índices e check da coluna nova. Nenhuma aplicação
em produção; o writer do agregado ainda será integrado.

Na candidata `151ed0d`, a jornada de corte chegou à confirmação e desmontagem,
mas falhou ao ler o corpo de uma resposta do Chromium após navegar. A prova
passa a delimitar a navegação e consultar as versões com o Bearer da sessão
reaberta. Mantém a exigência de uma revisão e uma versão, sem alterar o produto
para acomodar o teste. Nova rodada completa pendente.

O writer do agregado soma somente na primeira conclusão do recibo infantil,
sob a admissão física e as mesmas travas. Replay não soma novamente; falha
estrita da auditoria reverte também o agregado. A próxima concessão acerta
somente gameplay e conserva a margem registrada. A correlação com o SID fixa
o dia original sem usar o relógio do cliente. Provas com dados históricos
cobrem a margem atravessando meia-noite sem criar uso no dia seguinte.

A supervisão do responsável ganha leitura agregada dos últimos sete dias,
com tempo de jogo e margem separados. A leitura projeta o intervalo ainda
correlacionado, sem debitar nem modificar o ledger, e devolve somente datas e
durações. Autorização atual do responsável precede a consulta; outra conta
não lê o relatório. A retenção diária existente continua com seu corte no
calendário de Brasília, sem acrescentar conteúdo das partidas.

O recibo de salvamento tem FK para a sessão de jogo, não para o ingresso.
Portanto a limpeza de ingressos não o expurga: a manutenção agora o apaga
explicitamente após 24 horas do prazo, em lotes de 500 com `SKIP LOCKED`.
A prova conserva uma linha travada e um recibo recente e exige igualdade das
sessões antes/depois. A resposta do cron acrescenta somente essa contagem;
nenhuma credencial ou conteúdo é devolvido. Esses writers/leitores ainda
aguardam os gates completos.

`6ea7a6d` passou nos sete gates `44076515919`, incluindo a jornada de corte
com respostas perdidas e as migrations até 0178. `2653749` passou nos sete
gates `44078037674`, com agregado, replay/rollback, relatório autorizado e
expurgo de 500/linha travada. Fontes ainda privadas; produção permanece em
`2475661`, com 177 recibos/0176 e os dois modos desligados.

A etapa seguinte acrescenta prova de renovação recusada para concessão de
outro dia e nova admissão com SID/orçamento novos. A supervisão existente usa
o mesmo relógio IANA na emissão: o novo teste não altera a tolerância dos tokens.
O contador de retenção delimita os elegíveis globais do banco descartável
antes de montar a prova de lote.

O observador do host agora agenda o corte a partir da previsão do servidor.
Usa o relógio monotônico e subtrai o tempo de ida/volta da consulta, pausando
conservadoramente antes do limite; o servidor continua a autoridade para
comandos e gravação. Nova consulta e desmontagem cancelam o timer. Checkpoint
de troca ou revogação conserva sua própria parada. Os textos distinguem fim
do orçamento, horário e mudança do dia de uma falha de conexão.

Nova jornada de navegador configura um minuto pelo responsável, pareia um
aparelho sem autoridade adulta, joga e espera esse minuto real. Exige recibo
confirmado, recusa de escrita direta com a sessão anterior e relatório agregado
somente no responsável. Esse ensaio e o novo timer ainda aguardam os gates.
