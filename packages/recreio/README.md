# @informach/recreio

Domínio e contratos do Recreio, a plataforma de jogos. Não tem banco, React, Three.js nem WebSocket: o que grava fica em `apps/recreio`, e os jogos falam com a plataforma pelos contratos daqui.

O SDK também atende jogos sem mundos: `contexto.dados` lê/grava bytes por chave,
lista versões, resolve ou descarta conflitos; `contexto.conquista(id, chaveIdem)`
registra somente IDs previstos no manifesto. Conquistas do cliente não concedem
dinheiro nem acesso. `capacidades.mundos: null` dispensa mundo na montagem e
recusa sua criação no servidor. O Morada continua exigindo mundo.

Dados são privados por perfil/jogo, com 16 chaves, 64 KiB por versão, revisão
obrigatória para atualizar (omissão = 0), quatro versões aceitas e três conflitos
preservados. HTTP usa base64 canônico; o SDK usa `Uint8Array`, token vigente,
prazo e nenhum cookie. Escritas não são repetidas automaticamente. Um 409
`REVISAO_DIVERGENTE` informa `versaoId` e `revisaoAtual`; não significa perda da
cópia enviada. Quando a cota está cheia, `LIMITE_DE_DADOS` recusa a nova cópia.
`resolver` exige a revisão atual e `descartar` é explícito. Uma conquista obtida
mantém a chave original; reutilizar a chave para outro ID ou trocar a chave da
mesma obtenção é `FATO_DUPLICADO`. [Implantação e provas deste incremento](../../docs/recreio/dados-de-perfil-2026-11-16.md)
ainda estão em verificação remota; a documentação do contrato não atesta produção.

Consumido como TypeScript fonte, sem build, como os outros packages.

## Subpaths

| Subpath | Conteúdo | Quem usa |
| --- | --- | --- |
| `.` | Ids com marca, `decidirAcesso`, regras de mundo, posse, código de convite, erros | Todos |
| `./contrato` | Esquemas Zod e tipos de tudo que atravessa a rede: claims dos tokens, API do SDK, API das instâncias, `RecreioGameContext`, `ClienteDoHost` | Todos |
| `./emissor` | Assinatura dos tokens, montagem do JWKS e conferência dos tokens que o próprio Recreio emitiu. Precisa da chave privada | Só `apps/recreio` |
| `./erros` | Códigos e reconhecimento de recusas, sem SDK, Zod ou transporte | Interfaces que só precisam reconhecer uma recusa |
| `./host` | `criarVerificadorDeSessao` e `criarClienteDoHost` (o `ClienteDoHost` por HTTP) para o servidor de um jogo | Servidores de jogo |
| `./sdk` | `criarRecreio`: o `RecreioGameContext` para o cliente de um jogo. Só `fetch` e temporizadores. Também `ModuloDoJogo`, o contrato entre a página que hospeda o jogo e o cliente dele | Clientes de jogo e a página que hospeda o jogo |
| `./testing` | `criarPlataformaFalsa` e `criarEmissorDeTeste` | Testes e desenvolvimento dos jogos |
| `./testing/conformidade` | `descreverConformidadeDoHost`: as regras da API das instâncias como testes | Testes de quem implementa `ClienteDoHost` |

Escopo e estado de cada lote ficam no [registro da frente](../../docs/recreio/implementacao.md).

Pedidos do SDK têm prazo de 10 s, incluindo leitura do corpo; o emissor de
ingresso recebe `AbortSignal`. A renovação também respeita o vencimento da
sessão. Tempo esgotado é `INDISPONIVEL`, sem repetição automática das mutações
nem garantia de rollback remoto. A saída distingue parada local de confirmação
do servidor e permite nova tentativa depois de falha, agrupando chamadas
simultâneas. [Contrato e estado de homologação](../../docs/recreio/prazos-navegador-2026-11-16.md).

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

### Pelo HTTP

`criarClienteDoHost({ baseUrl, jogo, segredo, fotografiaMaxBytes, diarioMaxBytes, fetch?, tempoLimiteMs? })` devolve o mesmo `ClienteDoHost`, falando com `/api/interno/v1` do Recreio. Os tetos recebem `fotografiaMaxBytes` e `diarioPendenteMaxBytes` do manifesto do jogo:

- `Authorization: Bearer <segredo do jogo>` e `X-Recreio-Jogo: <id do jogo>` em todo pedido. Depois de `registrar`, o cliente guarda o `instanciaId` e o manda em `X-Recreio-Instancia`; antes disso, qualquer outra chamada recusa com `NAO_AUTENTICADO` sem sair para a rede.
- Bytes do diário vão em base64 dentro do JSON. A fotografia vai crua (`application/octet-stream`), com os números na consulta, o resumo opcional em `X-Recreio-Resumo` e, na leitura, os metadados em `X-Recreio-Fotografia` (JSON em base64url nos dois).
- A leitura limita o corpo pelo manifesto e pelo tamanho declarado, cancela respostas excedentes e confere SHA-256 antes de entregar os bytes. Corpo cortado, checksum divergente ou metadados inválidos são `INDISPONIVEL`; o cliente não entrega uma fotografia parcial ao jogo.
- Toda recusa vira `ErroDoRecreio(codigo, detalhe)` com o código que o Recreio mandou. Rede fora do ar, tempo esgotado (10 s por padrão) e resposta sem código do contrato viram `ErroDoRecreio("INDISPONIVEL")`: dá para tentar de novo, mas o prazo da posse continua correndo.

Os nomes dos cabeçalhos e os esquemas do transporte ficam em `./contrato` (`CABECALHO_DO_JOGO`, `DiarioLidoSchema`, `ConsultaDaFotografiaSchema`...).

O que o servidor do jogo precisa respeitar:

- **Batimento a cada `batimentoMs`** (10 s), com todos os mundos que executa. Posse que volta `perdida`: parar o mundo e fechar as conexões.
- **Cursor**: `null` no primeiro batimento, depois sempre o `cursor` da resposta anterior. Com `null`, o Recreio devolve as sessões encerradas desde que a instância se registrou; cada sessão encerrada aparece uma vez.
- **Parar de escrever antes do prazo** (`deveSeCercar`, com a folga de `FOLGA_DE_AUTOCERCA_MS`): o prazo é julgado pelo relógio do Recreio.
- **Compactação**: gravar uma fotografia apaga do diário o que as fotografias guardadas já contêm. Ao retomar um mundo, ler a fotografia e depois o diário com `apos = fotografia.diarioSeq`.

## SDK do cliente do jogo

Social é uma capacidade opcional em qualificação. `criarRecreio({ social: true,
... })` envia `suportaSocial: true`; `contexto.social` só existe quando o servidor
também responde `social: true`. Clientes anteriores não recebem campo novo.

Na candidata F5, `social.participantes(mundoId, apos?)` consulta dez participantes
atuais do próprio mundo e jogo, com cursor. Só identidade opaca, apelido/avatar
quando disponíveis e proteção própria; sem conta, presença ou conteúdo. Esse
vínculo permite bloquear, silenciar e denunciar sem amizade. O servidor captura
a referência; bloquear não expulsa membros nem altera progresso. Servidores e
clientes desse incremento ainda estão em qualificação.
A composição do Recreio mantém `RECREIO_SOCIAL_MODE=off` por padrão, até o aceite
da frente completa. Desligar novos contatos conserva recusa, remoção e proteção
de relações existentes para uma sessão ainda autorizada.

O contrato oferece código de uso único, pedido por código/UUID de repetição,
aceite, recusa/revogação, bloqueio/silêncio e remoção. Aprovação de responsável
exige login nativo recente no portal e não é uma capacidade de jogo. Nenhuma
mutação social repete automaticamente após falha de rede; o chamador conserva o
UUID de um pedido e pode recuperar o mesmo recibo. Nova emissão revoga o código
anterior. O servidor revalida SID, login/aparelho, cobertura, política e prazo;
um token de partida encerrada não vira identidade de portal.

`social.denunciar({ perfilId, denunciaId, categoria })` usa uma categoria fechada
e um contato que o servidor já conhece. Devolve protocolo opaco; conservar o
UUID permite recuperar a confirmação depois de resposta perdida. Não repete
automaticamente e não recebe texto/evidência, conta ou dados do mundo. A pessoa
pode denunciar sem abrir contato novo; o SDK ainda exige seu SID atual. No
portal, proteção não depende de cobertura. A fila e a operação permanecem em
qualificação; esta API não anuncia moderação habilitada em produção.

`social.denuncias(protocolo?)` consulta até dez protocolos do próprio perfil,
sem identidade ou conteúdo da outra pessoa. `social.reverDenuncia({ protocolo,
versaoDoCaso, recursoId })` pede uma revisão dentro do prazo e da revisão
atual. O UUID da tentativa permite conferir uma resposta perdida sem reenvio
automático. Ambos exigem o SID atual, inclusive com novos contatos desligados;
não recebem autoridade nativa ou perfil escolhido no corpo. O host oferece
consulta e revisão dentro do painel, sem sair da partida. UUIDs tipados e os
UUIDs destes contratos sociais são normalizados em minúsculas; IDs textuais da
autenticação conservam a caixa.

`social.listar(cursor?)` percorre dez relações conhecidas por página, sem busca
pública, conta ou conteúdo de mundo. Aprovações atuais governam nomes protegidos
e a disponibilidade da amizade. A presença informa somente um booleano: depende
da opção atual, amizade autorizada, contato de partida em até noventa segundos
e autoridade vigente do aparelho/login. `social.presenca(modo)` configura a
preferência adulta; perfil protegido só muda presença pela supervisão nativa.
Modo online para participantes de um mesmo mundo depende da superfície de F5.
Denúncias e telas ainda estão sendo concluídas.

```ts
import { criarRecreio } from "@informach/recreio/sdk";

const recreio = await criarRecreio({
  baseUrl: "", // a página do jogo roda na origem do portal
  jogo: "morada",
  // Quem fornece é a página que hospeda o jogo: pede o ingresso com o cookie do portal.
  obterIngresso: async () => {
    const resposta = await fetch("/api/sdk/v1/ingresso", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ jogo: "morada" }),
    });
    if (!resposta.ok) throw new Error("sem ingresso");
    return (await resposta.json()).ingresso;
  },
});

recreio.sessao.token(); // vai para o servidor do jogo na conexão, nunca em URL
recreio.sessao.aoRenovar((token) => { /* reenviar ao servidor do jogo */ });
recreio.sessao.aoMudarAcesso(({ codigo, estado, motivo }) => { /* salvar e voltar ao portal */ });
const aberto = await recreio.mundos.abrir(mundoId); // { endereco, membroId, papel, ... }
```

- A troca do ingresso é feita uma vez, em `criarRecreio`. Se o perfil já joga em outro aparelho, ela recusa com `ErroDoRecreio("JA_ABERTO")`; a página pergunta e chama de novo com `continuarAqui: true` (um ingresso novo é pedido a cada chamada).
- A renovação é silenciosa, quando passou `FRACAO_PARA_RENOVAR` do prazo. Recusa do Recreio (`ACESSO_PERDIDO`, `SESSAO_ENCERRADA`, `SESSAO_INVALIDA`) dispara `aoMudarAcesso` uma vez e encerra as renovações. Sem resposta do Recreio, o SDK tenta de novo a cada 15 s até a sessão vencer, e então avisa com `codigo: "INDISPONIVEL"`.
- `sair()` cancela o temporizador e encerra a sessão no Recreio. Sair de uma sessão que o Recreio já encerrou não é erro.
- Os pedidos de sessão e de mundos vão com `credentials: "omit"`: só o token no cabeçalho, nenhum cookie.
- O SDK não importa `./emissor`, `./host`, `jose` nem nada do Node; `src/sdk/sdk.test.ts` confere.

### A página que hospeda o jogo

O portal monta o cliente de um jogo por um contrato só de tipos (`ModuloDoJogo`, em `./sdk`), para a página não importar jogo nenhum e o jogo não importar a página:

```ts
import type { ModuloDoJogo } from "@informach/recreio/sdk";

export const meuJogo: ModuloDoJogo = {
  montar(host, contexto, { mundoId, aoSair, aoFalhar }) {
    // contexto.mundos.abrir(mundoId) diz onde o mundo está rodando; o token de
    // contexto.sessao.token() vai no primeiro quadro da conexão.
    return {
      dispose() {
        // fechar conexões e soltar o que criou em `host`
      },
    };
  },
};
```

- A página abre a sessão (`criarRecreio`) antes de montar e a encerra (`sair()`) depois de `dispose()`. O jogo não chama `sair()`.
- `aoSair()`: a pessoa saiu por dentro do jogo. `aoFalhar(erro)`: o jogo não tem como continuar; em geral ele repassa o `ErroDoRecreio` que recebeu de `mundos.abrir`, e a página mostra o motivo. Queda de conexão que o jogo resolve abrindo o mundo de novo não passa por `aoFalhar`.
- `erroDaResposta(resposta)` (também em `./sdk`) transforma a recusa de `POST /api/sdk/v1/ingresso` no mesmo `ErroDoRecreio` que o SDK lança; é o que a página usa em `obterIngresso`.
- O SDK confere as respostas com o Zod. Sob uma política de segurança sem `eval`, a página chama `z.config({ jitless: true })` no navegador, senão o Zod testa `new Function` e o navegador registra uma violação.

## Testar um servidor de jogo sem o Recreio

### Salvamento restrito

`salvamentoRestrito: true` negocia no SDK uma capacidade distinta de gameplay.
Quando disponível, `sessao.salvamento.estado()` consulta o próprio recibo e
`finalizarDados(lote)` encerra o SDK normal e confirma um lote CAS imutável,
preservando conflitos. A capacidade permite salvar depois da concessão normal,
dentro da margem do servidor; não permite voltar a jogar ou renovar.

`criarClienteDoHost` também implementa `ClienteDoHostComSalvamento`:
`salvarSessao({ mundoId, sid, cerca, operacao: "preparar" })` fixa o encerramento;
depois de persistir uma fotografia, a operação `"concluir"` envia `revisao` e
`diarioSeq`. O servidor confere posse, vínculo, autoridade e bytes duráveis.
Repetição conserva a mesma prova. O jogo deve pausar comandos e concluir a fila
antes da preparação, mantendo os demais membros ativos.

Contrato implantado em `3f2b1239`, com 0177/0178 e os modos desligados. O host
negocia a capacidade quando a flag e o manifesto permitem; Morada mantém sua
capacidade automática nula e saída manual confirmada. Contratos,
gates e pendências em [salvamento restrito](../../docs/recreio/salvamento-restrito-2026-11-17.md).

### Plataforma em memória

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

A implementação real passa pela mesma suíte de `./testing/conformidade` que a falsa: `apps/recreio/test/conformidade.integration.ts` roda a suíte com o `criarClienteDoHost` chamando as rotas do app.

## Presença física do anfitrião em homologação

`criarPresencaDaConexao` no subpath `/host` representa uma conexão física já
admitida. Recebe a chave estável dessa entrada e uma função que consulta o
socket/participação atuais; relê essa função depois das esperas. O chamador
mantém o produtor, chama `atualizar` no batimento e agrupa `renovacao()` em
pedidos de até 64. Desconectar ou chamar `encerrar` impede qualquer nova
atestação positiva nesse produtor, inclusive se a resposta anterior chegar
depois. Resposta perdida é consultada pela chave original; `null` conserva
a pendência, pois não prova que uma transação em voo não vá gravar.

O recibo não é autorização de visitante nem confirmação de salvamento.
Renovação perdida/expirada exige encerrar o produtor anterior antes de criar
outro para uma conexão ainda real. O jogo não deve remover uma pendência
incerta só porque o transporte falhou. Runtime e jornadas continuam em
implementação; esse helper não ativa visitas no Morada.

## Guarda local de visitante em homologação

`VisitaAberta.sessaoDeVisitaId` fixa o vínculo preparado para o SID e deve ser
levado à admissão privada. O host recebe também `presencaDoAnfitriaoId`, só na
resposta privada, e confere a conexão original localmente. No `/host`,
`criarPermissaoDeVisita` combina esse fato com `performance.now()` e o prazo
curto do servidor. Conferir `podeJogar()` ao receber e ao executar cada comando.
`suspender()` é obrigatório após resultado de renovação desconhecido; renovar
exige resposta integral nova, medida desde o envio. Perda do anfitrião original
ou negativa explícita é terminal. Esse helper não confirma persistência nem
encerra o SID: o jogo ainda precisa congelar, persistir e usar a API negativa.
O runtime de visitante está em implementação.

## Convites de visita em homologação

Com `social: true` e `visitas: true`, a negociação aceita oferece
`contexto.social.visitas`. `listar`/`consultar` devolvem recibos próprios;
`conferir` exige autorização atual para revelar nomes e contexto. `emitir`
recebe mundo/perfil/presença atestada e `pedidoId`; conservar esse pedido após
resposta perdida. `responder` aceita/recusa/revoga uma concessão temporária,
sem criar membro ou confirmar admissão. Nenhum envio tem retry automático.
O SDK confere o jogo/ID do recibo e a correspondência entre mundo e concessão.
`presenca(mundoId)` consulta somente a presença já atestada do próprio SID;
ausência não abre participação e recibo positivo não substitui a emissão.

Esses métodos não aprovam menores ou decisões de gestão. Aprovações dependem
da autoridade nativa recente correspondente. O histórico técnico não comprova
presença, direito atual, entrada ou salvamento. Endpoints e SDK ainda são
candidatos; telas e jornada completa continuam
em implementação no [registro](../../docs/recreio/visitas-temporarias-2026-11-17.md).

A candidata do portal oferece caixa fora/dentro da partida e aprovações nativas.
Na partida, a transição só é oferecida com capacidade de salvamento e módulo
finalizável: o hospedeiro exige o recibo confirmado antes da navegação. Conflito
ou confirmação desconhecida conservam o tratamento de progresso. Homologação
remota e implantação integral seguem pendentes; Morada não ganha visitas.

## Preparação da responsabilidade com aceite

O contrato de encerramento também reconhece `permissions_changed`. O host
fecha a conexão pelo cursor existente e o portal orienta voltar à estante
para uma nova admissão. Não representa saída do mundo, perda de assinatura
ou troca de aparelho. Os leitores precisam estar implantados antes do primeiro
escritor desse motivo; depois dele, rollback conserva leitores compatíveis.
A oferta/aceite ainda está em implementação e não é concedida pelo contrato.
Plano e gates em [responsabilidade aceita](../../docs/recreio/responsabilidade-aceita-2026-11-16.md).
