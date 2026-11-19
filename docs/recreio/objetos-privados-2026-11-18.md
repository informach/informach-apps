# Recreio — objetos privados e recuperação, F8

Em implementação. A primeira leitura do ambiente confirmou 34 serviços, três
volumes e zero buckets. Depois dos gates fechados, foi criado somente o bucket
isolado de homologação abaixo. Nenhum serviço do portal/jogo foi alterado,
nenhuma agenda foi habilitada e nenhum dado de produção foi movido.

## Contrato do provedor e composição necessária

A [documentação oficial Railway](https://docs.railway.com/storage-buckets#s3-compatibility)
admite objetos privados por S3, mas ainda não oferece versionamento, object lock,
lifecycle ou cifragem configurável do lado do servidor. O cliente deve usar a
região e o estilo de URL reais da credencial. O conector retornou busca válida,
mas falhou ao ler a página; a página oficial foi lida diretamente.

Fotos/exportações e backups precisam de buckets e credenciais separados. O
portal não deve receber a credencial dos dumps do banco compartilhado. Política
de expurgo e detecção de órfãos pertencem ao serviço; existência de bucket não
comprova backup, imutabilidade ou recuperação. Chaves de cifragem permanecem
fora dos objetos, com recuperação própria e retenção das versões necessárias.

## Primeiro componente em candidata

`features/objetos/criptografia.ts` contém um envelope limitado em memória com
AES-256-GCM do Node: IV aleatório de 96 bits por gravação e tag de 128 bits.
Cabeçalho, tipo e contexto técnico são autenticados como AAD; checksum e tamanho
da referência autoritativa são conferidos antes de devolver conteúdo. O objeto
não contém a chave ou o checksum do texto aberto. Não há plaintext devolvido
antes da validação da tag; buffers intermediários abertos são zerados.

O chamador fixa um limite positivo de até 256 MiB; o limite do manifesto e a
cota do produto continuam sendo obrigações adicionais do adapter. O componente
recusa excesso em vez de truncar. Backups maiores exigem executor de arquivo ou
stream autenticado, sem liberar partes não autenticadas ao restaurador.

O formato carrega versão/chave e contexto técnico UUID para foto, exportação,
backup ou recibo de retirada. A referência deve vir do banco/recibo confiável,
nunca dos metadados que chegaram do bucket. Rotação lê objetos antigos somente
enquanto a chave correspondente existe; não há fallback para chave ativa ou
bytes legados. A configuração é copiada para impedir alteração por referência.

Não usa SDK S3 nem novas dependências; não realiza rede, persistência,
autorização ou migração. Precisa passar no GitHub antes de ser considerado
validado. A API de criptografia foi conferida na
[documentação Node 24](https://nodejs.org/docs/latest-v24.x/api/crypto.html).
As versões Node/dependências do repositório permanecem fixas.

## Dependência candidata do adapter S3

O adapter seguinte usará `@aws-sdk/client-s3` fixado em `3.1172.0`, primeiro SDK
S3 neste app, sem atualizar as dependências existentes. Metadados do registro
oficial npm consultados nesta execução: Node >=20, Apache-2.0, integridade
`sha512-ByCRHFlL9yui61J5e4w9nrDZcRUbAzd+78z9Q1DQWoAT2HE1XwjtDGEx86GdNTu1+oSyerNhl8eijF6jMUvEpg==`.
A [API oficial do SDK](https://github.com/aws/aws-sdk-js-v3) foi consultada via
Context7. O lockfile será resolvido no GitHub, sem hooks, e adotado somente após
conferir proveniência e diff: nenhum pacote é instalado nesta máquina.

## Integração e provas restantes

1. Adapter S3 com credenciais apenas no servidor, timeout/corpo limitados,
   escrita e recuperação pelo mesmo recibo e leitura íntegra antes de confirmar.
   Homologar no bucket real isolado; tratar resposta perdida e exclusão própria.
2. Foto nova: preparar operação sob autoridade/cerca, I/O fora das travas,
   reler cerca/revisão na confirmação. Objeto órfão não vira fotografia válida.
3. Migração aditiva: ler bytes existentes, conferir SHA, cifrar/enviar/reabrir,
   confirmar ponteiro sem retirar o original antes da homologação. Não alternar
   silenciosamente para a cópia antiga quando um objeto estiver corrompido.
4. Recortes F7: captura consistente, artefato privado, download autenticado
   revogável e expurgo. O envelope não concede direito de baixar um objeto.
5. Backup: dump consistente da origem somente de leitura, cifragem e recibo,
   agenda e retenção delimitadas; restaurar o objeto realmente armazenado em
   destino novo, conferir conteúdo/estrutura/limpeza e medir RPO/RTO.
6. Retirada de identificadores: recibos concluídos devem sobreviver à recuperação
   e ser reaplicados antes de servir conteúdo restaurado. O backup antigo não
   autoriza reintroduzir dados de uma exclusão posterior.

Todos os testes, builds, ensaios de bucket e restauração rodam no GitHub ou no
executor operacional remoto. O ensaio lógico já realizado não fecha F8.


Lockfile gerado em `44430415152`/`8b1ff3f2`, pnpm 9.15.0 e Node 24.15.0,
e adotado intacto após conferir arquivo, integridade do SDK, manifesto e
proveniência. Os 1413 packages e 1421 snapshots existentes permaneceram iguais,
assim como todos os outros importers; só foram acrescentadas as 25 entradas
necessárias e a dependência do Recreio. [Recibo e hashes](evidencias/objetos-s3-lock-44430415152.json).
A instalação e qualificação desta composição ainda exigem seus gates remotos.

## Adapter S3 em candidata

`features/objetos/s3.ts` recebe o cliente composto no servidor e um bucket
próprio. A chave do objeto é derivada exclusivamente de contexto UUID/tipo e
checksum cifrado validados; não recebe URL ou caminho do navegador. O cliente
deve ter `maxAttempts=1`, e um prazo abrange requisição e consumo do corpo.
GET aceita apenas resposta integral com tamanho e tipo corretos, limita cada
chunk e fecha o socket ao abortar. Depois confere envelope, tag e SHA.

O envio exige envelope íntegro, usa `If-None-Match: *` e relê o objeto antes de
confirmar. Uma resposta 412 também precisa dessa releitura; presença/ETag não
comprovam conteúdo. Perda de resposta permanece inconclusiva, sem repetir PUT.
Recuperar usa a mesma referência; ausência não autoriza escolher outra chave.
O escritor nativo deve persistir tentativa, envelope e referência antes da rede
e reler a autoridade/cerca na confirmação. Essa integração ainda não existe.

Os novos testes usam o SDK real contra HTTP fechado no runner, com credenciais
sintéticas e sem serviço externo. Precisam de gate remoto próprio. Não provam
compatibilidade real das condições S3 com o Railway, permissão de download,
catálogo, migração ou backup. A referência do envelope agora conserva também o
tamanho cifrado exato; o formato ainda não foi implantado.

O workflow `recreio-objetos.yml` prepara a prova externa somente após tipos e
testes fechados. É manual, exige o nome exato de um bucket dedicado cujo nome
começa por `recreio-homologacao-`, credenciais próprias e executor GitHub do
repositório. Não usa o bucket de jogo ou de backup. Antes do PUT, exige prefixo
UUID vazio e grava recibo técnico. A prova usa apenas texto sintético, verifica
replay, tenta sobrescrever o próprio objeto para exigir 412 e testa negativa
de leitura anônima. Limpeza remove somente a chave criada pela operação, exige
inventário completo vazio e GET ausente; limpeza e sucesso são fatos separados.
O workflow não cancela uma execução em andamento para preservar essa limpeza.

Prova preparada não é prova executada. O bucket dedicado foi provisionado;
a credencial do runner foi autorizada e a evidência externa foi concluída,
conforme o registro operacional abaixo. A integração com fotos/exportações e
backup permanece pendente.


## Gates e estado operacional

`86eac206` concluiu quality em `44431685752`: dezesseis testes do envelope e dez
do adapter S3, além dos tipos e demais verificações do gate. A fonte seguinte
`df2845fc` passou no job `qualify` de `44432492043`, incluindo o script de prova,
tipos e os mesmos 26 testes. O job `provider` não executou nessa rodada.
Esses resultados não certificam armazenamento ou backup implantados.

Em 19/11 às 00:57 UTC, o bucket exclusivo `recreio-homologacao`
(`14cbada1-04eb-45cd-be30-94e10e4ba333`), região `sjc`, já estava provisionado.
Nome S3 `recreio-homologacao-c0xyqx`, endpoint oficial `t3.storageapi.dev`, região
de assinatura `auto` e estilo virtual-host conferidos pela CLI autenticada.
É somente homologação; nenhuma credencial do Postgres foi lida por essa etapa.

A primeira revisão automática bloqueou a configuração restrita no GitHub
Actions (`blocked by policy`), sem executar a chamada. O titular depois
autorizou explicitamente os seis segredos exclusivos do bucket de homologação;
foram registrados sem imprimir ou salvar os valores. Nenhuma credencial do
banco, do portal ou do jogo foi incluída.

A prova real `44433527147`/`df2845fc` concluiu tipos, 26 testes fechados e o job
externo. Foram comprovados leitura íntegra do envelope, replay, recusa 412 ao
tentar sobrescrever o próprio objeto, negativa de acesso anônimo e limpeza
confirmada por inventário completo e GET ausente. O
[recibo e hash do artefato](evidencias/objetos-provider-44433527147.json) separam
essa prova de migração de fotos, exportação nativa ou restauração de backup.
Somente bytes sintéticos foram usados; o objeto de teste foi removido.

## Integração de fotografias em preparação

A porta atual recebe transação em toda chamada. O leitor do bucket precisará
de admissão e releitura de posse/revisão em transações separadas, com o I/O no
intervalo; não colocar S3 sob a trava de mundo ou transformar erro em fallback
silencioso para uma fotografia antiga. O adapter de transporte não concede a
autoridade necessária para publicar o ponteiro ou entregar bytes a uma instância.

Primeiro DDL candidato: chave única de identidade de conteúdo da fotografia
(`id`, mundo, SHA e quantidade de bytes). Sua geração deve preceder o registro
aditivo de objetos e suas FKs, para que a migration não referencie uma chave
ainda ausente. O PK existente já assegura a unicidade; não há backfill de bytes
ou dados pessoais. O registro de entrega deverá manter envelope/recibo antes
do PUT e a confirmação antes de alterar o ponteiro. Retenção precisará destacar
referências e enfileirar expurgo próprio sem perder fotografias fixadas.

A chave ainda precisa ser gerada/adotada/verificada no GitHub. Não foi aplicada
em produção. O contrato entre banco, posse, expurgo e objetos continua em
implementação; nenhum byte atual foi migrado por esta alteração de schema.


0216 gerada em `44435353411`/`36f11806` e adotada intacta: somente a constraint
`recreio_snapshot_content_identity`. SQL, snapshot, predecessor e prefixo de
216 para 217 migrations foram conferidos por hash e comparação estrutural.
[Proveniência](evidencias/migracao-objetos-chaves-0216.json). A execução e o upgrade
no PostgreSQL ainda precisam passar; nenhuma migration foi aplicada em produção.

O registro aditivo seguinte, `snapshot_object_deliveries`, está em schema
candidato. Ele liga fotografia/mundo/SHA/tamanho pela chave da 0216, conserva
destino e envelope antes do envio, separa verificação de retirada e guarda
lease/tentativas de um worker. Só uma entrega permanece vinculada a cada
fotografia; recibos destacados continuam até o expurgo confirmado. O FK é
restritivo: retenção precisa destacar a entrega na mesma transação antes de
apagar a fotografia, nunca apagar o registro para ocultar um órfão.

Esse registro não muda o escritor atual nem habilita objeto. Ainda precisa de
geração, testes de PostgreSQL e implementação dos workers/leitores/retentores.
Backups de banco com ponteiros de bucket precisarão incluir manifesto e objetos
referenciados, protegendo-os contra GC durante a captura. Um dump de ponteiros
sem esses objetos não é backup completo nem prova de recuperação.


0217 gerada em `44436222649`/`ce8ac9f6` e adotada intacta: somente a tabela de
entregas, suas constraints/FKs e índices. Hashes, predecessor e prefixo de 217
para 218 migrations conferidos; nomes dentro do limite PostgreSQL. A chave da
0216 já precede a FK. [Proveniência](evidencias/migracao-objetos-entregas-0217.json).
Faltam aplicação em banco descartável, cenários de integridade/retenção e os
writers nativos. Nenhum desses DDLs foi aplicado em produção.


A candidata seguinte acrescenta dezoito cenários SQL de conteúdo, mundo, estados,
envelope, relógio finito, unicidade de vínculo e destaque/retirada. São fixtures
nativas de PostgreSQL sem publicar ponteiro ou afirmar confirmação de bucket.
O gate remoto precisa aplicar 0216/0217 e conferir esses cenários antes de
avançar os writers. Os dezesseis gates da fonte anterior `38b544fe` passaram em
`44433292118`; ela ainda não continha essas migrations. O CI compartilhado de
`7eb50298` passou em `44424819941`, e o de `8647b310` passou em `44427177027`.
A fonte final posterior exige os próprios checks aplicáveis.


## Leitor nativo em qualificação

A fonte posterior à 0217 implementa leitura limitada no Postgres e resolução
explícita de referências confirmadas de bucket. O serviço usa uma capacidade
privada do servidor; não recebe destino ou chave do navegador. A configuração
`RECREIO_OBJECTS_MODE` nasce `off` e só admite `read`: nenhum modo de migração
ou escrita está disponível. `read` exige ID/nome/escopo do bucket, endpoint
HTTPS oficial, região, estilo, credenciais exclusivas, chave ativa e mapa de
até dezesseis chaves AES-256 em base64 canônico. Homologação e produção têm
nomes de bucket distintos; a partida recusa configuração incompleta sem
imprimir valores. As chaves precisam de custódia e recuperação próprias antes
de qualquer migração real.

Antes de carregar `data`, o leitor consulta tamanho e metadados e aplica o teto
do jogo. PG exige comprimento e SHA exatos. Bucket exige recibo `verified`,
conteúdo/mundo/fotografia compatíveis e destino idêntico à composição atual.
A rede roda fora da transação; depois, uma nova transação relê posse/cerca/prazo,
a fotografia mais recente e sua confirmação. Uma troca no intervalo recusa a
entrega e limpa o buffer aberto. Ausência, corrupção ou destino divergente não
causam retorno silencioso de uma fotografia antiga.

Os novos cenários usam PostgreSQL e SDK S3 reais com HTTP fechado, incluindo
alterações concorrentes sob a trava do mundo. A promoção ao bucket permanece
uma fixture explícita do teste de leitura; não é prova de worker, migração ou
backup. Tipos, regressões e integração precisam de gates remotos desta fonte.
Checkpoint, recuperação histórica, retenção e backups ainda precisam consumir
o mesmo contrato antes de admitir qualquer ponteiro real em produção.


O registro/DDL `29d090c4` passou em quality `44437014121` e integração
`44437017538`: 97 arquivos/1173 casos PostgreSQL, incluindo dezoito do registro,
e cinco HTTP. [Recibo](evidencias/objetos-registro-44437017538.json). Nenhuma
migration de objetos foi aplicada em produção.

A candidata de checkpoint/retenção passa a resolver uma revisão específica da
fotografia com o mesmo limite e as mesmas verificações do leitor. PG continua
exigindo SHA/comprimento; bucket exige recibo confirmado e destino configurado
legível. Não há rede sob trava de encerramento. A retenção destaca a entrega e
apaga a fotografia na mesma transação; conserva recibo e lease em voo, limpa o
envelope pendente e agenda a retirada após quinze minutos. Fotografias fixadas
continuam protegidas. O coletor ainda precisa confirmar exclusão e revisitar
recibos contra PUT tardio; essa espera não prova que um processo antigo parou.
Backups precisarão de proteção própria contra GC. Os novos cenários continuam
em qualificação remota; não habilitar migração com base apenas nesse código.


O leitor `5d5df72e` passou em quality `44439533813` e integração `44439538487`:
17 cenários novos, 98 arquivos/1190 casos PostgreSQL e cinco HTTP. A composição
permaneceu desligada em produção. [Recibo](evidencias/objetos-leitura-44439538487.json).

## Recuperação histórica em qualificação

O mesmo resolvedor passa a atender uma revisão específica na recuperação
operacional. A preparação admite mundo hibernando sem posse aberta, captura
fonte e diário limitados, materializa o bucket fora da transação e relê mundo,
cerca, fonte e impressão completa antes de devolver. Uma abertura ou alteração
no intervalo invalida o material e limpa o buffer. O operador usa apenas as
variáveis privadas dos objetos; não passa a exigir autenticação/e-mail/URLs do
Next para restaurar PG com objetos desligados.

Na aplicação, uma transação relê fonte/recibo, mundo e diário e confere os bytes
preparados antes de inserir uma revisão nova em PG. Não apaga fonte nem diário;
repetição da operação conserva o recibo. Não há chamada S3 sob a trava de
aplicação. Uma referência que passou a revisão falha; armazenamento ausente,
corrompido ou desligado é recusado sem escolher outra revisão silenciosamente.
Os cenários sintéticos e as regressões Morada existentes precisam passar no
GitHub desta fonte. Isso ainda não constitui backup agendado ou worker de
migração e não autoriza mover os bytes atuais.


## Preparação durável do futuro executor

A etapa interna de preparação conserva a fotografia PG e grava uma única
referência/envelope cifrado, junto com auditoria mínima, antes de existir PUT.
Mundo precisa estar hibernando, sem posse aberta; revisão e diário não podem
ultrapassar o topo persistido. Destino e contexto são fixados na preparação.
Replay sob a trava do mundo reutiliza IV/envelope: chave antiga ausente,
conteúdo alterado, destino diferente ou recibo destacado não criam outro objeto.
As leituras conferem tamanhos antes de carregar bytes ou envelope. Não existe
rota nem modo de ambiente que execute essa preparação em produção.

Os cenários nativos verificam concorrência, cifragem, auditoria, permanência
em PG, replay e negativas. Faltam ao executor reserva/tentativa durável,
recuperação após resposta perdida, confirmação com nova admissão e publicação
atômica do ponteiro, além do coletor de retirada. A preparação sozinha não
comprova entrega externa nem autoriza migração. Nenhum objeto de produção foi
preparado por esta etapa.


A fonte `d4b77c2a` passou em quality `44442018626` e integração `44442022199`:
41 cenários de fotografias, 98 arquivos/1214 casos PostgreSQL e cinco HTTP.
Inclui leitores, restauração histórica, checkpoint/retenção e preparação
cifrada/auditada, inclusive falha real da auditoria e concorrência. O teste de
partida operacional sem variáveis Next também passou. [Recibo](evidencias/objetos-preparo-44442022199.json).

## Executor em qualificação

O executor interno reserva uma tentativa e token por 45 segundos antes de
entregar o envelope ao transporte. O I/O fica fora das transações. Resposta
perdida preserva PG e envelope e agenda recuperação em cinco minutos; replay
usa o mesmo objeto com PUT condicional e leitura completa. A publicação exige
mundo ainda parado, referência/fonte íntegras, token atual e prazo vivo no próprio
UPDATE. Registro confirmado, ponteiro e auditoria são atômicos. Executor antigo
não pode publicar nem limpar o token novo. Fonte/objeto corrompidos e chave
antiga ausente ficam em revisão, preservando PG; erros de configuração, banco ou
auditoria falham operacionalmente, sem declarar sucesso.

Os cenários com PostgreSQL/SDK real e HTTP fechado cobrem resposta perdida,
concorrência, nova abertura do mundo, tentativa vencida, retirada durante envio,
rotação sem chave antiga e rollback real da auditoria após upload. Ainda precisam
de seus gates remotos; não são prova de worker em produção. O transporte passa
a expor apenas o nome do bucket junto das operações, para recusar uma composição
que combine destino e transporte diferentes.

Ainda não existe rota, job ou modo de migração habilitado. Faltam scanner
limitado da fila, coleta de retirada com confirmação/recibo e verificação
recorrente contra PUT tardio, proteção de capturas de backup, prova nativa no
bucket real, migração aditiva e rollback com devolução explícita dos bytes a PG.
Depois de mover bytes, desligar o leitor ou voltar para a fonte antiga não é
rollback válido. Nenhum dado de produção foi movido.


## Prova nativa no provedor preparada

O workflow de objetos ganha uma entrada manual separada para combinar o executor
nativo e o bucket real já autorizado com um PostgreSQL 18 descartável no GitHub.
As seis credenciais existentes continuam restritas ao mesmo bucket; não há
credencial de banco ou jogo de produção. O script só admite GitHub Actions,
banco `recreio_object_probe` em `127.0.0.1:5432` e o ID/nome/endpoint exatos da
homologação conferida. Não usa seeds, família ou perfil real.

O mundo e a posse são fixtures técnicas explícitas. A preparação e a entrega
usam funções nativas, bytes sintéticos e chave AES descartável. A prova simula
perda da resposta entre o upload/leitura real e a confirmação no banco; conserva
PG/envelope, aguarda os cinco minutos persistidos sem alterar o relógio e repete
a mesma entrega. Depois confere ponteiro/recibo, usa o leitor da composição
servidora real e comprova a negativa da posse revogada. A limpeza é admitida por
recibo técnico antes do PUT e remove somente a chave sintética própria, exigindo
inventário vazio e GET ausente. Cancelamento automático permanece desativado.

A prova ainda precisa executar; não é backup, jornada familiar, compra nem
homologação de um jogo. Não migra ou restaura dados de produção. O inventário
Railway foi relido: 34 serviços, um bucket de homologação e nenhuma alteração
operacional pendente nesta preparação.


O executor `b8894978` passou em quality `44443402920` e integração
`44443406913`: 53 cenários de fotografias, 98 arquivos/1226 casos PostgreSQL e
cinco HTTP. [Recibo](evidencias/objetos-entrega-44443406913.json).

A prova nativa `44444276302`/`12459f31` concluiu qualificação e o job externo.
Comprovou preparo durável, perda da resposta após upload/leitura reais, espera
dos cinco minutos persistidos sem alterar relógio/recibo, recuperação do mesmo
objeto, publicação atômica, leitura pela composição servidora, negativa de posse
revogada e de acesso anônimo. O objeto sintético foi removido; inventário vazio
e GET ausente confirmados. O artefato original foi baixado e conferido por hash
e lista estrita de campos/flags. [Proveniência e limites](evidencias/objetos-nativos-provider-44444276302.json).

A prova usou mundo/posse técnicos e banco descartável, sem famílias, compras,
jogadores ou dados de produção. Nenhuma migration, agenda ou migração de bytes
foi habilitada em produção. Coleta, proteção de captura, arquivo cifrado,
restauração do objeto guardado e corte continuam em implementação. O CI
compartilhado da fonte anterior `38b544fe` também concluiu em `44433295619`;
fontes seguintes ainda exigem os próprios gates completos aplicáveis.


Próximo bloco: [arquivo cifrado, captura consistente e retirada](backup-e-retirada-2026-11-19.md).
