# SDK e dados de perfil — plano de implementação

> Execução em série pelo agente principal, com etapas revisáveis e gates no
> GitHub. A autorização do titular já inclui a implementação e a implantação
> após as verificações aplicáveis; não há etapa adicional de aprovação do plano.

**Objetivo:** um jogo sem mundos salva progresso privado, detecta concorrência
e registra conquistas pelo mesmo SDK e pela mesma assinatura do Recreio.

**Arquitetura:** contratos portáteis em `packages/recreio`; routes/services/
repositories no portal. Bytes opacos, identidade e jogo retirados da sessão.
Comparação de revisão e recibos de conquista transacionais, com auditoria estrita.

**Stack:** versões atuais de TypeScript, Zod, Drizzle/PostgreSQL e Next.js;
nenhuma atualização de dependência. Migração aditiva, gerada no GitHub.

**Spec:** `artes-3d/paginas/recreio.html` v2.2, seções SDK, mundos/saves,
critérios de aceite; [escopo do fechamento](fechamento-plataforma-2026-11-16.md).

## Contratos e limites

- Chave de dado: 1–64 caracteres ASCII, primeiro alfanumérico, depois
  alfanuméricos, ponto, hífen e sublinhado; sem caminho ou URL.
- Valor: bytes opacos até 64 KiB, transportados em base64 canônico. Nunca
  interpretar como estado do Morada ou copiar conteúdo para auditoria/Sentry.
- No máximo 16 chaves por perfil/jogo, quatro revisões aceitas por chave
  (atual e três anteriores) e três conflitos não resolvidos. Rejeitar novo
  conflito quando cheio; não descartar silenciosamente o progresso pendente.
- Revisão 0 significa ausente. Gravar sem revisão equivale a criar na revisão
  0, nunca sobrescrever incondicionalmente. Revisões positivas crescem até o
  teto inteiro do banco; não zerar para recuperar espaço.
- Escrita com base antiga preserva a candidata como conflito e devolve 409,
  com IDs e revisão atual. Repetição de bytes/base já confirmados pode devolver
  a revisão confirmada enquanto houver a evidência retida, sem regravar.
- Resolver usa a revisão atual e uma versão conflitante própria; aceitar a
  cópia escolhida e retirar o conflito é uma operação atômica. Descartar um
  conflito é explícito. Leitura de versão sempre confere perfil e jogo.
- Conquistas somente do manifesto, uma obtenção por perfil/jogo/id. A chave
  idempotente não libera uma segunda conquista. Não representar dinheiro,
  autorização de acesso ou premiação financeira.
- Metadados pessoais saem com o perfil; não tocar nos mundos compartilhados.
- Antes de tocar em dados: conta nativa → perfil → mutex dos dados desse perfil/jogo →
  aparelho → sessão de jogo → chave/versões. Revalidar relógio, vínculo,
  encerramento e acesso depois das esperas. Não adquirir o cursor de
  encerramentos segurando a sessão; recusar e deixar a manutenção encerrar.

## Etapa 1 — Prova negativa da superfície

Arquivo: `packages/recreio/src/sdk/sdk.test.ts`. Usar a fixture de transporte
existente para abrir a sessão e testar a API pública, sem chamar um mock de dados.

```ts
const a = ambiente();
a.responder({ corpo: a.aberta() });
const contexto = await criarRecreio(a.opcoes());
expect(contexto).toHaveProperty("dados.ler", expect.any(Function));
expect(contexto).toHaveProperty("dados.gravar", expect.any(Function));
expect(contexto).toHaveProperty("conquista", expect.any(Function));
```

- [x] Publicar branch `verify/recreio-2026-11-16-plataforma-sdk-red`.
- [x] Conferir no GitHub a falha nas propriedades ausentes; não declarar essa
  prova como persistência, isolamento ou integração.

Prova: fonte `8b2bd48`, rodada `43985084574`, quality com uma falha esperada
em `sdk.test.ts`: propriedade `dados.ler` ausente; 127 testes passaram.

## Etapa 2 — Schema e geração

Criar `packages/db/src/schema/recreio-dados.ts`, exportado pelo index.
`profile_data_keys` liga perfil/jogo/chave/revisão; `profile_data_versions`
conserva cópias aceitas e conflitantes; `profile_achievements` guarda a obtenção
idempotente. FKs compostas impedem relacionar versões a outro perfil/jogo.
Índices atendem escopo e ordenação; bytes e números têm CHECKs no banco.

- [x] Implementar tabelas e constraints, sem alterar linhas existentes.
- [x] Disparar `Database - gerar migracao revisavel` na branch de schema.
- [x] Baixar e conferir `proveniencia.json`, fonte e hashes antes de incorporar
  exclusivamente os arquivos gerados. Não editar SQL/snapshot/journal gerados.

Geração `43986690237`, fonte `f9b89e6de76fbb6a341638fb79728ef94e1d005c`,
artefato `14285183120`, SHA-256 do ZIP
`5e4375cd1792fe9566bf4efdf78c411421ec75b713b751ef3604d5c03a502034`.
Os três arquivos foram conferidos por tamanho e SHA-256 antes da cópia.
A `0167_milky_virginia_dare.sql` é aditiva; foi aplicada em produção pelo migrator,
com recibo e hash conferidos na [evidência operacional](evidencias/sdk-producao-2026-11-16.json).

## Etapa 3 — Persistência e HTTP

Criar `apps/recreio/src/features/dados-de-perfil/{service,repository}.ts` e
autoridade transacional no mesmo repository; contratos em
`packages/recreio/src/contrato/dados.ts`. Rotas:
`GET /api/sdk/v1/dados?chave=...` (histórico com `historico=1`),
`POST /api/sdk/v1/dados` (`gravar`, `resolver`, `descartar`) e
`/api/sdk/v1/conquistas`. O serviço valida payload, capacidade, cotas e limites
de tentativas; o repository revalida a sessão na transação.

Exemplo funcional obrigatório, com jogadores sintéticos reais no banco isolado:

```ts
await sdk.dados.gravar("progresso", new TextEncoder().encode("A"), 0);
await expect(sdk.dados.gravar("progresso", new TextEncoder().encode("B"), 0))
  .rejects.toMatchObject({ codigo: "REVISAO_DIVERGENTE" });
const historico = await sdk.dados.versoes("progresso");
const conflito = historico.versoes.find((versao) => versao.estado === "conflict");
if (!conflito) throw new Error("Conflito não preservado");
expect(await sdk.dados.resolver("progresso", conflito.id, 1)).toBe(2);
```

- [x] Exercitar binário, ausência, revisão, recuperação e resolução.
- [x] Recusar outro perfil/jogo, sessão encerrada, aparelho revogado, login
  removido, perfil suspenso, falta de acesso, política antiga e prazo vencido
  enquanto espera uma trava real do PostgreSQL.
- [x] Exercitar duas escritas concorrentes, repetição, cota, conflito cheio,
  auditoria indisponível e FKs; nenhuma mutação parcial confirmada.
- [x] Acrescentar as rotas ao despachante de integração. Auditoria só com IDs,
  revisão e códigos; sem chave de dado, bytes ou resumo do progresso.

## Etapa 4 — SDK e jogo independente

Modificar `packages/recreio/src/contrato/sdk.ts` e `sdk/index.ts`; acrescentar
serialização binária portátil, sem Buffer, React ou DOM no SDK. Expor
`dados.ler/gravar/versoes/resolver/descartar` e `conquista`/lista de conquistas.
Toda chamada usa token atual, prazo, `credentials: omit` e recusa depois da saída.

No catálogo, `capacidades.mundos` pode ser nulo. Adaptar somente os consumidores
identificados. Acrescentar título interno de prova com dados e conquistas,
carregado sob demanda e impossível de habilitar em produção pela flag de teste.
O cliente de prova não importa simulação, arte, servidor ou tipos do Morada.

O lote familiar revelou espera circular do pool no fallback PostgreSQL: validar
o login por uma segunda conexão, com as dez conexões ocupadas por transações,
esperava até o timeout. A leitura transacional agora exige seu `reader`; o
caminho fora de transação tem nome explícito e o Redis continua autoritativo
quando configurado. O novo teste segura uma trava de tabela por conexão externa,
confere dez escritores realmente bloqueados e libera o lote para validar os
logins pelas próprias conexões. Não aumentar o pool ou os timeouts para ocultar
esse problema. A rodada corrigida `44000485493` passou todos os 342 testes;
o controle negativo `44000491805`, com teste idêntico, falhou exatamente nessa
concorrência (341 demais aprovados). Os seis gates da candidata passaram.

A primeira prova de barreira (`43999022859`, fonte `61ede6d`) passou nos outros
341 casos, mas lia repetidamente o snapshot inicial de `pg_stat_activity`
dentro da transação de controle e não observava os dez escritores. Cada leitura
agora descarta esse snapshot, conforme a [documentação do PostgreSQL](https://www.postgresql.org/docs/18/monitoring-stats.html#MONITORING-STATS-VIEWS).
O timeout não foi ampliado. Controle negativo e correção usam o mesmo teste.

- [x] Testar bytes ponta a ponta, token novo na renovação, corpo excessivo,
  entrada inválida, abortos e ausência de repetição automática das mutações.
- [x] Com navegador GitHub: jogar, salvar, sair, reabrir e conferir progresso;
  reproduzir conflito e escolher uma das cópias; conquista não duplica.
- [x] Provar que criar mundo do título sem mundos é recusado pela API.

## Etapa 5 — Revisão, consumidores e implantação

Consumidores: `apps/recreio`, `apps/morada-server`, `packages/jogo-morada`,
`packages/morada-sim`, `packages/config`, `packages/auth`, `packages/db`,
`apps/admin`, além dos consumidores compartilhados atingidos pelo schema.

- [x] Seis gates do Recreio e verificações compartilhadas aplicáveis no GitHub.
- [x] Comparar o schema gerado ao anterior; migração aditiva antes do escritor.
- [x] Conferir serviços e staged changes; aplicar pelo migrator existente sem
  cortes financeiros de Compasso nem seeds comerciais.
- [x] Conferir fonte, prontidão, mapas, manutenção e ausência do título interno
  no catálogo de produção. Não manipular contas piloto ou dados reais.
- [x] Atualizar guias, estado e evidências. Prosseguir para F1; F0 não encerra
  o fechamento da plataforma.

## Publicação conferida

Fonte `6b51dd13`, portal `188855a8`, migrator `fa52d61b` e Morada `1720ebec`
implantados com sucesso. A consulta somente de leitura de 17/11 às 02:33 UTC
conferiu 168 recibos, hash da 0167 igual ao SQL gerado e as três tabelas novas
vazias. Prontidão dos dois serviços 200, dados sem autenticação 401 e jogo
interno desligado. Nenhuma conta piloto ou mundo real foi alterado.

O migrator rodou somente `pnpm db:migrate` nesta publicação; o comando original
foi restaurado e não há staged changes. O cron posterior foi aprovado com suas
cinco contagens. A atualização dos contratos também recompilou o Morada sem
alterar código da simulação, arte ou runtime: Mundo V2/protocolo 1 preservados.

Os dois envios de mapas Sentry foram processados para a release. Há um aviso
de script sem referência de mapa (`0cz1d0mv5g_q7.js`); não afirmar cobertura de
mapas de todos os scripts a partir do sucesso do uploader. O CI geral
`43989145590` passou em `bff2b1a`; packages e demais apps são idênticos à fonte
publicada. Os seis gates atuais cobrem os ajustes finais locais ao Recreio.
CI da main publicado ainda em execução no momento deste registro.

F0 entrega o contrato de progresso/conflitos/conquistas e sua prova independente.
Familiares, pareamento, políticas, social, cobrança, privacidade e operação do
fechamento completo continuam em F1–F11.
