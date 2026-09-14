# Evidência e review da fase 03

Data: 13/09/2026. Estado: concluída.

## Resultado

O catálogo comercial contém 61 missões, 508 atividades de ensino e prática e 96 atividades reservadas, totalizando 604 IDs autorais. As quatro trilhas possuem caminhos explícitos, diagnóstico e simulado; o recorte publicado distingue Canguru E no 6º ano, Canguru B no 7º e OLITEF/OBMEP N1 no 6º e 7º.

Alternativas, respostas numéricas, ordenação e justificativa aparecem na progressão. As 37 justificativas têm rubrica e resposta-modelo específica. Oito bancos reservados usam famílias semânticas compartilhadas entre cursos equivalentes, registram exposição por família e distinguem problemas diretos de diagnóstico dos problemas de verificação usados para transferência.

## Review e correções

O review 010 encontrou quatro problemas e todos foram corrigidos:

1. Os bancos reservados disfarçavam um mesmo molde com valores e identificadores diferentes. Foram criadas três estruturas diretas e três de verificação por habilidade, com família estável e detectores de equivalência estrutural.
2. Uma sequência que começava em 5 possuía gabarito de resto incorreto. A resposta agora deriva do valor inicial e os três casos são conferidos por oráculo independente.
3. As justificativas reutilizavam uma resposta genérica que não atendia às rubricas. Foram escritas respostas completas, distintas e específicas por habilidade e estágio.
4. Um teste de corretor era descrito como conferência autoral. A descrição foi corrigida e a revisão item a item passou a ser protegida por um ledger de 604 hashes, com falha para item ausente, alterado ou órfão.

O inventário também rejeita família com mais de uma estrutura, estruturas iguais sob famílias diferentes, sobreposição estrutural entre treino e avaliação e família repetida dentro do banco. O review ficou com quatro achados resolvidos e nenhum pendente.

## Verificação fresca

- TypeScript do app e do banco: aprovado.
- 60 testes unitários: aprovados (59 na suíte completa e 1 invariante adicional de exposição entre cursos, verificado em seguida).
- 35 testes de integração em PostgreSQL descartável: aprovados.
- Build de produção: aprovado.
- 6 jornadas E2E em build de produção, desktop e celular: aprovadas.

O executor E2E usa banco, diretório de build e artefatos exclusivos por execução, valida a porta local e remove somente os recursos com identificador aleatório verificado. Isso evita colisão com a sessão paralela de design.

## Limites

A conferência técnica e de autoria não representa validação de eficácia com estudantes nem aprovação humana de Helena. A validação pedagógica real começa depois da publicação, durante o estudo dos filhos, conforme o plano comercial.
