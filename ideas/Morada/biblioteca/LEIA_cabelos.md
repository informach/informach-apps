# Cabelos, barbas e bigodes

## Onde fica cada coisa

- `codigo/morada-art/cabelos.json`: o catálogo, a única lista de cabelos. É lido pelo gerador dos corpos, pelo script de
  adicionar e pela página (nomes dos botões). Cada item tem:
  - `id`;
  - `tipo`: `cabelo` (um por vez) ou `rosto` (barba e bigode, um por vez);
  - `rotulo`: o nome que aparece no botão;
  - `arquivo`: o FBX de origem, relativo à pasta dos pacotes;
  - `corpo_origem`: o corpo do personagem de origem, que serve de régua;
  - `pecas`: as malhas a juntar;
  - `so` (opcional): grupo de corpos que pode usar o item, por exemplo `homens_adultos`.
- `codigo/morada-art/cabelos.py`: o encaixe. A cabeça do personagem de origem serve de régua: os pontos presos ao osso
  `Head` dele são levados à caixa da cabeça do corpo (escala e posição). Barba e bigode ainda vão para a frente o quanto
  for preciso para não afundar no rosto. A peça fica presa só ao osso `Head`.
- `codigo/tools/adiciona_cabelo.py`: acrescenta itens do catálogo aos corpos que já existem, sem regerar os corpos.

## Variações

Um item com `"base"` (outro penteado) e `"forma"`:
- `comprido`: o que fica abaixo da metade da cabeça desce, e as pontas abrem um pouco.
- `volume`: mais largo e mais alto.
- `achatado`: rente no alto, para caber debaixo de chapéu.
- `rente`: barba mais curta, junto do rosto.
- `corta_lados`: só o meio, como no cavanhaque.

- `rabo`: rabo de cavalo (comprimento em alturas de cabeça).
- `coque`: coque no alto e atrás (raio).
- `trancas`: duas tranças dos lados (comprimento).
- `espetos`: espetado, com pontas cônicas no alto e na frente (altura; `n` pontas).
- `coque_duplo`: dois coques no alto (raio).
- `rabo_altura`: onde o rabo de cavalo prende (0 a 1 da cabeça; `rabo_alto` usa 0,95).
- `crista`: moicano (altura). Com `so_crista`, o resto do cabelo sai, e os lados ficam raspados. `largura` controla a
  largura da crista.

Cada penteado tem as versões comprida, volumosa e para chapéu. Também existem:
- barba rente, cavanhaque e barba cheia curta;
- rabo de cavalo, rabo curto, coque, coque com franja;
- duas tranças, maria-chiquinha;
- black power, cacheado volumoso curto;
- moicano e moicano baixo;
- espetado, espetado alto, coque duplo, rabo alto, cacheado com coque.

Cada cabelo tem uma miniatura (`tools/miniaturas_itens.py`), e a página escolhe por ela.

Com chapéu, o cabelo não atravessa a copa:
- na página e no jogo, o cabelo acima da aba não é desenhado;
- no arquivo-mestre, cada cabelo tem a forma `sob_chapeu`, ligada à propriedade `com_chapeu` do esqueleto
  (`cabelos.sob_chapeu`, `tools/cabelo_chapeu.py`). Veja `LEIA_roupas.md`.

## Para acrescentar um cabelo

1. Coloque o FBX na pasta dos pacotes e acrescente um item em `cabelos.json`.
2. Exporte o item:
   ```bash
   python exporta_itens.py -- <saida> <id>
   ```
3. Rode `biblioteca_pacote.py`. A página já mostra o item novo com o nome do catálogo. Os corpos não mudam.

Para pôr o item dentro do arquivo-mestre (render no Blender, por exemplo), use `adiciona_cabelo.py -- corpos.blend
<id>`. Para um grupo de corpos, passe os nomes depois do id. Para trocar um item que já existe, rode com `REFAZ=1`.

Qualquer FBX serve, desde que traga o corpo do personagem com o grupo de vértices `Head`. É ele que permite medir a
cabeça de origem. Uma peça avulsa, sem corpo, precisaria de uma cabeça de referência.

## Nos arquivos

- No arquivo-mestre e no GLB de cada corpo, cada item é uma malha `<corpo>_<id>`. Também existem:
  - `<corpo>_cabelo`: o penteado original do corpo;
  - `<corpo>_cabelo_raspado`: o cabelo raspado.
- Todos usam o material `Cabelo`: a cor é `material.color`, livre.
- O esqueleto de cada corpo guarda a base (`base`: m, f, fm ou p), que diz qual item é o original dele.
- No recém-nascido o cabelo é outro: rente ou com gorrinho, sem catálogo.

## Em arquivos separados (a página já usa; recomendado para o jogo)

Cada cabelo é um arquivo próprio (`itens/<id>.txt`, feito por `tools/exporta_itens.py`), carregado só quando alguém
escolhe. O arquivo leva a posição de cada ponto na caixa da cabeça da malha-base de cada família. No corpo, a posição
vai para a caixa da cabeça dele e fica presa ao osso `Head`. O formato está em `LEIA_roupas.md`.

Um cabelo novo, de qualquer fonte, entra sem mexer nos corpos:
1. Acrescente o item em `cabelos.json`.
2. Rode `exporta_itens.py -- <saida> <id>`.
3. Rode `biblioteca_pacote.py`.

O mesmo vale para chapéus, óculos e outros acessórios.
