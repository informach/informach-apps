# Guia das props da cidade do Morada (vale junto com o GUIA_CIDADE.md e o GUIA_PARQUE.md)

Leia antes `SP/morada-art/GUIA_CIDADE.md` e `SP/morada-art/GUIA_PARQUE.md` inteiros, mais o que eles mandam ler.
Convenções de grade, escala, eixos, animações (`girar`, `balancar`, `piscar`, `rolar`, `trocar`, `percurso`, `deslizar`),
assentos (slots), dia e noite, malha, colisão, vitrines e teste de cena valem aqui do mesmo jeito.

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

## Referência

`SP/cidade/refs/props.webp` mostra a vitrine de "mais de 200 props de rua", divididas em seis grupos: Parque, Praia,
Entretenimento, Esporte, Rua e Outdoors. Abra a imagem e amplie trechos com PIL em `python3 -I`. Ela serve de norte:
proporções fofas, cantos boleados e cores vivas. Os desenhos são originais, e o que tiver texto vai em português e
sem marcas.

Também há quadros do vídeo de apresentação em `SP/cidade/refs/video/`: `32_catalogo_props.webp` (as props de perto)
e as tomadas de rua, praia e parque (lista no `GUIA_CENAS.md`).

## O que já existe (não refaça; complete)

- `SP/cidade_out/mobiliario_urbano/`: bancos, mesa de piquenique, guarda-sol, postes, luminária, relógio, lixeiras,
  bebedouro, hidrante, correio, bicicletário, orelhão, pontos de ônibus, placas de trânsito, semáforos, refletores e
  peças do pacote.
- `SP/cidade_out/vegetacao/`: árvores, palmeiras, arbustos, topiarias, cerca-viva, canteiros, floreiras e vasos.
- `SP/cidade_out/parque_areas/`: caminhos, lago, zoológico, skate em bowl, palco de festival, tendas de circo,
  quiosques (sorvete, pipoca, algodão-doce e ingressos), playground inteiro, chafariz, obelisco, arco de treliça e
  coreto.
- `SP/cidade_out/parque_brinquedos/`: os brinquedos grandes.
- `SP/cidade_out/sinalizacao/` e `grafites/`: os outdoors e as placas, ou seja, o grupo Outdoors.

Leia os `catalogo.json` dessas pastas antes de começar e não repita ids nem peças iguais. Uma variação nova de uma
peça que já existe (outra cor ou outro desenho) pode entrar, com id próprio.

## Pacotes gratuitos (aproveite onde servir)

`SP/ideias/` tem pacotes grátis. As peças de pacote entram com `pacote=True` e id terminado em `_pacote` (uso interno,
não distribuir). Arquivos de pacote só se leem com Python `-I`.

- **Cartoon City** (`Cartoon_City/.../Separate_assets_fbx`): veja o que ainda não entrou em nenhuma categoria (grep
  do nome do FBX nos catálogos).
- **Christmas** (`Christmas_Pack/.../Separate_assets_fbx`): as árvores de Natal externas, a cerca e os montes de neve
  já estão nos móveis, na categoria `natal`. Não repita.
- **Fantasy:** já está em `fantasia`.

## Regras comuns

- **Pasta e gerador:** cada agente grava só na sua categoria (`SP/cidade_out/<categoria>/`), com o gerador
  `SP/morada-art/cidade_<categoria>.py` e auxiliares com o prefixo da categoria.
- **`extra`:** não use `lote` (é dos prédios). Para áreas maiores, use `"quadras": [nx, ny]`.
- **Malha:** prop pequena com 200 a 3 mil triângulos; quadra ou área com até 12 mil.
- **Colisão:** de 1 a 4 caixas; as quadras esportivas só têm a laje.
- **Dia e noite:** lâmpadas com `luz`, letreiros com estampa luminosa e neons onde fizer sentido.
- **Vitrines e teste de cena:**
  - vitrines de dia e de noite;
  - vitrines por grupo;
  - teste de cena com as suas peças junto das que já existem (ruas, pisos, prédios, vegetação, mobiliário), de dia e
    de noite.
- **Conferência:** duas rodadas contra a referência e a auditoria
  `python3 -I SP/tools/audita_moveis.py SP/cidade_out SP/cidade_out/_auditoria_<categoria>.json`. Olhe só a sua
  categoria: nenhum id repetido com as outras.
- **Proibido:**
  - `MOVEIS_THREADS` acima de 1 (há outros agentes renderizando);
  - alterar `moveis_base.py`, `cidade_base.py`, as páginas ou as outras categorias;
  - commit e push;
  - `rm` fora de caminhos literais seus.
- **Relatório final em português**, curto:
  - as peças, com quantas e quais;
  - as animações e os slots;
  - o que ficou de fora;
  - os problemas da base;
  - os caminhos dos arquivos.
