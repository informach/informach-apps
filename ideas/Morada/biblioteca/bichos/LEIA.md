# Bichos de estimação

Treze bichos feitos a partir do Doberman do pacote grátis Apocalypse (`Characters/Doberman.fbx`, textura `Color2.png`),
com as onze animações dele ajustadas a cada um. A imagem da vitrine de bichos de estimação serviu de norte; as formas,
cores, orelhas, caudas e coleiras foram feitas aqui. Base de pacote: **uso interno, não distribuir**.

| id | nome | espécie | escala | o que muda em relação ao Doberman |
|---|---|---|---|---|
| `doberman` | Doberman | cachorro | 1,0 | só as cores (preto e castanho) |
| `doberman_marrom` | Doberman marrom | cachorro | 1,0 | só as cores |
| `labrador` | Labrador | cachorro | 0,95 | mais encorpado, orelha caída, cauda longa, patas brancas, coleira azul |
| `rottweiler` | Rottweiler | cachorro | 0,97 | mais largo e baixo, focinho curto, orelha caída, coleira vermelha |
| `salsicha` | Salsicha preto e castanho | cachorro | 0,64 | tronco 1,6× mais longo, pernas com 42% do comprimento, orelha longa |
| `salsicha_marrom` | Salsicha marrom | cachorro | 0,64 | o mesmo, todo marrom |
| `spitz` | Spitz branco | cachorro | 0,62 | pelo fofo, focinho curto e fino, orelha pontuda, cauda enrolada |
| `lulu` | Lulu branco | cachorro | 0,42 | bola de pelo: tronco largo e curto, pernas curtas, cauda pompom |
| `lulu_rosa` | Lulu rosa | cachorro | 0,42 | o mesmo, rosa com pompom mais forte |
| `lulu_azul` | Lulu azul | cachorro | 0,42 | o mesmo, azul |
| `gato` | Gato preto | gato | 0,6 | magro, cabeça redonda, focinho bem curto, orelha de gato, cauda em S, bigode, olho verde |
| `gato_frajola` | Gato frajola | gato | 0,6 | preto com peito, queixo e patas brancos, olho amarelo |
| `gato_laranja` | Gato laranja | gato | 0,6 | laranja com peito, queixo e patas brancos |

## Animações

As onze do Doberman, com o mesmo nome em todos os bichos (nome no GLB → rótulo):
`parado`, `andar`, `correr`, `virar`, `latir` (no gato, "Miar"), `brincar` (pedir para brincar), `pata` (dar a pata),
`cambalhota`, `deitar`, `barriga` (barriga para cima), `dormir`. Ficam em laço, em trilhas NLA no Blender e como
animações separadas no GLB (24 fps, uma chave a cada 2 quadros).

## Como cada bicho nasce (`codigo/arte/bichos.py`)

- **Proporções**: cada osso ganha um fator de largura, comprimento e altura no próprio referencial (e, se preciso, um
  giro no descanso). O esqueleto novo é montado do quadril para as pontas: a cabeça de cada osso fica onde a do original
  ficava em relação ao pai, esticada pelos fatores do pai. Cada vértice vai com os ossos que o puxam (a mesma mistura de
  pesos do original: cabeça nova + R' S Rᵀ (p − cabeça)). Só o lugar de descanso muda, então as animações (giros de cada
  osso) continuam valendo. Depois, o quadril sobe ou desce até as patas encostarem no chão.
- **Animações**: o deslocamento do quadril (`Spine1`, que deita e pula) cresce ou diminui com a altura do quadril; o
  deslocamento dos outros ossos, com a escala. As curvas do próprio objeto do esqueleto (constantes) saem, para o bicho
  poder ser posto em qualquer lugar.
- **Cores**: a textura do Doberman é uma paleta com sombra pintada. Cada face vira uma classe pela cor que tinha (pelo,
  marca castanha, nariz, olho, boca, língua) e guarda o quanto era mais clara ou mais escura que a cor da classe. O bicho
  dá a cor de cada classe, pinta zonas por cima (peito, patas, ponta das patas, focinho de baixo) e a sombra continua.
  Sai como cor por vértice (por canto de face, faces chapadas), sem textura.
- **Focinho**: à frente dos olhos, a cabeça encolhe ou cresce (`focinho`), afina na largura e na altura até a ponta
  (`focinho_larg`) e o nariz diminui em volta do próprio centro (`nariz`).
- **Pelo fofo** (`fofo`): a malha infla pela normal, por osso (mais no pescoço e no peito).
- **Peças trocadas**: a orelha e a cauda do Doberman se recolhem para a base (sem buraco, escondidas) e entram as novas,
  presas a um osso só: orelha caída (aba arredondada), pontuda e de gato (triângulo, de gato com o lado de dentro rosa);
  cauda longa, de gato (S), enrolada (spitz) e pompom (lulu). A coleira é um anel que acompanha o pescoço (centrado no
  meio dele, com o raio de cada direção perto da mediana) e leva a média dos pesos dos 8 vértices do pescoço mais perto,
  para dobrar com ele; tem uma plaquinha dourada. O gato tem bigode (três fios de cada lado).

Para acrescentar um bicho: uma entrada em `BICHOS` (ou `base=` para variar as cores de outro) e rodar o gerador.

## Arquivos

- `<id>.glb`: malha com cor por vértice, esqueleto de 29 ossos e as 11 animações (~1 MB cada).
- `<id>.webp`: a miniatura (parado, de três quartos).
- `bichos.json`: nome, espécie, escala e as animações (id e rótulo) de cada um.
- A página `paginas/bichos/bichos.html` carrega `bichos/<id>.txt` (o mesmo GLB → gzip → base64) e `miniaturas.json`.

## Gerar de novo

```bash
blender-venv/bin/python -I codigo/arte/bichos.py -- <saida> todos --blend <saida>/bichos.blend
```

O gerador lê o pacote em `ideias/Apocalypse` e grava os GLB, o `bichos.json` e o arquivo-mestre (os 13 lado a lado, cada
um com as suas trilhas; não fica no repositório porque sai em 30 s). `codigo/ferramentas/render_bichos.py` faz a folha
com todos e os closes; `miniaturas_bichos.py` faz as miniaturas; `teste_bichos.js` testa a página.

## Limites

- Todos usam o esqueleto e os movimentos do Doberman: o gato anda, late (mia) e dá a pata como um cachorro, com o
  corpo de gato. O lulu e o salsicha fazem os mesmos gestos com pernas bem mais curtas.
- A cauda nova é uma peça rígida presa ao osso da cauda: balança inteira, sem curvar.
- O pelo fofo é a malha inflada (faces chapadas), não pelos.
