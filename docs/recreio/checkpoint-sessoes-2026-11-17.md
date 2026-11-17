# Checkpoint, avisos e troca de aparelho

Continuação de F3. Este é o desenho da próxima implementação, não uma entrega
homologada. O núcleo de política/tempo e autoridade atual precede esta etapa.
Mantém World2/protocolo1 do Morada; não depende da evolução D3–D8.

## Contrato

- Uma troca tem intenção persistente vinculada ao perfil, SID anterior,
  aparelho destinatário, nonce do ingresso e revisão de política. Uso único,
  prazo curto e retenção técnica delimitada. Outro pedido não captura uma
  confirmação anterior. O ingresso só é consumido quando a nova sessão abre.
- Antes de transferir, o host do jogo anterior suspende comandos, espera as
  escritas em andamento e confirma o checkpoint. A plataforma conserva uma
  barreira no SID antigo: apagar a intenção ou voltar ao mesmo perfil não
  permite que esse token volte a escrever. Falha/silêncio não vira confirmação.
- Dados sem mundo confirmam a fila de gravações pela autoridade do SID. A
  barreira espera as operações admitidas e recusa as seguintes. Conflito ou
  escrita sem confirmação impede anunciar progresso sincronizado.
- Mundo exige confirmação do servidor do jogo, autenticada pela API das
  instâncias e vinculada à posse/cerca e sessão. A fotografia cobre o diário
  confirmado. O ACK do navegador sozinho não comprova persistência do mundo.
  Um título sem esse contrato pede saída no aparelho antigo; não ganha um ACK
  fabricado pelo portal.
- O cliente interno sem mundos e o servidor genérico de teste devem provar o
  contrato antes da integração do adaptador do Morada. Seu protocolo de saída
  já devolve se houve salvamento; o consumidor precisa respeitar o resultado.

## Ordem e falhas

Identidade → mundo quando houver → perfil → mutex de sessão/aparelho → aparelho
→ cursor quando encerrar → sessão → intenção. A confirmação conserva a mesma
ordem, sem elevar SHARE de sessão para UPDATE. A barreira irreversível do SID
evita que a retenção da intenção reative tokens. Leitores chegam antes dos
escritores e a ativação só ocorre com os dois implantados.

Pedidos duplicados recuperam a mesma intenção/resultado. Se o nonce, aparelho,
acesso ou política mudarem, a nova abertura é recusada. Se o destinatário some
depois de confirmar o checkpoint, o aparelho anterior permanece parado, podendo
fechar a sessão e abrir outra com autoridade atual; não se remove a barreira.
Durante partição de rede, o prazo de reconexão e o limite de concessão continuam
explícitos. Um checkpoint atrasado não concede mais tempo de jogo.

## Tempo e experiência

O estado de controle usa relógio do banco, calendário de Brasília, agregado
por perfil/dia e orçamento já concedido. Consulta não renova, zera ou consome
outra vez o intervalo. O jogo recebe apenas saldo/prazo/motivo; nunca nascimento,
conta, e-mail, agenda completa ou informação comercial do responsável.

O aviso antecede o corte e solicita pausa/checkpoint com prazo delimitado. O
corte retira gameplay; a capacidade de sincronizar o estado já admitido deve
ser restrita, com revisão e prazo próprios, sem reabrir jogo ou driblar uma
revogação. Sem confirmação, a tela informa progresso não sincronizado e oferece
tentar novamente. Ao falhar pagamento/cancelar acesso, aplica-se o mesmo ciclo,
sem anunciar que nada foi perdido durante uma indisponibilidade.

## Provas exigidas

1. Dois aparelhos reais do executor remoto: pedir troca, checkpoint positivo,
   revogar token antigo e reabrir com progresso confirmado. Nenhum jogo novo
   roda antes do ACK. O mesmo teste no título sem mundos e no servidor genérico.
2. ACK negado/ausente/duplicado, nonce vencido, outra política, outro aparelho,
   outro SID, outra cerca e confirmação após vencer. Auditoria indisponível
   reverte intenção, barreira e transferência.
3. Escrita em voo antes da barreira termina; escrita posterior é recusada.
   Trocas simultâneas não abrem duas partidas nem conservam duas reservas.
4. Limite diário e janela com antecedência, virada local e falha de rede.
   Contador informado pelo cliente e mudança de relógio não ampliam concessão.
5. Revogação atual prevalece sobre qualquer intenção/recibo antigo. Retenção
   não reativa o SID. Nenhum segredo entra em URL, DOM, auditoria ou captura.

## Preparação candidata

A 0175 foi gerada no GitHub (`44030440266`, artefato `14305540498`), fonte
`b603a019aeca4f1ce79c2f69ee868328d5e616f2`. Os três arquivos foram conferidos
por origem/caminho/tamanho/SHA-256 antes da cópia: SQL
`0175_complete_runaways.sql`, 5.092 bytes,
`35b62be80dfb19a3a8d102f0dbfa45d89f7b264b44bdfe7b0d1b7a33406b2618`;
snapshot de 754.122 bytes e journal gerado de 26.736 bytes. Nenhum arquivo
gerado foi editado à mão. A tabela usa a identidade composta da 0172 e
restringe prazo, ciclo, confirmação e prova de servidor. Só adições.

Esta candidata acrescenta leitores da barreira: SID congelado não lê/grava
dados, entra em mundo, renova ou substitui a partida por mero `continuarAqui`.
A intenção técnica pode ser removida sem retirar a barreira no SID. Há uma
resposta própria de pausa na interface, sem anunciar troca concluída. Testes
de constraints e recusa real do token ainda precisam da rodada remota.

Não há escritor de checkpoint/troca ou aviso antecipado nesta preparação.
Não aplicar a 0175 isoladamente ou habilitar famílias/checkpoint em produção
com base neste desenho. A publicação intermediária dos leitores familiares
usa a fonte `ad37ca9` e termina na 0174; não inclui esta candidata.

Leitores `f6a1ed0` passaram nos seis gates `44032050142`, com 443 integrações
em 36 arquivos. O CI compartilhado dessa fonte é substituído pela rodada do
incremento seguinte, que altera o SDK; não apresentar a rodada cancelada como
aprovação compartilhada. A 0175 continua fora da produção.

### Recuperação de uma abertura sem repetir o consumo

Antes do escritor de troca, preparar o recibo da abertura: vínculo exato do
ingresso consumido ao SID criado e hash de uma prova aleatória de 256 bits
gerada pelo SDK. A prova não é token da sessão nem chave de conta; não vai em
URL, DOM, auditoria ou logs. Uma resposta perdida só pode recuperar a mesma
abertura com essa prova, autoridade atual e SID ainda válido. Não amplia prazo
nem consome tempo duas vezes. Ingresso sem prova conserva o uso único anterior.
Não inferir SID por perfil, data ou "última sessão".

Os leitores/colunas e a aceitação opcional do campo chegam antes do SDK que o
envia e do escritor que o confirma. `RECREIO_CHECKPOINT_MODE=off` é o padrão
da preparação; a ativação exige leitores e jornadas comprovados. O modo
desligado não deve permitir tomar uma partida ativa sem checkpoint: deve pedir
salvar e sair no aparelho anterior. A implementação dessa troca ainda está
pendente; a configuração sozinha não cumpre esse contrato.

## Consulta de controle em implementação

`GET /api/sdk/v1/sessao/controle` e `sessao.controle()` usam o token atual do
jogo e a admissão comum. O contato técnico toma UPDATE da sessão desde o
início, sem renovar o prazo, consumir ingresso ou acertar novamente o agregado.
Consulta durante a própria barreira continua possível, com autoridade atual;
isso não libera dados, mundo ou renovação. O limite é 60 consultas por perfil
por minuto, anterior à transação. O consumidor ainda não agenda consultas
automaticamente neste incremento.

A resposta leva relógio/prazo do servidor, estado da pausa, saldo agregado e
intenção vigente. Sem agenda completa, nascimento, identificador da conta,
e-mail ou dados opacos. Recibos falhos/terminados não ocultam a intenção ativa.
Estado confirmado exige a barreira e o modo precisa corresponder ao título.

A projeção lê no máximo 61 segundos do calendário IANA para antecipar janela,
limite diário e troca do dia. A concessão atual termina na meia-noite local:
o consumidor ainda precisa salvar e retomar com autoridade do novo dia; uma
renovação comum não pode esticar o token anterior através dessa fronteira.
O horário do cliente nunca amplia acesso. A barreira confirmada deixa de
consumir tempo, mesmo antes do encerramento definitivo da sessão.

Novas provas reais de HTTP/banco e SDK cobrem leitura repetida sem novo débito,
aparelho vencido, recibo falho anterior à intenção atual, leitura da própria
pausa, capacidade de texto do título, meia-noite e retorno do horário de verão.
Ainda dependem da rodada remota. A tela do aparelho em modo de preparação
explica que os jogos não estão disponíveis, sem consultar um kernel que os
recusa nem abrir gestão para a criança.

O pedido da troca, o ACK, os avisos no host e a capacidade restrita de salvar
antes/depois do corte ainda não estão implementados. Não inferir que consultar
o controle por si só proteja o progresso ou conclua F3.

Rodada `b205b1a`, `44035329040`: cinco gates passaram; a integração passou nos
novos casos de controle/tempo e em outros 444 testes, mas quatro preparações
da expiração global falharam. A fixture apagava sessões abertas de outros
arquivos sem limpar seus agregados dependentes; a ordem de arquivos expôs a
FK que corretamente impede isso. A preparação passa a limpar somente esses
agregados no mesmo banco descartável/transação, antes das sessões. Nenhuma FK,
regra de produção ou asserção de contagem foi removida. Repetir a suíte inteira
no GitHub, sem considerar a rodada anterior aprovada.

A correção `dc2fd24` passou nos seis gates `44036975292`. A rodada geral
compartilhada `44036973729` ainda precisa ser concluída/conferida. Esta evidência
cobre consulta e projeção, sem pedido/ACK de checkpoint nem consumidor automático.

### Recibo de abertura em candidata

A 0176 foi gerada no GitHub (`44037439007`, artefato `14307986083`), fonte
`2bca24a904255db08206e74a5f6f099aed7bce8e`. Cópia dos três arquivos após conferir
origem, caminhos, tamanhos e SHA-256: `0176_marvelous_skaar.sql`, 1.208 bytes,
`98f78aa825d68787dd9756351e021ce5fd10bb43b833d95337c29bd6df9e3f37`;
snapshot 756.072 bytes e journal 26.881 bytes. Nenhuma edição manual do gerado.

O escritor candidato associa consumo, hash com domínio próprio e SID exato na
mesma transação. Recuperação exige a prova e a autoridade atual, usa a mesma
conferência de SID dos dados/mundos, não modifica sessão/agregado nem repete
auditoria de início. Recibo antigo sem prova continua de uso único. SID encerrado,
congelado ou vencido não pode ser substituído pela partida atual do perfil.
Falhas inesperadas de unicidade não são mais classificadas genericamente como
`JA_ABERTO`: somente o índice da partida aberta admite essa classificação.

Os testes novos ainda dependem da rodada remota. O SDK ainda não envia a prova;
publicar leitores antes desse consumidor. A 0176 não foi aplicada em produção.

A rodada `da8a70e` encontrou cinco falhas no mesmo preparo do novo teste:
o auxiliar `pedir` devolve `{status, corpo}`, não `Response`. Corrigida a leitura
para o corpo já decodificado; 449 outros testes passaram, sem aprovar a rodada.
O consumidor candidato do SDK acrescenta `recuperarAbertura`, desligado por
padrão. Quando ativado após os leitores, gera 256 bits com Web Crypto e repete
uma única vez o mesmo pedido diante de indisponibilidade. Não repete recusas,
emite outro ingresso ou persiste a prova. Um teste passa por SDK, rotas e banco
reais e descarta a primeira resposta depois do commit. Falha da segunda tentativa
continua visível. Nenhuma página pública habilita esse consumidor ainda.

`509f872` passou nos seis gates `44039845030`: 455 integrações/37 arquivos,
incluindo a perda da resposta após o commit. O CI compartilhado `44039845094`
continua em execução. A prova negativa isolada `6ea64b4`, `44040174048`, adiciona
apenas a migration gerada, um teste HTTP e uma matriz de integração reduzida
à fonte anterior `2bca24a`: reproduziu exatamente uma recusa 401 ao esperar a
recuperação 200; os outros 448 testes passaram. Nunca integrar essa matriz.
O teste HTTP idêntico segue para a rodada verde completa, sem reduzir gates.

### Escritor por perfil em candidata, sem ativação

No modo `on`, a candidata cria uma intenção de até 30 segundos ao pedir troca
de uma sessão ativa sem mundo. O ingresso fica sem consumo enquanto o SID
anterior ainda não confirmou a fila. O ACK toma UPDATE da sessão desde a admissão,
espera as gravações admitidas, grava a barreira e a auditoria juntas. Negativa,
prazo vencido e falha de auditoria não viram confirmação. Outro ingresso não
captura o ACK; completar vincula o recibo exato ao novo SID. O servidor de um
mundo ainda não participa: a candidata exige saída manual e recusa ACK de navegador.

Os testes de duas sessões nativas e HTTP precisam da rodada remota. O SDK
expõe o ACK explícito, mas o host ainda não consulta/pausa/salva automaticamente.
`off` ainda conserva o comportamento legado de substituição, anterior à troca;
é preparação de rollout e **não corrige esse comportamento em produção**. Antes
de habilitar famílias, substituir esse legado pelo pedido de salvar/sair no
aparelho anterior, completar o consumidor e a prova de servidor e homologar
avisos, corte de tempo e gravação restrita. Não ativar `on` por este incremento.

`a375efc` passou nos seis gates `44041597703`: 461 integrações/39 arquivos,
incluindo as cinco de pedido, confirmação/negativa, outro perfil, expiração,
recusa de ACK de mundo e reversão por falha da auditoria. A prova HTTP inalterada
passou também em `632fd4e`, seis gates `44041202916`. CI compartilhado ainda em
execução; não confundir esses resultados com homologação do host.

### Host em implementação

A candidata liga o modo real `on` ao host. Mantém o ingresso/prova enquanto
aguarda até 30 segundos, com limite adicional de tentativas; negativa, expiração
e pedido manual não são repetidos silenciosamente. O módulo do jogo pode oferecer
checkpoint aguardável e retomada quando o servidor confirmou ausência da barreira.
O título 2D suspende comandos, espera a fila e confirma a gravação; conflito
responde negativamente. O host mantém a partida montada durante a pausa e só
anuncia salvamento depois da confirmação. ACK sem resposta é resolvido pelo
controle atual; não remove a barreira nem inventa confirmação.

O SDK suspende a renovação durante o ACK positivo e a pausa, inclusive se uma
renovação anterior ainda estava em voo. A consulta continua; revogação permanece
definitiva. O acompanhamento tem uma consulta por vez, a cada três segundos,
e cancela callbacks/timers da partida desmontada. Mundos continuam com saída manual.

O novo gate `checkpoint` usa outro build com a mesma flag de produção `on`, banco
descartável e dois contextos reais do Chromium; nenhum bypass de autorização.
Exercita espera antes do ACK, conflito/negativa/retentativa e perda do ACK depois
do commit. Os seis gates anteriores continuam integrais. Ainda precisa da rodada
remota; `on`, famílias e venda continuam desligados em produção. O legado `off`
e os avisos/corte de tempo ainda precisam do incremento seguinte.

`e587b10` passou nos sete gates `44043755818`. As três jornadas do gate
`checkpoint` passaram em 43,9 s: dois contextos aguardam o ACK, conflito/negativa
e nova tentativa, ACK perdido após commit. O CI compartilhado segue em execução.
As rodadas gerais antigas `44036973729` e `44041597529` foram canceladas por
substituição, não aprovadas. A rodada geral da preparação do recibo `44039845094`
também permanece em andamento; não usar a execução em curso como evidência verde.

### Retirada do legado e saída sem confirmação em candidata

A candidata seguinte retira a substituição forçada de `off`: o pedido responde
`CHECKPOINT_PENDENTE/manual`, mantém a partida anterior e conserva o ingresso.
Depois da saída pelo jogo, o mesmo ingresso pode abrir aqui dentro do prazo.
A reprodução isolada `42003b6`, `44044606320`, na fonte anterior `e587b10`, falhou
exatamente nesse caso: recebia 200 em vez de 409; os outros 460 testes passaram.
A mesma fixture segue intacta para a rodada corretiva. Nunca integrar a matriz
reduzida dessa reprodução.

As journeys de mundos passam a comprovar a saída manual. O navegador morto
é recuperado por revogação explícita do aparelho antigo na gestão; não se inventa
checkpoint nem se altera relógio da fixture para fingir espera real. Consultas
de permissões reutilizam sua sessão, sem tomar partidas só para montar a fixture.

O cliente World2 do Morada ignorava o booleano de saída. A candidata exige ACK
positivo antes de voltar à estante; negativa/ausência reconecta para conferir,
sem anunciar salvamento. Mantém a autoridade de revogação durante a espera e
solta os recursos ao desmontar. O teste de navegador faz proxy do servidor real
e descarta só o primeiro ACK; nenhum quadro é fabricado. A reprodução isolada
anterior e a rodada corretiva ainda precisam ser conferidas. Nenhuma mudança
de simulação, arte, protocolo ou formato do mundo. Ainda não é checkpoint de
mundo vinculado à intenção de troca: esse adapter autenticado continua pendente.

### Vínculo único de mundo em candidata

A preparação da confirmação por servidor encontrou que o mesmo SID podia ser
reatribuído a outro mundo do mesmo jogo, conservando conexões anteriores. Um ACK
do último mundo não seria prova das demais conexões. A candidata vincula o SID
ao primeiro mundo admitido pelo host; entradas concorrentes serializam na sessão
em UPDATE e só uma pode fixar o vínculo. O SDK também recusa abrir outro mundo
com esse SID, sem alterar a posse. Sair e obter uma nova partida permite mudar
de mundo; listar o catálogo e os mundos permanece separado dessa autorização.

As duas provas usam rotas, host autenticado e PostgreSQL reais. A reprodução
isolada anterior `97d5045` e a rodada corretiva precisam ser conferidas. O contrato
de exclusão futura precisa encerrar sessões vinculadas antes de apagar o mundo;
`ON DELETE SET NULL` não é autorização para reativar uma partida. Não há escritor
de exclusão física de mundo habilitado nesta candidata.

O teste de saída concorrente passa a observar um único pacote `sair` e o resultado
das duas chamadas, em vez da identidade do objeto Promise. A reprodução atualizada
é `ee3cbd2`; a prova de navegador permanece idêntica à rodada negativa anterior.


## Implantação conferida em 17/11

`668dde1fc50c8e4ed4d08ee1800165c285314b27` foi implantado no portal pelo
deployment `4cb643bf-067e-4428-9a87-b0edd0ba8965`, após os sete gates
`44047372449`. O CI compartilhado `44046097629` terminou aprovado em
`b173da923b58a8111d1e6c2fb0c18147bb761918`; o único delta compartilhado até
`668dde1` é a asserção de um único pacote no teste da conexão, também aprovada
no gate final. A alteração funcional posterior do app está coberta pelos sete
gates finais. Nenhuma evolução D3 de simulação, formato, protocolo ou arte foi
integrada: o Morada público conserva World2/protocolo1.

A [cópia lógica atual](evidencias/backup-logico-2026-11-17-pre-checkpoint.json)
foi restaurada e comparada no Railway, com limpeza confirmada, antes do DDL.
O migrator fixou a fonte homologada e executou somente `pnpm db:migrate`
no deployment `6d56a577-025a-4920-a7c9-b695b02c233c`, sem seeds comerciais.
O comando inclui os preparos técnicos existentes: backfill de tarefas informou
que não havia tabelas antigas e o armazenamento Mastra foi inicializado.
Conferidos 177 recibos, com os hashes exatos de 0175 e 0176 acima. Depois,
o migrator voltou a seguir main e teve seu comando original restaurado.
O deployment decorrente da reconexão (`fa59c69d-e886-4eec-8ccc-c564cda44a6a`)
foi `SKIPPED`: não houve nova execução de seeds.

Consulta operacional conferiu a fonte efetiva `668dde1`, `RECREIO_FAMILY_MODE=off`,
`RECREIO_CHECKPOINT_MODE=off`, jogo interno `0`, zero menores, pareados,
contextos restritos e intenções de troca. Portal e Morada responderam 200 em
`/api/ready`; controle do SDK sem token respondeu 401. Manutenção autenticada
em `/api/jobs/manutencao` respondeu 200 com dez contagens. O build confirmou
upload dos mapas e o Sentry registrou a release `2098083222` para Recreio.

As reproduções `97d5045`/`44047227346` recusaram as duas provas de mundo único
na fonte anterior, com 461 outras integrações aprovadas; a fixture intacta
passou em `668dde1`. `ee3cbd2`/`44046680803` falhou somente nas duas provas de
saída/autoridade, com 127 outras provas do cliente aprovadas. As mesmas
asserções passaram no corretivo. As 19 jornadas de navegador incluíram
perda do ACK real do Morada, recuperação da escolha e saída confirmada.

Piso operacional de retorno: conservar `668dde1` ou posterior com leitores de
barreira/recibo, vínculo único de mundo e saída confirmada. Desligar a flag não
autoriza ignorar barreira já persistida ou apagar recibos para reabrir o SID.
O expurgo técnico não pode descongelar a sessão. A tabela está vazia enquanto
a troca automática permanece desligada; retenção limitada precisa ser fechada
antes da ativação. A API de mundo e os avisos posteriores não fazem parte desta
fonte implantada. Famílias, venda, F3 e demais frentes continuam sem aceite final.

`b173da9` passou nos sete gates `44046097619`; as 19 jornadas de navegador passaram,
incluindo perda do ACK do Morada com recuperação da escolha e nova saída confirmada.
A reprodução atualizada `ee3cbd2`, `44046680803`, falhou só nos dois casos esperados
da conexão: encerramento rotulado incorretamente e dois pacotes de saída. As
outras 127 provas do cliente passaram. A mesma asserção de pacotes segue no corretivo.

`668dde1` passou nos sete gates `44047372449`. A reprodução `97d5045`,
`44047227346`, falhou nas duas provas novas de vínculo único: a segunda entrada
era aceita e as duas concorrentes eram admitidas; as outras 461 integrações
passaram. Matriz reduzida permanece isolada. O CI compartilhado do recibo
`509f872`/`44039845094` terminou aprovado; não cobre as mudanças posteriores do
SDK/cliente. O CI compartilhado `b173da9`/`44046097629` segue em execução.

### API de confirmação do servidor em candidata

O manifesto passa a declarar a capacidade `checkpoint` (`perfil`, `servidor`
ou `null`); o Morada e o contador de mundo continuam `null`, com saída manual.
`ClienteDoHostComCheckpoint` estende a interface básica sem atribuir suporte a
hosts antigos. O cliente HTTP oferece confirmação em `/mundos/{id}/checkpoint`.
O SDK de navegador não pode confirmar um mundo.

A API admite identidade → posse do mundo → perfil → mutex → aparelho → sessão
em UPDATE → intenção. Valida membro e conteúdo atuais, SID fixado no mundo,
posse/cerca/instância vigentes e fotografia posterior ao pedido com checksum
validado pelo armazenamento, mesma cerca e todo o diário confirmado. Auditoria,
prova e barreira são atômicas. Repetir a prova já confirmada não exige interromper
o progresso dos demais jogadores, mas não permite mudar a prova. Posse e prazo
da intenção são relidos depois da auditoria; esperar uma trava não admite ACK
ou nova abertura fora do prazo. O recibo de abertura conserva o prazo da troca
até a conferência final, sem renovar a intenção.

Novos testes reais de HTTP/banco cobrem foto antiga, diário não coberto, outra
instância/cerca/jogo, ACK de navegador e falha de auditoria. Duas provas de espera
sincronizam a auditoria com o prazo persistido do banco, sem substituir o relógio.
O consumidor/servidor genérico e sua jornada de navegador ainda não foram
implementados nesta candidata; não declarar suporte automático de mundo nem
ligar a flag por esta etapa. A rodada remota desta API ainda precisa ser executada.

A redação de contexto técnico passa a ocultar também a prova de abertura, ingresso,
PIN, código/segredo de pareamento e campos declarados em português. Corpos de
pedido já eram removidos pelo transporte Sentry; não foi observada exposição
em produção. O teste novo verifica a proteção recursiva desses campos.

Rodada `87182f1`: a integração `44051663870` passou nas novas provas de mundo e
prazo, mas o restante da matriz e o CI compartilhado pararam por uma importação
de tipo faltante em `host/cliente.ts`. O tipo básico ainda era usado no leitor
do diário; manter as duas interfaces importadas. Não considerar essa rodada aprovada.

A reprodução `0d27e20`, `44051681781`, sobre `668dde1`, falhou exatamente nas duas
esperas da auditoria: aceitava ACK e nova abertura depois do prazo. As outras
463 integrações passaram. A mesma fixture passou no corretivo `87182f1`; a nova
rodada completa precisa conservar essa evidência. Matriz reduzida segue isolada.

A confirmação candidata também relê o SHA-256 e o tamanho dos bytes persistidos
no PG. O teste novo corrompe somente a fotografia daquele mundo, mantendo seu
tamanho, e exige recusa sem barreira. Armazenamento em bucket continua recusado
até existir adapter com prova de integridade apropriada; não confiar só no
metadado do objeto futuro. Nenhum conteúdo entra na auditoria ou no relatório.

### Consumidor genérico de mundo em candidata

Plano do incremento: declarar suporte somente no contador interno; serializar
o checkpoint depois dos comandos admitidos, suspender comandos novos daquele
SID, gravar uma fotografia e confirmar pela API autenticada da instância.
Conservar a prova em uma resposta incerta; refazer a fotografia somente após
recusa explícita de cobertura do diário. Retomar exige admissão atual do host.
O cliente expõe `checkpoint({id, modo})`, mas seu booleano não confirma o mundo:
o observador relê o controle da plataforma. Pedido pendente suspende renovação;
fim da tentativa sem barreira permite retomá-la. Nenhuma mudança no Morada.

Arquivos: protocolo e cliente do contador, servidor E2E, catálogo interno,
observador do host e contrato/renovação do SDK. O ciclo de vida do servidor é
compartilhado pelos dois gates de navegador em `e2e/servidor-apoio.ts`.
A prova `checkpoint-e2e/mundo.spec.ts` atrasa o envio real do pedido, confere
que o aparelho novo não monta antes da fotografia, injeta um comando na conexão
antiga depois do ACK real, conserva outro membro ativo e reabre o contador.
O teste do SDK verifica suspensão e retomada da renovação. Gates completos
somente no GitHub; este incremento ainda não tem resultado remoto.

`149ea66` passou nos sete gates `44052471827`; o CI compartilhado correspondente
`44052471167` permanece em execução. Essa aprovação não inclui o consumidor
genérico deste incremento nem autoriza ativar famílias ou checkpoint em produção.

A rodada `4d9bd21`/`44056229374` chegou à troca real no mundo, mas a asserção
do motivo no aparelho anterior falhou: uma consulta admitida pelo token antes
do encerramento chegava à trava depois e perdia `replaced`, recebendo recusa
genérica. O kernel passa a devolver o motivo persistido somente após conferir
mesmo SID/perfil/aparelho/jogo e política atuais. Referências de outra autoridade
continuam genéricas. A prova integrada consulta a referência anterior após
a troca; a asserção original do navegador é preservada. Ainda sem resultado
remoto do corretivo.
