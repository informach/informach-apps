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
