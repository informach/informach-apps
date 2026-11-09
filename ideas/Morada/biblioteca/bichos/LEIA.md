# Bichos

São **47 bichos em três grupos**, cada um com as suas animações: **714 animações no total, de 47 tipos**.

| Grupo | Bichos |
|---|---:|
| Estimação | 24 |
| Zoológico | 12 |
| Fauna urbana | 11 |

Todos nascem de bichos com esqueleto de dois pacotes grátis e levam o selo **uso interno, não distribuir**:

- o Doberman do pacote Apocalypse (`Characters/Doberman.fbx`);
- os 6 bichos do pacote Animals (`Pinguin_001`, `Dog_001`, `Tiger_001`, `Deer_001`, `Kitty_001` e `Chicken_001`).

A vitrine de animais do pacote pago serviu de norte. Formas, cores e peças novas (trombas, jubas, chifres, asas, bicos,
casco, coleiras) foram feitas aqui, e a maior parte das animações foi composta aqui.

Página: `paginas/bichos/bichos.html`. Você escolhe o grupo e o bicho, vê um bicho só ou o grupo inteiro em vitrine e
toca qualquer animação. No grupo inteiro, quem não tem a animação escolhida fica parado.

## Estimação (24)

| Base | Bichos | Animações |
|---|---|---|
| Doberman (Apocalypse) | `doberman`, `doberman_marrom`, `labrador`, `rottweiler`, `salsicha`, `salsicha_marrom`, `spitz`, `lulu`, `lulu_rosa`, `lulu_azul`, `golden`, `pastor`, `husky`, `poodle`, `buldogue`, `caramelo` | 21 |
| Kitty_001 (Animals) | `gato` (preto), `gato_frajola`, `gato_laranja`, `gato_rosa` (persa), `gato_branco`, `siames`, `gato_malhado` | 17 |
| Dog_001 (Animals) | `border_collie` | 21 |

- **Cachorros:**
  - as 11 animações do Doberman: `parado`, `andar`, `correr`, `virar`, `latir`, `brincar`, `pata`, `cambalhota`,
    `deitar`, `barriga`, `dormir`;
  - 10 compostas aqui: `sentar`, `abanar`, `cocar` (coçar a orelha), `cavar`, `uivar`, `farejar`, `buscar` (corre,
    contorna e volta), `pular`, `beber`, `comer`.
- **Gatos:**
  - andam e correm como gato (as animações do pacote);
  - têm também `virar`, `latir` (o miado, para manter a compatibilidade), `brincar`, `pata`, `cambalhota`, `deitar`,
    `barriga`, `dormir` (enrolado), `sentar`, `espreguicar`, `lamber_pata`, `miar`, `pular` e `esfregar`.
- **Compatibilidade:** os ids e os nomes das animações antigas continuam os mesmos.

## Zoológico (12)

| Bicho | Base | Animações próprias, além de parado, andar, correr, comer, beber, deitar, dormir e virar |
|---|---|---|
| `girafa` (5,3 m) | Deer | `chamar`; come no alto e abre as pernas para beber |
| `elefante` (3,3 m) | Deer + 5 ossos de tromba | `chamar` (barrir), `banho` (tromba jogando água); come e bebe com a tromba |
| `bisao`, `zebra`, `cervo` | Deer | `chamar` (mugir, relinchar, bramir) |
| `tigre`, `leao` | Tiger | `rugir`, `espreguicar` |
| `urso`, `urso_polar` | Tiger | `rugir`, `espreguicar`, `em_pe` (em pé, farejando) |
| `hipopotamo` | Tiger | `abrir_boca` |
| `crocodilo` (4,1 m) | Tiger, deitado | `nadar`, `abrir_boca`, `comer` (morder), rastejar com a cauda ondulando |
| `canguru` | Tiger, em pé | anda pulando, `pular` parado, apoia-se na cauda |

- **Bocas que abrem:** felinos, ursos, hipopótamo e crocodilo têm mandíbula própria, com boca e dentes.
- **Peças novas:**
  - juba no leão;
  - crina na zebra e na girafa;
  - ossicones na girafa;
  - chifres e barba no bisão;
  - escamas no crocodilo;
  - presas e orelhas grandes no elefante.

## Fauna urbana (11)

| Bichos | Base | Animações |
|---|---|---|
| `pombo`, `pombo_claro`, `galinha`, `pardal` | Chicken | 12: parado, andar, correr, `bicar`, `ciscar`, `arrumar`, `sentar`, `chocar`, `voar`, `decolar`, `pousar`, `planar` |
| `pato` | Chicken | 14: as das aves, mais `nadar` e `mergulhar` |
| `gaivota` | Chicken | 13: as das aves, mais `nadar` |
| `pinguim` | Pinguin | 11: parado, andar, correr, `nadar`, `mergulhar`, `escorregar` (de barriga), `bater_asas`, `arrumar`, `chamar`, `deitar`, `pular` |
| `esquilo`, `coelho`, `rato` | Kitty | 9: parado, andar, correr, `farejar`, `comer` (segura noz, cenoura ou queijo), `pular`, `em_pe`, `cocar`, `dormir` |
| `jabuti` | Kitty | 9: parado, andar, correr, `esconder`, `escondida`, `sair`, `pastar`, `olhar`, `nadar` |

- **Asas:** as aves têm 6 ossos de pena em cada asa. Fechadas, as penas deitam no corpo; abertas, formam a asa.
- **Voar e nadar:** em `voar` e `planar`, o corpo fica a uma altura acima da origem (`notas` no catálogo). Em `nadar`,
  z = 0 é a linha d'água.

## Padrões

- **GLB:** cada bicho tem malha com cor por vértice (faces chapadas, sem textura), esqueleto e todas as animações como
  clipes separados, a 24 quadros por segundo, com uma chave a cada 2 quadros.
- **Escala e eixos:** escala real em metros, patas no chão em z = 0 e frente para −Y no Blender.
- **Animações:**
  - as do pacote foram passadas para 24 fps, com o deslocamento na escala de cada bicho;
  - as compostas usam poses-chave nos ossos, IK nas patas plantadas (que não deslizam) e correção para nada passar do
    chão (na maioria, menos de 1 cm).
- **Proporções:** cada osso ganha um fator de largura, comprimento e altura no próprio referencial. O esqueleto é
  remontado do quadril para as pontas e cada vértice acompanha os ossos que o puxam; por isso as animações continuam
  valendo. Peças que dobram (tromba, cauda) têm cadeias de ossos com pesos suaves.
- **Cores:** a paleta do pacote vira classes (pelo, marcas, nariz, olho, boca), e cada bicho dá as suas cores e zonas,
  mantendo a sombra pintada.

## Arquivos

- `<id>.glb` e `<id>.webp` (miniatura parada, de três quartos).
- `bichos.json`: os 47, com id, nome, espécie, grupo, escala, base e animações (id, rótulo, laço e segundos).
- A página carrega `paginas/bichos/bichos/<id>.txt` (GLB → gzip → base64), `bichos.json`, `grupos.json` e
  `miniaturas.json`, gerados por `codigo/ferramentas/bichos_pacote.py`.

## Gerar de novo

O guia é `codigo/arte/GUIA_BICHOS.md`.

```bash
blender-venv/bin/python -I codigo/arte/bichos_estimacao.py todos
```

```bash
bash codigo/arte/bichos_zoologico_tudo.sh <SP>
```

```bash
blender-venv/bin/python -I codigo/arte/bichos_urbano.py -- gera pets/urbano todos --blend pets/urbano/urbano.blend
```

```bash
python3 -I codigo/ferramentas/bichos_pacote.py <SP>
```

## Limites

- **Animações de outros bichos:**
  - o hipopótamo anda como o tigre;
  - zebra, girafa, bisão e elefante andam e correm como o cervo, e a passada da girafa fica exagerada;
  - roedores e jabuti andam como o gatinho.
- **Animações antigas dos cachorros:** foram copiadas sem retoque. O salsicha e o lulu fazem os gestos com pernas
  curtas.
- **Chão:** no rolar e no barriga para cima do persa e do border collie, a malha entra cerca de 2 cm no chão.
- **Rosto:** não há pálpebras (dormem de olho aberto). Só os bichos de zoológico com mandíbula abrem a boca.
- **Manchas e listras** seguem as faces da malha e ficam poligonais (girafa, zebra).
- **Pelo:** as caudas dos cachorros do Doberman são peças rígidas, e o pelo fofo é a malha inflada.
- **Ficaram de fora:** o sapo, a leoa e o nadar do hipopótamo.
