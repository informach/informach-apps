# @informach/recreio

Domínio e contratos do Recreio, a plataforma de jogos. Não tem banco, React, Three.js nem WebSocket: o que grava fica em `apps/recreio`, e os jogos falam com a plataforma pelos contratos daqui.

Consumido como TypeScript fonte, sem build, como os outros packages.

## Subpaths

| Subpath | Conteúdo | Quem usa |
| --- | --- | --- |
| `.` | Ids com marca, `decidirAcesso`, regras de mundo, posse, código de convite, erros | Todos |
| `./contrato` | Esquemas Zod e tipos de tudo que atravessa a rede: claims dos tokens, API do SDK, API das instâncias, `RecreioGameContext`, `ClienteDoHost` | Todos |
| `./emissor` | Assinatura dos tokens e montagem do JWKS. Precisa da chave privada | Só `apps/recreio` |
| `./host` | `criarVerificadorDeSessao` para o servidor de um jogo | Servidores de jogo |
| `./testing` | `criarPlataformaFalsa` e `criarEmissorDeTeste` | Testes e desenvolvimento dos jogos |
| `./testing/conformidade` | `descreverConformidadeDoHost`: as regras da API das instâncias como testes | Testes de quem implementa `ClienteDoHost` |

O cliente do SDK (`./sdk`) e o cliente HTTP das instâncias entram com os lotes P4 e P6 do [registro da frente](../../docs/recreio/implementacao.md).

## Quem pode importar o quê

- `apps/recreio`: tudo.
- Cliente de um jogo (`packages/jogo-*`): `.`, `./contrato` e `./sdk`. Nunca `./emissor` nem `./host`.
- Servidor de um jogo (`apps/*-server`): `.`, `./contrato`, `./host` e, em testes, `./testing`. Nunca `./emissor`.

O jogo recebe um ingresso, não acesso ao banco. O servidor do jogo fala com o Recreio só por `ClienteDoHost`.

## Identificadores

Cada id tem a sua marca (`ContaId`, `PerfilId`, `GrupoId`, `MundoId`, `MembroId`, `SessaoDeJogoId`...). O jogo só conhece o `PerfilId`; a conta do login compartilhado nunca chega a ele. Toda fronteira valida com o esquema Zod correspondente.

## Direito de jogar

`decidirAcesso(fatos)` é a única função que decide. Recebe fatos já carregados (perfil, assinatura do grupo, concessões, `agora`) e devolve o estado e se pode jogar. Ordem, o primeiro que casar vale:

1. Perfil suspenso: `SUSPENSO`.
2. Perfil sem grupo ou sem cobertura: `SEM_ACESSO`.
3. Assinatura `active` ou `trialing`: `ATIVO`, ou `CANCELAMENTO_AGENDADO` com data de fim.
4. Concessão vigente: cortesia dá `ATIVO`, teste dá `TESTE`.
5. Assinatura `past_due`, `unpaid` ou `incomplete`: `PAGAMENTO_PENDENTE`. Não joga.
6. Concessão mais recente revogada: `REVOGADO`.
7. Já teve assinatura: `ENCERRADO`.
8. Teste vencido: `TESTE_ENCERRADO`; cortesia vencida: `ENCERRADO`.
9. Nada: `SEM_ACESSO`.

`validoAte` é o fim conhecido do acesso; a sessão de jogo nunca passa dele.

## Tokens

JWS com Ed25519 (`alg: EdDSA`), `kid` no cabeçalho e `typ` diferente para cada um, para que um não passe pelo outro.

| | Ingresso | Sessão de jogo |
| --- | --- | --- |
| `typ` | `recreio-ingresso+jwt` | `recreio-sessao+jwt` |
| Validade | 60 s, uso único | 15 min, renovada em silêncio |
| `sub` | perfil | perfil |
| `sid` | sessão do aparelho | sessão de jogo |
| `aud` | o jogo | o jogo |

Os dois levam também `iss`, `scp`, `pv` (versão da política do perfil), `iat`, `nbf`, `exp` e `jti`. Nenhum leva e-mail, idade, conta, grupo ou cobrança, e claims fora dessa lista são recusadas.

O uso único do ingresso não é do token: quem troca consome o `jti` na mesma transação em que cria a sessão.

## API das instâncias

`ClienteDoHost` (em `./contrato`) é o que um servidor de jogo usa. As regras:

- **Posse**: o Recreio atribui a posse de um mundo a uma instância quando alguém abre o mundo; a instância a reivindica e recebe a **cerca**, um contador por mundo que só cresce. Um mundo aberto tem uma posse só.
- **Toda escrita leva a cerca.** Cerca que não é a da posse aberta, posse de outra instância, posse vencida ou ainda não reivindicada: `POSSE_PERDIDA`, e nada muda. A instância para aquele mundo e fecha as conexões.
- **Prazo**: a posse vale `POSSE_TTL_MS` (30 s) sem batimento, pelo relógio do Recreio. O batimento (`BATIMENTO_MS`, 10 s) renova todas as posses da instância e devolve as sessões de jogo encerradas desde o último.
- **Diário**: entradas com `seq` sem buracos e `fatoId` único. Repetir exatamente uma entrada já gravada não faz nada; qualquer outra coisa fora de ordem é `SEQUENCIA`. Um lote entra inteiro ou não entra.
- **Fotografia**: só grava sobre a `revisaoEsperada`. Ficam as 5 mais novas (mais as fixadas) e o diário é compactado até a mais antiga guardada.
- **Liberar**: com `vazio` ou `drenagem` exige fotografia que cubra o diário inteiro (`CHECKPOINT_PENDENTE`); com `erro`, não.
- **Entrada**: `verificarEntrada` confere de novo, no Recreio, que a sessão está viva, é daquele perfil e que ele é membro ativo do mundo.

Os tetos de tamanho vêm de `GameManifest.limites` em `@informach/config/jogos`.

## Testar um servidor de jogo sem o Recreio

```ts
import { criarEmissorDeTeste, criarPlataformaFalsa } from "@informach/recreio/testing";

const plataforma = criarPlataformaFalsa();
const recreio = await criarEmissorDeTeste();

const lia = plataforma.criarPerfil({ apelido: "Lia" });
const mundoId = plataforma.criarMundo({ criador: lia });

const host = plataforma.cliente();
await host.registrar({ urlPublica: "ws://localhost:3010", versao: "dev", capacidade: 50 });

plataforma.abrirMundo(mundoId, lia); // o que o navegador faz ao abrir o mundo
const posse = await host.reivindicarPosse(mundoId);

const sid = plataforma.abrirSessao(lia);
const token = await recreio.sessao({ perfilId: lia, sid });
const sessao = await recreio.verificador().verificar(token);
```

O relógio da plataforma falsa é manual (`avancar(ms)`), para testar vencimento de posse sem esperar.

A implementação real passa pela mesma suíte de `./testing/conformidade` que a falsa.
