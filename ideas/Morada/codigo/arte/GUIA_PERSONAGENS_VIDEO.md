# Personagens: o que o vídeo do pacote mostra e o que falta na nossa biblioteca

SP = `/tmp/claude-0/-home-user-informach-apps/4b0c5cb8-e6f3-54e3-8b85-cd31fc21bb7f/scratchpad`

Os quadros estão em `SP/personagens_refs_video/` (1920 × 1080; uso interno, nunca no repositório). O vídeo inteiro está
em `SP/_video/cartoon_city.mp4` e os quadros de 1 em 1 segundo em `SP/_video/quadros/` (personagens: q_0207 a q_0354).

| Quadros | O que mostra |
|---|---|
| `01_elenco` | elenco reunido com cachorro e gato |
| `02`…`04_profissoes_*` | 90 profissionais (30 papéis, ~3 versões cada): ator, arquiteto (capacete e planta enrolada), artista, jogador de basquete, ciclista (de bicicleta, skate e patinete), pedreiro, empresário(a), capitão, gari, cabeleireiro(a), camareira, paciente, policial, detento, reparador, bombeiro, segurança, comissária de bordo, nadador, professora, garçom e garçonete |
| `05`…`11_casuais_*` | 210 cidadãos comuns, todos diferentes (roupa, cabelo, cor, objeto de mão) |
| `12_tipos_de_corpo`, `13_tons_de_pele` | 11 corpos (adulto, adulta, plus m/f, idoso, idosa, musculoso, jovem m/f, criança m/f), 4 tons de pele |
| `14_expressoes`, `32_expressoes_rosto` | 10 expressões por tipo |
| `15`…`19_roupas_*` | catálogo por faixa: chapéus, agasalhos, calças, cabelos, sapatos, fantasias |
| `20`, `21_animacoes_multidao` | multidão com animações variadas (banco, carrinho de bebê, bengala, celular, sentado no chão, deitado) |
| `22`, `23_props_de_mao` | mais de 100 objetos de mão |
| `24_bichos_estimacao` | 13 bichos, 65 animações |
| `25`…`27_icones_*` | ícone 2D de cada personagem e de cada peça |
| `28`…`30_ferramenta_personalizar` | ferramenta: tipo de corpo e sexo, pele, rosto, cabelo, barba, chapéu, óculos, agasalho, calça, sapato, luvas, corpo inteiro; filtros por tipo; **Aleatório**, **Salvar personagem**, **Voltar ao padrão** |
| `31_controle_movimento`, `33_movimento_andar` | controle de movimento: o personagem anda e corre pelo chão, com a câmera atrás |
| `34_mixamo` | compatível com as animações do Mixamo |

## Comparação

| Item | Pacote (vídeo) | Nós |
|---|---|---|
| Corpos | 11 | **19** (com bebês, recém-nascidos, pequenos, atlética, alto e magro, grávida em 3 estágios) |
| Tons de pele | 4 | os do `peles.txt` |
| Expressões | 10 | **12** |
| Animações | 300+ | 154 (17 categorias) + 39 compostas |
| Roupas e acessórios | 1.100 | 317 peças com cor livre, 64 cabelos/barbas |
| Objetos de mão | 100+ | 58 |
| Personagens prontos | **300** (90 profissionais + 210 casuais) | **300** no Elenco (`elenco.json`: 90 profissionais em 30 papéis + 210 casuais, com miniatura, folhas e sprite; `elenco_define.py`, `elenco_valida.py`, `elenco_render.py`, `elenco_folhas.py`) e 122 conjuntos de roupa |
| Bichos de estimação | 13, 65 animações | **24**, até 21 animações cada (+ zoológico e fauna urbana) |
| Ícones 2D | de tudo | miniatura de cada peça |
| Ferramenta | Aleatório, salvar, filtros | escolha por imagem; sem aleatório nem salvar |
| Controle de movimento | sim | não |
| Andar de bicicleta, skate, patinete | sim (ciclistas) | sim: pedalando, skate e patinete, andando e parados, com o veículo preso à raiz (apoios no `info.json`) |
