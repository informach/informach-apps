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
