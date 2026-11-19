# F7: livro externo e continuidade de direitos

Estado: implementação candidata, sem credenciais, intenções ou exclusões reais.
Complementa [F7](direitos-implementacao-2026-11-18.md). Não libera tráfego restaurado.

## Contrato e ordem de execução

- [ ] Qualificar envelope canônico autenticado por livro/finalidade, chaves
  copiadas/rotacionáveis, limites e recusa de ambiguidades. Identificadores
  pessoais têm destino privado e não são anonimização.
- [ ] Qualificar intenção imutável, cabeçalho com geração/contagem/raiz,
  cadeia de histórico e CAS real do provedor. ETag é precondição, não prova
  de conteúdo. Resposta perdida exige leitura antes de repetir qualquer escrita.
- [ ] Persistir preparação, consentimento recente e escopo/revisão no PostgreSQL;
  revalidar adulto próprio/responsável atual, independentemente de assinatura.
- [ ] Publicar intenção externa somente depois do consentimento. A partir dessa
  fase, ela é restritiva/irreversível e não pode ser cancelada como se nunca
  tivesse existido. Os efeitos locais só começam após confirmação externa.
- [ ] Coordenar revogação, dados pessoais, objetos, responsabilidades e mundos,
  com recibos e idempotência. Não apagar conteúdo de outros participantes.
- [ ] Reaplicar TODAS as intenções admitidas antes de servir uma restauração;
  verificar cadeia, conjunto e pendências. Cabeçalho ausente não é livro vazio.
- [ ] Compor exportação integral, artefato privado revogável e telas/rotas,
  jornadas negativas e operação. Este codec não concede autoridade pessoal.

A inicialização é uma operação explícita de provisionamento. Não reabrir um
livro perdido silenciosamente. Cada intenção usa operação/revisão, conta,
lista ordenada de perfis, SHA do plano, datas e fonte; sem e-mail, nome, sessão
ou conteúdo familiar. Toda versão do cabeçalho é guardada antes do CAS; a
referência à intenção é conferida antes de publicar seu encadeamento.

O adapter não possui DELETE ou chaves/URLs livres. Limpeza da prova externa
é separada e só admite o prefixo aleatório que aquele job criou, no bucket de
homologação já autorizado, sem banco/credenciais de produção. Faltam ainda
leitor integral/corte, coordenador local, custódia real e composição operacional.

Documentação primária: [campos condicionais do SDK S3](https://github.com/aws/aws-sdk-js-v3/blob/main/clients/client-s3/src/models/models_0.ts).
As precondições documentadas na AWS precisam de prova no bucket Railway real;
não presumir suporte integral pela compatibilidade S3.

## Provas e congelamento

`44515397334`/`f4fbbdae` aprovou 179 testes de objetos/livro em treze arquivos
e tipos. No bucket real, intenção imutável, CAS concorrente com um vencedor,
ETag antigo recusado, leitura privada e limpeza de seis objetos passaram;
ZIP/SHA conferidos em [recibo](evidencias/livro-provider-44515397334.json).
Isso precede a cerca externa de recuperação e não conclui F7.

O próximo incremento torna `congelado` terminal nesta encarnação do livro:
CAS muda sua geração sem inventar uma entrada, conservando raiz e última
intenção. Um writer antigo que ainda tenha a versão anterior perde a condição
no próprio S3; um writer que releia o estado congelado recusa a admissão.
Efeitos locais só podem ser concluídos após admissão no cabeçalho, portanto
sua cadeia congelada contém todos os pedidos que podem ter sido concluídos.
Leitura integral e retomada com nova autoridade/custódia continuam pendentes;
não descongelar ou reinicializar automaticamente para contornar a cerca.

A primeira rodada do congelamento `44516612201` executou tipos e 181 testes:
180 passaram; um teste fabricava cabeçalho aberto incompatível com a geração
congelada, antes de alcançar o bloqueio esperado. O cenário foi corrigido para
usar um pedido assinado válido. A geração adicional da cerca não representa
nova intenção e não pode ser confundida com a contagem de pedidos.

O leitor seguinte verifica a cadeia inteira e as intenções autenticadas antes
de chamar o consumidor; histórico ausente, MAC/raiz divergente, repetição de
op/revisão ou limite excedido recusam a prova inteira. Replay exige cabeçalho
congelado e a mesma cerca antes/depois dos efeitos. Cabeçalhos históricos não
concedem capacidade de escrita; o erro do consumidor conserva sua causa.
Ainda não existem efeitos destrutivos locais ou liberação de tráfego.

`44517386865`/`139e96f5` passou: 188 testes em quatorze arquivos e a prova
externa de congelamento com oito objetos removidos, ZIP/SHA conferidos. O
incremento posterior de retomada mantém o mesmo livro e todo seu histórico,
mas exige chave inédita, nova época e SHA do recibo da cerca reaplicada.
As chaves usadas ficam autenticadas no cabeçalho; renomear material de chave
ou reutilizar uma chave antiga não constitui rotação. Intenção e cabeçalho
precisam pertencer à mesma chave/época antes da admissão. O worker antigo não
recebe a chave nova. A transição não apaga a cerca anterior nem suas entradas.

Essa porta de transporte não autoriza o corte: o coordenador operacional ainda
precisa comprovar os efeitos nativos, identidade e autoridades atuais antes de
usar a retomada. Nenhuma retomada automática foi adicionada ao portal.


`44521361720`/`f7365313` concluiu tipos, 190 testes em quatorze arquivos e
a prova externa ampliada: duas épocas/chaves, replay cronológico da cadeia
inteira congelada, negativa ao escritor antigo, preservação da falha do
consumidor e limpeza confirmada de doze objetos. ZIP e SHA conferidos no
[recibo](evidencias/livro-provider-44521361720.json). O consumidor da prova é
sintético; nenhum efeito nativo ou dado de produção foi executado.
