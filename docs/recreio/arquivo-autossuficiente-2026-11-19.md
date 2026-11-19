# F8 — conteúdo autossuficiente do arquivo de captura

Estado: primeiro incremento em preparação após captura/reservas e prova de queda do driver.
Não há arquivo de banco guardado ou rotina de restauração implementados por
este desenho. Complementa [captura e retirada](backup-e-retirada-2026-11-19.md).

O arquivo externo já tem cifragem/limites/transporte próprios. Seu conteúdo
precisa conservar dump, inventário e todas as fotografias em bucket da mesma
visão, incluindo as versões de chave necessárias. Guardar só o dump deixaria
ponteiros dependentes dos objetos vivos.

## Formato e responsabilidades

Implementar `apps/recreio/scripts/backup/arquivo-composto.ts`, sem rede/banco.
Formato `RCROBK01`, com quadros sequenciais de cabeçalho JSON canônico estrito limitado
e quantidade exata de bytes. Tipos permitidos, nesta ordem: inventário geral
da captura, chaves das fotografias, dump PostgreSQL custom, inventário lógico
do banco, fotografias cifradas, fechamento. Não há caminhos, nomes de arquivo,
symlinks, código, comandos ou URLs no protocolo. IDs técnicos e referências
completas pertencem ao manifesto privado, não à auditoria pública.

As chaves de fotografia entram em bloco binário de até dezesseis pares
identificador/32 bytes, apenas as versões usadas. Nenhuma chave de cifragem do
arquivo externo entra nele. O arquivo composto fica temporariamente em disco
privado (diretório 0700/arquivos 0600) e só sai do executor cifrado com chave
independente. Não registrar material de chave, dump, hashes de credenciais ou
conteúdo em logs/artefatos públicos. A custódia da chave externa continua sendo
uma entrega separada; prova com chave descartável não a conclui.

O montador recebe FileHandles abertos e vazios, teto/prazo e capacidades de
origem. Faz leitura posicional em blocos; valida tamanho/hash/identidade antes
e depois e não fecha handles emprestados. Fonte e destino não podem ser o
mesmo inode ou hardlinks. Falha limpa somente uma saída vazia previamente
admitida; nunca trunca arquivo preexistente. Fotografias entram uma por vez,
com referências na ordem canônica do inventário e conferência de tag/conteúdo;
não colocar dump ou lista inteira de objetos em memória.

O leitor primeiro confere o arquivo inteiro e o fechamento, incluindo o SHA
externo do conteúdo, contexto, ordens/contagens, limites e cada objeto. Somente
depois fornece capacidades de copiar trechos verificados para destinos privados.
Recusa cabeçalhos extras, duplicidade/ordem divergente, truncamento, excesso,
chave ausente e alteração da origem. Não existe extração genérica de caminhos.

## Composição e prova

1. Na visão exportada ainda aberta de `comCapturaConsistente`, executar
   `pg_dump --snapshot` e `inventariarBackup`. Conservar reservas duráveis.
2. Copiar cada envelope por `recuperarEnvelope`, com destino exato conferido;
   montar o arquivo e fechar seu manifesto contra o inventário fixado.
3. Cifrar o composto com `arquivo-cifrado`, persistir referência antes do PUT,
   enviar e recuperar de fato por `arquivo-s3`. Conferir novamente o composto
   completo guardado antes de liberar qualquer reserva.
4. Restaurar dump em PostgreSQL descartável e copiar fotografias para bucket
   isolado. Comparar inventários, hashes, permissões e leitura nativa antes de
   qualquer normalização. Depois aplicar diferenças operacionais explícitas:
   destinos exclusivamente isolados, workers desabilitados, tokens antigos
   inválidos e replay de direitos F7. Não ler/escrever o bucket original.
5. Operações antigas de captura no dump não conservam sua visão exportada.
   Reconciliá-las sem executar tentativas antigas, conservar recibos e impedir
   que controles restaurados acessem destinos de produção. Arquivos anteriores
   não precisam ser incluídos recursivamente no novo backup.

Testes de formato usam arquivos reais com dump/objetos sintéticos, vazio com
zero fotografias/zero chaves, múltiplas versões, corrupção/truncamento em cada
quadro, limites/cancelamento, origem alterada e originais preservados. A prova
seguinte usa pg_dump/pg_restore reais, banco e bucket descartáveis no GitHub,
perda da cópia local, conteúdo guardado e limpeza conferida. Só depois ampliar
o executor Railway e medir recursos/custo/RPO/RTO com dados reais protegidos.
Todos os testes, builds e cargas rodam remotamente.

## Primeiro incremento em candidata

O montador e conferidor estão implementados como primitivas privadas, sem
rede, banco ou rotina operacional. O inventário lógico é JSON canônico; SHA de
cada parte, cabeçalhos e fechamento precisam ser coerentes. Cabeçalhos e
inventários com campos duplicados não são normalizados silenciosamente. Chaves
extras não usadas e objetos fora da ordem/lista esperada recusam o arquivo.
Dump usa blocos de 64 KiB; apenas uma fotografia limitada e o inventário de até
512 KiB entram em memória. Entrada e saída continuam abertas ao chamador.

Os testes reais de arquivos cobrem duas versões/zero chaves, composição com o
envelope externo, adulteração mesmo recalculando SHA externo, duplicidade de
campos/objetos, truncamento/excesso, chaves ausentes/erradas/extras, cancelamento,
limite total, alteração do dump e preservação de destino preexistente.
Passaram em `44461354124`/`3c41bb19`: tipos e 93 testes de objetos, incluindo
22 do composto. [Recibo](evidencias/arquivo-composto-44461354124.json).
Não há pg_dump composto, transporte dessa captura, liberação de reservas ou
restauração de banco implementados por esta etapa.

O incremento seguinte acrescenta capacidades de copiar dump/envelopes para
FileHandles privados e obter o inventário lógico, somente depois da conferência
integral. Cada cópia revalida a identidade da origem, tamanho e SHA do trecho;
fonte alterada, destino preexistente/alias, encerramento e cancelamento recusam
a cópia. Falha limpa apenas saída vazia admitida. A iteração conserva ordem,
contagens e hash das referências; não extrai caminhos. As chaves são entregues
somente a callback privado e suas cópias emprestadas são zeradas ao retornar,
inclusive na falha. Encerrar revoga capacidades sem fechar o handle emprestado.
Configuração e manifesto admitidos são copiados, sem aceitar mutação posterior
do chamador. Em `44463125293`/`3fb41482`, tipos e 101 testes de objetos passaram,
incluindo trinta do composto e cancelamento real de cópia de 32 MiB.
[Recibo](evidencias/arquivo-trechos-44463125293.json). A revisão seguinte verifica
cancelamento também ao retornar do callback privado das chaves, antes de admitir
sucesso, sempre zerando as cópias emprestadas. Esse ajuste ainda precisa passar.
Essas capacidades não representam restauração SQL.

O [índice de recuperação](indice-recuperacao-2026-11-19.md) deverá permitir
localizar e autenticar o arquivo sem depender do banco original.

## Captura SQL nativa em qualificação

`dump-snapshot.ts` conecta `pg_dump --snapshot` à visão ainda aberta de
`comCapturaConsistente`. Lê a saída em fluxo, limita os bytes antes de gravar,
confere o cabeçalho custom/PGDMP, sincroniza e resume o arquivo. O ambiente do
processo contém somente a conexão admitida, opções READ ONLY e opções fixas;
credenciais não entram nos argumentos e stderr nunca é publicado. Falha,
limite e cancelamento encerram o processo, aguardam `close` e eliminam apenas
o parcial admitido. Handles ocupados permanecem preservados.

`dump.backup-capture.ts` usa cliente PostgreSQL 18 real, somente no GitHub,
e banco descartável. A prova preparada grava uma linha depois de exportar a
visão, monta composto com dump/inventário da visão anterior, cifra, elimina
fontes locais, extrai o dump recuperado e restaura em outro banco aleatório.
Compara todo o inventário definido, incluindo estrutura/permissões, e exige
que a linha posterior exista apenas na origem. Também cobre visão vencida,
limite, cancelamento após o primeiro bloco e destino ocupado.

Esta prova ainda aguarda o gate remoto `backup-capture`. Não contém fotos em
bucket, upload real, controle durável de publicação, custódia recuperável de
chaves nem normalização de autoridades depois da restauração. Não habilita
tráfego, cron ou backup em produção.

Primeira prova nativa aprovada em `44467962304`/`3a65f1c9`: quinze testes em
dois arquivos, sendo cinco de dump/restauração, com cliente PostgreSQL 18.6.
[Recibo com limites](evidencias/dump-nativo-44467962304.json). O gate de tipos
paralelo `44467968690` recusou o ambiente do processo sem `NODE_ENV` obrigatório
no Next e o novo prefixo de temporários fora da união permitida. A correção
explicita o ambiente e acrescenta somente esse prefixo à lista fechada, sem
casts ou supressões. A candidata corrigida exige nova execução de ambos os
gates e agora verifica os tipos do app antes das provas nativas.

A fonte corrigida `df05a887` passou `44468536258` e `44468540610`: tipos do
banco/app, quinze provas de captura/dump e 144 testes de objetos. O ajuste
adicional exige a presença real do canal stderr antes de restaurar; o tipo
não foi forçado. [Recibo conjunto](evidencias/dump-nativo-tipado-44468536258.json).

## Composição do arquivo com fotografias em qualificação

`montar-captura.ts` compõe inventário/dump da visão aberta e envelopes do
destino exato. Copia somente versões de chave usadas no arquivo, lê uma foto
por vez, confere novamente o GCM no composto e elimina dump/inventário/foto
temporários após montar. Capacidades precisam ser privadas, vazias e distintas;
a saída continua privada e ainda precisa ser cifrada pelo executor. Não há
PUT ou liberação de reservas nesse montador. O leitor de envelopes S3 passou
a receber o cancelamento da captura, além do seu próprio prazo.

`montagem.backup-capture.ts` prepara fotografia e recibo SQL nativos, usa SDK
S3/HTTP fechado, monta/cifra, guarda arquivo e índice, elimina fontes locais
e o objeto vivo da fixture, e recupera pelo índice. Restaura o SQL em outro
banco e confere o inventário; extrai/autentica a fotografia somente com a chave
incluída no arquivo. A recuperação exige apenas GETs do prefixo do backup e a
retirada assinada corta leituras posteriores. Falta evidência remota dessa
composição; não é teste do provedor externo. Os destinos e autoridades do SQL
restaurado ainda não foram normalizados para tráfego e nenhuma reserva é
liberada por essa prova. Controle durável, ledger F7, custódia e cadência
operacional continuam pendentes.

Composição `4e6d9b2b` aprovada em `44469243603` (16 provas), objetos
`44469247207` (146 testes), quality `44469589117` e integração
`44469593535`. [Recibo conjunto com limites](evidencias/captura-composta-44469243603.json).
A fotografia foi recuperada sem buscar o objeto vivo; os dados do banco
restaurado coincidiram com o inventário da visão. A prova usa HTTP fechado e
restauração em outro banco do mesmo cluster, não desastre de cluster inteiro.

### Prova externa preparada

O workflow de objetos recebeu `capture_probe`, falso por padrão e isolado dos
outros modos. Usa somente os seis segredos já autorizados, o bucket exato de
homologação e PostgreSQL descartável no GitHub. O adapter de qualificação
admite somente dois prefixos UUID novos, persiste recibo antes do PUT, conserva
as chaves tentadas, remove a fotografia sintética depois de guardar o arquivo,
recupera pelo índice, restaura/confere e testa a retirada. Ao final, apaga
somente as quatro chaves sintéticas registradas, exige NoSuchKey em cada uma e
LIST vazio nos dois prefixos. O tombstone só é apagado por se tratar de uma
prova sintética sem workers; a operação real deverá conservá-lo.

Primeiro qualificar a versão no HTTP fechado; depois executar explicitamente
a prova externa e adotar o recibo apenas se restauração, retirada, acesso
anônimo negado e limpeza tiverem sido confirmados. Chaves de cifragem são
descartáveis, não credenciais de produção. Essa execução não habilita serviços,
libera reservas ou comprova custódia recuperável/ledger F7/cadência/RPO/RTO.

### Lacunas antes do desastre de cluster inteiro

A restauração recente cria outro banco no mesmo cluster: os papéis globais e
as extensões já instaladas continuam disponíveis. Isso não prova reconstrução
de um cluster perdido. Antes de habilitar o backup operacional, persistir as
identidades/atributos necessários dos papéis sem suas senhas, admitir a
recriação segura no destino isolado e ensaiar cluster novo. Ampliar também a
conferência do catálogo: o inventário atual resume tabelas/constraints/índices/
RLS e concessões de tabela; não compara integralmente funções, views, triggers,
sequências, tipos, privilégios de schema/função/coluna e configurações globais.
Essas lacunas precisam de implementação e testes de divergência, não de uma
alegação mais ampla sobre o inventário atual. A referência com hash/GCM
protege os bytes guardados; não substitui a conferência da restauração.

Os clientes PostgreSQL 18 do runner podem variar no patch: `44468536258` usou
18.7; `44469243603` e `44469593535` registraram 18.6. O executor operacional
continua no digest 18.6 documentado. Não inferir homologação dessa imagem a
partir de um cliente do runner com outro patch.

A porta de qualificação `5a71f233` passou no HTTP fechado em `44470641584`
e nos tipos/objetos em `44470645967`, antes de admitir a prova externa.
[Recibo](evidencias/captura-provider-fechado-44470641584.json). O modo externo
exige também negar leitura anônima dos três objetos do backup, inclusive o
documento de retirada; a fotografia já foi apagada com ausência confirmada.

Prova externa aprovada em [44470950325](https://github.com/informach/informach-apps/actions/runs/44470950325),
fonte `23b29660`: recuperação nativa, replay condicional do índice, retirada,
anonimato negado e limpeza das quatro chaves confirmados. Artefato `14503659873`,
704 bytes, SHA-256 `c3777765a53bf950950d063d3be5f4bd078e1ec61b96ea0f45938eac015aaf0c`,
conferido e adotado no [recibo público](evidencias/captura-provider-44470950325.json).
Nenhum dado de produção foi usado. O recibo explicita `freshCluster=false`,
`authoritiesNormalizedForTraffic=false` e `durableCaptureFinalized=false`;
a prova não encerra as lacunas registradas acima.

## Inventário v2 em qualificação

O inventário passa a declarar `metodo=recreio-inventario-v2`; comparação e
container recusam a versão anterior. Todos os arquivos da etapa anterior eram
provas sintéticas já removidas, sem backup de produção/consumidor implantado.
O SQL nativo e a versão externa anterior continuam com seus próprios recibos;
não se atribui a eles a cobertura v2 sem nova execução.

A conferência adicional resume schemas/proprietários, views/materializadas,
funções/procedimentos, triggers/estado, regras, tipos/enums/domínios,
propriedades/vínculos de sequências, extensões e estatísticas declaradas.
Relações incluem persistência, partição/herança, opções, nomes de constraints,
collation de coluna e estado/identidade dos índices. ACLs de schema, função,
tipo, sequência, coluna e privilégios padrão conservam grantor, destinatário,
privilégio e grant option; NULL usa o default efetivo do objeto. Somente hashes
e contagens desses registros saem das consultas, sem expor definições ou
nomes dos papéis em recibos públicos.

Recursos ainda sem perfil (FDW/servidor estrangeiro, agregados de usuário,
event triggers, large objects, parameter ACL, collations/conversions de
usuário e ranges/multiranges) geram `CATALOGO_NAO_SUPORTADO`; não são omitidos
para produzir uma comparação verde. Isso não declara suporte universal ao
PostgreSQL. O contador atual de sequência não pertence ao snapshot MVCC e não
entra no resumo estrutural; o dump guarda seu SEQUENCE SET. Sua conferência de
restauração e o inventário/recriação dos papéis globais continuam como passos
explícitos antes do desastre de cluster inteiro e de qualquer ativação.

Quinze cenários adicionais foram preparados em PostgreSQL real: alteração de
função, view, trigger, sequência, enum, domínio, nome de constraint, privilégios
padrão/schema/função/coluna/tipo/sequência, recurso fora do perfil e método
incompatível. A candidata precisa passar integração, objetos/tipos, captura
composta e o executor Docker de restauração, todos no GitHub. Nenhum cliente,
dependência, imagem operacional ou serviço de produção foi atualizado.

O inventário v2 `45590f3b` passou integração `44472614111` e tipos/objetos
`44472619085`; [recibo](evidencias/catalogo-v2-44472614111.json). O Docker
`44472623639` construiu a imagem, mas a fixture foi aberta antes de existir:
o socket do PostgreSQL temporário do entrypoint ficou pronto antes da criação
de `POSTGRES_DB`. A correção substitui essa prontidão por consulta autenticada
TCP ao banco exato, sem atraso fixo. O teste de restauração não chegou a ser
executado nessa rodada e precisa passar novamente com a prontidão corrigida.

O executor Docker com prontidão corrigida passou em `44473670843`/`1c7d9e56`,
imagem Node 24.15.0/PostgreSQL 18.6, inventário v2, conteúdo/estrutura e
remoção dos temporários confirmados. [Recibo](evidencias/catalogo-runtime-44473670843.json).
Ele antecede o incremento de metadados globais abaixo.

### Metadados globais e recriação em preparação

Duas consultas de metadados em transações READ ONLY no Railway confirmaram
PostgreSQL 18.6, um papel não nativo, operador superuser e três memberships,
sem concedentes não superuser, configs por banco, tablespaces extras ou objetos
fora do perfil. Dono do banco é o operador, ACL/default e limite de conexões
estão no perfil admitido. Nenhum conteúdo familiar, senha ou valor de segredo
foi consultado/devolvido. [Recibo da observação](evidencias/perfil-postgres-producao-20261119.json).
Isso não qualifica isolamento de privilégios dos aplicativos nem restauração.

`globais-postgres.ts` acrescenta ao inventário privado nomes/atributos,
limites/validade, configurações permitidas e vínculos com ADMIN/INHERIT/SET.
Senhas/hashes não são selecionados. O perfil exige operador superuser/dono,
ACL default, sem settings por banco/tablespaces extras; concedentes precisam
ser o operador. Configuração fora da lista falha explicitamente. Esses nomes
ficam no arquivo cifrado, nunca no recibo público. A comparação passa a incluir
os metadados globais, sem anunciar suporte universal a todos os perfis de DBA.

A recriação só admite o cluster novo do executor: sem TCP, socket privado em
`/tmp/recreio-backup-*`, porta 55432, controle no banco postgres, operador
correto e nenhum banco de aplicação. Identidades existentes inesperadas são
recusadas. O bootstrap usa o nome do operador capturado; outros papéis começam
sem senha. A senha nova do operador é preservada. Atributos/GUCs/memberships
são aplicados em transação e conferidos; grants idênticos não são repetidos.
A regra impede executar essa recriação no banco de origem.

O workflow Docker passa a provar bootstrap `postgres` e `ci`, com dois papéis
NOLOGIN, limite/expiração/GUCs e ADMIN/INHERIT/SET distintos. Dois testes SQL
adicionais cobrem drift global e recusa da origem; oito testes de contrato
cobrem senha, NUL, duplicação, operador, GUCs e membros fora do perfil. Tudo
aguarda os gates remotos desta candidata. Não há reconstrução de credenciais
antigas, normalização F7/autoridades para tráfego ou implantação.

Recriação `6c9e47cc` aprovada nos dois operadores em `44475981474`; os dois
ZIPs foram conferidos por tamanho/SHA e seus recibos exigem conteúdo,
estrutura, globais e limpeza. Integração `44475973608` também aprovada.
[Recibo](evidencias/globais-runtime-44475981474.json). O gate de objetos
`44475977919` passou os tipos, mas um teste existente de transporte binário
excedeu os 5 segundos. As comparações grandes passam a usar Buffer.equals,
que confere integralmente tamanho/bytes e evita comparação genérica/diff de
centenas de milhares de propriedades. Esse ajuste ainda precisa de nova
execução; não se declara resolvido o timeout a partir da edição.

A fixture seguinte inclui papel LOGIN com senha pública `ci` só na origem.
A recriação admite somente ausência de senha nos papéis não operadores do
alvo e confere novamente essa ausência ao final. São contagens booleanas no
cluster descartável; nenhum hash/valor de senha é selecionado/transportado.
O operador mantém a senha nova gerada pelo initdb. A matriz seguinte precisa
provar quatro papéis e os memberships, além de repetir objetos/tipos.

A fonte `e7909d43` passou os dois bootstraps em `44477614524`, com quatro
papéis, configs/memberships e senha não transportada. Tipos e 154 testes de
objetos passaram em `44477610703`; o arquivo dos quinze testes S3 levou
1.277 ms. [Recibo](evidencias/globais-credenciais-44477614524.json). Isso não
certifica um limite de latência em produção ou elimina toda variação do runner.

### Executor comum para o arquivo guardado

`cluster-isolado.ts` extrai o mesmo protocolo de cluster novo para uso pelo
ensaio lógico e pela futura recuperação composta. Só recebe handle privado
regular/single-link, inventário copiado antes de awaits e cancelamento; não
recebe URL/credencial da origem. Confere PostgreSQL 18.6, locale, globais,
dump/restauração e inventário antes de expor o callback privado. Abre o
handle herdado por procfs com offset independente; o ensaio avança o handle
emprestado antes da chamada para provar essa fronteira.

`ferramentas-nativas.ts` centraliza ambiente mínimo, prazo/cancelamento,
encerramento aguardado e classificação de aviso sem imprimir stderr. O helper
fecha conexões, para o cluster e só remove o caminho canônico permitido.
Falha e falha de limpeza são preservadas, com confirmação explícita dos
temporários. O ensaio conserva separadamente a limpeza da fonte local e do
cluster. Esta extração ainda precisa passar no Docker e nos tipos antes de
ser usada na prova fria do arquivo efetivamente guardado.

A próxima prova deve usar a mesma imagem 18.6 e fonte descartável 18.6,
recuperar por índice/S3 sem DATABASE_URL da origem no worker, conferir arquivo,
abrir dump/globais/fotografias e restaurar no cluster novo. As seis credenciais
continuam exclusivas do bucket de homologação e as chaves do arquivo são
sintéticas/descartáveis. Normalização de destinos/autoridades, ledger F7,
controle durável, custódia e cadência continuam etapas separadas.

Executor comum `cdbbc2fd` aprovado em `44479795532` nos dois operadores,
incluindo offset não inicial do handle; tipos/objetos `44479790896` aprovados.
[Recibo e limites](evidencias/cluster-comum-44479795532.json).

### Prova fria composta em preparação

`recuperar-captura-prova.ts` é um segundo entrypoint do mesmo Docker 18.6,
empacotado CommonJS para o SDK Node. Recebe somente UUID de captura, versões
sintéticas de chave e as seis credenciais restritas; recusa DATABASE_URL,
credenciais do PostgreSQL/jogos e ambiente Railway. Não monta arquivos da
origem. O SDK só admite GET no prefixo do backup indicado. Recupera índice,
arquivo e composto, extrai dump/globais e restaura no cluster novo. Confere
inventário e cada vínculo foto/entrega restaurados; abre os envelopes apenas
com as versões de chave incluídas, sem buscar a fotografia viva.

O launcher só roda no GitHub com flags explícitas, filesystem raiz readonly,
tmpfs, 768 MiB, duas CPUs e 128 PIDs. Passa segredos por nomes de env, sem
argumentos/arquivos/logs; não encaminha a conexão da origem. Aguarda o worker
e reconcilia o container de nome exclusivo se houver falha. O teste reserva
seis minutos no modo frio para prazo do worker e limpeza, mantendo os prazos
internos e as verificações de integridade. A evidência fria só pode ser
confirmada com cluster/arquivos removidos e vínculos/fotos conferidos.

`fresh_cluster_probe` é falso por padrão e exige `capture_probe`. A origem
sintética desse job fica no mesmo digest PostgreSQL 18.6 do destino, para não
confundir patches/libc/locale. Nenhuma versão/serviço de produção foi alterada.
Primeiro qualificar tipos, HTTP fechado e imagem; depois executar o modo
externo. Ainda não há normalização de destinos/autoridades para tráfego,
replay F7, custódia recuperável, controle durável, cron ou RPO/RTO de produção.
