# Incremento 5.34 — texto semântico dinâmico

Estado: implementado e revisado localmente em 20/10/2026 (branch `feat/edisvg-lote-5-restante`). Cobre o item "texto semântico dinâmico" do [review integral](full-review-2026-10-18.md), continuação do [5.9](review-lote-5-semantica.md), que deixou "semântica dinâmica avançada" no escopo restante. Entra no projeto v23 e no blueprint v12, ainda não publicados.

## Lacuna

Nome e descrição acessíveis eram textos fixos. Um placar, um contador ou um botão cujo rótulo muda conforme o estado ficavam com o nome autoral para leitores de tela, mesmo quando o texto visível mudava. Também não havia como pedir que mudanças fossem anunciadas.

## Contrato

- **Binding semântico** (`kind: "semantics"` na lógica): `{inputId, targetId, property: "label" | "description", template, direction: "one-way"}`. O modelo tem um único `{valor}`. O input pode ser de texto, lista, número (formato brasileiro, até seis casas) ou booleano ("sim"/"não"); trigger e cor são recusados. O objeto precisa de semântica com nome (grupo, imagem ou botão), e a descrição exige uma descrição autoral, que é o elemento `desc` que o player atualiza. Dois bindings no mesmo destino são recusados, como os demais.
- **Avaliação**: `evaluateBehavior` devolve `semantics` (nome e descrição por objeto), depois das camadas, como os outros bindings. Valem o tempo, os componentes e o Testar da lógica existente.
- **Região viva**: `semantics.live` (`polite` ou `assertive`) escreve `aria-live` no invólucro do objeto no player interativo, para que tecnologias assistivas sejam avisadas das mudanças dentro dele. O SVG estático não leva o atributo.
- **Player**: escreve o `aria-label` e o texto do `desc` só quando mudam. Sem binding, mantém os textos autorais. Os metadados semânticos chegam à validação da lógica também dentro do player.
- **Interface**: o painel de semântica ganha *Anunciar mudanças* (não, educado, imediato). O formulário de bindings ganha *Semântico (nome ou descrição acessível)*, com o texto vinculado e o modelo. O MCP usa os mesmos comandos de lógica.

## Achados durante a revisão

1. O player construía os alvos da lógica só com tag e pose, então um documento válido no compilador era recusado ao montar ("Binding semântico requer objeto com nome acessível"). A E2E pegou isso; os alvos passaram a levar a semântica do conteúdo.
2. Mudar o `aria-label` de um elemento nem sempre é anunciado pelos leitores, que reagem melhor a mudanças de conteúdo. Por isso o contrato verificado é a árvore de acessibilidade (nome, descrição e `live`) e a promessa de anúncio fica fora do perfil.

## Gates e evidências

- Núcleo: 163 testes (2 novos): nome e descrição seguindo inputs pelo modelo (0 → "1.234,5", não → sim) e recusas (objeto sem nome, input trigger, modelo sem `{valor}` ou com dois, destino repetido), além do `aria-live` só no player.
- App: gates v23 (região viva e binding) e v12 (blueprint), e o `aria-live` na marcação interativa compilada.
- E2E (`tests/e2e/dynamic-semantics.test.ts`): na árvore de acessibilidade do Chromium (CDP), o objeto aparece como "Placar: 0 pontos" com descrição "Partida encerrada: não" e `live: polite`; depois de mudar os inputs, como "Placar: 1.234,5 pontos" com "Partida encerrada: sim". O painel de semântica salva a região viva no projeto.
- Regressão: app 281/281, E2E completo 112/112, consumidor Next 1/1, tipos de app e núcleo, Biome sem erros (avisos legados).

## Limites que permanecem

Um único `{valor}` por modelo e sem plural nem formatação por idioma além do português do Brasil. O anúncio efetivo depende do leitor de tela e não foi homologado em dispositivos. Não há controles de formulário dentro do SVG.
