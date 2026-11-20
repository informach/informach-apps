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
