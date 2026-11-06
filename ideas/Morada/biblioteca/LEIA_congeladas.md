# Animações aprovadas ficam congeladas

Regra: corrigir uma animação nunca muda outra que já está boa.

## Como marcar

Na página Tipos de corpo, escolha uma animação da biblioteca. O painel abaixo de "biblioteca do Mixamo" tem três botões:

- **Boa (congelar)**: a animação é congelada.
- **Ruim (corrigir)**: a animação entra na fila de correção.
- **Sem marca**: tira a marca.

A marca vale para a biblioteca daquele corpo, a "fonte": adulto, plus_f, adulta_gravida… Por isso a adulta marca na
biblioteca do adulto, que é a mesma. Fica guardada no banco da página (coleção `avaliacoes`), e só quem edita a página
pode marcar.

## O que acontece com as boas

- Antes de qualquer correção, rodo `congeladas.py sincroniza`. Ele lê as marcas e guarda uma cópia exata de cada boa
  em `congeladas/<fonte>/<id>.blend`, com a impressão digital das chaves e os apoios e correções dela (`<id>.json`).
  Uma boa que já estava congelada não é tocada.
- Toda exportação (`biblioteca_exporta.py`) repõe as congeladas antes de gravar o GLB. Então o jogo e a página sempre
  recebem a versão aprovada, mesmo que alguma correção geral (chão, antebraço, dedos, uma receita compartilhada,
  refazer a grávida) tenha mexido na biblioteca de trabalho.
- Os scripts de reconstrução também repõem as congeladas na biblioteca de trabalho. Assim as animações que partem de
  outras (as compostas, a grávida) usam a versão aprovada.
- `congeladas.py confere` compara cada congelada com a biblioteca de trabalho e lista as que mudaram. Nada é publicado
  nem vai para o repositório com uma congelada diferente.
- As ruins vão para `para_corrigir.json`. As correções passam a ser feitas só nas animações pedidas.

## Para corrigir uma que estava boa

Tire a marca (Sem marca ou Ruim). Na próxima sincronização ela é descongelada e volta a poder mudar.
