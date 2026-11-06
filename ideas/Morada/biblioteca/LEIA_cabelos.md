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

Cada penteado tem as versões comprida, volumosa e para chapéu. Também existem barba rente, cavanhaque e barba cheia
curta.

## Para acrescentar um cabelo

1. Coloque o FBX na pasta dos pacotes e acrescente um item em `cabelos.json`.
2. Encaixe nos corpos:
   ```bash
   python adiciona_cabelo.py -- corpos.blend <id>
   ```
   Para um grupo de corpos, passe os nomes depois do id. Para trocar um item que já existe, rode com `REFAZ=1`.
3. Exporte os corpos de novo (`corpo_exporta.py`) e rode `biblioteca_pacote.py`. A página já mostra o botão novo com o
   nome do catálogo.

Qualquer FBX serve, desde que traga o corpo do personagem com o grupo de vértices `Head`. É ele que permite medir a
cabeça de origem. Uma peça avulsa, sem corpo, precisaria de uma cabeça de referência.

## Nos arquivos

- No arquivo-mestre e no GLB de cada corpo, cada item é uma malha `<corpo>_<id>`. Também existem:
  - `<corpo>_cabelo`: o penteado original do corpo;
  - `<corpo>_cabelo_raspado`: o cabelo raspado.
- Todos usam o material `Cabelo`: a cor é `material.color`, livre.
- O esqueleto de cada corpo guarda a base (`base`: m, f, fm ou p), que diz qual item é o original dele.
- No recém-nascido o cabelo é outro: rente ou com gorrinho, sem catálogo.

## Para o jogo (recomendado)

Hoje cada corpo carrega todos os penteados no próprio arquivo. Com muitos itens fica pesado. Como o cabelo só acompanha
o osso da cabeça, no jogo basta:

- uma malha por item;
- por corpo, o ajuste do encaixe (escala e posição em relação ao osso `Head`, poucos números);
- carregar o item só quando alguém escolhe.

Assim um cabelo novo, de qualquer fonte, entra sem mexer nos corpos. O mesmo vale para chapéus, óculos e outros
acessórios.
