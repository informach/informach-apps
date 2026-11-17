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
