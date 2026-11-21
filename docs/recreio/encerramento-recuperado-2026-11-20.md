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

O primeiro incremento de composição financeira está em implementação:
uma filha financeira privada é separada da filha de efeitos pessoais, tem
pagante/operação fixos e expira com a fábrica pai. Os repositórios financeiros
usam o banco da coordenação; a fila normal conserva sua leitura ociosa sem
abrir S3/Stripe. O mutex global por DATABASE_URL não entra na cópia privada,
que já possui exclusão da fábrica/filha. Nenhum booleano de um chamador
habilita esse escopo. Ainda faltam a prova positiva em cluster físico privado,
a observação atual quando havia confirmação antiga e a ligação ao recibo
terminal. A admissão de efeitos para encerrar conta continua recusada.

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

Cada candidato fica separado da implantação. As duas restaurações técnicas
reais do arquivo 1613df70 não são as duas recuperações completas deste plano.
Nenhum passo acima autoriza antecipar vendas, abrir tráfego recuperado ou
reativar credenciais antigas. A fonte corrente mantém esses caminhos fechados.
