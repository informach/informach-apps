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
