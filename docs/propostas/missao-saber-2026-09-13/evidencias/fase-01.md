# Evidência e review da fase 01

Data: 13/09/2026. Estado: concluída.

## Resultado

O catálogo autoral passou a ficar disponível por padrão conforme trilha, ano, assinatura e posição do perfil. O fluxo editorial não utilizado foi removido de rotas, módulos, variáveis e textos. A nova área de manutenção serve somente para relatos, pausa, invalidação pontual e reativação.

A migration 0044_bright_karen_page.sql cria `content_controls` e os campos de interrupção. A migration 0047_hot_spiral.sql remove a tabela `releases`; ela não integra o esquema atual nem o produto em produção.

## Review e correções

O review da rodada 009 encontrou seis problemas, todos corrigidos:

1. O início relê assinatura e posição do perfil sob o mesmo lock da cobrança.
2. Itens de avaliações mistas carregam proveniência interna e invalidação pela impressão do conteúdo.
3. Diagnóstico e simulado selecionam e travam apenas as fontes realmente usadas.
4. A migration foi separada no padrão expand/contract e não remove a tabela exigida pelo binário anterior.
5. Hoje, Jornada, Revisão e Simulados usam a mesma política de acesso do servidor.
6. Sessões pausadas podem ser encerradas de modo idempotente, sem acertos ou domínio artificiais.

## Verificação

- TypeScript do app e do banco: aprovado.
- 47 testes unitários: aprovados.
- 33 testes de integração em PostgreSQL descartável: aprovados.
- Build de produção Next.js: aprovado, incluindo a nova rota de manutenção e sem a rota editorial.
- 6 cenários E2E em desktop e celular: aprovados.
- Review 009: 6 resolvidos, 0 pendentes.

Os testes cobrem acesso gratuito e pago, inadimplência, downgrade Família para Individual, perfil excedente, chamadas diretas ao repositório, concorrência, pausa de fontes de avaliação, invalidação precisa, interrupção parcial, histórico e exportação.
