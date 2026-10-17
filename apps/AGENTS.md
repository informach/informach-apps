# Padrões de desenvolvimento dos aplicativos

Antes de criar ou alterar um app, leia o [AGENTS.md da raiz](../AGENTS.md), o [estado do trabalho](../docs/estado-do-repositorio.md), as regras específicas do app e a documentação aplicável:

- Todos os apps: `docs/arquitetura-monorepo.md`, `docs/arquitetura-packages.md` e `docs/audit-payload-policy.md`.
- Apps web Next.js: `docs/arquitetura-apps.md`.
- Apps desktop e novas ferramentas Edi: `docs/arquitetura-desktop.md`.

## Regras comuns

- Apps consomem packages por `workspace:*`; apps não importam outros apps.
- Preserve alterações do usuário, dados, formatos e interfaces fora do escopo solicitado.
- Use as dependências homologadas e o lockfile da raiz. Versões candidatas documentadas não estão automaticamente aprovadas.
- Código novo deve ter contratos explícitos, validação nas entradas e testes proporcionais ao risco.
- Corrija a causa de falhas; não use supressões, casts inseguros, catches vazios ou delays arbitrários para esconder problemas.
- Alterações em packages e tooling compartilhados devem verificar todos os consumidores afetados.
- Diferencie uma proposta ou regra documentada de infraestrutura efetivamente implementada e validada.
- Atualize o guia local, a arquitetura ou o runbook afetado na mesma entrega. Mudanças de frente e pendências devem chegar ao índice de estado e ao registro detalhado correspondente, conforme a regra de manutenção da raiz.

## Ferramentas desktop

- Preserve interfaces e recursos já funcionais durante a integração. Recursos pendentes só entram no escopo quando solicitados.
- Separe main, preload, renderer e contratos compartilhados. Código novo de domínio e infraestrutura será TypeScript.
- Novos renderers usarão React; renderers existentes podem ser integrados sem reescrita visual, respeitando contratos, tipos e segurança.
- Use Electron com sandbox e isolamento; valide origem, schema e autorização em IPC e MCP.
- Proteja arquivos com escrita atômica, migração versionada e perfis de teste isolados.
- Integre sessão, licença e atualização pelos packages compartilhados da suíte. Abertura direta também deve validar o acesso.
- Registre novas ferramentas no catálogo tipado definido pelo padrão, com identidade Windows única e participação no release automático.
- Não exponha segredos, endpoints arbitrários ou opções de bypass em builds comerciais.
- Preserve trabalhos abertos ao atualizar e use o pipeline comum. No piloto aprovado, exija manifesto e inventário assinados com as chaves próprias Ed25519 e integridade do instalador; não confunda isso com certificado Authenticode reconhecido pelo Windows. Siga a decisão e o manual de distribuição vinculados ao padrão desktop.
