# Desafios de peças: levantamento

Quebra-cabeças físicos populares, vendidos em madeira ou MDF, que a criança monta em 3D no laboratório e que a competição sorteia. Levantamento de 31/10/2026, com pesquisa na web; quando a fonte não dava a geometria exata, o desafio ficou fora ou a geometria foi construída e verificada aqui, sem chute.

## Como as soluções foram conferidas

- **Em malha:** as soluções de referência saíram de um resolvedor de cobertura exata (busca com retrocesso, peças nas 8 orientações do plano ou nos 24 giros do cubo) e foram gravadas em `catalogo/solucoes-malha.ts`, que não se edita à mão.
- **Ângulo livre:** as peças são definidas na posição da solução, então a solução existe por construção.
- **Conferência:** o mesmo verificador do produto confere todas as soluções nos testes. No plano, ele amostra uma malha fina com tolerância de 0,012 nas bordas; nos sólidos, faz o mesmo em volume.

## Os 15 desafios desta leva

Faixas: **a** 2º e 3º ano, **b** 4º e 5º, **c** 6º e 7º, **d** 8º ano em diante. "Aberto" = disponível sem assinatura.

| Desafio | Conhecido como | Faixa | Peças | Geometria |
|---|---|---|---|---|
| Retângulo 5 × 3 (aberto) | Katamino | a | 3 pentominós: P, F, U | malha plana |
| Cubo 2 × 2 × 2 (aberto) | Cubo de cubinhos | a | 2 cantoneiras de 3 cubos e uma dupla | malha no espaço |
| Tangram (aberto) | Tangram | a | 7: dois triângulos grandes, um médio, dois pequenos, quadrado e paralelogramo | ângulo livre, giro de 45°, vira |
| Retângulo 5 × 4 | Katamino | b | 4 pentominós: L, N, U, P | malha plana |
| 4 Ts no quadrado | Quadrado de tetraminós T | b | 4 Ts de 4 casas | malha plana, 4 × 4 |
| Cubo Soma | Cubo Soma, de Piet Hein (1933) | b | 7: V, L, T, Z, A, B, P | malha no espaço, 3 × 3 × 3 |
| Pirâmide de duas peças | Quebra-cabeça da pirâmide de 2 peças | b | 2 metades iguais de um tetraedro regular | sólidos, 24 giros do cubo |
| Retângulo 5 × 6 | Katamino | c | 6 pentominós: L, N, P, T, U, Y | malha plana |
| A cruz de nove peças | Cruz de pentominós | c | 9 pentominós diferentes: F, I, L, N, P, T, U, V, Y | malha plana, cruz de 45 casas (9 × 9, braços de 3) |
| Tabuleiro 8 × 8 com furo | Pentominós no tabuleiro de xadrez | c | os 12 pentominós | malha plana, centro 2 × 2 vazio |
| Cubo dos três cubinhos | Slothouber-Graatsma | c | 6 blocos 1 × 2 × 2 e 3 cubinhos | malha no espaço, 3 × 3 × 3 |
| O T de quatro peças | Quebra-cabeça do T (versão do Missão Saber) | c | trapézio, outro trapézio, triângulo e peça com recorte | ângulo livre, giro de 45°, vira |
| Retângulo 6 × 10 | Pentominós | d | os 12 pentominós | malha plana |
| A cruz de quatro peças iguais | Dissecção da cruz grega | d | 4 peças iguais | ângulo livre, giro de 90° |
| 4 Ts na caixa | Jogo dos 4 Ts | d | 4 Ts | ângulo livre, giro de 3° |

Os pentominós seguem a nomenclatura usual (F, I, L, N, P, T, U, V, W, X, Y, Z), com espelho permitido no plano, porque a peça de madeira vira. No espaço não há espelho: as peças A e B do Cubo Soma são espelhadas entre si e continuam diferentes.

**Cruz com poucas peças.** A cruz de 20 casas (6 × 6, braços de 2) com quatro pentominós diferentes **não tem solução**, conforme o resolvedor. Por isso a cruz de pentominós é a de nove peças.

### O T de quatro peças

O quebra-cabeça do T clássico (triângulo, dois trapézios e um pentágono irregular) tem medidas que variam entre fabricantes. A versão daqui parte da letra T com barra 3 × 1 sobre haste 1 × 3:

- **Dois trapézios retângulos iguais:** um na barra, com corte de 45°, e um no pé da haste.
- **Um triângulo retângulo isósceles:** na ponta da barra.
- **Uma peça com recorte:** cobre o cruzamento.

A dificuldade clássica se mantém: o recorte não é o buraco do T, e a peça fica inclinada no cruzamento.

### A cruz de quatro peças iguais

Cruz grega de cinco quadrados cortada por duas retas perpendiculares pelo centro, com inclinação 1/2. Saem quatro peças iguais, que também formam um quadrado de lado √5 (a direção do desafio aqui é formar a cruz).

### 4 Ts na caixa

Inspirado no **Jogo dos 4 Ts** de MDF da foto enviada pela titular: base de 10 × 10 cm com moldura, MDF de 3 mm e uma só solução. As medidas do fabricante não estão disponíveis; a versão daqui foi construída para ter o mesmo espírito, ou seja, os Ts só cabem inclinados.

- **Peças:** T com barra 3 × 1 e haste 1 × 3.
- **Caixa:** quadrada, de lado interno 5,8. Na escala da base de 10 cm, a unidade dá cerca de 1,5 cm.
- **Retos não cabem.** Empurrados para um canto, Ts alinhados aos lados têm arestas em coordenadas inteiras, então basta procurar na malha de lado 5 (o maior inteiro dentro de 5,8). A busca exaustiva não encontra arranjo, e alinhados eles precisariam de lado 6. Essa busca é um teste do produto.
- **Inclinados cabem.** Em cata-vento a 18°, cabem com 0,02 de folga entre as peças e cerca de 0,027 em cada parede. Lado mínimo do cata-vento por ângulo: 10°: 5,91; 15°: 5,80; 18°: 5,71; 20°: 5,83; 22,5°: 6,00.
- **Giro de 3 em 3 graus:** com ele, os 18° ficam alcançáveis.

Se a titular medir o brinquedo físico, basta trocar as medidas em `catalogo/index.ts` e rodar os testes: eles conferem de novo a solução e a impossibilidade da montagem reta.

## Fora desta leva

| Quebra-cabeça | Por quê |
|---|---|
| Cubo diabólico (Hoffmann, 6 peças de 2 a 7 cubos, 13 soluções) | As fontes legíveis não davam a forma exata das peças; fica para quando houver referência confiável. |
| Stomachion de Arquimedes (14 peças) | As coordenadas exatas das peças não foram confirmadas numa fonte legível. |
| Pirâmide de 4 peças | As fontes divergem sobre a forma (base quadrada ou triangular). |
| 4-T da ThinkFun (lado difícil) | Sem medidas publicadas; o "4 Ts na caixa" ocupa esse lugar. |
| Cubo Bedlam (13 peças, 4 × 4 × 4) e Tetris Cube | Difíceis demais para o público e para montar arrastando. |
| Burr de 6 peças, a "cruz chinesa" | Exige sequência de encaixes deslizantes, não posicionamento; não cabe no arrastar e girar. |

## Fontes consultadas

- [Soma cube](https://en.wikipedia.org/wiki/Soma_cube), [Diabolical cube](https://en.wikipedia.org/wiki/Diabolical_cube), [Bedlam cube](https://en.wikipedia.org/wiki/Bedlam_cube), [Slothouber–Graatsma puzzle](https://en.wikipedia.org/wiki/Slothouber%E2%80%93Graatsma_puzzle), [Pentomino](https://en.wikipedia.org/wiki/Pentomino), [Ostomachion](https://en.wikipedia.org/wiki/Ostomachion), [T puzzle](https://en.wikipedia.org/wiki/T_puzzle)
- [Storer, Four T Puzzle](https://www.cs.brandeis.edu/~storer/JimPuzzles/ZPAGES/zzzFourTPuzzle.html), [ThinkFun 4-T](https://legacy.thinkfun.com/products/4-t-puzzle), [Rombol 4-T](https://rombol.de/en/products/4-t-puzzle-zwei-herausforderungen)
- [CSIRO, T puzzle](https://blog.doublehelix.csiro.au/t-puzzle), [Canaltech, quebra-cabeça em T](https://canaltech.com.br/internet/voce-consegue-resolver-quebra-cabeca-em-t-esta-deixando-todo-mundo-irritado/)
- [Lemaire, cruz e quadrado](https://www.cs.purdue.edu/homes/gnf/book/Booknews/Lempuz.html), [MathsWorld, pirâmides de 2 e 4 peças](https://www.mathsworlduk.com/touring-exhibition/2-piece-pyramid-4-piece-pyramid)
- [IME-USP, Poliminós](https://www.ime.usp.br/~iole/POLIMINOS.pdf), [UFMG, quebra-cabeças no Portal OBMEP](https://www.ufmg.br/proex/?p=11013), [UDESC, cubo Bedlam](https://udesc.br/arquivos/cct/documentos/Cubo_bedlam_17163173494271_10455.pdf)
- Descrição e foto do Jogo dos 4 Ts em MDF enviadas pela titular (10 × 10 cm, MDF 3 mm, uma só solução).
