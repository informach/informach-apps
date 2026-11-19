# Recreio: exportação e encerramento da participação

Execução autorizada no fechamento F7, independente do Morada D3–D8.
Implementação em curso; este plano não habilita exclusão, cobrança ou tráfego.
As validações manuais ficam reunidas no final, conforme decisão do titular.

Próximo incremento: recibo próprio `account_closure_finances`, vinculado à
operação/solicitante/tipo originais. Congelamento, outbox assinada e seleção
financeira serão uma TX; efeitos destrutivos continuarão bloqueados até prova
do inventário completo e da parada das renovações. Nenhuma ausência local ou
resposta HTTP isolada confirma isso. Recibos de cancelamento existentes serão
preservados, sem substituir seu aceite, ator, fonte ou datas.

A conta sem cliente terá evidência explícita `no_customer`, após conferir que
nenhuma tentativa admitida existe. Conta com cliente exige inventário do
provedor, origem/namespace e conciliação de todos os contratos/Checkouts antes
da confirmação. Agendas ou origens desconhecidas permanecem em conferência.
Schema candidato; geração pelo GitHub e testes de integridade ainda pendentes.
Não há escritor desse recibo, aceite público ou conclusão de encerramento.

A revisão do schema 5667c421 encontrou a semântica SQL de NULL no contador
de tentativas: o segundo ramo precisa exigir `request_started_at is not null`.
Também foi acrescentada finitude às datas da participação. A geração inicial
44623327745 não autoriza adoção; regenerar a partir da correção, sem editar SQL
ou snapshot gerados. Provar os dois casos no PostgreSQL descartável.

A geração corrigida 44623570754/01288283 foi conferida e adotada intacta:
0238/239 recibos candidatos, novo recibo e somente a nova condição de finitude
na tabela anterior de participação. Prefixo/predecessor, hashes e as demais
tabelas foram conferidos. Cinco comandos aditivos, sem migração em produção.
O ZIP original 44623327745 foi preservado e seu recibo marca `adopted=false`.

O consentimento privado candidato agora exige V2/três aceites, conserva o ciclo
financeiro antes da TX e toma UPDATE das identidades em ordem antes de mundos,
perfis e aparelhos. Reconstitui todo o escopo; outbox assinada, congelamento de
perfis/mundos, encerramento de pedidos nunca enviados, participação `closing`
e recibo financeiro `pending` são atômicos. Contexto infantil não vira gestão
adulta ao retirar o perfil ativo. Replay conserva os bytes/login/fonte originais
e não atravessa os tipos de operação. Sete testes novos aguardam qualificação.
Isso não confirma parada de renovação, exclusão, publicação no livro ou estado
`closed`; os executores destrutivos continuam exclusivos de `retirar_perfil`.

## Exportação

A cópia de perfil já tem captura consistente, artefato cifrado de dez minutos,
download autenticado/revogável e prova remota de três jornadas. Ela não contém
os fatos pessoais da conta/pagante. A exportação será apresentada em escopos
explícitos: dados da conta no Recreio e dados de cada perfil próprio ou sob
responsabilidade atual. Ter pago um contrato não concede cópia de outro adulto.

1. Generalizar o artefato existente com escopo `profile`/`account`, preservando
   os registros anteriores como perfil. Conta não exige jogador; nenhum perfil
   artificial será criado. Gerar/adotar o DDL intacto pelo GitHub.
2. Capturar numa fotografia SQL os dados da própria conta no Recreio: identificação
   usada no portal, declaração de responsabilidade, dados públicos dos próprios
   aparelhos, histórico de aceite/compra/troca/contrato e pedidos de direitos.
   Paginar projeções explícitas. Não copiar sessões/tokens/hashes/segredos,
   contato de convidados, denúncias alheias ou conteúdo de outros aplicativos.
3. Reutilizar cifragem, quota, prazo, substituição, revogação e admissão após
   abertura. O modo conta usa autoridade nativa irrestrita atual, sem substituir
   a autorização própria/parental exigida para cada arquivo de perfil.
4. Qualificar conta sem jogador, titular convidado, outro pagante na família,
   chamada infantil direta, revogação/prazo/auditoria e a interface de 390 px.
   Os arquivos continuam com seus escopos explícitos; não anunciar cópia de
   mundos ou dados de terceiros como exportação integral.

## Encerramento

Encerrar o Recreio é separado de excluir a identidade Informach. A prévia
atual de `encerrar_conta` não contém aceite financeiro nem executa a operação.
Ela não pode ser reinterpretada como cancelamento de contratos ou autorização
para apagar perfis não selecionados.

1. Persistir participação nativa `active`/`closing`/`closed` e revisão. A conta
   continua apta a atendimento, direitos e gestão dos próprios fatos financeiros.
   Congelamento deve impedir novos jogadores, testes, compras e concessões;
   não basta ocultar botões. Inventariar todos os escritores e suas travas.
2. Preparar plano versionado com seleção completa de perfis/responsabilidades,
   mundos e pendências financeiras. O adulto pode transferir responsabilidade
   pelos fluxos com aceite existentes ou incluir a retirada no consentimento;
   não fabricar aceite de outro adulto. Mundos compartilhados exigem sucessão
   quando a pessoa retirada ainda é responsável.
3. Registrar confirmação explícita do encerramento e do tratamento financeiro,
   com login recente e plano relido sob trava. Coordenar Checkouts/agendas e
   contratos admitidos por seus recibos recuperáveis existentes, incluindo
   resposta perdida e fatos desconhecidos. Consulta ausente não prova cancelamento.
4. Só concluir quando efeitos financeiros, perfis, aparelhos e dependências
   consentidos tiverem seus recibos. Conservar períodos/fatos financeiros e
   direitos dos outros adultos; retenção técnica não é anonimização. Reabrir
   participação futuramente exige decisão própria e não reanima credenciais,
   perfis apagados ou testes já utilizados.

## Recuperação e implantação

### Plano financeiro v2 em composição

67d541a5 concluiu quality 44609205600 e direitos 44609210682 para o codec v2.
O leitor/preparador seguinte e69bee7c falhou no typecheck em 44610776863 e
44610785415: a chave de `billing_contracts` é `subscriptionId`, e o helper de
compra de teste precisava do tipo `AceiteDaCompra` para conservar os literais
de versão. Correção nas referências e na anotação do retorno, sem casts ou
mudança de regras; os oito novos casos não haviam sido executados nessa rodada.

O codec distingue `recreio-previa-encerramento-v2` da prévia legada v1.
Somente encerramento admite esse formato, com revisão ativa da participação,
cliente próprio exclusivo do Recreio e referências ordenadas de compras/trocas
comprovadamente não enviadas. Três aceites separados vinculam encerramento,
retirada dos perfis e cancelamento da renovação. Não há identidade, cliente do
provedor ou plano financeiro vindo do formulário.

O SHA autentica o plano privado completo; sua projeção de interface mostra
efeitos/contadores e omite referências Stripe e IDs dos aceites financeiros.
Mudança de modo, cliente, seleções ou revisão exige nova preparação. Bytes
canônicos v1 continuam iguais e suas prévias não ganham autoridade financeira.
O registro de preparação e a intenção mantêm seu próprio formato v1, separado
da versão do conteúdo do plano. Não há alteração de DDL neste codec.

A composição pública ainda produz v1. O preparador privado v2 conserva ciclo
financeiro antes da TX e login nativo recente, usa a mesma seleção de perfis/
mundos e limita as autorizações não enviadas. Cliente e Checkout vêm do reader
`@informach/billing/recreio-account-closure`, escopado por app/pagante. Namespace
diferente, tentativa iniciada, revisão pendente ou Checkout sem origem nativa
correspondente exigem conciliação. Nada disso é interpretado como ausência de
efeito remoto. O plano privado é persistido uma vez; mudança posterior marca
a prévia desatualizada e exige outra, sem reescrever os bytes anteriores.

Esse incremento não confirma encerramento, não chama Stripe e não muda
participação. Seguem confirmação/outbox, tratamento recuperável das pendências
e executor financeiro com recibos. A interrupção da renovação precisa também
impedir que uma capacidade antiga do portal financeiro a reative; esse caminho
deve ser qualificado antes de compor a confirmação pública.

### Barreira de participação em implementação

`account_participations` distingue legado ativo (ausência/revisão zero), ativo
persistido (1), encerramento (2) e encerrado (3). A FK composta exige operação
de encerramento do mesmo solicitante; retirada de perfil e operação alheia não
podem ser usadas como origem. Identidade comum, finanças e mundos não têm cascade
destrutivo. Não há writer público, retomada automática ou nova declaração de
consentimento neste incremento.

Admissão nativa comum e kernel de jogo exigem participação atual ativa. Direitos
pessoais e gestão/leitura/cancelamento financeiro usam finalidade explícita,
conservando a mesma identidade, contexto adulto, aparelho e login. Não concedem
novas compras/trocas/testes. Aceitar convite também confere o titular do grupo,
impedindo anexar um novo membro a um grupo em encerramento.

O coordenador deve conservar o ciclo financeiro externo antes da transação,
mutexes de contas em ordem e UPDATE na identidade antes de mudar a participação.
Leitores conservam SHARE nessa identidade. Admissão para escrita/jogo exige
`read committed`: um snapshot antigo anterior à espera não comprova estado
atual; a captura de direitos mantém seu `repeatable read` sem conceder escrita.
Perfis selecionados e capacidades de jogo ainda precisam ser congelados na mesma
transação do consentimento completo. Esta base não executa o encerramento.

Schema e código seguem para geração/qualificação no GitHub; não foram migrados
ou habilitados em produção. O plano v2, coordenação financeira, consentimento,
workers e conclusão continuam obrigatórios.

A geração inicial 44604567639/1ceeea68 produziu FK antes da UNIQUE composta
referenciada. O artefato 14568114251 (ZIP SHA-256
`91f8856bfde21da8f0713226f196d08be7a55cea159772f2dd2bb363b8fa56d2`)
foi recusado na leitura, sem adoção do SQL. A geração é separada: primeiro a
UNIQUE aditiva de `rights_operations`, depois a nova tabela/FK. O schema da
nova tabela sai temporariamente do índice apenas na fonte intermediária do
gerador; essa fonte não é candidata a deploy ou gate do app. Arquivos gerados
não são reordenados ou editados manualmente.

A UNIQUE 0235 foi gerada em 44605065615/951b40ff e a tabela 0236 em
44605491318/19928a64, ambas adotadas byte a byte após SHA, predecessor e prefixo
do journal. Na segunda geração, todas as tabelas anteriores permaneceram
idênticas. 237 recibos candidatos; nenhum DDL aplicado em produção. Recibos em
`evidencias/migracao-participacao-{unique,tabela}-*.json`.

As provas preparadas conferem legado sem jogador, bloqueio dos escritores em
`closing`/`closed`, manutenção da leitura financeira/direitos, autenticação
infantil recusada, FK de solicitante/tipo, snapshot antigo recusado e espera
real por trava PostgreSQL. As operações usadas para testar a barreira são
fixtures estruturais assinadas; não demonstram consentimento de encerramento
v2, processamento ou liquidação financeira.

44605848173/33a7b721 preservou as duas cópias no upgrade 234→237, mas o
typecheck recusou a fixture infantil, que usava número numa coluna UUID.
Corrigido para UUID real, sem cast ou mudança no schema. Os casos nativos não
haviam sido executados nessa rodada; a candidata precisa de nova qualificação.

44606233777/8b2051c0 passou typecheck e 109/110 casos; a única falha era a
expectativa nova de `trocas=null` numa conta com grupo próprio. O contrato
existente devolve DTO com grupo/data e `contrato/pedido=null`; a fixture foi
corrigida, sem alterar o reader. A navegação candidata passa a mostrar apenas
a conta em encerramento, mantendo dados/assinatura e redirecionando estante,
criação e seleção de perfil. Novas provas de navegador usam somente estado
estrutural em banco descartável e baixam o arquivo real; não consentem ou
executam encerramento em produção.

d3475f2e concluiu 111 casos/9 arquivos e upgrade 234→237 em 44607167200;
as seis jornadas de navegador passaram em 44607175365 (38,7 s), com capturas
390 px de ambos os estados inspecionadas: leitura, links e largura adequados.
O recibo `evidencias/participacao-ui-44607175365.json` conserva fonte e hashes.
A rodada completa 44607183659 permanece em execução nesta anotação. O ajuste
seguinte também impede nova prévia depois de iniciar o encerramento, conservando
histórico/cópias e replay da referência original; exige nova prova focada.

Intenções externas conservam os IDs e o consentimento original. Reaplicação
offline não pode criar usuários fictícios, atribuir ao operador o aceite do
solicitante ausente no backup ou exigir um novo consentimento para retirar
cópias antigas. Precisa de recibo histórico próprio e banco em quarentena.
Artefatos temporários, sessões e demais capacidades restauradas devem ser
invalidados antes de qualquer admissão de tráfego. As provas atuais de fotos
e de duas passagens do livro não concluíram esse coordenador.

Todos os gates pesados são remotos. A promoção exige fonte e DDL qualificados,
backup atual recuperável, normalização/replay, custódia, agenda/alertas e ensaio
final. A implantação das candidatas não foi realizada por este plano.
