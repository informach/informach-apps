# @informach/morada-arte

Empacotador de arte do Morada. Lê a biblioteca de personagens do repositório de arte (corpos, rostos, cabelos,
roupas e bibliotecas de animação) e gera pacotes pequenos, prontos para o jogo: um GLB por personagem, um GLB de
animações por esqueleto e um `manifest.json`.

Roda em Node, com `tsx`, sem passo de build. Não faz parte do cliente: o cliente só importa o tipo do manifesto
(`@informach/morada-arte/manifesto`).

## Regras sobre a arte

A arte é material licenciado, de uso interno, num repositório privado (`informach/artes-3d`).

- Nada da arte entra neste repositório: nem geometria, nem textura, nem tabela de animação, nem fixture de teste
  derivada dela. O código lê tudo da pasta de entrada, em tempo de execução. Até as tabelas de cores com nome e a
  lista de corpos são lidas da página de referência (`src/leitura/pagina.ts`).
- A pasta de entrada (`ARTES_3D_DIR`) e a pasta de saída ficam fora do repositório.
- Nenhum script envia a arte para fora da máquina. A verificação contra a página de referência sobe um servidor
  em `127.0.0.1` e bloqueia qualquer outro endereço.

## Entrada

Uma cópia do repositório de arte no commit desejado. Basta um clone parcial com estas pastas:

| Caminho | O que é |
|---|---|
| `biblioteca/corpos/<corpo>.glb` | corpo, esqueleto de 44 ossos, 12 rostos, cabelo original |
| `biblioteca/itens/<id>.txt`, `familias.txt`, `peles.txt` | peças e cabelos no formato `MIT1` e as tabelas que os ligam aos corpos |
| `codigo/arte/roupas.json`, `cabelos.json`, `elenco.json` | catálogos e os 312 personagens prontos |
| `biblioteca/roupas_mascaras/` | máscaras de cor livre e `mascaras.json` |
| `biblioteca/roupas_gen/`, `paginas/tipos_de_corpo/roupas/` | texturas das peças |
| `paginas/tipos_de_corpo/corpos/paleta.png`, `corpos.html` | paleta dos corpos e as tabelas da página |
| `biblioteca/bibliotecas_30fps/<esqueleto>.glb` | bibliotecas de animação (só as dos esqueletos usados) |
| `biblioteca/info.json`, `biblioteca/rotulos.json` | apoios de cena e nomes dos clipes |

## Uso

```bash
ARTES_3D_DIR=/caminho/para/artes-3d pnpm --filter @informach/morada-arte empacotar -- --saida /caminho/para/saida
```

```
tsx src/cli.ts --arte <ARTES_3D_DIR> --saida <pasta> [opções]

  --prova                  o elenco da prova (o padrão)
  --elenco <id,id,...>     personagens prontos de codigo/arte/elenco.json
  --personagens <arquivo>  descrições em JSON (formato "morada-elenco")
  --commit <hash>          commit da arte, quando a pasta não é um clone do git
```

Sai com código diferente de zero em qualquer falha de leitura ou de validação, com o arquivo e o campo na
mensagem. No fim imprime a tabela de tamanhos, chamadas de desenho, triângulos, chaves de animação e o que a
biblioteca não tem.

## Saída

```
saida/
  manifest.json
  lia.<hash>.glb              um por personagem
  anim-adulto.<hash>.glb      um por esqueleto usado
```

O hash é o começo do SHA-256 do conteúdo: a mesma entrada dá os mesmos bytes e os mesmos nomes, e os arquivos
podem ser servidos com cache sem prazo. Pacotes de uma rodada anterior que saíram do manifesto são apagados da
pasta.

### Pacote de personagem

- Um esqueleto (o nó `Armadura` e os 44 ossos, com os nomes da biblioteca) e uma skin.
- Nó `corpo`: pele, roupas e cabelo numa malha só, pintados nos vértices (`COLOR_0`), num material. Peças com
  estampa que os vértices não guardam (xadrez, jeans, listras) viram uma primitiva a mais, com uma textura
  pequena já na cor escolhida. A decisão é por material de cada peça (`erroDaPinturaPorVertice` em
  `src/cor/pintura.ts`): a cor interpolada entre os vértices é comparada com a textura da página em pontos fixos
  de cada triângulo e em todo texel que cai dentro dele; se o **erro máximo** passa de `limiarDeTextura` (10
  níveis de 255, em sRGB; `src/personagem/montagem.ts`), a peça leva textura. É o máximo, e não um percentil,
  para um detalhe pequeno (os botões de um dólmã) não sumir. A textura assada tem até 512 px de lado e é reduzida
  à metade enquanto o PNG passa de 48 kB (até o mínimo de 64 px).
- Nós `rosto_<expressão>`: uma malha por expressão, a mesma skin e o mesmo material. O cliente deixa visível só
  uma. As sete formas de fala (`fala_X`, `fala_M`, `fala_A`, `fala_E`, `fala_I`, `fala_O`, `fala_F`) ficam só no
  rosto neutro.
- Nó `chupeta`, nos bebês: o cliente pode esconder.
- Formas `gravidez_1..3` na malha do corpo de quem engravida.
- `_JOINTS_DOBRADO` e `_WEIGHTS_DOBRADO`: nas peças com saia, os pesos para as poses dobradas (sentado, deitado,
  agachado), que o cliente troca pelos de pano. No three eles chegam como `_joints_dobrado` e `_weights_dobrado`.
- Sem animações. Geometria quantizada (`KHR_mesh_quantization`) e comprimida (`EXT_meshopt_compression`). Carrega
  no three.js 0.186.1 com `GLTFLoader` e `MeshoptDecoder`.

Convenções do glTF: metros, Y para cima, frente em +Z, origem no chão, entre os pés.

### Biblioteca de animação

O esqueleto (sem malha) e os clipes que o jogo usa, com os ids da biblioteca de arte. O cliente toca cada clipe no
esqueleto do personagem pelo nome dos ossos. Os clipes começam em zero. Canais parados no valor de descanso saem;
os outros perdem as chaves que a interpolação refaz dentro da tolerância (`TOLERANCIA_PADRAO` em
`src/animacao/clipes.ts`), e o desvio de pés, mãos e cabeça é medido quadro a quadro e aparece na tabela.

### Manifesto

`ManifestoSchema` em `src/manifesto.ts` (Zod). Para cada personagem: arquivo, bytes, corpo, altura, biblioteca de
animação (e a de grávida), nós, expressões, formas de gravidez, âncoras (colo, cabeça, ossos das mãos), custo de
desenho e a aparência da simulação para a qual foi feito. Para cada biblioteca: arquivo, bytes, clipes (duração,
ciclo, deslocamento, pose dobrada, apoio de cena), o clipe de cada postura básica e o clipe de cada nome de
animação que o jogo pede, com a marca de substituto quando a biblioteca não tem o gesto. Traz também o commit da
arte e a versão do formato.

## Como um personagem é montado

A referência é a página do repositório de arte (`paginas/tipos_de_corpo/corpos.html`). O que ela faz no navegador,
a cada escolha, o empacotador faz uma vez:

| Página | Aqui |
|---|---|
| `prepararPele`, `montarItem`, `posicoesPeca`, `normaisDe`, `vizinhosDe` | `src/encaixe/montar.ts`, `src/encaixe/posicoes.ts` |
| `coberturaDe`, `camadaCoberta`, `ocultarPele`, `ossosDePerna` | `src/encaixe/cobertura.ts` |
| `aplicarPersonagem`, `aplicarRoupa`, `penteadoEfetivo`, `corteChapeu` | `src/personagem/resolucao.ts` |
| `aplicarCorteCabelo` (descarte no shader) | `planoDoCorte` e `cortarPorPlano` (corte na geometria) |
| `aplicarTom`, `rostoPorLuz`, `prepararCorRoupa` (shader da cor livre) | `src/cor/cores.ts`, `src/cor/pintura.ts` |
| `pesosDaPose` | atributos `_JOINTS_DOBRADO` e `_WEIGHTS_DOBRADO` |

O que difere da página, de propósito:

- A conta da pele coberta é feita com Y para cima. Na página, com os corpos do repositório, `Skeleton.pose()`
  deixa o corpo girado durante essa conta, e a faixa da saia fechada sai no eixo errado (as pernas somem abaixo da
  barra). `referencialDaPagina` reproduz a página para a conferência; os pacotes usam `REFERENCIAL_DO_MODELO`.
- Com três camadas de roupa, a página esconde a de baixo conforme a ordem em que as peças chegaram da rede. Aqui a
  peça de cima entra inteira na conta, em qualquer ordem.
- O material é desenhado dos dois lados (como os corpos da biblioteca). Na página as peças montadas são de um lado
  só, e o avesso de uma saia deixa ver através.
- Cabelo e manta usam a rugosidade do material único (0,75; na página, 0,9 e 0,95).

## Verificação contra a página

A equivalência com a página foi conferida no protótipo, antes de o pacote entrar aqui: scripts que rodavam a
página de referência no Chromium (Playwright), com o three 0.160.0 dela, sobre os mesmos arquivos, e comparavam
com o pacote (peças vértice por vértice, em todos os corpos; pele coberta e camadas nos dois referenciais). Eles
não estão neste pacote: rodam código da página com objetos do three sem tipo, e servem a arte num servidor local.
Os números estão no [registro da frente](../../docs/recreio/implementacao.md), no lote X2. Refazer a conferência
quando a regra de encaixe, cobertura ou cor mudar.

## Para acrescentar um personagem

1. Escreva a descrição (corpo, pele, cabelo, roupa por parte com cor). O formato é o de "Salvar personagem" da
   página, com `id` e `nome`:
   ```json
   {
     "formato": "morada-elenco",
     "versao": 1,
     "personagens": [
       {
         "id": "tia_bia",
         "nome": "Tia Bia",
         "corpo": "plus_f",
         "pele": "Morena",
         "cabelo": { "penteado": "rabo_cavalo", "cor": "Preto" },
         "roupa": {
           "cima": { "id": "nov_polo", "cor": "#3BAA5C" },
           "baixo": { "id": "nov_calca_social" },
           "pes": { "id": "roupa_tenis_009", "cor": null }
         }
       }
     ]
   }
   ```
   `cor: null` deixa a textura como está; sem `cor`, vale a cor inicial do catálogo.
2. Rode `tsx src/cli.ts --personagens <arquivo> --saida <pasta>`. Um id de peça que não existe, uma peça na parte
   errada do corpo ou uma barba que não serve no corpo param o empacotador com a explicação.
3. Para um personagem pronto do elenco da arte, basta `--elenco <id>`.
4. Para um morador da prova, o caminho é `src/personagem/prova.ts`: a tabela que leva os nomes de cabelo e de
   roupa da simulação às peças do catálogo.

Para um clipe novo do jogo: acrescente o pedido em `src/animacao/jogo.ts`, com os ids da biblioteca que o atendem
em ordem de preferência.

## O que ainda não é montado

- Objetos de mão (`tipo: "mao"`, 101 peças): pegada, contato da palma e do polegar, dedos fechados a cada quadro e
  pose de segurar. O empacotador recusa o personagem que traz um.
- Tramas com furos (`transparente`: meia arrastão, meia 7/8 arrastão, luvas arrastão). Recusadas também.

## Testes

```bash
pnpm --filter @informach/morada-arte test
```

Os testes usam uma biblioteca de mentira, fabricada em `test/fabrica.ts` (um boneco de quatro vértices, uma camisa,
um cabelo, uma biblioteca de animação). O bloco que precisa da arte de verdade é pulado sem `ARTES_3D_DIR`, e o
nome dele diz isso.

## Organização

```
src/
  leitura/      biblioteca.ts (onde cada coisa está), glb.ts, corpo.ts, item.ts (MIT1), tabelas.ts,
                catalogos.ts, pagina.ts (tabelas da página), imagem.ts (PNG)
  encaixe/      posicoes.ts, montar.ts, cobertura.ts
  cor/          cores.ts, pintura.ts
  personagem/   esquema.ts, resolucao.ts, montagem.ts, partes.ts, prova.ts
  animacao/     jogo.ts (os clipes que o jogo usa), clipes.ts (leitura e redução)
  saida/        glb.ts, biblioteca.ts
  manifesto.ts  esquema do manifest.json
  empacotar.ts  o empacotador
  cli.ts        linha de comando
test/           testes e a fábrica da biblioteca de mentira
```
