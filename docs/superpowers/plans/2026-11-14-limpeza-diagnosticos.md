# Limpeza dos diagnósticos do repositório

**Objetivo:** zerar erros, avisos e informações reportados pela verificação geral sem alterar o comportamento dos produtos.

**Arquitetura:** tratar as ocorrências nas áreas responsáveis, mantendo as regras de acessibilidade, tipagem e cache; aplicar apenas correções cujo comportamento possa ser verificado. A fotografia de `pnpm check` de 14/11 contém 618 avisos e 98 informações, concentrados em asserções de nulidade e especificidade CSS.

**Stack:** pnpm, Biome, TypeScript, React, Electron e Next.js.

**Restrições:** preservar mudanças concorrentes; não desativar regras nem inserir supressões em massa; testar consumidores e interfaces afetados; trabalhar na main.

## Etapas

- [x] Inventariar diagnósticos por regra e área e verificar os guias locais.
- [x] Corrigir imports, parâmetros, expressões, variáveis de ambiente e sugestões mecânicas; executar os testes relevantes.
- [x] Resolver asserções de nulidade por domínio, com guardas e invariantes explícitas; executar testes de cada pacote ou app.
- [x] Corrigir especificidade e uso de `!important` preservando acessibilidade e comportamento visual; verificar interfaces afetadas.
- [ ] Repetir `pnpm check` até não restarem diagnósticos; executar os gates dos consumidores alterados e revisar o diff.
- [ ] Registrar resultados e pendências verificadas; publicar conforme as regras do repositório.

O Biome voltou a verificar as variáveis dos scripts autônomos com listas exatas
por arquivo, sem adicioná-las ao ambiente global do Turbo. As camadas CSS dão
prioridade às regras de ocultação e aos cursores de arrasto; as comparações de
estilo incluem movimento reduzido e estados ocultos. A confirmação dos gates
completos e a implantação da correção de CSP da Agenda continuam pendentes.
