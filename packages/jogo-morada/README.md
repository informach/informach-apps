# @informach/jogo-morada

O cliente do Morada no navegador. TypeScript consumido como fonte, sem build. A cena é three.js imperativo; o HUD é React. O cliente não muda o mundo: manda intenções ao servidor do jogo (`apps/morada-server`) e desenha o que ele diz.

Regras do mundo e protocolo: [`packages/morada-sim/README.md`](../morada-sim/README.md). Servidor: [`apps/morada-server/README.md`](../../apps/morada-server/README.md). Estado da frente: [`docs/recreio/implementacao.md`](../../docs/recreio/implementacao.md).

## Uso

```ts
import { montarMorada, type FonteDoMundo } from "@informach/jogo-morada";

const jogo = montarMorada(elemento, { fonte, aoSair: () => voltarParaAEstante() });
// ...
await jogo.dispose();
```

Ou, em React, `import { MoradaJogo } from "@informach/jogo-morada/react"`, que monta ao aparecer e solta ao sumir. O elemento que recebe o jogo precisa ter tamanho; o jogo ocupa tudo.

`FonteDoMundo` é tudo o que o jogo precisa de quem o hospeda: `abrir()` (onde o mundo está rodando, chamado de novo a cada reabertura), `token()` (a sessão de jogo, que vai no primeiro quadro e nunca no endereço), `aoRenovar` (a sessão ganhou prazo novo: o jogo manda `renovar_sessao` ao servidor) e `aoPerderAcesso`. A bancada entrega uma fonte feita do servidor de desenvolvimento; o portal entrega uma feita do SDK do Recreio.

| Opção | Para quê |
| --- | --- |
| `fonte` | De onde vêm o mundo e a sessão |
| `aoSair` | Chamado quando a pessoa sai e o servidor confirmou. Sem isto, o botão Sair só encerra o jogo |
| `aoEncerrar(motivo)` | O jogo parou sem a pessoa pedir e não vai tentar de novo (`sessao`, `sem_acesso`, `acesso_encerrado`, `substituida`, `protocolo`). O jogo mostra o motivo; quem hospeda pode desmontar e explicar do seu jeito |
| `depurar` | Expõe `window.__morada` (espelho, posições desenhadas, medidas da cena). Só bancada e testes |

### O jogo não vaza para o portal

`src/index.ts` só tem tipos, a marca `MARCA_DO_CLIENTE` e `montarMorada`, que carrega o jogo de verdade com `import()`. O three.js, o HUD e o CSS ficam de `src/jogo.ts` para dentro. Quem importa só a marca ou os tipos não carrega nada disso; `e2e/bundle.spec.ts` confere no bundle e na rede.

## Como é feito

| Pasta | Papel |
| --- | --- |
| `src/rede` | `conexao.ts`: WebSocket, entrada, sequência dos quadros, o que fazer com cada fechamento, reabertura com espera crescente. `relogio.ts`: estimativa do tick do servidor com fração |
| `src/espelho` | `loja.ts`: o espelho do mundo e a inscrição do HUD. `comandos.ts`: intenções com id, pendentes, reenvio com o mesmo id. `previsao.ts`: o "ir até aqui" previsto e a suavização do desenho. `sessao.ts`: liga tudo, sem tela |
| `src/modelo` | O que o HUD mostra, como contas puras sobre o espelho: retratos, menu, fila, necessidades, relógio, pedidos, textos das recusas |
| `src/cena` | `cena.ts`: renderer, laço, qualidade, perda de contexto, clique. `casa.ts`, `planta.ts`: a casa a partir da planta. `moradores.ts`, `situacao.ts`: onde e como cada morador está. `espaco.ts`: da planta à cena |
| `src/ativos` | `ativos.ts`: como a cena pede o visual de moradores e objetos. `procedurais.ts`: cápsulas e caixas, a única implementação por enquanto |
| `src/hud` | O HUD em React e `hud.css`, CSS puro debaixo de `.morada` |
| `bancada` | Página de desenvolvimento que joga contra o servidor no modo `falsa` |
| `e2e` | Testes de navegador (Playwright) |

O espelho tem as mesmas tabelas do estado do servidor, então as funções puras da simulação rodam nele: `recusaDaInteracao`, `temPontoLivre`, `impedimentoDoPedido` e `impedimentoDoCuidado` montam o menu com o motivo de cada opção desligada, `podeSerInterrompido` e `partidaDe` dizem se e de onde o servidor começaria a andar, `criarNavegador` dá a mesma rota que o servidor dará, `posicaoNoMovimento` põe cada morador no lugar. `estadoDoEspelho` monta essa forma sem copiar nada. Regra do mundo não é copiada aqui: quando o cliente precisa de uma, a simulação a exporta.

**Quem está no mundo.** A presença que o servidor replica traz o apelido de cada jogador. É dela que saem "Dirigido por Bruno", a plaquinha do retrato, quem falta concordar com a velocidade e a linha da presença ("Você e Bruno · Ana em espera"). Um jogador sem apelido na visão aparece como "outra pessoa"; o jogo não inventa nome.

**Eixos.** A simulação usa os eixos do Blender em milímetros (planta em x e y, altura em z, frente em −Y). A cena usa os do glTF em metros: `(x, y, z) → (x, z, −y)`. É uma rotação, sem espelho, e o giro da simulação é o mesmo ângulo em torno do Y da cena. Um modelo com a frente em +Z entra sem ajuste.

**Tempo.** O servidor só manda o tick quando algo muda (no passo) e uma vez por segundo (no pulso, que sai depois do passo e diz o tick em que o mundo está). A cena desenha pelo tick estimado: o morador que a pessoa dirige no tick de agora, os outros dois ticks atrás.

**Previsão.** Só o "ir até aqui" do próprio morador é previsto, e só quando o servidor começaria a andar no próximo passo. O desenho desliza para a rota do servidor em 150 ms quando ela chega, e de volta se o pedido é recusado.

**Conexão.** Depois de 4009, 4010, 4011, 4013 e de queda de rede, o cliente chama `fonte.abrir()` de novo (espera de 0,5 s a 8 s, com folga sorteada) e entra com a mesma sessão, que retoma a reserva. Depois de 4001, 4003, 4008 e 4012, para e diz por quê.

**Ativos.** A cena não sabe que cara as coisas têm: pede a `Ativos`. `AtivosProcedurais` desenha sem arte nenhuma, e é o que roda no CI. Os pacotes de arte entram por outra implementação da mesma interface; a arte licenciada nunca é versionada aqui.

## Rodar

```bash
# Em um terminal, na raiz: o servidor do jogo em modo de desenvolvimento (porta 3010).
MORADA_PLATAFORMA=falsa MORADA_REGRAS=prova pnpm dev:morada-server

# Em outro: a bancada (porta 5173). Abra duas abas com apelidos diferentes.
pnpm --filter @informach/jogo-morada bancada
```

`http://localhost:5173/?apelido=Lia` entra direto. O primeiro apelido cria o mundo; os outros entram na mesma família. Nada é salvo, e reiniciar o servidor dá um mundo novo. A porta 5173 é fixa porque o servidor de desenvolvimento só aceita o WebSocket dessa origem.

A sessão de desenvolvimento vale 15 minutos e a bancada a renova sozinha a cada 5, pelo `aoRenovar` da fonte, como o SDK do Recreio faz no portal: o jogo segue enquanto a página estiver aberta. Ao reabrir o mundo depois de uma queda, a bancada pede a mesma sessão (`continuar`), e o servidor retoma a reserva. `&validade=20` na URL faz a sessão valer 20 segundos, para ver a renovação acontecer.

Na cena: arrastar anda, botão direito ou dois dedos gira, roda aproxima. WASD e setas andam, Espaço pede a pausa, Esc fecha o menu.

```bash
pnpm --filter @informach/jogo-morada typecheck
pnpm --filter @informach/jogo-morada test    # unidade, sem navegador
pnpm --filter @informach/jogo-morada e2e     # navegador; sobe o servidor e a bancada sozinho
pnpm exec biome check packages/jogo-morada
```

O `e2e` precisa das portas 3010 e 5173 livres e do Chromium do Playwright (`pnpm --filter @informach/jogo-morada exec playwright install chromium`). O navegador de teste desenha por software; `MORADA_E2E_GPU=1` usa a placa de vídeo. As fotos de cada passo ficam em `e2e/telas/`, fora do git.

## Testes

| Arquivo | O que prova |
| --- | --- |
| `src/rede/conexao.test.ts` | Estados da entrada; cada fechamento reabre ou para; espera crescente; lacuna de sequência; servidor mudo; renovar; sair |
| `src/rede/relogio.test.ts` | O tick estimado não anda para trás, converge e fica limitado com a rede tremida, com pausa e com mudança de ritmo |
| `src/espelho/sessao.test.ts` | O espelho fica igual à visão do servidor depois de um roteiro com duas pessoas; comando sem resposta vai de novo com o mesmo id e não é feito duas vezes; a rota prevista é a do servidor; a recusa cancela a previsão |
| `src/modelo/menu.test.ts` | O menu de objetos e moradores: com o bebê no colo, móvel ocupado, parentes, cuidados, pôr para dormir; o que o menu oferece o servidor aceita, e o que ele desliga o servidor recusa pelo mesmo motivo |
| `src/modelo/retratos.test.ts` | Os retratos para duas pessoas, com o apelido de quem dirige; a linha da presença; a espera de quem caiu; o voto de velocidade; a fila; os pedidos |
| `src/modelo/eventos.test.ts` | Os avisos de uma vez só em frases: a recusa com o detalhe, o casal, a fase |
| `src/cena/espaco.test.ts` | Da planta à cena sem espelhar; as peças de parede com portas e janelas; onde cada morador é desenhado |
| `e2e/dois-jogadores.spec.ts` | Duas pessoas em dois navegadores: entrar, dirigir, andar, usar a geladeira, uma cair, perder e recuperar o contexto WebGL |
| `e2e/bundle.spec.ts` | O tamanho do JavaScript do jogo e a página que só importa a marca |
| `e2e/sessao.spec.ts` | Com a sessão valendo 9 s, a bancada renova e o jogo passa do prazo na mesma conexão; sem conseguir renovar, a sessão vence e o jogo diz por quê |

Os testes de unidade usam a simulação de verdade (`@informach/morada-sim/testes`) como referência. `src/testes/servidor-de-mentira.ts` fala o protocolo com um `Mundo` real por trás, sem rede.

## Ainda não tem

- Arte: os corpos, os móveis e as animações de verdade entram por uma implementação de `Ativos` (lotes X2 e D1).
- Som, construir, comprar e criar família (etapa 2).
- A rota `/jogar/morada` do portal e a fonte feita do SDK do Recreio (lote X1).
