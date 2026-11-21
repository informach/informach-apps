# Encerramento de conta na recuperação privada

Continuação de F7/F8. A retirada de perfil já tem admissão e reaplicação nativas
qualificadas. Encerrar conta também exige conciliar o financeiro e a participação;
não ampliar o executor de retirada para ignorar essas duas barreiras.

## Sequência de implementação

1. Reutilizar a admissão fixa de `admissao-recuperada-repository.ts` para
   reconhecer encerramento nativo que já estava admitido no arquivo. Conservar
   preparo, bytes/MAC, consentimento, primeira admissão e conclusão; a avaliação
   pertence à nova execução. Encerramento ausente/publishing ainda não é
   suportado por esse primeiro incremento e deve continuar recusado. Não
   fabricar cliente, participação, identidade ou aceite.
2. Acrescentar avaliação financeira por execução/operação, gerada pelo workflow
   de migrations. A confirmação original continua imutável. Uma prova nova lê
   o escopo assinado e o inventário completo atual do provedor; modo, pagante,
   cliente e contratos devem coincidir. Divergência fica em revisão. Não usar
   pagamento confirmado antigo como prova da situação atual, nem chamar I/O
   financeiro dentro das travas de dados. Ausência local não vira ausência no
   Stripe quando houve cliente/tentativa.
3. Fazer a composição financeira usar exclusivamente o banco da coordenação.
   O worker normal conserva o caminho ocioso sem S3/Stripe. O executor privado
   tem entrada separada, capacidade emitida no escopo da operação e nenhuma
   conexão implícita ao banco global. Só emitir capacidade de efeitos depois
   da avaliação financeira atual e da participação conferidas. O recuperador
   técnico do arquivo continua sem credenciais de origem, login ou Stripe.
4. Ampliar o executor/recibo terminal para encerramentos autenticados e provar:
   operação nativa anterior e posterior ao arquivo; publicação interrompida;
   operação já concluída; rollback da auditoria; repetição sem renovar prazos;
   financeiro divergente/indisponível; terceiro/global preservados. Usar banco
   descartável e cluster frio no GitHub, incluindo SDK/API Sandbox quando
   houver I/O do provedor. Somente fixture sintética cria consentimento.
5. Compor a publicação seletiva do Recreio com identidade/permissões atuais,
   credenciais/sessões renovadas e encerramento dos hosts antigos. Nunca
   restaurar tabelas globais/billing antigas sobre outros aplicativos, nem
   executar FLUSHALL. Reaprovação humana necessária não pode ser inventada
   pelo operador ou substituída pela conta pagante. Provar duas recuperações
   completas consecutivas, com captura/livro atualizados, antes do aceite.

## Verificação e fronteira

Uma filha financeira privada é separada da filha de efeitos pessoais, tem
pagante/operação fixos e expira com a fábrica pai. Os repositórios financeiros
usam o banco da coordenação; a fila normal conserva sua leitura ociosa sem
abrir S3/Stripe. O mutex global por DATABASE_URL não entra na cópia privada,
que já possui exclusão da fábrica/filha. Nenhum booleano de um chamador
habilita esse escopo. Os perfis nativos antes da captura, financeiro atual,
seleção sem mundo e recibo terminal passaram nas provas abaixo. A candidata
amplia para mundo compartilhado e publicação interrompida; decisão ausente
e publicação seletiva ainda estão em implementação. Produção não foi ativada.

Conservar os recibos financeiros originais: confirmado no arquivo é fato
histórico, não observação atual do provedor. A composição não pode importar
chaves de Stripe/identidade para o recuperador técnico do arquivo. A possível
reutilização do hash do recibo da execução para evidência financeira ainda
precisa de desenho/verificação; não há nova migration ou ativação implícita.

A correção de tipos 9bee2416 passou qualidade 44857493251, direitos
44857496346 e regressão de cluster frio 44857500015. O financeiro normal
passou 44857078509; o ajuste posterior foi somente de inferência do contrato.
Esses gates preservam o caminho já qualificado e não comprovam a entrada nova
na cópia privada.

A próxima prova cria, antes da captura, outro livro exclusivo de homologação
com encerramento nativo de um adulto sem jogador/cliente. Na segunda cópia
física já restaurada e normalizada, o worker sem URL/chaves de origem deve
retomar somente sua etapa financeira pendente, repetir sem alterar recibo e
recusar raiz/cópia/filha vencida, outro pagante e efeitos pessoais. Origem,
preparação, consentimento e identidades devem continuar idênticos. O novo
livro acrescenta exatamente seis objetos de teste (plano, intenção, três
cabeçalhos históricos e cabeça), todos sob prefixo próprio e com limpeza.
O recibo exige campos positivos específicos e conserva
`nativeAccountClosureFullyReplayed=false`. Não é inventário real de cobrança,
reavaliação de confirmação anterior ou encerramento integral recuperado.

Somente GitHub Actions executa tipos, testes, builds, jornadas e clusters.
O candidato seguinte separa uma avaliação descritiva atual de confirmação
histórica: lê a origem completa antes/depois do I/O na mesma conexão privada,
confere a evidência real do adapter Stripe quando há cliente e conserva o
recibo antigo inteiro. Recusa renovação/Checkout pendente, origem ou modo
divergente e parada reativada/adiada. Não atualiza confirmação nem admite
efeitos pessoais. O recibo descritivo ainda não está ligado ao recibo terminal.
A fixture passa a ter dois adultos sem jogador/cliente no livro financeiro:
um confirmado antes da captura e outro ainda pendente. São nove objetos
nesse livro (duas intenções/planos, quatro cabeçalhos históricos e cabeça),
21 objetos de direitos/25 totais, todos exclusivos e removidos ao final.
O primeiro ensaio 44858908744 chegou ao fim da recuperação fria e confirmou
as oito propriedades financeiras, mas falhou na expectativa do inventário:
o histórico da geração zero também é armazenado. O artefato mostrou 22
objetos/18 de direitos e limpeza confirmada. A correção ba8f5a4d passou
44859406663: oito propriedades financeiras conferidas, 51 GETs exclusivos
do livro, nenhuma credencial de banco de origem, 22 objetos/18 de direitos
e limpeza dos objetos/clusters confirmada. Não tratar o primeiro ensaio como
gate aprovado nem confundir esse caso pendente sem cliente com a avaliação
atual de uma confirmação anterior. Qualidade 44858905869 também passou.

O candidato de inventário HTTP acrescenta um terceiro adulto ao mesmo livro:
cliente sintético, sem compra/assinatura, com consentimento nativo e financeiro
confirmado pelo adapter real antes da captura. O SDK Stripe conversa apenas
com servidor 127.0.0.1 descartável, chave literal sintética e GETs limitados.
A cópia física deve reler o inventário, recusar cliente/pagante/modo divergente,
contrato/Checkout desconhecido, página incompleta, falha do provedor, cópia de
evidência e mudança de origem durante I/O, e preservar o recibo/cliente originais.
São 12 objetos nesse livro, 24 de direitos/28 totais, com remoção confirmada.
Isso não é consulta ao Stripe real, fatura paga, estorno ou contestação homologada.
Nenhuma nova capacidade de efeitos pessoais ou publicação acompanha a avaliação.

Qualificação da avaliação descritiva: af2ecbea passou qualidade 44859912491,
conciliação 44859917302 e cluster frio 44859914933 (25 objetos, limpeza e
confirmação anterior preservadas). f3f42f7d passou qualidade 44860368960 e
cluster frio 44860371146: 28 objetos, 26 GETs do SDK no servidor HTTP fechado,
sete recusas específicas mais cópia de evidência, modo e corrida de origem;
clientes/recibos originais e limpeza conferidos. Não usou Stripe real.

Persistência candidata: 0244 foi gerada em 44861054095/5da96558 e adotada
intacta, incluindo índice por solicitante/run/operação. Acrescenta somente
`rights_recovery_finances`, três FKs restritivas e dois índices; sem DML.
SHA SQL `6ff445b0d15d56bacf7a5291360aea4bfc39f586c471e7544f0285b072683aa0`.
São 245 recibos/81 tabelas no candidato; produção permanece 0243/244/80.
A primeira geração 44860591493 foi substituída antes de commit da migration
para incluir o índice da cópia própria; não foi aplicada em nenhum serviço.

Cada nova avaliação deve gravar tentativa antes do provedor e limpar o
resultado positivo anterior. Só a mesma tentativa, conexão, fonte e recibo
canônico podem confirmar o resultado atual; falha fica em revisão. Auditoria
e recibo são atômicos e não alteram o consentimento/confirmação originais.
A prova amplia para 14 tentativas, falha real de auditoria, origem alterada
durante I/O e recorte pessoal sem referências privadas. Ainda não concede
efeitos pessoais, não encerra a conta e não publica a recuperação.

2c2d021f passou qualidade 44861335275, direitos 44861339988 e conciliação
44861342217. O primeiro cluster frio 44861337798 recusou a rodada durante a
prova financeira: a exceção PostgreSQL injetada é encapsulada pelo Drizzle.
e5f59de3 percorre somente a cadeia de causas para reconhecer o código exato
P7777 e acrescenta classificadores estáticos/etapa financeira ao diagnóstico;
nenhuma mensagem SQL ou dado privado entra no recibo. Qualidade 44861822403
passou; cluster frio 44861819511 continua em verificação.

O incremento de proteção confere a identidade imutável da observação do SDK
depois das esperas e dentro da transação final, com prazo ligado à tentativa.
A prova altera a evidência no primeiro GET do livro após o SDK devolver seu
resultado, sem temporizadores, e exige recusa/estado de revisão. A conferência
de uma avaliação atual também verifica origem, confirmação histórica, prazo
de cinco minutos pelo relógio do banco e tentativa/recibo fixos. A prova passa
a 17 tentativas e testa datas vencidas/futuras com rollback, revisão posterior
e recibo substituído. Esse guard ainda não emite filha de dados: admissão e
efeitos de encerramento permanecem fechados até sua qualificação e integração.

42d0ecf9 passou cluster frio 44862809669: 17 tentativas, mutação posterior
à leitura do SDK recusada, datas vencidas/futuras e selo substituído recusados,
auditoria atômica e cópia própria conferidas. Todos os 28 objetos e clusters
foram removidos. [Recibo](evidencias/financeiro-recuperado-44862809669.json).
O teste 44862252106 havia encontrado 23514: chamadas voláteis separadas a
clock_timestamp podiam inverter criação/tentativa por microssegundos. A
correção reutiliza um único instante PostgreSQL em texto/cast, preservando
microssegundos e as restrições; não converte o relógio para Date do JavaScript.

Próximo perfil candidato: encerramento original nativo já admitido, sem
seleção de jogadores. Sua admissão de dados exige avaliação financeira atual,
e a filha de efeitos sela tentativa/recibo que são reconferidos a cada TX.
O executor de conta passa a usar o banco/escopo da coordenação, mantendo a
identidade global e a confirmação financeira. A fixture grava PINs nativos
de dois adultos antes da captura; somente um encerramento deve remover seu
PIN, concluir a participação, repetir sem mudar datas e preservar o outro
adulto/tabelas fora da seleção. Não admite encerramento ausente/publishing,
seleção de jogadores ou tráfego; o recibo integral continua false.

f5f1ba5f passou qualidade 44863337321, direitos 44863339620, conciliação
44863342008 e cluster frio 44863335099. A conta sem jogadores teve PIN
removido e participação encerrada, com consentimento, confirmação financeira,
outra conta, identidades/tabelas globais e repetição preservados. Limpeza dos
28 objetos e clusters conferida. Este perfil não conclui os demais casos.

A candidata seguinte inclui seleção nativa de adulto próprio e menor sob
responsabilidade aceita. Os dois perfis e seis registros de dados opacos são
criados antes do consentimento/captura; não há mundo nesse cenário. Após a
retomada financeira, nova avaliação atual e admissão própria de dados são
obrigatórias. O mesmo executor de retirada deve minimizar os dois perfis,
retirar conteúdo/responsabilidade e concluir somente sua conta, preservando
demais perfis, mundos, registros globais e a confirmação/consentimento originais.
Decisões ausentes/publishing, mundos no encerramento e recibo terminal seguem
em aberto; não habilitar tráfego ou produção a partir dessa candidata.

7d085a95 passou cluster frio 44865074023: seleção nativa adulto/menor, seis
registros opacos removidos, responsabilidade retirada, demais perfis/mundos e
registros globais preservados, confirmação/consentimento e repetição conferidos;
28 objetos e clusters removidos. [Recibo](evidencias/encerramento-selecao-44865074023.json).
69e9f45e passou qualidade 44864608778, direitos 44864616267 e conciliação
44864622841; o ajuste 7d085a95 alterou somente o apelido da fixture para
respeitar o limite de 20 caracteres. O primeiro cluster 44864603105 parou
nesse dado sintético inválido, antes da captura, e não qualifica a reaplicação.

A verificação de encerramentos nativos acrescenta pós-condição somente de
leitura dos lotes pessoais, participação fechada, dados opacos ausentes,
conclusão dos sujeitos e financeiro atual. Só depois avança a avaliação por
execução, com auditoria estrita e repetição que preserva a primeira data.
Uma falha real P7778 na auditoria deve reverter esse avanço. Isso ainda não é
recibo terminal do livro, rotação, identidade atual ou admissão de tráfego.

623905dd passou qualidade 44865826161, direitos 44865828905, conciliação
44865831361 e cluster frio 44865823657: avaliações individuais verificadas,
primeira data preservada e rollback real P7778, com limpeza dos 28 objetos.

O próximo candidato conclui as três decisões nativas desse livro sintético
e verifica seu recibo terminal ampliado. A entrada antiga continua restrita
a retiradas; a nova inclui financeiro atual e pós-condições dos encerramentos.
Uma execução incompleta deve recusar a confirmação. Falha real P7779 na
auditoria deve reverter estado e recibo antes de uma repetição válida.
O escopo fecha depois da confirmação e conserva tráfego não autorizado.
Este perfil ainda não cobre encerramento com mundo, decisão ausente/publishing,
identidade atual ou publicação seletiva; não declara recuperação integral.

A ampliação seguinte prepara antes da captura um mundo de outro adulto,
com convite e aceite nativos para o adulto da conta a encerrar. O menor
continua fora do Morada. Foto PostgreSQL e diário do simulador são sintéticos;
a autoridade, o consentimento e a seleção vêm dos serviços reais. A prova
exige recuperar o diário, retirar identificadores das duas fotos, compactar
os fatos e conservar responsável, outro membro, famílias, permissão alterada
no diário, versão do formato e todas as linhas dos demais mundos. Está em
qualificação remota; não acrescenta integração do Morada D3–D8 nem tráfego.

1c425558 passou qualidade 44867148085, direitos 44867152783, conciliação
44867154915 e cluster frio 44867150449. O recibo terminal das três decisões
nativas passou, incluindo recusa incompleta, rollback P7779, fechamento do
escopo e preservação do financeiro/consentimento original. Limpeza confirmada.
[Recibo](evidencias/recibo-encerramento-44867150449.json). O CI compartilhado
da base 2c2d021f terminou com sucesso em 44861344652.

O candidato de publicação interrompida confere a preparação nativa, os
bytes/MAC e a presença no prefixo externo congelado antes de confirmar somente
a publicação SQL. Não grava prontidão da avaliação nem altera o financeiro.
A prova acrescenta uma quarta conta sem jogadores/PIN: o publicador real
anexa a decisão, uma falha de auditoria reverte a confirmação antes da captura,
e o recuperador deve repetir a confirmação com rollback real P7781. Depois
executa a fila financeira original, avalia a situação atual e só então admite
o encerramento. Conserva datas/MAC/consentimento, demais financeiros e identidade.
O livro sintético passa a quatro decisões, 27 objetos de direitos/31 totais;
nenhuma chave ou decisão de produção entra no workflow.

a2ea497a passou qualidade 44868024165, direitos 44868029556, conciliação
44868032029 e cluster frio 44868026640. A publicação interrompida, o rollback,
as fases financeiras/dados e o recibo terminal de quatro decisões passaram;
limpeza dos 31 objetos e clusters confirmada. A prova anterior do mundo
compartilhado aeda35c5 passou 44867642872; o ajuste de tipo da fixture não
alterou a autoridade nem os dados de produção.

O candidato seguinte cobre consentimento realmente emitido depois da captura
para uma conta já existente, sem jogadores/mundos e sem cliente Stripe.
O banco restaurado não contém operação, prévia, participação ou financeiro
dessa decisão; contém a identidade e seu PIN anteriores. A preparação privada
autentica o prefixo e cria somente origem recuperada, barreira e fila financeira
pendente. A fila nasce no relógio atual do banco, sem retroagir sua criação ao
consentimento. A identidade e a prévia nativa não são criadas. Auditoria P7782
deve reverter operação/barreira/fila juntas. Avaliação financeira atual e admissão
de dados continuam separadas. Verificação nativa deve recusar essa origem;
a verificação histórica tem entrada própria. O recibo ampliado usa domínio
`historical-rights-v3`; a entrada antiga de retiradas mantém seu domínio.

O livro sintético passa a cinco decisões, 30 objetos de direitos/34 totais.
Este perfil não qualifica decisão ausente com jogadores, cliente Stripe ou
mundo, nem elimina a conciliação global/financeira atual e a publicação seletiva.

9f44950f passou qualidade 44868793013, direitos 44868798804, conciliação
44868802128 e cluster frio 44868795994. Consentimento posterior sem jogadores,
origem recuperada, fila sem retroagir a data, rollback P7782, recusa da entrada
nativa e recibo terminal passaram. Limpeza dos 34 objetos e clusters conferida.
[Recibo](evidencias/encerramento-ausente-44868795994.json).

A ampliação em candidata inclui outra seleção adulto/menor e mundo de terceiro,
todos criados antes da captura, com consentimento somente depois. A preparação
recuperada confere cadastros/responsabilidades e o mapa integral, congela a
seleção e conserva a avaliação sem prontidão até o financeiro atual. Uma falha
P7783 deve reverter perfis, mundo, sujeitos, barreira e fila juntos. A prova
também acrescenta uma referência a mundo fora do plano e simula a necessidade
de resolver a responsabilidade do mundo: ambas devem exigir revisão, sem
inventar aceite. Cliente Stripe e pendências de compra/troca ainda são recusados.
O livro passa a seis decisões, 33 objetos de direitos/37 totais. Os resultados
anteriores continuam vinculados às fontes e aos perfis efetivamente testados.

998a9aaf passou qualidade 44870020818, direitos 44870026283, conciliação
44870029267 e cluster frio 44870023436. A seleção posterior com seis registros
opacos, duas fotos, diário e mundo compartilhado passou, incluindo rollback
P7783, mundo extra recusado e responsabilidade que exige revisão. Os 37 objetos
e clusters foram removidos. [Recibo](evidencias/encerramento-ausente-selecao-44870023436.json).
O gate integral da composição 45d246c2 está em 44872287047; não confundir
essa execução com promoção à main ou implantação do portal.

Cada candidato fica separado da implantação. As duas restaurações técnicas
reais do arquivo 1613df70 não são as duas recuperações completas deste plano.
Nenhum passo acima autoriza antecipar vendas, abrir tráfego recuperado ou
reativar credenciais antigas. A fonte corrente mantém esses caminhos fechados.
