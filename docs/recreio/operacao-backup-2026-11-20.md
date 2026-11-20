# Executor e agenda de backup do Recreio

Continuação de F8/F10, autorizada no fechamento da plataforma. Os componentes
já têm prova nativa, mas ainda falta o processo agendado que os compõe e se
recupera das interrupções. Este plano não declara agenda/custódia habilitadas.

Base qualificada: 0243/244 recibos/80 tabelas; replay técnico a33e94b7 passou
direitos e cluster frio, all/CI ainda em execução. Ensaio real de 20/11, origem
0203/204, restaurou conteúdo/estrutura/globais idênticos e removeu serviço e
temporários. Custo acumulado está medido com pool compartilhado discriminado.

## Ordem de execução

1. Qualificar a fronteira de auditoria dos módulos de publicação, retirada e
   abandono. A imagem operacional não leva Better Auth/login. Não fornecer
   credenciais de SMTP ou cobrança ao serviço de backup.
2. Compor captura consistente, arquivo autossuficiente, cifragem, tentativa
   durável anterior ao PUT, leitura integral, índice assinado, confirmação e
   liberação de reservas. Usar as implementações existentes; sem outra cópia
   das regras ou passagem implícita da prova de homologação para produção.
   Conferir os dois destinos antes da primeira escrita de controle. O portal
   recebe somente a credencial das fotos/exportações; nunca a dos dumps.
3. Reconciliar operações interrompidas antes de criar novas. Captura sem arquivo
   usa abandono nativo sob barreira; publicação que pode ter enviado não pode
   virar ausente por timeout. Resposta perdida exige GET e autenticação integral
   do objeto/índice original, conservando chave/IV/referência. Retomada não
   refaz a cifragem. Rede indisponível mantém pendência com prazo/repetição.
4. Concluir o caminho de recuperação sem credencial da origem, inclusive
   upgrade privado após comparar o inventário original. Verificar a cadeia de
   migrations por timestamps e hashes; schema futuro/inconsistente não é
   autorização para executar arquivos. O PostgreSQL compartilhado de produção
   nunca recebe um restore integral. Publicação é somente do escopo Recreio,
   com identidade, permissões e finanças atuais e credenciais renovadas.
5. Preparar destinos e chaves separados, referências no Railway e recuperação
   fora da perda do serviço original. As seis credenciais no GitHub continuam
   exclusivas da homologação. Material real não vai ao bucket de testes,
   GitHub, logs ou chat. Bucket criado, variável presente ou cópia DPAPI local
   não é prova de recuperação. Recriar um recuperador sem URL da origem e
   comprovar abertura do arquivo efetivamente guardado e do livro de direitos.
6. Configurar o executor com destinos/máximo de bytes/prazo explícitos e limite
   de execução concorrente. Cron/retirada só entram depois da primeira captura
   cifrada real conferida e dos gates. Cadência/retenção serão discriminadas
   junto com custo e atraso observado, sem anunciar RPO/RTO contratual a partir
   do ensaio de 15,4 segundos. Expurgo usa índice de retirada e recibos nativos;
   não apagar o bucket ou recorrer a lifecycle inexistente do provedor.
7. Medir primeira captura, atraso e restauração da agenda. Monitorar ausência
   de captura confirmada e falhas parciais; alertas chegam ao canal existente.
   Homologar falha/repetição/limpeza no GitHub e falha operacional sem conteúdo
   em logs. Testes humanos do portal/Checkout continuam somente no final.

## Gates e limites

Somente inspeção/edição/formatter/sintaxe local. Geração SQL, testes, Docker,
carga e navegador no GitHub; captura/restauração real no executor Railway.
Cada incremento registra fonte e recibos; gates anteriores não certificam
arquivos posteriores. Resumos de estado devem separar implementação,
qualificação, implantação e ativação.

O recibo técnico de replay fecha apenas retiradas. Ele não liquida cobrança,
não verifica idade externa, não aceita responsabilidade em nome de outro
adulto e não libera tráfego ou um jogo ainda em análise. Morada D3–D8 e a
validação em vídeo integrado permanecem fora do fechamento independente.


## Composição nativa em candidata

`capturar-e-publicar.ts` admite todos os handles vazios/privados/distintos e
os destinos antes da primeira escrita. Usa captura/montador nativos, cifra
uma vez, persiste a referência antes do PUT, relê e autentica o arquivo inteiro
e o índice, confirma por auditoria estrita e libera somente um lote de até cem
reservas. Falha conserva o controle durável para reconciliação; não abandona
arquivo incerto ou troca IV/referência após resposta perdida. O proprietário
dos handles/chaves continua responsável por encerramento e limpeza.

A prova preparada no GitHub usa PostgreSQL/HTTP fechado reais do protocolo,
dados opacos sintéticos em PG, código completo do executor e recuperação
a partir do índice/arquivo guardados depois de perder todas as saídas locais.
Compara inventário SQL restaurado e bytes; destinos incompatíveis, bucket
produtivo comum e arquivo preexistente devem falhar sem escrita de controle,
sem pedido S3 e sem destruir o arquivo. A retirada imediata é política da
fixture sintética, não cadência/retenção real. Gates ainda pendentes.

Ainda faltam a composição protegida de ambiente/credenciais, a exclusão de
execuções concorrentes, reconciliação das operações interrompidas, custódia e
prova real antes da agenda. O núcleo sozinho não habilita serviço ou cron.


## Coordenação limitada em candidata

O núcleo passa a exigir uma capacidade emitida por uma transação READ ONLY
própria que mantém uma trava de executor distinta da barreira de captura/GC.
Outra execução retorna ocupada sem esperar ou entrar no callback. O prazo
é limitado a quinze minutos; PID e posse reais são reconferidos entre fases.
Cópia e uso após término são recusados. Encerramento/perda da conexão aborta
o sinal e o proprietário aguarda a tarefa já iniciada antes de devolver.
I/O já emitido continua sujeito aos prazos e recibos nativos; o escopo não
fabrica prova de que uma escrita remota não ocorreu.

As regressões preparadas executam concorrência real, derrubam somente a sessão
coordenadora do banco descartável, exigem aborto sem nova fase, aguardam a
tarefa proprietária, repetem a aquisição e preservam o erro original de callback.
Não há ponte de teste, timeout maior, flag de bypass ou teste pesado local.
O núcleo de publicação também reconfere a capacidade antes/depois do arquivo,
PUT, índice e lote de reservas. Credenciais/ambiente, reconciliação e agenda
produtiva permanecem nas etapas seguintes; gates desta candidata pendentes.


## Publicação interrompida em candidata

A retomada de publicação agora exige o destino completo na mesma transação da
reserva; ID, nome e escopo divergentes não alteram a tentativa ou auditoria.
O reconciliador, sob capacidade real de executor, lê o ciphertext original e
retoma a confirmação/índice, sem novo IV/ciframento. Só NoSuchKey de GET pode
iniciar abandono; ainda exige tombstone permanente assinado e relido, remoção
restrita, confirmação de ausência e lote limitado antes de liberar reservas.
Rede/permissão, NoSuchBucket, corrupção, chave, SQL e auditoria não viram ausência.

A prova fria existente passa a usar essa composição na resposta perdida de
publicação: arquivos locais descartados, índice já guardado e confirmação SQL
pendente. Negativas adicionais usam controle/MAC sintéticos e HTTP fechado:
NoSuchKey com tombstone/ausência e PUT tardio recusado; acesso negado, bucket
ausente e ciphertext corrompido devem preservar reservas e não emitir retirada.
Essas negativas não declaram dump autossuficiente; o caso de objeto presente
continua a restauração SQL/foto real da prova fria. Gates pendentes.


a94129a9 foi recusada no cluster 44819780557: a fixture tardia recolocava
só ciphertext, sem manifesto, e a leitura corretamente parava em manifesto
ausente antes de conferir o tombstone. A correção acrescenta manifesto tardio
assinado de protocolo MAC, sem criar confirmação SQL/verificação de arquivo.
O teste continua exigindo RETIRADO, agora com ambos os objetos tardios; não
aceita uma lista genérica de erros para passar. Não há mudança no leitor nativo.


401a5b0e foi recusada em 44820794166: o manifesto tardio da fixture não
registrava Content-Type application/json no servidor HTTP fechado; o leitor
recusou integridade antes da conferência do tombstone. A fixture agora conserva
esse metadado HTTP e confere o MAC antes de simular a escrita tardia. Decoder
e exigência de RETIRADO permanecem estritos. Nenhum dado/serviço real alterado.


A candidata e5754c26 passou cluster frio externo 44822503406, qualidade
44822507351 e integração 44822511082. Nenhum bypass foi acrescentado.

## Upgrade da cópia restaurada

O executor de ensaio ganha modo explícito RECREIO_BACKUP_PRIVATE_UPGRADE=1,
desligado por padrão. Compara novamente conteúdo, estrutura e globais antes
de qualquer DDL; deriva o cliente de migração somente do socket/banco privado
já conferido, sem URL livre nem pool da aplicação. O migrador oficial exige
um prefixo exato dos recibos, inclusive SHA-256 SQL e timestamp; histórico
ausente, alterado, incompleto ou futuro é recusado. Não há seed, reparação
de recibos, atualização da origem ou autorização de tráfego.

Depois do upgrade, compara os valores de todas as colunas originais do Recreio,
todas as tabelas dos outros schemas e os fatos globais. Usa cliente separado
para que os codecs do Drizzle não alterem a leitura crua do inventário.
Somente resumos saem do banco, sem linhas ou dados pessoais nos relatórios.

O workflow recreio-backup-upgrade.yml prepara no GitHub a release pública
d014bd90 com 204 recibos, duas famílias sintéticas, dois mundos, dez fotografias
e sentinela alheia. A imagem operacional precisa provar 204→244/40 migrações
só na cópia e recusar checksum adulterado em outra captura sintética, com
limpeza em ambos os casos. Estas fotografias são bytes opacos de migração;
não comprovam conteúdo jogável nem consentimento. Gates ainda pendentes.
Depois deles, repetir a prova com uma captura real somente leitura no Railway,
antes de qualquer atualização do banco original ou promoção à main remota.


44824373761/ac5ae7d1 passou contratos/tipos e concluiu o upgrade sintético
204→244 nas duas origens, com preservação dos valores/globais e limpeza.
O gate completo foi recusado porque os avisos padrão do postgres.js não eram
JSONL. A correção registra somente o SQLSTATE validado em evento JSON, sem
mensagem/identificador SQL; o leitor estrito do relatório não foi afrouxado.
Repetir também a negativa de checksum antes de considerar o perfil aprovado.


## Fila limitada em candidata

listarPendenciasDoBackup lê somente IDs, no máximo vinte por fase, em TX
somente leitura e com prazos SQL limitados. Exige ID/nome/escopo dos dois
destinos, exclui protocolo legado, publicação com posse viva e retirada em
andamento. Separa captura sem arquivo, reservas abandonadas, publicação
vencida, reservas publicadas e reservas com ausência já confirmada. O scanner
não decide ausência, retenção ou autorização e não carrega corpos/índices.
Os escritores continuam obrigados a conferir fatos sob as travas nativas.

As regressões SQL usam fixtures de controle/MAC: conferem todas as linhas de
controle antes/depois da consulta, destinos divergentes, nova posse, etapas
de retirada, limite/ordem e exclusão de legado. Não declaram prova externa
do arquivo. Tipos/captura/cluster desta extensão ainda precisam de gates;
o processo operacional que consumirá as pistas continua em implementação.


O ensaio real 14b56ada/8cf0fdb1 recusou dois hashes históricos antes do DDL,
com temporários e serviço removidos. A proveniência exata dos SQLs originais
foi encontrada no Git; não reescrever recibos nem reintroduzir DROP antigo
na pasta executável. Perfil histórico explícito e nova prova sintética/real
seguem em [upgrade privado](upgrade-privado-2026-11-20.md).


## Passada operacional de reconciliação em candidata

O scanner a6390c22 passou qualidade/captura/cluster
44825578790/44825582709/44825587037. A composição seguinte exige capacidade
real de executor durante toda a passada. Cada escritor reconfere o destino
persistido sob sua trava; um ID de scanner não concede autoridade sobre outro
bucket. Assumir retirada, abandonar captura e liberar reservas publicadas/sem
arquivo recebem destino completo obrigatório, sem parâmetro opcional legado.

Cada publicação recebe oito arquivos novos privados, com nomes fixos, sem
caminho de entrada livre; propriedade, modo, inode e raiz /tmp conferidos.
Encerramento/remoção são aguardados; falha de callback é preservada e falha de
limpeza faz o job falhar. Não truncar saída preexistente para aceitá-la.

A passada retoma os protocolos nativos e limita cada fase à fila existente.
Falha de um item fica durável, permite progresso de outro e faz a passada
inteira falhar; perda/expiração da posse impede iniciar outro item. Não há
nova captura, decisão de retenção ou autorização de tráfego nesta função.
Regressões preparadas usam arquivos reais, auditoria estrita e HTTP fechado;
a prova do arquivo presente continua nos gates de captura/restauração.
Ambiente/credenciais, custódia e cron ainda precisam da composição final.


## Entrada operacional e política em candidata

O reconciliador 53e742e2 passou qualidade/captura/cluster
44828469839/44828475049/44828480078. O gate nativo inclui onze arquivos,
com publicação/retirada, fila, arquivos reais e falha de auditoria/repetição.

A nova entrada operar-backup.ts compõe os ports nativos com configuração
explícita, sem credenciais de login/SMTP/Stripe, argumentos livres ou migração
da origem. Exige schema pronto, fonte/ambiente admitidos, SSL explícito,
limites e destinos separados em produção. O processo fecha seu próprio pool
e os clientes S3 após aguardar as tarefas; erros de limpeza fazem o job falhar.
O modo off não importa dependências operacionais. O Docker mantém o ensaio
anterior como entrada padrão; modo operacional precisa ser explicitamente
configurado. Não habilitado em produção.

A política SQL é somente leitura, usa a data original da captura e o relógio
do PostgreSQL, e limita vinte candidatos de retenção. Publicar/repetir hoje
uma captura antiga não reinicia sua idade. Retirada automática reconfere
destino e idade sob a trava nativa, antes do tombstone/ausência/liberação.
Parâmetros inválidos são recusados antes dos efeitos na fila. Não há booleano
de scanner ou data do operador que conceda permissão de retirar.

Configuração operacional a preparar após gates: cadência de seis horas,
intervalo mínimo de cinco horas para não perder uma rodada por causa do tempo
da captura anterior, retenção de 28 dias, limite de 1 GiB e fotos de até 4 MiB.
Estes valores não são agenda ativa nem RPO/RTO contratual. O limite aceito de
retenção é 1–88 dias; não há preservação infinita de arquivos antigos por falta
de uma cópia mais nova. Alertas e prova real precisam acompanhar a ativação.

Gates novos devem cobrir tipos/negativas de configuração, política nativa e
entra/saída Docker off/inválida, sem relaxar o JSONL. A composição completa da
CLI com provedor real ainda precisa de prova separada, além dos ports nativos.
Custódia separada, recuperação sem credenciais da origem e primeira execução
produtiva cifrada continuam pendentes; nenhuma credencial real vai ao GitHub.


c1dec016 foi recusada nos tipos porque o callback de comparação capturava
uma variável mutável ainda tipada como opcional. f5b4116f usa uma coleção
constante dos materiais já validados, mantendo a proibição de reutilização.
Passou qualidade 44832374709, captura/política 44832378633 e cluster externo
44832382761; a entrada Docker off/inválida passou em 44832004778.
Isso ainda não é prova da CLI completa com arquivo real no provedor.

## Recuperador operacional em candidata

Modo restore tem composição distinta: recebe somente credencial/chave do
arquivo e ID da captura, sem DATABASE_URL, credencial de fotografias, login,
e-mail ou cobrança. O bundle deve recusar import de pool/índice/job-runs do
banco original e Better Auth. Cliente S3 só admite GET dos três nomes previstos
na captura selecionada; proíbe listagem, escrita e leitura de outros objetos.
Essa é uma fronteira de código, não declaração de IAM read-only do provedor.

O recuperador autentica índice/arquivo/composto e restaura no socket privado
existente. Compara o inventário original antes do upgrade e depois reidrata
fotografias contidas no arquivo. Pode executar uma ou duas rodadas físicas
sequenciais, com encerramento/remoção de cada cluster. Relê o índice depois de
cada rodada para respeitar uma retirada concorrente. Nunca publica dados,
liquida finanças ou libera tráfego; duas rodadas deste ensaio não substituem
duas recuperações completas F7 com estado atual e publicação seletiva.

Parser de armazenamento e limites é compartilhado com o capturador, mantendo
o contrato já existente de S3/chaveiro. A nova composição e seu limite de
leitura ainda precisam de gates e da prova CLI inteira no bucket sintético
autorizado. Nenhuma das duas entradas foi ativada em produção.


1423d6cd passou a imagem de restauração/off/inválida em 44834307319 e as
fronteiras de bundle. A qualificação foi recusada por inferência de genéricos
no teste que agrupava comandos S3 de tipos diferentes. e039c21f mantém cada
chamada tipada individualmente por callback; nenhuma asserção de tipo ou
permissão foi ampliada. Rodadas 44834730401/44834733649/44834736688 pendentes.

## Prova das CLIs completas em preparação

Perfil backup-operational é separado e só roda mediante flag explícita no
GitHub informach/informach-apps, bucket exato recreio-homologacao-c0xyqx e
imagem fixa. Não oferece fallback para mocks ou outro endpoint. Usa as seis
credenciais de homologação já autorizadas, sem acrescentar credenciais reais.

A prova usa duas chamadas da imagem real para captura/cadência; uma fotografia
cifrada sintética e sentinela SQL alheia entram no arquivo. Depois remove só
o objeto sintético e desabilita conexões somente no banco review descartável,
terminando suas sessões pelo administrador do PostgreSQL local do job. O
recuperador recebe só o arquivo/chave, restaura duas cópias privadas e não
publica tráfego. São bytes opacos: não se declara jogo, diversão ou conteúdo
familiar homologado a partir dessa fixture.

O banco é reabilitado antes de qualquer consulta final, inclusive em falha.
A limpeza recupera referências duráveis de publicação e apaga/rele apenas
objetos próprios, exigindo NoSuchKey, sem tratar erro de bucket/permissão como
ausência. Containers têm nomes/labels únicos e posse conferida antes de retirar.
Relatório público contém somente estados/contagens/IDs técnicos, nunca chaves,
URL do banco ou conteúdo. A prova ainda não foi executada.


44836468149 foi recusada antes da execução porque o ambiente mínimo do
subprocesso não declarava NODE_ENV exigido pelos tipos; 833411ab corrigiu o
contrato explicitamente, sem copiar todo o ambiente da aplicação.
44837074484 executou a imagem real e falhou na captura, mantendo origem
somente no CI e limpeza confirmada de seu único objeto sintético.

O descriptor proprietário usava wx, mas dump/composto/cifra precisam de leitura
nas fases seguintes. A correção usa wx+ com criação exclusiva e modo 0600,
sem abrir ou truncar arquivo preexistente. Regressão real relê o conteúdo pelo
mesmo descriptor. O cenário de arquivo íntegro já guardado e confirmação
perdida passa também a usar a fila operacional, incluindo sua alocação própria
de arquivos; não somente o reconciliador unitário. Repetir CLI e captura fria
antes de qualificar a correção. Nenhum serviço de produção foi alterado.


## CLI completa qualificada — 5fe5710e

A rodada [44837783170](https://github.com/informach/informach-apps/actions/runs/44837783170)
passou. A imagem real capturou e releu 914.596 bytes cifrados no bucket de
homologação; a segunda chamada confirmou a cadência sem duplicar a captura.
O banco review ficou comprovadamente sem conexões e o objeto sintético de
origem foi removido antes do recuperador. Sem credencial da origem, ele abriu
somente a captura escolhida (sete GETs), conferiu inventário/recibos e restaurou
duas cópias físicas privadas, cada uma com 244 recibos e sem migrations novas.
Ambos os clusters, arquivos, containers e quatro objetos próprios tiveram
limpeza confirmada; o banco review foi reabilitado. Dados reais não entraram
no GitHub. [Recibo e hash do ZIP](evidencias/backup-operacional-cli-44837783170.json).

Qualidade 44837795416, captura nativa 44837787315 e cluster externo 44837791237
também passaram nesta fonte; o CI compartilhado ac5ae7d1 passou 44824438593.
Isso qualifica as entradas e corrige as notas de gates pendentes acima, que
registram a sequência histórica. Não demonstra custódia produtiva, recuperação
financeira/identidades atuais, conteúdo jogado ou publicação seletiva F7.
A agenda e as chaves/destinos reais continuam por implantar após preflight e
backup durável anterior à atualização do schema compartilhado.


## Preparação real de custódia, sem ativação

Em 20/11 foram criados os buckets separados `recreio-arquivos-producao`
(364e47df-0471-406e-8c04-aa05e1c7a657) e `recreio-objetos-producao`
(d1112996-d9cc-42e5-8fe5-4587944e16d7), ambos sjc. O serviço vazio
`recreio-custodia-operacional` (1b39b426-617b-45db-b437-11988d6c67aa)
conserva vinte variáveis desses destinos: credenciais por bucket e materiais
AES distintos, sem URL/senha do banco, login, SMTP ou Stripe. A comparação
local protegida com as vinte variáveis persistidas confirmou igualdade exata,
sem mostrar valores. Existe cópia local DPAPI do usuário Windows, fora do Git.
Nada foi enviado ao GitHub e nenhum processo/deploy/cron foi iniciado.
Isso é preparação, ainda sem prova de recuperação independente ou arquivo real.

O PostgreSQL real foi relido às 23h50 UTC: 18.6, SSL ativo, 204 recibos.
O backup diário do volume de 20/11 às 10h33 UTC está listado, mas criar uma
cópia manual atual falhou: `Plan limit of 10 backups per volume exceeded`.
Os onze registros incluem três manuais e cópias agendadas. Não foi apagada
nenhuma cópia antiga. Foi pedido ao titular decidir somente sobre os dois
backups manuais de 13/09; migração continua pendente dessa cópia atual.
