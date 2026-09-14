# Missão Saber — implementação do piloto comercial

**Nova etapa planejada:** o [plano da versão comercial](../../../docs/propostas/missao-saber-2026-09-13/PLANO-VERSAO-COMERCIAL.md) substitui, para a próxima entrega, a exigência de aprovação editorial prévia e define a expansão para pelo menos 600 atividades no recorte de 6º/7º. São seis fases pendentes, com integração ao design desenvolvido em outra sessão. Este PRD permanece como registro da implementação inicial; a criação do novo plano não removeu ainda o bloqueio no código.

Autorização: implementar a proposta de 13/09/2026, revisar cada fase e fazer full review.
Fonte: `docs/propostas/missao-saber-2026-09-13/PROPOSTA.md`, currículo, política autoral e estudo Brilliant na mesma pasta.

## Critérios de aceitação

1. Novo app independente no monorepo; conta do responsável, perfis isolados, autenticação e persistência PostgreSQL.
2. Catálogo inicial 6º/7º: OLITEF N1, OBMEP N1, Canguru E e B. Biblioteca piloto autoral com revisão automatizada e estado editorial explícito. Arquivos oficiais não integram o app.
3. Missões com explicações, erros específicos, pistas graduais, diagnóstico, domínio conservador por habilidade, revisão espaçada, retomada versionada e tentativas idempotentes corrigidas no servidor.
4. Hoje, jornada, laboratório, revisão, simulados, caderno e família. Três ferramentas manipuláveis com teclado e alternativa textual. Interface responsiva em português, sem corações punitivos, anúncios ou ranking público.
5. Individual R$29,90/mês ou R$299/ano, Família R$44,90/mês ou R$449/ano (até três perfis); unidade gratuita. Stripe pelos serviços compartilhados, webhook verificado, histórico/exportação continuam acessíveis sem assinatura.
6. Preferências de rotina, relatório familiar com evidências, consentimento do responsável, exportação/limpeza, revisão/publicação/retirada editorial e relatos de erro.
7. Testes relevantes, migration gerada, build, reviews por fase e revisão completa documentados. Operação local e próximos passos concretos.

## Limites previstos na proposta

Publicação em produção, ativação de preços Stripe e e-mail reais, revisão pedagógica humana, piloto com famílias e validação jurídica dependem de etapas externas. Não declarar esses resultados concluídos com testes de software. A expansão aos demais anos, 600+ itens de lançamento, escolas, IA e offline pertence às etapas condicionadas à validação; o acervo e currículo da expansão já estão documentados.

O conteúdo inicial fica identificado como piloto e exige aprovação editorial explícita para abrir aulas assinadas. A demonstração autoral é pública e não concede domínio ou resultado oficial. Não importar questões legadas sem origem e revisão verificáveis.
