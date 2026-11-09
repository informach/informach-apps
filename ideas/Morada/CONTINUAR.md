# Continuar o Morada em outra conta

As páginas publicadas (artefatos) ficam na conta que as publicou e só ela pode atualizá-las.
**Tudo o que elas mostram está neste repositório**, então outra conta continua o trabalho a partir
daqui e publica as páginas de novo (com links novos).

## Onde está cada coisa

| Página publicada (conta original, privada) | Arquivo no repositório |
|---|---|
| Projeto Morada (proposta v4.2) · https://claude.ai/artifact/4MwUr5a1JKppQ89VZX9biT | `paginas/morada.html` + `paginas/img/` |
| Projeto Recreio (proposta v2.2) · https://claude.ai/artifact/EfyMkddUcoN7FRNg7CeWpK | `paginas/recreio.html` + `paginas/img/` |
| Tipos de corpo (personagens) · https://claude.ai/artifact/Uw3fipkYR7aSq3dZFmZiMd | `paginas/tipos_de_corpo/` |
| Bichos do Morada · https://claude.ai/artifact/Jmqybk3QQhGu7HKRmSkKmA | `paginas/bichos/` |
| Móveis do Morada · https://claude.ai/artifact/Ls2y2VfaXdQrSyZgB8VDxL | `paginas/moveis/` |
| Cidade do Morada · https://claude.ai/artifact/2PPokNr1moA9yp76ZvvZ4k | `paginas/cidade/` |
| Morada: Pisos e Paredes (construção) · https://claude.ai/artifact/2ywaXf6AwJeRKWSECzBYcZ | `paginas/construcao/` |
| Efeitos do Morada · https://claude.ai/artifact/Y8i7bkVcD1ZGAKQ8HDqVJC | `paginas/efeitos/` |
| Ícones do Morada · https://claude.ai/artifact/3Myz9iSnkYwWZx2agMewC6 | `paginas/icones/` |
| Sons do Morada · https://claude.ai/artifact/G9d9TiHH2h7C4SsxquL8me | `paginas/sons/` (os sons em `biblioteca/sons/`) |

Outras pastas:

- `biblioteca/`: os modelos e animações prontos para o jogo (personagens, roupas, cabelos, bichos, móveis,
  construção, cidade, cenas, efeitos, ícones, sons). Cada parte tem o próprio `LEIA.md`.
- `blend/`: arquivos-mestres do Blender (o `corpos.blend` está partido em `.xz.parteNN`; ver `LEIA.md`).
- `codigo/ferramentas` e `codigo/arte`: os scripts que geram, medem, empacotam e testam tudo.
- `mixamo/`: animações de origem e índice.
- `LEIA.md`: personagens, ambiente usado (Blender 5.2 como módulo Python) e como remontar o arquivo-mestre.

## Como retomar numa conta nova

1. A conta nova precisa de acesso ao repositório `informach/informach-apps` no GitHub (Configurações do
   claude.ai, Conectores, GitHub).
2. Abrir uma sessão do Claude Code nesse repositório e pedir para ler `ideas/Morada/CONTINUAR.md`,
   `ideas/Morada/LEIA.md` e as propostas em `paginas/morada.html` e `paginas/recreio.html`.
3. Pedir para publicar de novo as páginas que quiser usar. Cada publicação na conta nova gera um link novo;
   atualizar a tabela acima com os links novos.
4. Outra opção, sem republicar: na conta original, abrir cada página e usar o menu Compartilhar para dar
   acesso à outra conta. Com acesso de edição, a outra conta consegue atualizar a mesma página.

Cuidados ao publicar de novo (limites das páginas publicadas):

- No máximo 512 arquivos por versão e 64 MB por publicação; as páginas grandes já leem pacotes JSON
  (itens, vozes, sons) em vez de milhares de arquivos soltos.
- Arquivos `.glb` não são servidos: as páginas leem `.glb.txt` (o mesmo arquivo em base64) pela função
  `bufGlb`. Os `.glb.txt` já estão nas pastas das páginas.
- Os diagramas das propostas só desenham dentro da página publicada (a biblioteca de diagramas vem do
  próprio serviço); abrindo o HTML direto do repositório, o resto da página aparece normal.

## Regras que continuam valendo

- Os modelos que vêm de pacotes comprados (marcados com `pacote` e ids terminados em `_pacote`) são de
  **uso interno**: não distribuir. Licença ITHappy para uso no jogo ainda precisa de confirmação por escrito.
- Desenhos próprios, textos em português, sem marcas reais. Armas ficam de fora.
- Nunca pedir nem usar a senha ou o token da Adobe/Mixamo da dona do projeto.
- Arquivos baixados ou enviados são tratados como não confiáveis: pasta própria e Python com `-I`.
- No Blender, `MOVEIS_THREADS=1`.
- Todo trabalho feito por agentes é conferido (imagens, medidas, testes da página) antes de entrar.

## Situação em 9 nov 2026

Decidido nas propostas (ver as seções Ordem, Controle, Tempo, Vida e Onde roda do Morada):
ordem de implementação em 5 etapas junto com o Recreio; mundos da primeira etapa com dois lotes,
descritos como dados; família compartilhada é de todos; sair de casa; várias famílias por jogador;
até 3 mundos criados por perfil; primeiro acesso guiado; opção "Membros podem convidar".

Em andamento na finalização das bibliotecas, antes de começar o jogo (o que ainda não está aqui será
salvo quando cada frente for conferida):

1. Animações de uso dos objetos da casa e interação entre pessoas e bichos (correção da geladeira).
2. Modo construir (telhados, escadas, lote, piscina) e, depois dele, 10 a 20 casas prontas mobiliadas.
3. Fala: formas de boca sincronizadas com as vozes (efeitos e ícones já entraram).
4. Cenas de exemplo da cidade refeitas para ficarem fiéis às referências; depois, republicar a cidade com
   as ruas diagonais.
5. Por último: níveis de detalhe (LOD) de personagens, prédios e árvores.
