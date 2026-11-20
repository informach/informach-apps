# Reaplicação nativa dos direitos após restauração

Frente F8 em implementação. As provas existentes restauram/normalizam a
captura e invalidam capacidades; ainda não comprovam esta reaplicação.
Não admitir tráfego ou anunciar recuperação completa a partir delas.

## Causa e separação das autoridades

O solicitante pode não existir no backup, mesmo que o perfil selecionado já
existisse: por exemplo, uma responsabilidade mudou depois da captura. Uma
preparação interativa tem FK para `core.users`. Recriá-la com conta fictícia,
login do operador ou datas inventadas não preservaria o consentimento original.
Um mundo mencionado no plano também pode não existir no backup. A FK de
`rights_worlds` exige mundo vivo; simplesmente omitir esse mundo quebraria a
comparação integral do plano assinado.

A operação restaurada terá uma proveniência de recuperação distinta da prévia
interativa: plano original, solicitante histórico, importação efetiva e execução
ligada ao cabeçalho congelado/captura. Essa fonte não é identidade ou concessão.
A preparação nativa conserva sua FK e as exigências de login recente. Uma
operação tem exatamente uma das duas proveniências, com escopo composto no banco.
Nenhum processo público ganha um modo para ignorar o livro ou as permissões.

## Sequência de implementação e prova

1. Persistir execução e fontes históricas sem FK para uma identidade fictícia.
   Conservar assinatura, intenção, fonte e datas originais da decisão; registrar
   a importação separadamente. Gerar/adotar a migration no GitHub.
2. Resolver a fonte original em um leitor comum aos workers, conferindo SHA,
   assinatura e seleção completa. Referências de mundos ausentes ficam
   explícitas no mapa recuperado; não criar mundo vazio nem reduzir a seleção.
3. Admitir execução offline somente com prova do cluster privado, inventário
   autenticado comparado, capacidades revogadas e prefixo inteiro congelado.
   O contexto privado deve ser vinculado à conexão/cerca; workers normais
   continuam exigindo livro aberto e chave corrente.
4. Reaplicar retirada com os mesmos preparadores de foto/diário e efeitos
   pessoais. A responsabilidade histórica assinada não reatribui a guarda do
   backup ao solicitante. Ausência do perfil é recibo explícito, não descarte
   silencioso da seleção. Preservar dados dos demais e prazos técnicos originais.
5. Reconciliar finanças antes de efeitos de encerramento. Clientes/origens que
   surgiram depois da captura precisam de proveniência autenticada e leitura
   completa do provedor; inexistência local não prova inexistência remota.
   Não criar identidade, período pago ou aceite de sucessão por suposição.
6. Conferir todos os efeitos/pendências, emitir recibo durável, normalizar
   identidade e destinos/chaves atuais e só então admitir tráfego. Operações
   inconclusivas e mundos que precisam de sucessão real permanecem bloqueados,
   com diagnóstico e resolução explícitos; não atribuir responsabilidade ao admin.

Casos obrigatórios: backup anterior ao consentimento; solicitante ausente e
perfil presente; perfil ou mundo ausente; relações antigas diferentes das
assinadas; plano/scope/cerca corrompidos; última entrada inválida antes de qualquer
efeito; rollback/reinício/repetição; dados de terceiro preservados; fechamento
com e sem cobrança; origem financeira posterior ao backup; quitação/reconciliação
distintas; prefixo mudando; chave nova e recibo externo antes da reabertura.

## Limites já identificados

O plano atual registra os mundos e contadores, sem reconstruir sozinho um
sucessor aceito que não exista na captura. Não inventar esse aceite nem apagar
o mundo de terceiros. Também não resolve sozinho toda a origem financeira
posterior ao backup. Esses casos exigem protocolo autenticado de reconciliação,
com quarentena até a prova; não podem ser classificados como concluídos apenas
porque os demais passos da cópia funcionaram. Revisão de retenção/checkpoint do
livro e inventário dos mundos legados continuam parte do fechamento.


## Primeiro incremento em candidata

Duas tabelas guardam execução e fonte histórica, sem conta ou mundo fictício.
A preparação nativa conserva sua FK; a operação admite exatamente uma origem,
inclusive recusando ambas nulas pela semântica SQL de CHECK. A fonte recuperada
é vinculada ao ator/versão de plano/tipo/livro por FK composta e não pode nascer
como publicação de novo consentimento.

O leitor histórico usa o parser/SHA canônico e confere o mapa inteiro contra
o plano e o banco (incluindo ausência efetiva). Retorna execução não autorizada.
Os nove leitores dos workers interativos usam uma porta explícita que recusa
fonte recuperada; o verificador normal conserva a mesma barreira. Nenhuma
exceção ao cabeçalho aberto/chave corrente foi introduzida. Pedido interativo
não reutiliza ID já ocupado por uma operação recuperada.

A prova preparada usa perfil real em PG, solicitante ausente, mundo presente e
mundo ausente, origem inválida/dupla/nula, mapa truncado/divergente e tentativa
de uso pela porta interativa. Não comprova consentimento nativo, prefixo externo,
efeitos offline, finanças ou tráfego restaurado. Migration e gates ainda pendentes.


Geração 44774522635/02ee5a8a adotada intacta como 0242: duas tabelas de
proveniência, coluna de recuperação e origem exclusiva/FK composta na operação.
A FK da preparação para a conta e as demais estruturas são idênticas ao snapshot
anterior. Sem DML/backfill: operações existentes conservam a origem nativa,
com nova coluna nula. O journal mantém as 242 entradas anteriores, 243 no total.
SQL/snapshot/journal/ZIP conferidos no
[recibo](evidencias/migracao-origem-recuperada-44774522635.json).
Fonte 464368eb passou direitos 44775278155, qualidade 44775284648 e
conciliação 44775290564. PostgreSQL confirmou as recusas de origem e o upgrade;
essa prova continua sem executar efeitos offline.


## Importação privada em qualificação

O importador de fontes usa exclusivamente o cliente do cluster restaurado.
Antes de ler o livro, verifica o destino privado e a ausência das vinte fontes
de capacidades temporárias. Exige livro congelado, próxima chave distinta e
não utilizada, captura/fonte fixadas e seleção completa. A cerca observada é
exigida também no preflight de todos os planos, antes da primeira escrita.
Revisões repetidas da mesma operação são recusadas explicitamente: o schema
atual conserva uma decisão imutável por operação, sem colapsar revisões.

Importações são limitadas, transacionais por decisão e idempotentes: repetição
compara captura, fonte, chave, plano e mapa inteiro, conserva a primeira data
e recusa divergência sem substituir os dados. Interrupção deixa a execução
em `replaying`. Esta etapa não cria operação nativa, identidade, consentimento,
efeito financeiro, direito ou liberação de tráfego.

A prova preparada restaura o backup real sintético em PostgreSQL 18.6 privado
e usa o SDK S3/HTTP fechado com MACs reais para as fontes históricas. Verifica
plano final ausente antes de qualquer gravação, mundo presente/ausente, conta
ausente, repetição com datas originais, captura divergente, mapa adulterado
sem sobrescrita e limpeza exata pelo inventário completo. É prova de armazenamento
e proveniência; não comprova consentimento do adulto ou reaplicação dos efeitos.
Os novos gates ainda precisam executar.


## Verificador canônico em candidata

`intencao-persistida` reúne a conferência de MAC/SHA, todos os campos da
intenção assinada, seleção ordenada de perfis e seleção inteira de mundos.
O caminho interativo conserva as exigências de preparação e FK. A conferência
histórica acrescenta o mesmo verificador ao plano/mapa recuperado, consulta
todos os sujeitos (incluindo referências ausentes) e limita a época à cerca.
Nenhum dos dois validadores emite permissão de efeitos offline. A prova nativa
preparada inclui sujeito faltante/adicional, fonte divergente e adulteração
do MAC persistida em PG com SHA recalculado. Os gates ainda precisam executar.


## Importação comprovada, conexão nativa em qualificação

37099d58 passou qualidade 44777706933; a prova fria 44777711780 recusou o plano
na restrição JSONB. Diagnóstico c74cea66/44778543649 isolou
`SQL_RECOVERY_PLAN`: string JSON recebia serialização JSON novamente pelo driver.
5c57ce23 corrige a causa com `tx.json` nos dois parâmetros. Qualidade
44778997078 e cluster frio/bucket real 44778991297 passaram; quatro objetos e
registros históricos sintéticos limpos, com inventário preservado.
[Recibo e hashes](evidencias/fontes-cluster-frio-44778991297.json).
O livro histórico da prova usa HTTP fechado, com MACs reais de fixtures; não
é prova de consentimento do adulto ou de efeitos nativos após recuperação.

O verificador compartilhado d9396b81 passou direitos 44778056259 e qualidade
44778061634. Negativas de MAC persistido/SHA recalculado, origem e seleção
completa passaram no PostgreSQL.

A candidata seguinte abre uma conexão nativa própria derivada exclusivamente
do socket/banco privado já verificado e confirma o destino pela própria
conexão. Não altera DATABASE_URL ou parsers do cliente de inventário, não usa
o singleton e encerra seu pool inclusive em falhas. A factory compartilhada
continua compatível com as URLs usadas nos provisionamentos Conta/Edi; esses
consumidores exigem CI compartilhado. Prova fria preparada confere leitura
nativa das fontes, rollback, fechamento efetivo e inventário integral após
a limpeza. Nenhuma porta de worker foi liberada para execução offline.


## Preparação SQL compartilhada em candidata

A inspeção de drenagem e o congelamento de perfis/mundos foram extraídos da
admissão interativa para funções que recebem a transação explicitamente.
A admissão continua conferindo identidade, prévia, aceite e livro nos mesmos
pontos; revogação de aparelhos/sessões, finanças e auditoria permanecem na
mesma transação. Seleções duplicadas, perfil/jogo fora do plano e drenagem de
mundo alheio são recusados pelo helper. Não há nova rota, criação implícita
de consentimento ou permissão de execução com livro congelado. As provas
nativas existentes devem ser repetidas na nova fonte.

O leitor privado do livro passa a disponibilizar os bytes autenticados originais
da intenção por referência/SHA. Uma chave nova ativa não reassina nem substitui
a decisão antiga. A prova preparada compara bytes e chave originais, relê
depois de zerar o buffer e recusa SHA divergente usando o SDK/HTTP real fechado.
Isto permite importar a operação sem fabricar uma nova assinatura/autoridade;
a admissão e os efeitos históricos ainda precisam da composição privada.


## Conexão qualificada e carga SQL sem credenciais do portal

Conexão b1d0d84e passou cluster frio 44780703784, qualidade 44780710345 e
integração 44780721833. Leitura nativa, rollback, fechamento do pool e limpeza
com inventário idêntico foram conferidos no
[recibo](evidencias/conexao-cluster-frio-44780703784.json). CI compartilhado
44780716449 ainda em curso. A extração de preparo 20afa0cd passou direitos
44781746827; qualidade ainda em curso.

A nova candidata separa `account/serializacao-repository` do login, conservando
a mesma trava consultiva e a reexportação anterior. Direitos usa a entrada
`@informach/auth/audit`, a mesma implementação/estado de auditoria sem carregar
a composição Better Auth. Escritores continuam passando a própria transação,
sem nova identidade, sessão ou exceção de persistência.

A prova fria preparada carrega cinco workers SQL reais sem DATABASE_URL,
credenciais de login, e-mail ou Stripe. Ela os chama com o livro autenticamente
congelado e exige recusa DIREITOS_LIVRO antes de tocar o singleton. É prova de
carga e da manutenção da barreira normal, não licença para executar os efeitos
na recuperação. Fotografias/recuperação do diário ainda precisam separar a
consulta de limites do catálogo das configurações de hosts/login. O coordenador
privado, a admissão de operações recuperadas e a reconciliação financeira
continuam obrigatórios e ainda não foram liberados.


## Coordenação privada SQL em candidata

O controle do destino privado e as consultas de capacidades possuem uma única
fonte, usada pelo normalizador e pelo coordenador. A factory recebe a conexão
nativa própria, consulta o PostgreSQL real, confere execução/captura/fonte,
chave seguinte distinta, cabeçalho congelado, prefixo/planos inteiros e todas
as fontes/mapas persistidos. Leituras têm limites de 5 s por instrução, 2 s
por trava e 15 s por transação, sem rede dentro das transações.

A coordenação é registrada apenas no processo e apenas durante o callback.
Cópia do objeto e uso após o término são recusados antes do singleton. Os
workers SQL de retirada/dados/drenagem/conclusão/expurgo passam a receber o
banco e escopo dessa coordenação: só operações recuperadas da execução e da
cerca, com intenção original e seleção completas conferidas de novo. Filas
interativas continuam com livro aberto/chave corrente e excluem essa origem.
A factory não cria operações, consentimentos ou efeitos, não libera tráfego
e não resolve encerramento financeiro; o escopo privado atual aceita somente
retirada, mantendo cobrança/encerramento fora dele até sua implementação.

A prova preparada admite o contexto no cluster frio e consulta as cinco filas
vazias pelo banco privado. Exige recusa de captura divergente, último plano
ausente antes do callback, objeto copiado e coordenação vencida. Não deve ser
apresentada como execução de retirada: não há operação nativa importada nessa
prova e `historicalSourceEffectsExecuted` permanece falso. Admissão histórica,
perfis ausentes/responsabilidades antigas, fotos/diário e finanças continuam
pendentes de implementação e prova.


## Admissão por operação em candidata

A fonte 67048f29 passou cluster frio 44784096494, qualidade 44784102274 e
integração 44784107192. Essa prova consultou filas vazias: não importou uma
operação nativa ou executou retirada.

O incremento seguinte limita a coordenação principal à preparação: ela não
seleciona operações para efeitos. Cada operação exige um escopo filho exclusivo,
verificação do MAC/seleção completos e captura limitada a 256 vínculos do backup.
O escopo expira no término. A responsabilidade assinada continua no plano e no
sujeito; o vínculo antigo do backup é somente uma conferência de consistência
na memória, nunca uma reatribuição ao solicitante histórico. A autoridade dos
workers interativos permanece a mesma.

`admissao-recuperada-repository` usa bytes/datas/fonte/chave originais, verifica
a execução e registra admissão histórica, sem consentimento ou identidade
novos. Preparo SQL é o mesmo da admissão interativa. Perfil ausente recebe
recibo explícito; mundo ausente permanece no mapa integral. Mundo adicional,
cadastro incompatível ou operação nativa anterior ainda sem conciliação são
recusas explícitas. Não reescrever admissão/conclusão antigas ou inventar sucessor.
Cobrança permanece fora desse perfil de admissão.

A prova preparada usa um menor real do backup sem mundo, responsabilidade
histórica posterior e solicitante ausente, com MAC de fixture declarado. Confere
admissão/repetição, assinatura/datas originais, auditoria histórica única, guarda
antiga preservada, escopo exclusivo e vencimento. Nenhum apagador pessoal roda:
ao final é desfeito apenas o congelamento sintético e o inventário completo
deve voltar a ser idêntico, inclusive microssegundos. Não é retirada executada
ou prova de aceite nativo; ambas continuam necessárias na composição final.


## Admissão qualificada e fotografias em candidata

6d7edda3 passou qualidade 44787689932 e integração 44787694501. O cluster frio
44787685798 recusou a prova porque a captura não tinha menor sem mundo. A fonte
e1e39c73 cria essa família pelos serviços nativos ANTES de capturar; cluster
frio 44788555964 passou, com guarda antiga preservada, conta histórica ausente,
admissão repetida, datas/MAC originais, auditoria única, escopo vencido e limpeza
com inventário idêntico. [Recibo](evidencias/admissao-cluster-frio-44788555964.json).
Apenas o congelamento sintético foi revertido; nenhum apagador pessoal foi
chamado. A decisão histórica continua sendo MAC de fixture, sem alegação de
aceite nativo. [Coordenação anterior](evidencias/coordenacao-cluster-frio-44784096494.json).

O próximo incremento vincula também as filas/commits de fotos e recuperação
do diário ao banco/escopo ativos e ao mesmo verificador da decisão original.
Limites vêm do catálogo canônico na recuperação, sem avaliar host, login ou
publicação como permissão. A composição online continua usando o catálogo do
deploy, resolvido antes de abrir SQL. O reader externo de recuperação só é
carregado quando a função online correspondente precisa dele.

Revisão de fotografia passa a exigir coordenação e registra bloqueio com
auditoria estrita na mesma transação. A cópia de bytes do commit é zerada
somente depois da transação. Prova fria preparada carrega oito workers, exige
recusa normal do livro congelado e consulta as filas fotográficas privadas
vazias. Isso não comprova transformação/reaplicação de fotos; a composição
operacional, admissão das operações já existentes, encerramento financeiro e
prova integral em outro cluster continuam pendentes.


## Duração dos escopos em candidata

A fonte 74d714da falhou nos tipos: reserva fotográfica ainda devolvia uma
preparação removida e a prova acessava `situacao` sem distinguir material
de recuperação. 22645047 retira o campo sem consumidor e estreita a união
explicitamente; cluster frio 44790153497 passou com oito workers sem credenciais
do portal e filas privadas vazias. Qualidade e integração dessa fonte ainda
estão em curso; isto não comprova transformação das fotografias.

O incremento seguinte vincula cada filho à vida do pai e ao cancelamento/prazo
da execução. Admissão revalida o contexto depois da leitura externa e antes
de finalizar SQL; fases de dados, fotos, diário, conclusão e expurgo revalidam
antes de confirmar suas transações. Não recorrer ao pool original após expirar.

A prova preparada usa promessas observadas e barreiras explícitas, sem sleeps:
o pai termina, só então um filho retido tenta chamar o worker real. Outro
caso cancela o contexto antes da mutação. Ambos devem recusar; o inventário
completo após desfazer apenas o congelamento sintético detecta qualquer
apagador que rode indevidamente. Nenhum apagamento é esperado nesses casos.


## Composição operacional em candidata

40798712 passou cluster frio 44791374487, qualidade 44791379919 e integração
44791385771. Filho retido após o término do pai e cancelamento antes da mutação
foram recusados usando o worker real, com inventário preservado após a limpeza.
Nenhum apagador pessoal rodou.

Os mesmos adaptadores operacionais de foto/diário agora possuem uma entrada
que recebe a coordenação efetiva. A entrada online conserva sua conferência
completa do livro; a privada exige reader externo nulo e fotos normalizadas
em PG. Após o I/O, relê a cerca original e conserva o MESMO objeto de capacidade
privada; uma cópia de assinatura/prova não ganha autoridade. Nenhum engine
entra no grafo Next: a composição permanece em `scripts/direitos`.

A prova preparada reconfere o cabeçalho por HTTP e exige a mesma coordenação,
além de consultar as filas operacionais vazias sem credenciais do portal.
Transformação real, consentimento nativo posterior à captura, operações já
existentes, finanças e publicação final continuam pendentes.

## Próximos pontos de prova e publicação

1. Criar o consentimento pelos serviços nativos depois da captura e consumir
   o livro independente guardado, em outro cluster frio. O teste de apagamento
   usa cluster descartável próprio: não recompor dados pessoais para esconder
   o efeito. Conservar terceiro/global/retencões e provar ausência do alvo.
2. Executar foto/diário reais com snapshot tipado, incluindo referência
   presente/ausente. Para operações já nativas no backup, conservar as datas
   e a evidência de admissão/conclusão anteriores; provar o cabeçalho ancestral
   autêntico, sem reescrever a decisão como consentimento novo.
3. Confirmar finanças atuais antes de qualquer encerramento recuperado.
   Proveniência posterior ao backup não autoriza criar conta/cliente/fato
   financeiro fictício nem inferir ausência do provedor pela ausência local.
4. A captura inclui outros domínios para a restauração isolada e a conferência.
   Isso NÃO autoriza publicar o dump inteiro no banco compartilhado ou retroceder
   identidade, auditoria, finanças e conteúdo dos outros apps. A publicação
   precisa de destino/escopo próprios do Recreio, identidade atual e reconciliação
   das FKs/recibos, novos destinos/chaves e prova antes de liberar tráfego.
5. Manter custódia independente, agenda/alertas, retenção/checkpoint do livro,
   RPO/RTO/custo observados, gates finais e testes humanos no final.


## Consentimento nativo posterior à captura — candidata

22645047 passou cluster frio 44790153497, qualidade 44790159030 e integração
44790163929. 40798712 passou 44791374487/44791379919/44791385771. A composição
f466c178 passou cluster frio 44793400837 e qualidade 44793407072; integração
44793412931 ainda está em execução. Recibos derivados estão em `evidencias/`,
com hashes dos ZIPs originais conservados fora do repositório. Esses recibos
ainda não executaram apagador pessoal.

A nova prova prepara uma família pelos serviços nativos antes da captura, com
um progresso opaco e uma conquista do perfil selecionado e de outro perfil.
Somente depois de publicar/conferir o backup, usa login recente, prévia,
confirmação nativa, outbox e publicação reais. A decisão posterior é guardada
no bucket exclusivo de homologação, em prefixo próprio do livro, e congelada.
O filho recebe apenas coordenadas/chaves sintéticas e as seis credenciais já
restritas; não recebe banco da origem, autenticação, Stripe ou host de jogo.

A primeira restauração continua provando normalização/recusas e inventário
intacto. Uma segunda restauração descartável recebe o livro externo por cliente
GET restrito ao prefixo exato, importa/admite o pedido e executa os workers
nativos de dados, minimização, referências e conclusão, com limite de passagens.
Confere ausência do alvo, identidade global e dados do outro perfil, auditoria
anterior e tabelas alheias. Não recoloca dados apagados para simular inventário
intacto. Ambos os clusters e todos os objetos sintéticos precisam ser removidos.

Os campos antigos de fixture MAC passam a se chamar
`macFixturePersonalErasureExecuted`/`macFixtureSourceEffectsExecuted`; a prova
nativa tem campos separados `nativePostCapture*`. As restrições GET dos dois
clientes também são declaradas separadamente. Os recibos históricos conservam
o formato original. Gates da nova prova pendentes; não é recuperação integral,
não inclui foto/diário tipados, finanças, operações prévias ou publicação.

Na conferência de aparelhos, a FK pode limpar somente `active_profile_id` do
perfil retirado. A prova compara cada outro campo por hash e mantém os demais
perfis selecionados, revogações e a trava `minor_context_generation`. Não exige
inventário idêntico dessa coluna nem aceita apagar/recriar aparelhos.


## Fotografia tipada na prova posterior — candidata seguinte

A candidata inicial f8480bcd passou a admissão, retirada pessoal, conclusão e
conferências do terceiro/global/auditoria, mas falhou na comparação das tabelas
em 44795713916. A FK de seleção do aparelho era uma alteração esperada não
separada da matriz; 2a955293 passa a conferir somente essa coluna à parte, sem
permitir mudança da trava infantil ou dos outros campos. Gates de repetição:
44796463771/44796468303/44796473327. Qualidade/integração da fonte anterior foram
canceladas pela concorrência do workflow após publicar essa correção. Não há
recibo aprovado da reaplicação nativa ainda.

O próximo incremento substitui os bytes provisórios por fotografia gzip tipada
da simulação real, com dois fundadores. O mundo e o responsável são nativos;
a família é criada pelos serviços reais. O histórico de autoria e o estado do
jogo são fixtures sintéticas inseridas antes da captura, sem atribuir associação
de membro, presença ou permissão ao menor. Não comprova sessão infantil no
Morada, diversão, visualização, FPS ou aceite humano de transferência.

O pedido posterior continua sendo consentimento nativo. A segunda restauração
normaliza a foto do bucket para PG e chama o mesmo adapter operacional sob a
coordenação privada. A prova exige remover o ID selecionado, manter o outro ID
e as famílias da simulação, conferir hash/metadados da foto e preservar o mundo
e o membro responsável. Não inclui recuperação de diário além da fotografia
nem operações prévias/finanças/publicação. Gates desta fonte ainda pendentes.


2a955293 passou bucket/cluster frio **44796463771**. A segunda restauração
executou o consentimento nativo posterior à captura e os apagadores pessoais;
confirmou ausência do alvo, terceiro/global/auditoria anterior e aparelhos
preservados, sem novo consentimento. Livro externo foi lido somente por GET no
prefixo próprio, dez objetos sintéticos foram removidos, dois clusters e arquivos
limpos. [Recibo](evidencias/retirada-nativa-cluster-frio-44796463771.json). Qualidade
44796468303 e integração 44796473327 ainda em execução. A fotografia tipada acima
é o incremento seguinte; não está incluída nesse recibo aprovado.


6c7eb4d4 passou fotografia tipada/cluster frio **44797362860** e qualidade
44797368369. Adapter operacional removeu o ID selecionado dos bytes gzip,
conservou o outro fundador e as famílias, hash/metadados da foto e responsável/
membro/mundo; retirada pessoal e limpeza dos dez objetos/dois clusters foram
confirmadas. [Recibo](evidencias/foto-nativa-cluster-frio-44797362860.json). Integração
44797372963 ainda em execução. Diário posterior à foto continua fora dessa prova.

## Correção do teste de independência do SDK

CI compartilhado 44780716449/b1d0d84e falhou no E2E de progresso; 48 testes
passaram e seis foram ignorados por seus modos declarados. O trace original
foi conservado fora do Git. A única URL que correspondeu a `morada|three` foi
`/jogos/morada`, recurso fetch de prefetch da ficha editorial; não houve URL do
motor nesse recorte. O predicado confundia metadados de catálogo com executável.

A prova passa a recusar a rota `/jogar/morada` e scripts nomeados, além de ler
os corpos dos scripts recebidos, inclusive chunks cujo nome é só hash. Three
0.186.1 registra `window.__THREE__` no próprio módulo (fonte fixada inspecionada);
o E2E recusa esse marcador no código recebido e sua presença antes/depois do
fluxo. Leitura falha de script é inconclusiva e reprova. As recusas de API de
mundos e as fronteiras estáticas dos imports continuam intactas. Nenhuma
mudança no prefetch do produto ou exceção para importar engine no portal.
Documentação Playwright 1.64.1 conferida para `resourceType` e `response.text`.
Gates desta correção ainda pendentes.


## Diário posterior à fotografia — candidata

A prova seguinte produz um fato durável com o próprio motor depois da foto:
a permissão de jogo `gastar` do fundador preservado é retirada na simulação,
sem modificar sua identidade ou autoridade no portal. Todos os fatos emitidos
pelo avanço curto são guardados, em sequência, no banco descartável antes da
captura. A foto inicial continua na revisão 1/diário 0; o mundo aponta para o
último fato confirmado. Não é uma sessão real de usuário ou prova de desempenho.

Na segunda restauração, o adapter recupera o diário ainda não fotografado,
confirma a revisão 2, drena, trata ambas as fotos e só então compacta o prefixo
coberto e retira o perfil. Exige exatamente uma recuperação, dois tratamentos
fotográficos, quantidade compactada igual ao diário original e nenhum fato
restante. Hashes SHA-256 do JSON canônico das famílias e do acesso de jogo do
outro fundador vêm do estado final anterior à captura, somente como oráculos
de comparação: não são usados para criar/restaurar estado. Tick, revisão, cerca
nova e liberação do mundo também são conferidos. Gates pendentes; operações
prévias ao backup, seleção toda ausente, finanças e publicação seguem abertas.


## Cabeçalhos de operações já admitidas — verificador em candidata

O leitor recebe opcionalmente pares limitados de intenção/revisão/hash e
cabeçalho persistido. Confere a cadeia inteira e a posição da admissão: um
cabeçalho autêntico anterior à inclusão dessa intenção é recusado. Só guarda
contadores para os pares solicitados, sem duplicar todos os cabeçalhos no fluxo
comum; o formato da prova devolvida permanece igual. Par malformado/repetido
é configuração inválida antes de I/O. Cabeçalho ausente, hash diferente ou
intenção posterior ao cabeçalho são integridade inválida. Não autoriza efeitos.

Casos preparados com HTTP/S3 fechado real: duas intenções, admissão ancestral
válida após congelar e negativas para cabeça anterior/ausente e outro hash.
Gates desse incremento pendentes.

Sequência de integração ainda necessária:

1. No cluster privado, inventariar as operações nativas admitidas/em execução/
   concluídas do mesmo livro, com limite, e conferir seus pares antes dos efeitos.
2. Conservar `preparation_id` e a origem nativa; validar preparação/MAC/plano
   inteiro contra a fonte externa e o mapa da captura. Não converter a operação
   existente em importação recém-admitida nem sobrescrever datas/cabeçalhos.
3. Vincular essa conferência à coordenação privada temporária e à operação
   específica. A execução normal continua exigindo livro aberto/chave atual.
4. Reconciliação de lease/backoff do worker ocorre só na cópia privada, depois
   da prova integral, com auditoria própria. Não é novo consentimento. Conclusão
   anterior e prazos de retenção são conservados; estados de revisão não viram
   autorização automática. Outbox não admitida exige seu próprio tratamento.
5. A prova fria precisa de uma decisão nativa publicada ANTES da captura e
   outra DEPOIS, no mesmo livro. O primeiro cabeçalho deve ser ancestral real;
   aplicar ambas na segunda restauração e conferir os recibos originais. Nenhum
   usuário/preparação/dado pessoal é recriado para fechar uma FK.
6. A seleção inteiramente ausente com mundo presente ainda precisa da liberação
   compartilhada dos mundos após fotos/diário, sem depender de um último perfil
   vivo. Não inventar responsável/aceite para liberar mundo compartilhado.

Fad2a884 falhou antes de executar diário: TS18048 no acesso opcional da fixture
(44799100250/44799105139). Guardas explícitas sem assertion ou exceção de lint
foram publicadas em 10197642; repetição 44799702439/44799708245/44799713119.
Qualidade e integração das fontes anteriores 2a955293 e 6c7eb4d4 passaram; os
recibos aprovados dessas fontes continuam distintos da prova nova de diário.


## Leitura da origem nativa já existente — candidata

`conferirFonteNativaRecuperada` compara a operação com sua preparação nativa
original, MAC, seleção inteira, fonte/plano externo e mapa da execução. Conserva
o cabeçalho antigo e devolve o par que ainda precisa da conferência de inclusão
na cadeia. Não grava, não troca origem, não limpa lease, não admite efeitos e
não confirma financeiro. O leitor da origem importada conserva a exigência de
seu cabeçalho congelado; ambos compartilham somente a consulta da fonte.

A integração preparada cria família/consentimento/outbox nativos e congela o
livro por HTTP/S3 fechado. Metadados de execução são fixtures: não é um cluster
restaurado nem uma autorização. Exige par ancestral válido, recusa execução
normal com livro congelado, recusa outra execução/mapa divergente e compara a
operação inteira após as leituras. Nenhuma data, preparação ou origem deve mudar.
Gates pendentes. Vinculação da prova à capacidade privada/retomada ainda falta.

A execução 44799702439 chegou às conferências finais do diário e reprovou
`DIARIO_NATIVO_DIVERGENTE`. Nenhum aceite foi relaxado: contadores, mundo,
identificadores, famílias, acesso e metadados agora possuem classificadores
fixos separados em 2ed8518b, sem valores/conteúdo/SQL no diagnóstico. Prova
44800675986 em execução para identificar o predicado; original 3aecf157 está
qualificando os pares ancestrais em 44800202826/44800207843.

Para o ensaio nativo anterior ao backup, preparar uma decisão publicada antes
da captura e outra depois no mesmo livro, conservar a primeira preparação e
suas datas e provar ambas no cluster descartável. Se houver lease/backoff
herdado, reconciliar só esses campos de worker sob prova integral, com auditoria
própria e repetição sem novo evento. Operação já concluída deve preservar também
o instante de conclusão; estado em revisão/publicação não passa automaticamente.


## Conferências do diário e da captura de scripts

44800675986 isolou a falha do diário em `DIARIO_NATIVO_METADADOS`: contadores,
liberação do mundo, identificadores, famílias e acesso final passaram. A fixture
avançava 1.000 ms sem sessão, mas seu contrato durável só inclui os fatos
emitidos; relógio transcorrido silenciosamente não é checkpoint confirmado.
O incremento agora usa `avancar(0)`, contrato público que recolhe o fato real
da mudança de acesso sem avançar tempo. Conserva todos os fatos emitidos e as
comparações exatas de tick/metadados e estado final; não aceita inventar avanço
de relógio na recuperação. Prova de tempo com host/diário real permanece nos
testes de drenagem existentes, não é alegada por este caso isolado.

A rodada completa a7389a97/44798333650 reprovou somente o E2E de progresso.
O trace confirmou HTTP 200 nos scripts e erro `Network.getResponseBody`: a
navegação invalidou o corpo antes de o observador terminá-lo. O teste agora
observa scripts desde o pedido e aguarda a leitura de todos os já emitidos
antes de sair de cada documento. Falhas de corpo continuam reprovando; não
aumenta timeout, desliga cache ou altera o transporte/IP do app. Trace original
conservado fora do Git. Gates da correção pendentes.

3aecf157 passou direitos/upgrade **44800202826** e qualidade **44800207843**:
pares ancestrais válidos e recusas por cabeça anterior/ausente/hash/repetição
foram qualificados. Qualidade/integração 10197642 passaram 44799708245/44799713119;
aquele cluster frio continua reprovado pelo oráculo de metadados acima.


## Liberação limitada de mundos — implementação seguinte

A liberação atual fica no último perfil minimizado. Isso deixa uma seleção
inteiramente ausente sem executor dessa transição e concentra todos os mundos
em uma transação. A correção separará uma etapa SQL de liberação, um mundo por
passagem, sob a mesma intenção, operação, coordenação e conferência financeira.

- A minimização continua retirando cadastro/vínculos e registrando o recibo; não
  libera mundo nem remove sua autoria antes do tratamento do estado de jogo.
- A nova fila só admite sujeitos minimizados/em expurgo/removidos, fotos/diário
  concluídos e um mundo em dependências. Conferirá projeções mínimas, cursores,
  cercas e responsável remanescente; não fabrica responsável ou aceite.
- O expurgo já exige todos os mundos concluídos. Manter essa guarda para que a
  FK de um perfil ainda não apague a referência de autoria necessária para
  limpar o rótulo do mundo. A conclusão conserva a mesma exigência.
- A etapa própria entra entre cadastro e referências no executor e na prova
  fria. Auditoria é atômica com cada liberação; uma revisão impede liberação.
- Testar seleção ausente, dois mundos em passagens distintas, terceiro e estado
  preservados, e falha de auditoria com rollback. Atualizar os testes que antes
  esperavam a liberação dentro da minimização; não esconder a etapa no helper.

Não altera o schema, não libera tráfego de restauração e não implementa a
retomada nativa/financeira ainda pendente. Gates antes de qualquer ativação.


A etapa `liberarProximoMundoDeDireitos` foi implementada em candidata e entrou
entre cadastro e referências. Usa a mesma reserva/coordenação/MAC/financeiro e
limites SQL; processa um mundo, confere cursores/cercas, projeções mínimas e
responsável remanescente, e registra `rights_world_released` atomicamente. A
conclusão continua recusando sujeitos em expurgo; compartilhar a conferência
mínima não torna `purging` um estado concluído. Nenhuma migration foi criada.

A regressão nativa preparada possui dois mundos vazios de outro responsável,
seleção assinada por autoria histórica e minimização real do perfil. Depois
emula um recibo de ausência na cópia, sem inventar identidade/consentimento.
Exige uma liberação por chamada, conclusão bloqueada entre as duas, rollback
de mundo/etapa após falha estrita de auditoria e preservação dos membros/donos/
nomes. É fixture de estados de recuperação, não restauração fria completa com
seleção ausente. A prova fria com sujeito presente passa a chamar a nova etapa
explicitamente; o executor ordinário consulta seis workers SQL sob a cerca.
Gates desse incremento pendentes.


91dcdf7a passou o diário nativo/cluster frio **44801988161**, com fato real
confirmado no mesmo tick, recuperação, duas fotos tratadas, compactação e
retirada pessoal, preservação/limpeza confirmadas.
[Recibo](evidencias/diario-nativo-cluster-frio-44801988161.json). Rodada completa
44801993382 e CI compartilhado 44802000813 ainda em execução. Este recibo é
anterior à separação da liberação de mundos. Origem nativa já existente d3f0432c
passou direitos 44801318469 e qualidade 44801324830, somente leitura/negativas;
retomada sob capacidade privada ainda pendente.


## Avaliação por execução e recibo de retomada — schema em geração

A fonte histórica usa `operation_id` como PK e guarda sua primeira execução.
Reaproveitá-la como avaliação corrente impediria uma segunda restauração ou
exigiria sobrescrever a origem. Outra lacuna: limpar lease em cada chamada de
retomada poderia cancelar a reserva de um worker novo no mesmo cluster.
Auditoria não será usada como banco operacional para contornar essas causas.

Uma tabela aditiva `rights_recovery_evaluations` terá PK execução/operação e
FKs compostas para execução/livro e fonte original/ator/plano/tipo/livro. Guarda
o mapa atual e os estados staged/ready/verified/review. O recibo ready fixa a
origem, preparação ou fonte, hash da intenção e cabeçalho originalmente admitido.
É uma avaliação técnica por restauração, sem FK para autor histórico ou mundo
ausente, sem criar identidade, e não autoriza efeitos/tráfego por si. Datas de
consentimento/admissão/conclusão da operação permanecem originais.

A admissão fixa escreverá o recibo e reconciliará o lease herdado uma única vez,
na mesma transação da auditoria. Repetição não limpará lease/backoff de worker
novo. Escopo filho exigirá recibo pronto, cadeia inteira, origem/MAC/mapeamento
atual e cluster privado. A mesma regra deverá tratar origem nativa e origem
recuperada já presente em um backup posterior, preservando a fonte anterior.
Operações de publicação/revisão e financeiro não viram autorização automática.

Há uma implementação nativa e fixture de consentimento anterior em andamento
no worktree; ela ainda não usa esse recibo durável e NÃO foi qualificada ou
ativada. A geração publicará somente o schema aditivo a partir da fonte a1a5ae28;
os arquivos SQL/snapshot/journal deverão ser adotados intactos do GitHub e
conferidos estruturalmente antes de ligar os consumidores. Não aplicar DDL em
produção. A base qualificada permanece 0242/243 recibos/79 tabelas até a adoção.

Provas a acrescentar: duas decisões nativas no mesmo livro (antes/depois do
backup), efeito parcial anterior conservado, lease de crash sintético reconciliado
com repetição, conclusão antiga imutável, duas recuperações consecutivas e recusa
de recibo/execução/origem divergentes. Uma nova recuperação exige avaliação nova,
não reescrita de fonte, conta, consentimento ou datas antigas.

A publicação continua restrita ao Recreio, sem restaurar o dump inteiro sobre o
PostgreSQL compartilhado. Backup de versão antiga exige conferência do inventário
original antes do upgrade privado pela cadeia de migrations verificada; não usar
leitores atuais contra schema antigo como se as tabelas já existissem. Custódia
independente, finanças/identidade atuais, retenções após retomada e checkpoint do
livro ainda precisam da implementação/prova indicadas nesta frente.


0243 gerada em **44808850554** a partir de 68e568ab foi adotada sem alterar
SQL/snapshot/journal. ZIP e arquivos conferidos por SHA-256, snapshot anterior
intacto, apenas uma tabela aditiva e prefixo de 243 recibos preservado: candidata
com 244 recibos/80 tabelas. [Proveniência](evidencias/migracao-avaliacoes-44808850554.json).
Aplicação SQL e consumidores ainda exigem gates; produção continua 0203/204.

A liberação limitada por mundo de a1a5ae28 passou direitos **44805260098**,
qualidade **44805265107** e cluster frio **44805269975**. A rodada completa
44801993382 passou 15 dos 16 gates, inclusive E2E. O único reprovado foi
versões: prefetch RSC da ficha pública, ausente da lista conhecida durante
o intervalo proposital sem processo. O teste agora deriva fichas de JOGOS,
mantendo mesma origem, parâmetro RSC, dois erros de transporte específicos e
janela da troca. Ações e console fora dela continuam estritos. Gate auxiliar
versoes permite verificar esse reparo sem substituir a rodada all final.


## Candidata: recibo corrente e operação anterior à captura

A implementação corrente preserva a primeira rights_recovery_source e importa
uma avaliação por execução/operação, com mapa atual. O coordenador autentica
na cadeia os cabeçalhos originalmente admitidos de ambas as origens existentes,
confere plano/MAC/seleção e exige recibo ready para abrir escopo filho. A admissão
fixa escreve ready e reconcilia lease herdado uma única vez, atomicamente com
auditoria estrita; repetição não altera lease/backoff ou datas de consentimento,
admissão e conclusão. A origem recuperada conserva também a cerca da primeira
admissão; não é convertida em preparação interativa. Financeiro continua fechado.

A prova fria passa a conter duas decisões reais no mesmo livro: uma nativa
anterior à captura, com primeira remoção já confirmada, e a posterior. A reserva
de crash é fixture sintética explícita. A restauração deverá continuar só os
dois registros restantes da operação antiga, preservar identidade/histórico e
a outra pessoa, recusar escopo sem ready, preservar uma nova reserva sintética
após repetição e conservar conclusão após nova chamada. Nenhum consentimento
ou idade é inventado pelo worker. Há negativas SQL de recibo incompleto e
validação da execução/origem na integração; tudo ainda exige gates remotos.

Esta candidata não comprova duas restaurações consecutivas, retenção técnica
após reabertura do livro, custódia produtiva, conciliação financeira histórica
ou publicação seletiva na base compartilhada. São pendências reais, mantidas
no fechamento F7/F8. Não houve alteração em produção.


1d7b22cd foi recusada pelo typecheck remoto em 44811627558/44811637551: a
função interna declarada podia ser chamada antes do narrowing da avaliação.
A definição passa a expressão const criada após a validação, sem cast, assert
não nulo ou supressão. Os três gates serão refeitos na nova fonte. A candidata
de schema f50bc3be passou direitos 44810698876, qualidade 44810703406 e versões
44810707510; isso não qualifica a implementação posterior de retomada.
