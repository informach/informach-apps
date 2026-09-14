---
status: resolved
file: apps/missao-saber/src/features/editorial/repository.ts
line: 9
severity: medium
author: claude-code
provider_ref:
---

# Issue 004: Não ocultar pendências editoriais com limites globais

## Review Comment

`contentReports()` retorna somente os 100 relatos mais recentes, incluindo os já resolvidos, sem paginação ou outro acesso. Quando uma pendência antiga sai desse conjunto, o editor não consegue mais localizá-la nem resolvê-la pela interface; 100 relatos novos já tratados bastam para ocultá-la. Isso compromete a fila de qualidade que sustenta a publicação de conteúdo didático. O mesmo padrão em `reviewHistory()` limita o histórico global a 200 decisões, e a página usa esse recorte para calcular o estado atual de cada aula: uma aprovação antiga pode aparecer como “Aguardando revisão”, embora `releaseStates()` continue a liberar a aula ao aluno.

Separar consultas operacionais de histórico: carregar/paginar a fila de relatos abertos sem deixá-la ser consumida por resolvidos; obter a decisão atual por aula/versão independentemente da paginação de auditoria. Se houver limites, expor navegação que alcance todos os registros e ordenação determinística. Cobrir uma pendência antiga com mais de 100 relatos posteriores resolvidos e uma decisão corrente seguida por mais de 200 decisões em outras aulas.

## Triage

- Decision: `VALID`
- Notes: Fila seleciona somente relatos abertos, do mais antigo ao mais recente; histórico tem paginação e estado corrente vem de `releaseStates()`. Integração PostgreSQL adiciona 105 relatos posteriores resolvidos e 210 decisões, confirma a pendência antiga acessível, histórico paginado e aprovação atual preservada. Execução independente: 13/09/2026 11:43:15 America/Sao_Paulo, 14 testes aprovados, exit 0.
