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
- Antes de tocar em dados: perfil → mutex dos dados desse perfil/jogo →
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

- [ ] Publicar branch `verify/recreio-2026-11-16-plataforma-sdk-red`.
- [ ] Conferir no GitHub a falha nas propriedades ausentes; não declarar essa
  prova como persistência, isolamento ou integração.

## Etapa 2 — Schema e geração

Criar `packages/db/src/schema/recreio-dados.ts`, exportado pelo index.
`profile_data_keys` liga perfil/jogo/chave/revisão; `profile_data_versions`
conserva cópias aceitas e conflitantes; `profile_achievements` guarda a obtenção
idempotente. FKs compostas impedem relacionar versões a outro perfil/jogo.
Índices atendem escopo e ordenação; bytes e números têm CHECKs no banco.

- [ ] Implementar tabelas e constraints, sem alterar linhas existentes.
- [ ] Disparar `Database - gerar migracao revisavel` na branch de schema.
- [ ] Baixar e conferir `proveniencia.json`, fonte e hashes antes de incorporar
  exclusivamente os arquivos gerados. Não editar SQL/snapshot/journal gerados.

## Etapa 3 — Persistência e HTTP

Criar `apps/recreio/src/features/dados-de-perfil/{service,repository}.ts` e
`features/sessao-de-jogo/autoridade-repository.ts`; contratos em
`packages/recreio/src/contrato/dados.ts`. Rotas:
`/api/sdk/v1/dados/[chave]`, `/versoes` e `/resolver`, e
`/api/sdk/v1/conquistas`. O serviço valida payload, capacidade, cotas e limites
de tentativas; o repository revalida a sessão na transação.

Exemplo funcional obrigatório, com jogadores sintéticos reais no banco isolado:

```ts
// Sessões obtidas por emitirIngresso/trocarIngresso; HTTP pelo despachante real.
// Primeira gravação -> revisão 1; base 0 com outro conteúdo -> 409.
// A leitura atual conserva os bytes iniciais; ler a candidata devolve os outros.
// Resolver na revisão 1 -> revisão 2; repetir uma base antiga não a substitui.
```

- [ ] Exercitar binário, ausência, revisão, recuperação e resolução.
- [ ] Recusar outro perfil/jogo, sessão encerrada, aparelho revogado, login
  removido, perfil suspenso, falta de acesso, política antiga e prazo vencido
  enquanto espera uma trava real do PostgreSQL.
- [ ] Exercitar duas escritas concorrentes, repetição, cota, conflito cheio,
  auditoria indisponível e FKs; nenhuma mutação parcial confirmada.
- [ ] Acrescentar as rotas ao despachante de integração. Auditoria só com IDs,
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

- [ ] Testar bytes ponta a ponta, token novo na renovação, corpo excessivo,
  entrada inválida, abortos e ausência de repetição automática das mutações.
- [ ] Com navegador GitHub: jogar, salvar, sair, reabrir e conferir progresso;
  reproduzir conflito e escolher uma das cópias; conquista não duplica.
- [ ] Provar que criar mundo do título sem mundos é recusado pela API.

## Etapa 5 — Revisão, consumidores e implantação

Consumidores: `apps/recreio`, `apps/morada-server`, `packages/jogo-morada`,
`packages/morada-sim`, `packages/config`, `packages/auth`, `packages/db`,
`apps/admin`, além dos consumidores compartilhados atingidos pelo schema.

- [ ] Seis gates do Recreio e verificações compartilhadas aplicáveis no GitHub.
- [ ] Comparar o schema gerado ao anterior; migração aditiva antes do escritor.
- [ ] Conferir serviços e staged changes; aplicar pelo migrator existente sem
  cortes financeiros de Compasso nem seeds comerciais.
- [ ] Conferir fonte, prontidão, mapas, manutenção e ausência do título interno
  no catálogo de produção. Não manipular contas piloto ou dados reais.
- [ ] Atualizar guias, estado e evidências. Prosseguir para F1; F0 não encerra
  o fechamento da plataforma.
