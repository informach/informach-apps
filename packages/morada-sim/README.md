# @informach/morada-sim

A simulação do Morada. TypeScript puro, consumido como fonte, sem build. Não tem DOM, rede, banco, relógio nem sorteio do ambiente: quem a hospeda entrega tudo como dado. Roda com autoridade no servidor (`apps/morada-server`) e é reaproveitada nos testes e no cliente (regras para montar menus, posição de quem anda, espelho do mundo).

A simulação guarda a verdade; o desenho mostra; a interface pede; a rede e o banco transportam.

## Uso

```ts
import { criarMundo, restaurar } from "@informach/morada-sim";
import { BAIRRO_DA_PROVA } from "@informach/morada-sim/conteudo";

const mundo = criarMundo({
  mundoId,
  semente: 20261111,
  definicao: BAIRRO_DA_PROVA,
  fundadores: [perfilId],
});

mundo.aplicar({ t: "sessao_entrou", sessaoId, perfilId, apelido: "Lia" });
const resultado = mundo.aplicar({ t: "intencao", sessaoId, intencao });
const { tick, fatos, mudancas, apresentacao } = mundo.avancar(100);

const foto = mundo.fotografar();
const voltou = restaurar(foto, fatosGravadosDepoisDaFoto);
```

| Chamada | O que faz |
| --- | --- |
| `criarMundo(novo)` | Monta um mundo a partir de um bairro descrito como dados |
| `mundo.aplicar(entrada)` | Aplica uma entrada agora: intenção de jogador, sessão que entrou, caiu, voltou ou saiu, expiração, acesso concedido ou revogado, dia real. Só intenções podem ser recusadas |
| `mundo.avancar(ms)` | Anda o tempo em passos de 100 ms. Acelerado, cada 100 ms valem 2 ou 3 passos; pausado, nenhum. `avancar(0)` só recolhe o que as entradas produziram |
| `mundo.fotografar()` | O estado durável, como dados |
| `restaurar(foto, fatos)` | Volta o mundo da fotografia e reaplica os fatos gravados depois dela |
| `mundo.visao(perfilId)` | A visão inteira, para quem entra ou reconecta |
| `mundo.hash()` | Resumo do estado, para comparar |

`avancar` devolve três coisas diferentes:

- **`fatos`**: o que é crítico e precisa ir para o diário antes de qualquer cliente saber.
- **`mudancas`**: o que mudou no que os clientes veem, campo a campo.
- **`apresentacao`**: avisos de uma vez só (nasceu, recusou, chegou visita). Nunca são estado.

## Subpaths

| Subpath | Conteúdo |
| --- | --- |
| `.` | Execução, tipos, ids, invariantes, comandos, fatos, navegação, replicação, regras puras |
| `./conteudo` | Necessidades, interações, comportamentos, catálogo, o bairro e a casa da prova |
| `./formatos` | Esquemas Zod do bairro, do imóvel e da fotografia; migrações |
| `./testes` | Mundo da prova pronto e o roteiro que anda o tempo conferindo as invariantes |

## Determinismo

O mesmo roteiro dá sempre o mesmo mundo, tick a tick. As regras, e como cada uma é imposta:

- **Tempo é o número do tick.** Acelerar é dar mais passos por segundo real; o estado no tick N não depende da velocidade.
- **Sorteio por contador** (`nucleo/sorteio.ts`): função da semente, de um domínio, de uma chave e do tick. Não há gerador com estado.
- **Só inteiros**: milímetros, centavos, partes por milhão. Nada de função transcendental.
- **Ordem fixa**: toda iteração segue a ordem de criação das tabelas, e os sistemas rodam sempre na mesma ordem.
- O `tsconfig` do package não tem DOM nem Node, então `window`, `process`, `setTimeout` e `fetch` nem compilam. Um teste varre o código atrás de `Date`, `Math.random`, `performance`, `console` e imports de fora. O preparo dos testes faz `Math.random` e `Date.now` lançarem erro.

## Estado

Duas regiões, em `dominio/tipos.ts`:

- **`EstadoDoMundo`** é durável e vai inteiro para a fotografia: bairros, lotes, imóveis, objetos, famílias, moradores, relações, ações, gravidezes, pedidos, quadro de tarefas, acessos, memórias.
- **`Presenca`** é volátil: sessões (com o apelido de quem joga), reservas de controle e o voto de velocidade. Nunca é gravada.

Não existe campo "é NPC". Todo morador decide sozinho; quem dirige um morador é uma reserva de sessão.

As invariantes (`verificarInvariantes`) valem em qualquer instante: um condutor por morador, morador em no máximo uma família, limite de moradores por família, fundo e carteira nunca negativos, um ocupante por ponto de uso, um bebê por gravidez concluída, relação única por par.

## Fatos

Dinheiro, família, casal, parentesco, gravidez, nascimento, fase, pedidos e permissões só mudam por um **fato** (`dominio/fatos.ts`), aplicado por `reduzirFato`. O redutor é usado dos dois lados: pela simulação ao vivo e pela recuperação. Como o caminho é o mesmo, os dois não divergem.

- Um fato guarda o resultado, não a intenção: valores absolutos e a entidade inteira quando ela nasce.
- O id é determinístico. O nascimento de uma gravidez é sempre `nasc:<gravidezId>`, e o id do bebê é decidido na concepção.
- Aplicar o mesmo fato de novo não muda nada.

O que não é fato (necessidades, posições, filas, deriva dos vínculos) volta como estava na última fotografia.

## Comandos

Uma `Intencao` passa por: idempotência (o mesmo `comandoId` devolve a resposta da primeira vez), sessão presente, versão (só quando o cliente a informa), autorização (acesso à família, reserva do morador, permissão que a ação exige), regras duras e, por fim, o efeito. Um comando recusado não muda nada além de ficar registrado.

Um comando do jogador passa à frente do que o morador fazia por conta própria, se aquilo puder ser interrompido.

## Regras puras

As regras que só leem o estado são exportadas para o cliente montar menus e prever o que o servidor vai fazer, sem copiar nada. Recebem o estado (ou o espelho na forma do estado), nunca um contexto de passo, e a simulação usa as mesmas funções:

| Função | Responde |
| --- | --- |
| `recusaDaInteracao`, `temPontoLivre` | Esta interação pode acontecer agora, e há lugar? |
| `impedimentoDoPedido`, `decidirProposta` | O que impede um pedido de vida, e o que o morador responderia |
| `impedimentoDoCuidado` | O que impede um cuidado com o bebê. Com cuidador `null`, só o que não depende de quem cuida |
| `podeSerInterrompido` | O que o morador faz agora cede o lugar a um comando? |
| `ondeLevanta`, `partidaDe` | Onde fica em pé quem sai de um móvel, e de onde o morador parte para andar |
| `relacaoExistente`, `saoParentes` | A relação de um par, sem criar uma, e se são parentes diretos |
| `permissoesDe`, `temPermissao` | O que um perfil pode fazer com uma família |

## Conteúdo como dados

Uma interação nova é uma entrada em `conteudo/interacoes.ts`: quem pode, o que exige, quanto dura, o que promete para a autonomia e que efeitos tem. Um móvel novo é uma entrada no catálogo com o comportamento do tipo dele; todos os sofás compartilham o mesmo.

Cada ponto de uso tem a **vaga** (onde o corpo fica) e uma lista de **acessos** (de onde se chega, em ordem de preferência). A mesma cama pode estar encostada em paredes diferentes em cada casa; a navegação usa o primeiro acesso alcançável.

Os ids do catálogo são os mesmos da biblioteca de arte. O mundo salvo nunca guarda arquivo 3D.

`validarConteudo()` confere as referências cruzadas.

## Mundo como dados

Um mundo nasce de um bairro (`formatos/bairro.ts`: lotes, tamanho, casa inicial, famílias, avulsos, relações) e de modelos de imóvel (`formatos/imovel.ts`: paredes, aberturas, cômodos, objetos). O da etapa 1 tem dois lotes, um com a casa pronta e um vazio. Unidades: milímetros inteiros, planta em x e y, altura em z; com giro 0 a frente aponta para −Y.

A casa e o catálogo da prova foram gerados a partir de `casa_mansarda` em `biblioteca/casas_prontas/casas_prontas.json` do repositório de arte, sem as peças de pacote e com um berço a mais.

## Replicação

`criarReplicador` guarda a última forma enviada de cada campo e devolve só o que mudou nas entidades marcadas. Necessidades e idades mudam a cada tick e são conferidas uma vez por segundo. `aplicarMudancas` atualiza o espelho do cliente.

A presença vai na visão como `presenca`: cada jogador com o id, o estado (`presente` ou `em_graca`) e o **apelido** que quem hospeda o mundo informou em `sessao_entrou` ou `sessao_voltou` (`null` se não informou). O apelido é texto de fora, limitado a `APELIDO_MAX` caracteres pelo esquema da entrada; a simulação só o guarda na presença e o repassa. Como a presença, não entra na fotografia nem no diário.

Os avisos de uma vez só (`EventoDeApresentacao`) usam os tipos do domínio: `recusou` leva um `MotivoDeRecusa` e, quando há, o mesmo `detalhe` da resposta a um comando; `casal` leva um `EstadoDoCasal`; `cresceu`, uma `Fase`.

Com `conferirReplicacao: true` (o padrão dos testes) o replicador varre tudo a cada passo e acusa qualquer mudança visível que não tenha sido marcada.

## Testes

`pnpm --filter @informach/morada-sim test` roda tudo; leva alguns minutos, porque vários testes vivem dias de jogo.

| Arquivo | O que prova |
| --- | --- |
| `testes/mundo.test.ts` | Conteúdo sem referência quebrada; bairro de dois lotes; todo ponto de uso alcançável |
| `testes/determinismo.test.ts` | Mesmo roteiro, mesmo mundo; independência da velocidade; restaurar e seguir é igual a não parar; o código não lê relógio nem sorteio |
| `testes/familia.test.ts` | Quatro moradores vivem sete dias sozinhos sem necessidade presa no zero |
| `testes/vida.test.ts` | Casamento com morador do bairro que continua sendo a mesma pessoa; bebê que nasce uma vez, é cuidado e cresce com o mesmo id |
| `testes/convivio.test.ts` | Dois jogadores na mesma família; um condutor por morador; queda sem aviso com a fila intacta; acordo de velocidade; comando repetido; ids trocados; o apelido de cada jogador na visão e fora da fotografia |
| `testes/tempo.test.ts` | As três políticas de avanço com duas famílias; gravidez e ausência; envelhecimento |
| `testes/recuperacao.test.ts` | De qualquer fotografia, os fatos seguintes levam ao mesmo estado crítico; o parto acontece uma vez só em cada ponto de queda |
| `testes/propriedades.test.ts` | Roteiros aleatórios: invariantes, replicação e espelho valem depois de qualquer sequência |

## Limites desta etapa

- Um andar por imóvel; paredes retas; objetos em giros de 90°.
- Navegação em grade de 25 cm atrás da interface `Navegador`; uma malha de navegação pode tomar o lugar dela.
- Pedidos de vida entre duas famílias com jogadores viram pedido aberto, mas unir duas famílias fica para a etapa dos vizinhos.
- A criança pequena não anda pela casa sozinha: brinca, cochila e é cuidada onde está.
- Os nomes dos clipes de animação nas interações são provisórios; o empacotador de arte confere a lista contra a biblioteca.
- Não há dinheiro circulando além do fundo inicial; contas, trabalho e compras entram nas fases seguintes.
