# Desenho técnico

**Próxima etapa:** seguir o [plano da versão comercial](../../../docs/propostas/missao-saber-2026-09-13/PLANO-VERSAO-COMERCIAL.md) para disponibilidade sem aprovação obrigatória, novos formatos, expansão autoral, jornada Família e acompanhamento. As seis fases ainda estão planejadas e devem preservar os dados existentes e integrar o design da outra sessão. A especificação abaixo registra a base anterior, inclusive requisitos editoriais agora substituídos no planejamento.

- `apps/missao-saber`, Next.js 16 / React 19, porta 3005, pacotes Informach de auth, db, billing, config e emails.
- Schema PostgreSQL `missao_saber`: famílias/consentimento, perfis, sessões, tentativas, pistas, caderno, versões editoriais e relatos. FK em cascata apenas para dados pedagógicos. Billing mantém seu ciclo compartilhado.
- Catálogo autoral versionado no servidor. DTO público omite gabarito e pistas futuras. Sessões congelam conteúdo/revisão; retirada editorial bloqueia novas sessões, histórico permanece. Diagnóstico e simulado com políticas distintas.
- Cada tentativa tem UUID idempotente, restrição única por sessão/item, transação com lock da sessão, perfil validado pelo responsável. Correção, ajuda, ordem e progresso nunca dependem de valores calculados pelo cliente.
- Motor puro para pontuação, espaçamento e domínio: só acertos sem ajuda em famílias novas são evidência de autonomia. Diagnóstico orienta, não certifica. Simulado retém feedback até entrega.
- RSC lê repositórios; actions autenticam e validam; serviços de domínio ficam livres de Next. Transações serializam criação de perfis, sessões e limpeza. Dados não são partilhados entre apps.
- Stripe usa catálogo dedicado e `getProSubscription`; preços ausentes desabilitam checkout sem oferecer cobrança falsa. Mudanças/cancelamento pelo portal Stripe. Ambiente de produção exige segredos válidos e e-mail live.
- Conteúdo: piloto de 144 atividades em 24 missões, 12 habilidades; as quatro trilhas podem compartilhar pré-requisitos. Amostras públicas explicitamente demonstrativas. Revisão humana registrada no editorial é requisito de publicação comercial.
- Verificação: unidades para matemática/motor/entrada; integração em banco descartável local; E2E local sem serviços pagos; lint/typecheck/test/build do workspace; review independente conforme skill cy-review-round.
